// git cherry-pick: copies commits onto HEAD (docs/features/git-model.md, "Cherry-pick"). The mirror of revert: each
// commit's change against its parent is merged three-way onto HEAD and committed with the commit's message and author.
// A conflict, or a pick that comes out empty, stops like a merge with the cherry-pick operation in progress.
import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { topoOrder } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint } from '../output'
import { logHead } from '../reflog'
import { resolveRev } from '../refs'
import { headId, headTree } from '../state'
import { hasUnmerged, treesEqual } from '../worktree'
import type { CherryPickOperation, Command, CommandResult, Commit, GitState, OutputLine, Repo, Snapshot } from '../types'
import { commitIndex, unresolvedConflict } from './commit'
import { ADVICE_OFF, SEQUENCER_OPTIONS, blockedBy, fatal, moveRef, notARepo, refuseDirtyIndex, requireCommit, resetWorkdirToHead, restoreTracked, withRepo } from './common'
import { conflictReport, mergeCommit } from './merge'
import { statusLines } from './status'

const FAILED = 'fatal: cherry-pick failed'

const pickOf = (repo: Repo): CherryPickOperation | null => repo.operation?.type === 'cherry-pick' ? repo.operation : null

const noPick = (state: GitState) => fail(state, [err('error: no cherry-pick or revert in progress'), err(FAILED)], 128)

/** git's wording for `--skip` without a cherry-pick (it only looks for a pick, not a revert). */
const noPickToSkip = (state: GitState) => fail(state, [err('error: no cherry-pick in progress'), err(FAILED)], 128)

const USAGE = [
  'usage: git cherry-pick [--edit] [-n] [-m <parent-number>] [-s] [-x] [--ff]',
  '                       [-S[<keyid>]] <commit>...',
  '   or: git cherry-pick (--continue | --skip | --abort | --quit)',
  ...SEQUENCER_OPTIONS,
  '    -x                    append commit name',
  '    --[no-]ff             allow fast-forward',
  '    --[no-]allow-empty    preserve initially empty commits',
  '    --[no-]allow-empty-message',
  '                          allow commits with empty messages',
  '    --[no-]keep-redundant-commits',
  '                          deprecated: use --empty=keep instead',
  '    --empty (stop|drop|keep)',
  '                          how to handle commits that become empty',
  ''
]

/** The commit message of a pick; `-x` adds the line git uses to say where it came from. */
const pickMessage = (commit: Commit, recordOrigin: boolean) =>
  recordOrigin ? `${commit.message}\n\n(cherry picked from commit ${commit.id})` : commit.message

/** How a cherry-pick command runs its picks (the stopped operation keeps all of it but `noCommit`). */
interface PickRun {
  recordOrigin: boolean
  noCommit: boolean
  head: string
  before: Snapshot
}

/** The run a stopped cherry-pick goes on with (`--continue`, `--skip`): never `-n`, that one does not stop as an operation. */
const runOf = (operation: CherryPickOperation): PickRun =>
  ({ recordOrigin: operation.recordOrigin, noCommit: false, head: operation.head, before: operation.before })

/** git's text for a pick that changed nothing: the status, then how to go on. */
function emptyPick(repo: Repo, workdir: GitState['workdir']): OutputLine[] {
  return [
    ...statusLines(repo, workdir),
    err('The previous cherry-pick is now empty, possibly due to conflict resolution.'),
    err('If you wish to commit it anyway, use:'),
    err(''),
    err('    git commit --allow-empty'),
    err(''),
    err('Otherwise, please use \'git cherry-pick --skip\'')
  ]
}

const stopAt = (repo: Repo, id: string, todo: string[], run: PickRun): Repo => ({
  ...repo,
  operation: {
    type: 'cherry-pick',
    current: id,
    message: pickMessage(repo.commits[id]!, run.recordOrigin),
    todo,
    recordOrigin: run.recordOrigin,
    head: run.head,
    before: run.before
  }
})

/** Picks `todo` one by one onto HEAD; stops at the first conflict or empty pick. */
function replay(start: GitState, todo: string[], run: PickRun, output: OutputLine[]): CommandResult {
  let state = withRepo(start, { ...start.repo!, operation: null })
  for (let i = 0; i < todo.length; i++) {
    const repo = state.repo!
    const commit = repo.commits[todo[i]!]!
    const rest = todo.slice(i + 1)
    // with -n the picks pile up in the index; otherwise every pick starts from the commit before
    const { merged, applied } = mergeCommit(repo, state.workdir, commit, run.noCommit ? repo.index : headTree(repo))
    if (!applied.ok) return fail(state, [...output, ...applied.output, err(FAILED)], 128)

    if (merged.conflicts.length) {
      const conflicted: Repo = { ...repo, index: applied.index, unmerged: applied.unmerged }
      const apply = `${shortId(commit.id)}... ${subject(commit)}`
      const lines = [...output, ...conflictReport(merged), err(`error: could not apply ${apply}`)]
      if (run.noCommit) {
        return fail({ ...withRepo(state, conflicted), workdir: applied.workdir }, [
          ...lines,
          hint('hint: after resolving the conflicts, mark the corrected paths'),
          hint('hint: with \'git add <paths>\' or \'git rm <paths>\''),
          hint(ADVICE_OFF)
        ])
      }
      return fail({ ...withRepo(state, stopAt(conflicted, commit.id, rest, run)), workdir: applied.workdir }, [
        ...lines,
        hint('hint: After resolving the conflicts, mark them with'),
        hint('hint: "git add/rm <pathspec>", then run'),
        hint('hint: "git cherry-pick --continue".'),
        hint('hint: You can instead skip this commit with "git cherry-pick --skip".'),
        hint('hint: To abort and get back to the state before "git cherry-pick",'),
        hint('hint: run "git cherry-pick --abort".'),
        hint(ADVICE_OFF)
      ])
    }

    state = { ...withRepo(state, { ...repo, index: applied.index }), workdir: applied.workdir }
    if (run.noCommit) continue
    if (treesEqual(applied.index, headTree(repo))) {
      const stopped = stopAt(state.repo!, commit.id, rest, run)
      return fail(withRepo(state, stopped), [...output, ...emptyPick(stopped, state.workdir)])
    }
    const committed = commitIndex(state, { message: pickMessage(commit, run.recordOrigin), author: commit.author, reflog: `cherry-pick: ${subject(commit)}` })
    state = committed.state
    output.push(...committed.output)
  }
  return done(state, output)
}

/** The commits a list of revisions and `a..b` ranges stands for, in the order to pick them. Null: an unknown revision. */
function commitsToPick(repo: Repo, revs: string[]): { ids: string[] } | { bad: string } | { unsupported: string } {
  const ids: string[] = []
  for (const rev of revs) {
    // a...b is the symmetric difference in git; only a..b is handled here
    if (rev.includes('...')) return { unsupported: rev }
    if (rev.includes('..')) {
      const [from, to] = rev.split('..')
      const exclude = resolveRev(repo, from || 'HEAD')
      const include = resolveRev(repo, to || 'HEAD')
      if (!exclude) return { bad: from! }
      if (!include) return { bad: to! }
      ids.push(...topoOrder(repo.commits, [include], [exclude]).reverse())
    } else {
      const id = resolveRev(repo, rev)
      if (!id) return { bad: rev }
      ids.push(id)
    }
  }
  return { ids }
}

function abort(state: GitState, repo: Repo, operation: CherryPickOperation): CommandResult {
  // git goes back with `reset --merge <id>`, which writes a reset entry (also when HEAD stays where it is)
  const next = moveRef({ ...repo, index: operation.before.index, unmerged: {}, operation: null }, 'HEAD', operation.head, { log: `reset: moving to ${operation.head}` })
  return done({ ...withRepo(state, next), workdir: restoreTracked(repo, state.workdir, operation.before) })
}

function skip(state: GitState, repo: Repo, operation: CherryPickOperation): CommandResult {
  // like rebase --skip: every tracked file back to HEAD, then on with the rest
  const workdir = resetWorkdirToHead(repo, state.workdir)
  // git resets to HEAD first, which shows in the reflog even though HEAD does not move
  const reset = logHead({ ...repo, index: headTree(repo), unmerged: {} }, `reset: moving to ${headId(repo)}`)
  return replay({ ...withRepo(state, reset), workdir }, operation.todo, runOf(operation), [])
}

function resume(state: GitState, repo: Repo, operation: CherryPickOperation): CommandResult {
  if (hasUnmerged(repo)) return unresolvedConflict(state, 'Committing')
  const run = runOf(operation)
  if (!operation.current) return replay(state, operation.todo, run, [])
  if (treesEqual(repo.index, headTree(repo))) return fail(state, emptyPick(repo, state.workdir))
  const picked = repo.commits[operation.current]!
  const working = withRepo(state, { ...repo, operation: null })
  const committed = commitIndex(working, { message: operation.message, author: picked.author, reflog: `cherry-pick: ${subject(picked)}` })
  return replay(committed.state, operation.todo, run, committed.output)
}

export const cherryPick: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('cherry-pick', argv, {
    flags: ['-x', '-n', '--continue', '--abort', '--skip'],
    alias: { '--no-commit': '-n' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  const operation = pickOf(repo)

  if (flags.has('--abort')) return operation ? abort(state, repo, operation) : noPick(state)
  if (flags.has('--skip')) return operation ? skip(state, repo, operation) : noPickToSkip(state)
  if (flags.has('--continue')) return operation ? resume(state, repo, operation) : noPick(state)

  // a cherry-pick in progress is named first, then unmerged files, then any other operation
  if (operation) return blockedBy(state, 'cherry-pick')!
  if (hasUnmerged(repo)) {
    return fail(state, [
      err('error: Cherry-picking is not possible because you have unmerged files.'),
      hint('hint: Fix them up in the work tree, and then use \'git add/rm <file>\''),
      hint('hint: as appropriate to mark resolution and make a commit.'),
      err(FAILED)
    ], 128)
  }
  const blocked = blockedBy(state, 'cherry-pick')
  if (blocked) return blocked
  if (!positionals.length) return fail(state, USAGE.map(text => err(text)), 129)

  const head = requireCommit(state, repo)
  if (typeof head !== 'string') return head
  const picks = commitsToPick(repo, positionals)
  if ('unsupported' in picks) return fail(state, [err(`git cherry-pick: ${picks.unsupported}: three-dot ranges are not in this trainer yet (use a..b)`)])
  if ('bad' in picks) return fatal(state, `fatal: bad revision '${picks.bad}'`)
  const merge = picks.ids.find(id => repo.commits[id]!.parents.length > 1)
  if (merge) return fail(state, [err(`error: commit ${merge} is a merge but no -m option was given.`), err(FAILED)], 128)
  const dirty = flags.has('-n') ? null : refuseDirtyIndex(state, 'cherry-pick')
  if (dirty) return dirty

  return replay(state, picks.ids, { recordOrigin: flags.has('-x'), noCommit: flags.has('-n'), head, before: { index: repo.index, workdir: state.workdir } }, [])
}
