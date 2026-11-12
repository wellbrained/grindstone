// git revert <commit>: a new commit that undoes an older one. No editor: it takes git's default message.
// A revert that would conflict is refused (conflicting reverts are not in the trainer yet), and so is a merge commit (git needs -m).
import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { shortId } from '../objects/hash'
import { done, err, fail, hint } from '../output'
import { mergeTrees } from '../merge3'
import { resolveRev } from '../refs'
import { headTree } from '../state'
import { moveTrees, treesEqual } from '../worktree'
import type { Command } from '../types'
import { commitIndex } from './commit'
import { fatal, notARepo, requireCommit, withRepo } from './common'
import { statusLines } from './status'

export const revert: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('revert', argv, { flags: ['--no-edit'] })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { positionals } = parsed.args
  if (!positionals.length) return fail(state, [err('usage: git revert [--no-edit] <commit>')], 129)
  if (positionals.length > 1) return fail(state, [err('git revert: reverting several commits at once is not in this trainer yet')])

  if (Object.keys(repo.unmerged).length) {
    return fail(state, [
      err('error: revert is not possible because you have unmerged files.'),
      hint('hint: Fix them up in the work tree, and then use \'git add/rm <file>\''),
      hint('hint: as appropriate to mark resolution and make a commit.'),
      err('fatal: revert failed')
    ], 128)
  }
  if (repo.operation?.type === 'merge') return fatal(state, 'fatal: You have not concluded your merge (MERGE_HEAD exists).')
  if (repo.operation?.type === 'rebase') return fatal(state, 'fatal: You are in the middle of a rebase; finish it with "git rebase --continue" or "git rebase --abort" first.')

  const head = requireCommit(state, repo)
  if (typeof head !== 'string') return head
  const rev = positionals[0]!
  const id = resolveRev(repo, rev)
  if (!id) return fatal(state, `fatal: bad revision '${rev}'`)
  const commit = repo.commits[id]!
  if (commit.parents.length > 1) {
    return fail(state, [err(`error: commit ${id} is a merge but no -m option was given.`), err('fatal: revert failed')], 128)
  }

  const ours = headTree(repo)
  if (!treesEqual(ours, repo.index)) {
    return fail(state, [
      err('error: your local changes would be overwritten by revert.'),
      hint('hint: commit your changes or stash them to proceed.'),
      err('fatal: revert failed')
    ], 128)
  }

  // the change from the commit back to its parent, applied on top of HEAD
  const parentTree = commit.parents[0] ? repo.commits[commit.parents[0]]!.tree : {}
  const label = `${shortId(id)}... ${subject(commit)}`
  const merged = mergeTrees(commit.tree, ours, parentTree, { ours: 'HEAD', theirs: `parent of ${label}` })
  if (merged.conflicts.length) {
    return fail(state, [
      err(`error: could not revert ${label}`),
      hint(`hint: this revert conflicts with later changes to ${merged.conflicts.map(conflict => conflict.path).join(', ')}; reverts with conflicts are not in this trainer yet`)
    ])
  }
  // nothing left to undo (already reverted): git stops with the status, like an empty commit
  if (treesEqual(merged.index, ours)) return fail(state, statusLines(repo, state.workdir))

  const moved = moveTrees(repo, state.workdir, ours, merged.index, 'merge')
  if (!moved.ok) return fail(state, [...moved.output, err('fatal: revert failed')], 128)
  const working = { ...withRepo(state, { ...repo, index: moved.index }), workdir: moved.workdir }
  const result = commitIndex(working, { message: `Revert "${subject(commit)}"\n\nThis reverts commit ${id}.`, reflog: `revert: Revert "${subject(commit)}"` })
  return done(result.state, result.output)
}
