import { parseArgs } from '../args'
import { createCommit, subject } from '../objects/commit'
import { commitsToReplay, isAncestor } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, ref } from '../output'
import { mergeTrees } from '../merge3'
import { resolveRev } from '../refs'
import { headId, headTree, withEntry } from '../state'
import { localChanges, moveTrees, treesEqual } from '../worktree'
import type { Command, CommandResult, GitState, OutputLine, RebaseOperation, Repo } from '../types'
import { activeBranch } from './branch'
import { commitIndex } from './commit'
import { fatal, notARepo, storeCommit, withRepo } from './common'
import { applyMerge, conflictReport } from './merge'

const noRebase = (state: GitState) => fatal(state, 'fatal: No rebase in progress?')

function finish(state: GitState, operation: RebaseOperation, output: OutputLine[]): CommandResult {
  const repo = state.repo!
  const tip = headId(repo)!
  if (!operation.branch) {
    return done(withRepo(state, { ...repo, operation: null }), [...output, out('Successfully rebased and updated detached HEAD.')])
  }
  const next: Repo = {
    ...repo,
    branches: { ...repo.branches, [operation.branch]: tip },
    head: { type: 'branch', name: operation.branch },
    operation: null
  }
  return done(withRepo(state, next), [...output, out('Successfully rebased and updated ', ref(`refs/heads/${operation.branch}`), '.')])
}

/** Replays the remaining commits one by one; stops at the first conflict. */
function replay(start: GitState, output: OutputLine[]): CommandResult {
  let state = start
  for (;;) {
    const repo = state.repo!
    const operation = repo.operation as RebaseOperation
    const [next, ...rest] = operation.todo
    if (!next) return finish(state, operation, output)

    const commit = repo.commits[next]!
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
        operation: { ...operation, todo: rest, stopped: commit.id }
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
        err(`Could not apply ${apply}`)
      ])
    }

    let nextRepo: Repo = { ...repo, index: applied.index, operation: { ...operation, todo: rest } }
    // a commit whose changes are already upstream becomes empty and is dropped
    if (!treesEqual(merged.index, oursTree)) {
      const created = createCommit(state, { parents: [headId(repo)!], tree: merged.index, message: commit.message, author: commit.author })
      state = created.state
      nextRepo = { ...storeCommit(nextRepo, created.commit), head: { type: 'detached', commit: created.commit.id } }
    }
    state = { ...withRepo(state, nextRepo), workdir: applied.workdir }
  }
}

/** Starts rebasing HEAD onto `onto`. Used by rebase and pull --rebase. */
export function startRebase(state: GitState, onto: string): CommandResult {
  const repo = state.repo!
  const head = headId(repo)
  if (!head) return fatal(state, 'fatal: invalid upstream \'HEAD\'')
  const changes = localChanges(repo, state.workdir)
  if (changes.unstaged) return fail(state, [err('error: cannot rebase: You have unstaged changes.'), err('error: Please commit or stash them.')])
  if (changes.staged) return fail(state, [err('error: cannot rebase: Your index contains uncommitted changes.'), err('error: Please commit or stash them.')])

  const branch = activeBranch(repo)
  if (isAncestor(repo.commits, onto, head)) {
    return done(state, [out(branch ? `Current branch ${branch} is up to date.` : 'HEAD is up to date.')])
  }

  const todo = commitsToReplay(repo.commits, head, onto).map(commit => commit.id)
  const moved = moveTrees(repo, state.workdir, headTree(repo), repo.commits[onto]!.tree, 'checkout')
  if (!moved.ok) return fail(state, moved.output)
  const next: Repo = {
    ...repo,
    head: { type: 'detached', commit: onto },
    index: moved.index,
    operation: { type: 'rebase', branch, origHead: head, onto, todo, stopped: null, before: { index: repo.index, workdir: state.workdir } }
  }
  return replay({ ...withRepo(state, next), workdir: moved.workdir }, [])
}

export const rebase: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('rebase', argv, { flags: ['--continue', '--abort', '--skip'] })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  const operation = repo.operation?.type === 'rebase' ? repo.operation : null

  if (flags.has('--abort')) {
    if (!operation) return noRebase(state)
    const head = operation.branch ? { type: 'branch' as const, name: operation.branch } : { type: 'detached' as const, commit: operation.origHead }
    const branches = operation.branch ? { ...repo.branches, [operation.branch]: operation.origHead } : repo.branches
    const next: Repo = { ...repo, head, branches, index: operation.before.index, unmerged: {}, operation: null }
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
    let current = state
    const output: OutputLine[] = []
    if (operation.stopped && !treesEqual(repo.index, headTree(repo))) {
      const stopped = repo.commits[operation.stopped]!
      const committed = commitIndex(state, { message: stopped.message, author: stopped.author })
      current = committed.state
      output.push(...committed.output)
    }
    const next = current.repo!
    return replay(withRepo(current, { ...next, operation: { ...(next.operation as RebaseOperation), stopped: null } }), output)
  }

  if (operation) {
    return fatal(state, [
      'fatal: It seems that there is already a rebase-merge directory, and',
      'I wonder if you are in the middle of another rebase.  If that is the',
      'case, please try',
      '\tgit rebase (--continue | --abort | --skip)'
    ].join('\n'))
  }
  if (repo.operation?.type === 'merge') return fatal(state, 'fatal: You have not concluded your merge (MERGE_HEAD exists).')

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
  return startRebase(state, onto)
}
