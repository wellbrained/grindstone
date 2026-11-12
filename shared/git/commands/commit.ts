import { parseArgs } from '../args'
import { createCommit, subject } from '../objects/commit'
import { shortId } from '../objects/hash'
import { err, fail, hint, out } from '../output'
import { logHead } from '../reflog'
import { headId, headTree } from '../state'
import { treesEqual } from '../worktree'
import type { Author, Command, CommandResult, GitState, OutputLine } from '../types'
import { stage } from './add'
import { fatal, headLabel, moveHead, notARepo, storeCommit, summary, withRepo } from './common'
import { statusLines } from './status'

export const unresolvedConflict = (state: GitState, action: string): CommandResult => fail(state, [
  err(`error: ${action} is not possible because you have unmerged files.`),
  hint('hint: Fix them up in the work tree, and then use \'git add/rm <file>\''),
  hint('hint: as appropriate to mark resolution and make a commit.'),
  err('fatal: Exiting because of an unresolved conflict.')
], 128)

export interface CommitOptions {
  message: string
  author?: Author
  /** Replace HEAD instead of adding a child (`--amend`). */
  amend?: boolean
  /** The reflog message; git's `commit: <subject>` (or `commit (amend)`, `(initial)`, `(merge)`) by default. */
  reflog?: string
}

function commitReflog(subjectLine: string, kind: { amend: boolean, initial: boolean, merge: boolean }): string {
  const variant = kind.amend ? ' (amend)' : kind.initial ? ' (initial)' : kind.merge ? ' (merge)' : ''
  return `commit${variant}: ${subjectLine}`
}

/** Commits the index; used by `git commit`, `rebase --continue` and the setup builder. */
export function commitIndex(state: GitState, options: CommitOptions): { state: GitState, output: OutputLine[] } {
  const repo = state.repo!
  const head = headId(repo)
  const previous = head ? repo.commits[head]! : null
  const merging = repo.operation?.type === 'merge' ? repo.operation : null
  // a plain `git commit` that concludes a stopped cherry-pick; the picks after it wait for `git cherry-pick --continue`
  const picking = repo.operation?.type === 'cherry-pick' && repo.operation.current ? repo.operation : null
  const parents = options.amend && previous
    ? previous.parents
    : [...(head ? [head] : []), ...(merging ? [merging.theirs] : [])]

  const created = createCommit(state, { parents, tree: repo.index, message: options.message, author: options.author })
  const commit = created.commit
  let next = moveHead(storeCommit(repo, commit), commit.id)
  if (merging) next = { ...next, operation: null, unmerged: {} }
  if (picking) next = { ...next, operation: picking.todo.length ? { ...picking, current: null } : null, unmerged: {} }
  const amend = !!options.amend && !!previous
  const reflog = picking && !amend ? `commit (cherry-pick): ${subject(commit)}` : commitReflog(subject(commit), { amend, initial: parents.length === 0, merge: !!merging })
  next = logHead(next, options.reflog ?? reflog)

  const root = parents.length === 0 ? ' (root-commit)' : ''
  const output = [out('[', headLabel(repo), `${root} ${shortId(commit.id)}] ${subject(commit)}`)]
  if (parents.length < 2) {
    const parentTree = parents[0] ? repo.commits[parents[0]]!.tree : {}
    output.push(...summary(parentTree, commit.tree))
  }
  return { state: withRepo(created.state, next), output }
}

export const commit: Command = (state, argv) => {
  let repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('commit', argv, {
    flags: ['-a', '--amend', '--no-edit', '--allow-empty'],
    values: ['-m'],
    alias: { '--message': '-m', '--all': '-a' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args
  if (positionals.length) return fail(state, [err(`git commit: committing only some paths ('${positionals[0]}') is not in this trainer yet`)])

  if (Object.keys(repo.unmerged).length) return unresolvedConflict(state, 'Committing')

  const amend = flags.has('--amend')
  const head = headId(repo)
  if (amend && !head) return fatal(state, 'fatal: You have nothing to amend.')
  if (amend && repo.operation?.type === 'merge') return fatal(state, 'fatal: You are in the middle of a merge -- cannot amend.')

  if (flags.has('-a')) {
    const tracked = Object.keys(repo.index).filter(path => state.workdir[path] !== repo!.index[path])
    repo = stage(repo, state.workdir, tracked)
  }

  const previous = head ? repo.commits[head]! : null
  const picked = repo.operation?.type === 'cherry-pick' && repo.operation.current ? repo.operation : null
  let message: string
  if (values['-m']) message = values['-m'].join('\n\n')
  else if (repo.operation?.type === 'merge') message = repo.operation.message
  else if (picked && !amend) message = picked.message
  else if (amend && previous) message = previous.message
  else {
    return fail(state, [
      err('error: there is no editor in this trainer for commit messages'),
      hint('hint: write the message on the command line: git commit -m "message"')
    ])
  }
  if (!message.trim()) return fail(state, [err('Aborting commit due to empty commit message.')])

  const working = withRepo(state, repo)
  const unchanged = treesEqual(headTree(repo), repo.index)
  if (unchanged && !amend && repo.operation?.type !== 'merge' && !flags.has('--allow-empty')) {
    return fail(state, statusLines(repo, state.workdir))
  }

  // like git, a commit that concludes a cherry-pick keeps the picked commit's author
  const author = amend ? previous!.author : picked ? repo.commits[picked.current!]!.author : undefined
  const result = commitIndex(working, { message: message.trim(), amend, author })
  return { state: result.state, output: result.output, exitCode: 0 }
}
