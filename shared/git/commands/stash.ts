// git stash: put staged and unstaged changes (with -u also untracked files) on a shelf and get them back later.
// Entries live on the repo (`repo.stash`, newest first), not as commits, so the graph and `log --all` leave them out.
// Applying is a three-way merge of the stashed working tree onto the current index; it refuses instead of writing
// conflict markers. Like git without --index, staged changes come back unstaged (new files come back staged).
import { parseArgs } from '../args'
import { ignoreMatcher } from '../ignore'
import { createCommit, subject } from '../objects/commit'
import { shortId } from '../objects/hash'
import { done, err, fail, out } from '../output'
import { mergeTrees } from '../merge3'
import { logHead } from '../reflog'
import { headId, without } from '../state'
import { hasUnmerged, moveTrees, treesEqual, unmergedOf } from '../worktree'
import type { Command, CommandResult, GitState, OutputLine, Repo, StashEntry, Tree } from '../types'
import { notARepo, resetWorkdirToHead, withRepo } from './common'
import { statusLines } from './status'

const branchLabel = (repo: Repo) => repo.head.type === 'branch' ? repo.head.name : '(no branch)'

/** Untracked files that no .gitignore names (what `git stash -u` takes along). */
function untrackedFiles(repo: Repo, workdir: Tree): Tree {
  const ignored = ignoreMatcher(workdir)
  return Object.fromEntries(Object.entries(workdir).filter(([path]) => repo.index[path] === undefined && !ignored(path)))
}

/**
 * What is left of a stopped operation once the hard reset is through: a merge, or a single stopped cherry-pick, is over
 * (no MERGE_HEAD, no CHERRY_PICK_HEAD); a cherry-pick with more picks waiting keeps its sequence for `--continue`/`--abort`.
 * A rebase keeps its own state.
 */
function afterReset(operation: Repo['operation']): Repo['operation'] {
  if (operation?.type === 'merge') return null
  if (operation?.type === 'cherry-pick') return operation.todo.length ? { ...operation, current: null } : null
  return operation
}

const push = (state: GitState, repo: Repo, argv: string[]): CommandResult => {
  const parsed = parseArgs('stash', argv, { flags: ['-u'], values: ['-m'], alias: { '--include-untracked': '-u', '--message': '-m' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args
  if (positionals.length) return fail(state, [err('git stash push: stashing only some paths is not in this trainer yet')])

  const unmerged = unmergedOf(repo)
  if (unmerged.length) {
    return fail(state, [...unmerged.map(path => err(`${path}: needs merge`)), err('error: could not write index')])
  }
  const head = headId(repo)
  if (!head) return fail(state, [err('You do not have the initial commit yet')])
  const headCommit = repo.commits[head]!

  const tracked: Tree = Object.fromEntries(Object.keys(repo.index).flatMap(path => state.workdir[path] === undefined ? [] : [[path, state.workdir[path]!]]))
  const untracked = flags.has('-u') ? untrackedFiles(repo, state.workdir) : {}
  const changed = !treesEqual(headCommit.tree, repo.index) || !treesEqual(repo.index, tracked) || Object.keys(untracked).length > 0
  if (!changed) return done(state, [out('No local changes to save')])

  const message = values['-m']
    ? `On ${branchLabel(repo)}: ${values['-m'].join('\n\n')}`
    : `WIP on ${branchLabel(repo)}: ${shortId(head)} ${subject(headCommit)}`
  // a commit object only for a deterministic id; it is not stored with the commits
  const created = createCommit(state, { parents: [head], tree: { ...untracked, ...tracked }, message })
  const entry: StashEntry = { id: created.commit.id, base: head, message, index: repo.index, workdir: tracked, untracked }

  // back to HEAD: tracked files as committed, staged new files gone, the untracked ones taken along removed
  const workdir = Object.keys(untracked).reduce(without, resetWorkdirToHead(repo, state.workdir))
  // git resets the working tree to HEAD for this, and the reflog says so
  const reset: Repo = { ...repo, index: headCommit.tree, unmerged: {}, operation: afterReset(repo.operation), stash: [entry, ...repo.stash] }
  const next: Repo = logHead(reset, 'reset: moving to HEAD')
  return done({ ...withRepo(created.state, next), workdir }, [out(`Saved working directory and index state ${message}`)])
}

/**
 * The entry an argument names (`stash@{1}` or a bare `1`, the newest by default), or git's error: "No stash entries
 * found." only without an argument; otherwise an unusable name is "not a valid reference" (exit 1) and a number past
 * the end counts the entries (exit 128).
 */
function pick(state: GitState, repo: Repo, arg: string | undefined): { index: number, name: string } | CommandResult {
  if (arg === undefined) {
    return repo.stash.length ? { index: 0, name: 'refs/stash@{0}' } : fail(state, [err('No stash entries found.')])
  }
  const braced = /^stash@\{(\d+)\}$/.exec(arg)
  const bare = /^\d+$/.test(arg)
  const index = braced ? Number(braced[1]) : bare ? Number(arg) : -1
  // git spells a bare number out as refs/stash@{n} in its messages
  if (index < 0 || !repo.stash.length) return fail(state, [err(`error: ${bare ? `refs/stash@{${arg}}` : arg} is not a valid reference`)])
  if (index >= repo.stash.length) return fail(state, [err(`fatal: log for '${bare ? 'refs/stash' : 'stash'}' only has ${repo.stash.length} entries`)], 128)
  return { index, name: bare ? `refs/stash@{${index}}` : `stash@{${index}}` }
}

const dropped = (entry: StashEntry, name: string) => out(`Dropped ${name} (${entry.id})`)

const apply = (state: GitState, repo: Repo, argv: string[], pop: boolean): CommandResult => {
  const command = pop ? 'pop' : 'apply'
  const parsed = parseArgs(`stash ${command}`, argv, {})
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const picked = pick(state, repo, parsed.args.positionals[0])
  if ('state' in picked) return picked
  const entry = repo.stash[picked.index]!
  const kept: OutputLine[] = pop ? [err('The stash entry is kept in case you need it again.')] : []

  if (hasUnmerged(repo) || repo.operation?.type === 'merge') {
    return fail(state, [err('error: cannot apply a stash in the middle of a merge'), ...kept])
  }
  const existing = Object.keys(entry.untracked).filter(path => state.workdir[path] !== undefined)
  if (existing.length) {
    return fail(state, [...existing.map(path => err(`${path} already exists, no checkout`)), err('error: could not restore untracked files from stash'), ...kept])
  }

  const merged = mergeTrees(repo.commits[entry.base]!.tree, repo.index, entry.workdir, { ours: 'Updated upstream', theirs: 'Stashed changes' })
  if (merged.conflicts.length) {
    const paths = merged.conflicts.map(conflict => conflict.path).join(', ')
    return fail(state, [err(`error: this stash conflicts with ${paths}; applying a stash with conflicts is not in this trainer yet`), ...kept])
  }
  const moved = moveTrees(repo, state.workdir, repo.index, merged.index, 'merge')
  // git shows where things stand after refusing, then says the entry is kept
  if (!moved.ok) return fail(state, [...moved.output, ...statusLines(repo, state.workdir), ...kept])

  // the index stays as it was, except that new files come back staged (git without --index)
  const index = { ...merged.index, ...repo.index }
  const workdir = { ...moved.workdir, ...entry.untracked }
  const stash = pop ? repo.stash.filter((_, i) => i !== picked.index) : repo.stash
  const next: Repo = { ...repo, index, stash }
  return done({ ...withRepo(state, next), workdir }, [...statusLines(next, workdir), ...(pop ? [dropped(entry, picked.name)] : [])])
}

const NOT_YET = ['show', 'save', 'branch', 'create', 'store']

export const stash: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const [sub, ...rest] = argv
  if (sub === undefined || sub.startsWith('-')) return push(state, repo, argv)

  switch (sub) {
    case 'push':
      return push(state, repo, rest)
    case 'list':
      return done(state, repo.stash.map((entry, i) => out(`stash@{${i}}: ${entry.message}`)))
    case 'apply':
      return apply(state, repo, rest, false)
    case 'pop':
      return apply(state, repo, rest, true)
    case 'drop': {
      const picked = pick(state, repo, rest[0])
      if ('state' in picked) return picked
      const entry = repo.stash[picked.index]!
      return done(withRepo(state, { ...repo, stash: repo.stash.filter((_, i) => i !== picked.index) }), [dropped(entry, picked.name)])
    }
    case 'clear':
      return done(withRepo(state, { ...repo, stash: [] }))
    default:
      if (NOT_YET.includes(sub)) return fail(state, [err(`git stash ${sub} is not in this trainer yet`)])
      return fail(state, [err(`fatal: subcommand wasn't specified; 'push' can't be assumed due to unexpected token '${sub}'`)], 128)
  }
}
