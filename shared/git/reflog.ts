// The reflog: where HEAD and each local branch pointed, newest first, with git's messages ("commit: <subject>",
// "reset: moving to HEAD~1", "checkout: moving from main to feature", ...). Commands record an entry for every move
// (docs/features/git-model.md, "Reflog"). Entries are plain data on the repo, so they stay immutable and deterministic.
import { headId, own } from './state'
import type { ReflogEntry, Repo } from './types'

/** The reflog key of HEAD; branches use their name (a branch can never be called HEAD). */
export const HEAD_LOG = 'HEAD'

export function reflogOf(repo: Repo, name: string): ReflogEntry[] {
  return own(repo.reflog, name) ?? []
}

/** Adds an entry (newest first) to one log. */
export function logRef(repo: Repo, name: string, id: string, message: string): Repo {
  return { ...repo, reflog: { ...repo.reflog, [name]: [{ id, message }, ...reflogOf(repo, name)] } }
}

/**
 * Records where HEAD points now. When HEAD is on a branch and `branch` is true (the move went through the branch:
 * commit, reset, merge), the branch's log gets the same entry, like git's symref update.
 */
export function logHead(repo: Repo, message: string, options: { branch?: boolean } = {}): Repo {
  const id = headId(repo)
  if (!id) return repo
  const logged = logRef(repo, HEAD_LOG, id, message)
  return options.branch !== false && repo.head.type === 'branch' ? logRef(logged, repo.head.name, id, message) : logged
}

/** Records where a branch points now (only that branch's log). */
export function logBranch(repo: Repo, name: string, message: string): Repo {
  const id = own(repo.branches, name)
  return id ? logRef(repo, name, id, message) : repo
}

/** Deleting a branch deletes its log, like git. */
export function dropLog(repo: Repo, name: string): Repo {
  if (!repo.reflog || !own(repo.reflog, name)) return repo
  const { [name]: _dropped, ...rest } = repo.reflog
  return { ...repo, reflog: rest }
}

/** Renaming a branch takes its log along. */
export function renameLog(repo: Repo, from: string, to: string): Repo {
  const entries = own(repo.reflog, from)
  if (!entries) return repo
  const { [from]: _moved, ...rest } = repo.reflog!
  return { ...repo, reflog: { ...rest, [to]: entries } }
}

/** The ref `<name>@{n}` stands for: HEAD, a branch, or (for a bare `@{n}`) the current branch. Null when there is none. */
function selectorRef(repo: Repo, name: string): string | null {
  if (name === '') return repo.head.type === 'branch' ? repo.head.name : null
  if (name === 'HEAD' || name === '@') return HEAD_LOG
  const branch = name.replace(/^refs\/heads\//, '')
  return own(repo.branches, branch) ? branch : null
}

/** Resolves `HEAD@{n}`, `<branch>@{n}` and `@{n}` (the current branch) to a commit id, or null. */
export function resolveSelector(repo: Repo, rev: string): string | null {
  const match = /^(.*)@\{(\d+)\}$/.exec(rev)
  if (!match) return null
  const ref = selectorRef(repo, match[1]!)
  return ref ? reflogOf(repo, ref)[Number(match[2])]?.id ?? null : null
}
