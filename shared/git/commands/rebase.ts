// git rebase, plain and interactive (docs/features/git-model.md, "Interactive rebase").
import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { commitsToReplay, isAncestor } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, plural, ref } from '../output'
import { mergeTrees } from '../merge3'
import { logBranch, logHead } from '../reflog'
import { rebaseProgress } from '../rebase-progress'
import { resolveRev } from '../refs'
import { headId, headTree, withEntry } from '../state'
import { localChanges, moveTrees, treesEqual } from '../worktree'
import type { ChainMessage, Command, CommandResult, Commit, EditorWait, GitState, OutputLine, RebaseAction, RebaseOperation, RebaseStep, Repo } from '../types'
import { activeBranch } from './branch'
import { commitIndex } from './commit'
import { CHERRY_PICKING, fatal, notARepo, withRepo } from './common'
import { applyMerge, conflictReport } from './merge'

/** Where git writes the todo list and the commit message it opens in the editor. */
export const TODO_PATH = '.git/rebase-merge/git-rebase-todo'
export const MESSAGE_PATH = '.git/COMMIT_EDITMSG'

const WAITING = 'hint: Waiting for your editor to close the file...'

const noRebase = (state: GitState) => fatal(state, 'fatal: no rebase in progress')

const ADVICE_OFF = 'hint: Disable this message with "git config set advice.mergeConflict false"'

const rebaseOf = (state: GitState): RebaseOperation | null =>
  state.repo?.operation?.type === 'rebase' ? state.repo.operation : null

/** The file git waits for in the editor, or null. */
export const editorWait = (state: GitState): EditorWait | null => rebaseOf(state)?.editor ?? null

function withOperation(state: GitState, change: Partial<RebaseOperation>): GitState {
  const repo = state.repo!
  return withRepo(state, { ...repo, operation: { ...(repo.operation as RebaseOperation), ...change } })
}

const isMeld = (action: RebaseAction | undefined) => action === 'squash' || action === 'fixup'

/** A reflog message of this rebase: `rebase (pick): <subject>`, `pull --rebase (finish): ...`. */
const reflogLine = (operation: RebaseOperation, step: string, text: string) => `${operation.action ?? 'rebase'} (${step}): ${text}`

function finish(state: GitState, operation: RebaseOperation, output: OutputLine[]): CommandResult {
  const repo = state.repo!
  const tip = headId(repo)!
  if (!operation.branch) {
    return done(withRepo(state, { ...repo, operation: null }), [...output, out('Successfully rebased and updated detached HEAD.')])
  }
  const updated = logBranch({ ...repo, branches: { ...repo.branches, [operation.branch]: tip } }, operation.branch, reflogLine(operation, 'finish', `refs/heads/${operation.branch} onto ${operation.onto}`))
  const next: Repo = logHead({ ...updated, head: { type: 'branch', name: operation.branch }, operation: null }, reflogLine(operation, 'finish', `returning to refs/heads/${operation.branch}`), { branch: false })
  return done(withRepo(state, next), [...output, out('Successfully rebased and updated ', ref(`refs/heads/${operation.branch}`), '.')])
}

// ---- commit messages (reword, squash) ----

const MESSAGE_HELP = [
  '# Please enter the commit message for your changes. Lines starting',
  '# with \'#\' will be ignored, and an empty message aborts the commit.',
  '#'
]

const messageFooter = (repo: Repo, operation: RebaseOperation) => [...MESSAGE_HELP, ...rebaseProgress(repo, operation).map(text => `# ${text}`), '']

const chainMessage = (chain: ChainMessage[]) => chain.filter(entry => entry.keep).map(entry => entry.message).join('\n\n')

/** git's squash message: every message of the chain, the ones of fixups commented out. */
function combinationText(repo: Repo, chain: ChainMessage[], operation: RebaseOperation): string {
  const lines = [`# This is a combination of ${chain.length} commits.`]
  chain.forEach((entry, i) => {
    // the first one is the commit the others meld into, always kept
    const kept = entry.keep || i === 0
    if (i === 0) lines.push('# This is the 1st commit message:')
    else lines.push(kept ? `# This is the commit message #${i + 1}:` : `# The commit message #${i + 1} will be skipped:`)
    lines.push('', ...entry.message.split('\n').map(line => kept ? line : `# ${line}`), '')
  })
  return [...lines, ...messageFooter(repo, operation)].join('\n')
}

/** git's default cleanup: drop # lines and trailing spaces, collapse blank lines, trim blank lines at both ends. */
export function cleanMessage(text: string): string {
  const lines = text.split('\n').filter(line => !line.startsWith('#')).map(line => line.trimEnd())
  const collapsed = lines.filter((line, i) => line !== '' || (i > 0 && lines[i - 1] !== ''))
  return collapsed.join('\n').trim()
}

// ---- the todo list ----

const TODO_HELP = [
  '#',
  '# Commands:',
  '# p, pick <commit> = use commit',
  '# r, reword <commit> = use commit, but edit the commit message',
  '# s, squash <commit> = use commit, but meld into previous commit',
  '# f, fixup <commit> = like "squash" but keep only the previous',
  '#                    commit\'s log message',
  '# d, drop <commit> = remove commit',
  '#',
  '# These lines can be re-ordered; they are executed from top to bottom.',
  '#',
  '# If you remove a line here THAT COMMIT WILL BE LOST.',
  '#',
  '# However, if you remove everything, the rebase will be aborted.',
  '#',
  ''
]

function todoText(commits: Commit[], upstream: string, head: string, onto: string): string {
  const lines = commits.length ? commits.map(commit => `pick ${shortId(commit.id)} # ${subject(commit)}`) : ['noop']
  const count = plural(lines.length, 'command')
  return [...lines, '', `# Rebase ${shortId(upstream)}..${shortId(head)} onto ${shortId(onto)} (${count})`, ...TODO_HELP].join('\n')
}

const TODO_ACTIONS: Record<string, RebaseAction | 'noop'> = {
  pick: 'pick', p: 'pick', reword: 'reword', r: 'reword', squash: 'squash', s: 'squash', fixup: 'fixup', f: 'fixup', drop: 'drop', d: 'drop', noop: 'noop'
}
/** Real todo commands the trainer does not run (yet), with their short forms. */
const TODO_ELSEWHERE: Record<string, string> = {
  'edit': 'edit', 'e': 'edit', 'exec': 'exec', 'x': 'exec', 'break': 'break', 'b': 'break', 'label': 'label', 'l': 'label',
  'reset': 'reset', 't': 'reset', 'merge': 'merge', 'm': 'merge', 'update-ref': 'update-ref', 'u': 'update-ref'
}

type ParsedTodo = { ok: true, steps: RebaseStep[], commands: number } | { ok: false, errors: string[] }

function parseTodo(repo: Repo, text: string): ParsedTodo {
  const steps: RebaseStep[] = []
  let commands = 0
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line || line.startsWith('#')) continue
    const invalid = `error: invalid line ${i + 1}: ${line}`
    const [word = '', target] = line.split(/\s+/)
    const action = TODO_ACTIONS[word]
    if (!action) {
      const elsewhere = TODO_ELSEWHERE[word]
      return { ok: false, errors: [elsewhere ? `error: '${elsewhere}' in the todo list is not in this trainer yet` : invalid] }
    }
    commands++
    if (action === 'noop') continue
    const name = word.length === 1 ? Object.keys(TODO_ACTIONS).find(key => key.length > 1 && TODO_ACTIONS[key] === action)! : word
    if (!target) return { ok: false, errors: [`error: missing arguments for ${name}`, invalid] }
    const commit = resolveRev(repo, target)
    if (!commit) return { ok: false, errors: [`error: could not parse '${target}'`, invalid] }
    if (isMeld(action) && steps.every(step => step.action === 'drop')) return { ok: false, errors: [`error: cannot '${name}' without a previous commit`] }
    steps.push({ action, commit })
  }
  return { ok: true, steps, commands }
}

// ---- replaying ----

/**
 * Commits the replayed changes (already in the index) for one step: a new commit for pick and reword (or, when the
 * commit's parent is HEAD and nothing changed, git's fast-forward to the commit itself), an amended HEAD for squash and fixup.
 */
function commitStep(state: GitState, step: RebaseStep, fastForward: boolean, continued = false): { state: GitState, output: OutputLine[] } {
  const repo = state.repo!
  const operation = repo.operation as RebaseOperation
  const commit = repo.commits[step.commit]!
  // a reword is a pick first (logged under its own name); its new message gets another entry once saved
  const reflog = (text: string) => reflogLine(operation, continued ? 'continue' : step.action, text)
  if (isMeld(step.action)) {
    const chain = [...(operation.chain ?? []), { message: commit.message, keep: step.action === 'squash' }]
    const head = repo.commits[headId(repo)!]!
    const message = chainMessage(chain)
    const committed = commitIndex(state, { message, amend: true, author: head.author, reflog: reflog(message.split('\n')[0]!) })
    return { state: withOperation(committed.state, { chain }), output: committed.output }
  }
  const chain = [{ message: commit.message, keep: true }]
  if (fastForward) {
    // git moves HEAD straight to the commit instead of picking it
    const moved = logHead({ ...repo, head: { type: 'detached', commit: commit.id } }, `${operation.action ?? 'rebase'}: fast-forward`)
    return { state: withOperation(withRepo(state, moved), { chain }), output: [] }
  }
  // a commit whose changes are already upstream becomes empty and is dropped
  if (treesEqual(repo.index, headTree(repo))) return { state, output: [] }
  const committed = commitIndex(state, { message: commit.message, author: commit.author, reflog: reflog(subject(commit)) })
  return { state: withOperation(committed.state, { chain }), output: committed.output }
}

/** After a step: open the commit message in the editor for a reword, and at the end of a squash chain. Null: go on. */
function pauseFor(state: GitState, step: RebaseStep): GitState | null {
  const repo = state.repo!
  const operation = repo.operation as RebaseOperation
  const chain = operation.chain ?? []
  let text: string | null = null
  if (step.action === 'reword') {
    text = [chainMessage(chain), '', ...messageFooter(repo, operation)].join('\n')
  } else if (isMeld(step.action) && !isMeld(operation.todo[0]?.action) && chain.slice(1).some(entry => entry.keep)) {
    text = combinationText(repo, chain, operation)
  }
  if (text === null) return null
  return withOperation(state, { editor: { kind: 'message', path: MESSAGE_PATH, text } })
}

/** Replays the remaining steps one by one; stops at the first conflict or when git needs a message. */
function replay(start: GitState, output: OutputLine[]): CommandResult {
  let state = start
  for (;;) {
    const repo = state.repo!
    const operation = repo.operation as RebaseOperation
    const [step, ...rest] = operation.todo
    if (!step) return finish(state, operation, output)
    const finished = [...(operation.done ?? []), step]

    // a dropped commit is only counted as done
    if (step.action === 'drop') {
      state = withRepo(state, { ...repo, operation: { ...operation, todo: rest, done: finished } })
      continue
    }

    const commit = repo.commits[step.commit]!
    const head = headId(repo)
    const parentTree = commit.parents[0] ? repo.commits[commit.parents[0]]!.tree : {}
    const oursTree = headTree(repo)
    const label = `${shortId(commit.id)} (${subject(commit)})`
    const merged = mergeTrees(parentTree, oursTree, commit.tree, { ours: 'HEAD', theirs: label })
    const applied = applyMerge(repo, state.workdir, oursTree, merged)
    if (!applied.ok) return fail(state, [...output, ...applied.output])

    if (merged.conflicts.length) {
      const stopped: Repo = {
        ...repo,
        index: applied.index,
        unmerged: applied.unmerged,
        operation: { ...operation, todo: rest, stopped: step, done: finished }
      }
      const apply = `${shortId(commit.id)}... ${subject(commit)}`
      return fail({ ...withRepo(state, stopped), workdir: applied.workdir }, [
        ...output,
        ...conflictReport(merged),
        err(`error: could not apply ${apply}`),
        hint('hint: Resolve all conflicts manually, mark them as resolved with'),
        hint('hint: "git add/rm <conflicted_files>", then run "git rebase --continue".'),
        hint('hint: You can instead skip this commit: run "git rebase --skip".'),
        hint('hint: To abort and get back to the state before "git rebase", run "git rebase --abort".'),
        hint(ADVICE_OFF),
        // the todo line's "# <subject>" is what git quotes here
        err(`Could not apply ${shortId(commit.id)}... # ${subject(commit)}`)
      ])
    }

    state = { ...withRepo(state, { ...repo, index: applied.index, operation: { ...operation, todo: rest, done: finished } }), workdir: applied.workdir }
    const fastForward = !isMeld(step.action) && commit.parents[0] === head && treesEqual(applied.index, commit.tree)
    state = commitStep(state, step, fastForward).state
    const paused = pauseFor(state, step)
    if (paused) return done(paused, [...output, hint(WAITING)])
  }
}

function refuseDirty(state: GitState): CommandResult | null {
  const repo = state.repo!
  // unmerged paths count as both: unstaged changes and an index that is not clean
  const unmerged = Object.keys(repo.unmerged).sort()
  const changes = unmerged.length ? { staged: true, unstaged: true } : localChanges(repo, state.workdir)
  const ask = err('error: Please commit or stash them.')
  if (changes.unstaged && changes.staged) {
    return fail(state, [
      ...unmerged.map(path => err(`${path}: needs merge`)),
      err('error: cannot rebase: You have unstaged changes.'),
      err('error: additionally, your index contains uncommitted changes.'),
      ask
    ])
  }
  if (changes.unstaged) return fail(state, [err('error: cannot rebase: You have unstaged changes.'), ask])
  if (changes.staged) return fail(state, [err('error: cannot rebase: Your index contains uncommitted changes.'), ask])
  return null
}

/** Checks out `onto` (detached) and replays `todo`, as the operation's next steps. */
function begin(state: GitState, operation: RebaseOperation, steps: RebaseStep[]): CommandResult {
  const repo = state.repo!
  // like git, leading picks whose parent is already the base are not replayed: the base moves up over them
  let base = operation.onto
  let skipped = 0
  while (steps[skipped]?.action === 'pick' && repo.commits[steps[skipped]!.commit]!.parents[0] === base) base = steps[skipped++]!.commit
  const todo = steps.slice(skipped)
  // a squash or fixup right after the skipped picks melds into the last of them, whose message starts the chain
  const chain = skipped ? [{ message: repo.commits[base]!.message, keep: true }] : operation.chain
  const moved = moveTrees(repo, state.workdir, headTree(repo), repo.commits[base]!.tree, 'checkout')
  if (!moved.ok) return fail(state, moved.output)
  const detached: Repo = { ...repo, head: { type: 'detached', commit: base }, index: moved.index, origHead: operation.origHead, operation: { ...operation, todo, done: steps.slice(0, skipped), editor: null, ...(chain ? { chain } : {}) } }
  const next = logHead(detached, reflogLine(operation, 'start', `checkout ${operation.upstream ?? operation.onto}`))
  return replay({ ...withRepo(state, next), workdir: moved.workdir }, [])
}

/** Starts rebasing HEAD onto `onto` (`upstream` as typed, `action` the reflog's name). Used by rebase and pull --rebase. */
export function startRebase(state: GitState, onto: string, names: { upstream?: string, action?: string } = {}): CommandResult {
  const repo = state.repo!
  const head = headId(repo)
  if (!head) return fatal(state, 'fatal: invalid upstream \'HEAD\'')
  const dirty = refuseDirty(state)
  if (dirty) return dirty

  const branch = activeBranch(repo)
  if (isAncestor(repo.commits, onto, head)) {
    return done(state, [out(branch ? `Current branch ${branch} is up to date.` : 'HEAD is up to date.')])
  }

  const todo = commitsToReplay(repo.commits, head, onto).map(commit => ({ action: 'pick' as const, commit: commit.id }))
  const operation: RebaseOperation = {
    type: 'rebase',
    branch,
    origHead: head,
    onto,
    todo: [],
    stopped: null,
    before: { index: repo.index, workdir: state.workdir },
    ...(names.action ? { action: names.action } : {}),
    ...(names.upstream ? { upstream: names.upstream } : {})
  }
  return begin(state, operation, todo)
}

/** `git rebase -i`: writes the todo list and waits for the editor; nothing moves until it is saved (submitEditor). */
function startInteractive(state: GitState, onto: string, upstream: string): CommandResult {
  const repo = state.repo!
  const head = headId(repo)
  if (!head) return fatal(state, 'fatal: invalid upstream \'HEAD\'')
  const dirty = refuseDirty(state)
  if (dirty) return dirty

  const text = todoText(commitsToReplay(repo.commits, head, onto), onto, head, onto)
  const operation: RebaseOperation = {
    type: 'rebase',
    branch: activeBranch(repo),
    origHead: head,
    onto,
    todo: [],
    stopped: null,
    before: { index: repo.index, workdir: state.workdir },
    interactive: true,
    editor: { kind: 'todo', path: TODO_PATH, text },
    upstream
  }
  return done(withRepo(state, { ...repo, operation }), [hint(WAITING)])
}

function applyTodo(state: GitState, operation: RebaseOperation, text: string): CommandResult {
  const parsed = parseTodo(state.repo!, text)
  if (!parsed.ok) {
    return fail(state, [...parsed.errors.map(line => err(line)), hint('hint: Fix the list in the editor and save it again, or run "git rebase --abort".')])
  }
  if (!parsed.commands) {
    // like git: an empty list cancels the rebase, nothing has moved yet
    return { state: withRepo(state, { ...state.repo!, operation: null }), output: [err('error: nothing to do')], exitCode: 1 }
  }
  return begin(state, operation, parsed.steps)
}

function applyMessage(state: GitState, text: string): CommandResult {
  const repo = state.repo!
  const head = repo.commits[headId(repo)!]!
  const message = cleanMessage(text)
  if (!message) {
    // the commit keeps the message it has; the rebase stops here and `git rebase --continue` goes on
    return {
      state: withOperation(state, { editor: null, stopped: { action: 'pick', commit: head.id } }),
      output: [err('Aborting commit due to empty commit message.'), err(`Could not apply ${shortId(head.id)}... ${subject(head)}`)],
      exitCode: 1
    }
  }
  const step = ((repo.operation as RebaseOperation).chain?.length ?? 0) > 1 ? 'squash' : 'reword'
  const reflog = reflogLine(repo.operation as RebaseOperation, step, message.split('\n')[0]!)
  const committed = commitIndex(withOperation(state, { editor: null }), { message, amend: true, author: head.author, reflog })
  return replay(withOperation(committed.state, { chain: [{ message, keep: true }] }), committed.output)
}

/**
 * Saves and closes the file git waits for in the editor (`git rebase -i`): the todo list starts the rebase, a commit
 * message is used for the reworded or squashed commit. Nothing waiting: an error, state unchanged.
 */
export function submitEditor(state: GitState, text: string): CommandResult {
  const operation = rebaseOf(state)
  const wait = operation?.editor
  if (!operation || !wait) return fail(state, [err('error: git is not waiting for a file in the editor')])
  return wait.kind === 'todo' ? applyTodo(state, operation, text) : applyMessage(state, text)
}

/** While git waits for the editor, the terminal is busy: only `git rebase --abort` gets through. */
export function waitingRefusal(state: GitState, argv: string[]): CommandResult | null {
  const wait = editorWait(state)
  if (!wait) return null
  if (argv[0] === 'git' && argv[1] === 'rebase' && argv[2] === '--abort' && argv.length === 3) return null
  const file = wait.path.slice(wait.path.lastIndexOf('/') + 1)
  return fail(state, [
    err(`error: git is waiting for you to close ${file} in the editor`),
    hint('hint: Save it or cancel it there first, or run "git rebase --abort".')
  ])
}

export const rebase: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('rebase', argv, { flags: ['--continue', '--abort', '--skip', '-i'], alias: { '--interactive': '-i' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  const operation = rebaseOf(state)

  if (flags.has('--abort')) {
    if (!operation) return noRebase(state)
    const head = operation.branch ? { type: 'branch' as const, name: operation.branch } : { type: 'detached' as const, commit: operation.origHead }
    const branches = operation.branch ? { ...repo.branches, [operation.branch]: operation.origHead } : repo.branches
    const restored: Repo = { ...repo, head, branches, index: operation.before.index, unmerged: {}, operation: null }
    // only a rebase that had moved HEAD records the way back (not one still waiting for its todo list)
    const moved = repo.head.type !== head.type || headId(repo) !== operation.origHead
    const target = operation.branch ? `refs/heads/${operation.branch}` : operation.origHead
    const next = moved ? logHead(restored, reflogLine(operation, 'abort', `returning to ${target}`), { branch: false }) : restored
    return done({ ...withRepo(state, next), workdir: operation.before.workdir })
  }

  if (flags.has('--skip')) {
    if (!operation) return noRebase(state)
    const tree = headTree(repo)
    let workdir = state.workdir
    for (const path of new Set([...Object.keys(repo.index), ...Object.keys(repo.unmerged), ...Object.keys(tree)])) {
      workdir = withEntry(workdir, path, tree[path])
    }
    const next: Repo = { ...repo, index: tree, unmerged: {}, operation: { ...operation, stopped: null } }
    return replay({ ...withRepo(state, next), workdir }, [])
  }

  if (flags.has('--continue')) {
    if (!operation) return noRebase(state)
    if (Object.keys(repo.unmerged).length) {
      return fail(state, [err('error: you must edit all merge conflicts and then'), err('mark them as resolved using git add')])
    }
    let current = withOperation(state, { stopped: null })
    const output: OutputLine[] = []
    const step = operation.stopped
    if (step && !treesEqual(repo.index, headTree(repo))) {
      const committed = commitStep(current, step, false, true)
      current = committed.state
      output.push(...committed.output)
      const paused = pauseFor(current, step)
      if (paused) return done(paused, [...output, hint(WAITING)])
    }
    return replay(current, output)
  }

  if (operation) {
    return fatal(state, [
      'fatal: It seems that there is already a rebase-merge directory, and',
      'I wonder if you are in the middle of another rebase.  If that is the',
      'case, please try',
      '\tgit rebase (--continue | --abort | --skip)'
    ].join('\n'))
  }
  if (repo.operation?.type === 'merge') return refuseDirty(state) ?? fatal(state, 'fatal: You have not concluded your merge (MERGE_HEAD exists).')
  if (repo.operation?.type === 'cherry-pick') return fatal(state, CHERRY_PICKING.split('\n')[0]!)

  let upstream = positionals[0]
  if (!upstream) {
    const current = activeBranch(repo)
    const tracked = current ? repo.upstream[current] : undefined
    if (!tracked) {
      return fail(state, [
        out('There is no tracking information for the current branch.'),
        out('Please specify which branch you want to rebase against.'),
        out('See git-rebase(1) for details.'),
        out(''),
        out('    git rebase \'<branch>\'')
      ])
    }
    upstream = `origin/${tracked}`
  }
  const onto = resolveRev(repo, upstream)
  if (!onto) return fatal(state, `fatal: invalid upstream '${upstream}'`)
  return flags.has('-i') ? startInteractive(state, onto, upstream) : startRebase(state, onto, { upstream })
}
