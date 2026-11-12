// Read-only questions over the state, for level goals and the UI.
import { ignoreMatcher } from './ignore'
import { isAncestor as reachableFrom, range } from './objects/graph'
import { resolveRev } from './refs'
import { headId, own } from './state'
import { computeStatus } from './worktree'
import type { Commit, EditorWait, GitState, Operation, StashEntry, Tag } from './types'

export function currentBranch(state: GitState): string | null {
  return state.repo?.head.type === 'branch' ? state.repo.head.name : null
}

export function headCommit(state: GitState): Commit | null {
  const id = state.repo ? headId(state.repo) : null
  return id ? state.repo!.commits[id]! : null
}

/** Resolves a revision (branch, origin/<branch>, HEAD~1, short id) in the local repository. */
export function resolve(state: GitState, rev: string): string | null {
  return state.repo ? resolveRev(state.repo, rev) : null
}

/** The commit a revision resolves to in the local repository, or null. */
export function commitAt(state: GitState, rev: string): Commit | null {
  const id = resolve(state, rev)
  return id ? state.repo!.commits[id]! : null
}

export function branchExists(state: GitState, name: string): boolean {
  return own(state.repo?.branches, name) !== undefined
}

/** Commits of a revision (`feature`) or range (`main..feature`), newest first. Empty if it does not resolve. */
export function commitsOf(state: GitState, revOrRange: string): Commit[] {
  if (!state.repo) return []
  const [from, to] = revOrRange.includes('..') ? revOrRange.split('..') as [string, string] : [null, revOrRange]
  const include = resolve(state, to || 'HEAD')
  const exclude = from === null ? null : resolve(state, from || 'HEAD')
  if (!include || (from !== null && !exclude)) return []
  return range(state.repo.commits, [include], exclude ? [exclude] : [])
}

/** Whether `ancestor` is contained in `descendant` (equal counts as contained). */
export function isAncestor(state: GitState, ancestor: string, descendant: string): boolean {
  const a = resolve(state, ancestor)
  const b = resolve(state, descendant)
  return !!a && !!b && reachableFrom(state.repo!.commits, a, b)
}

export function hasMergeCommits(state: GitState, revOrRange: string): boolean {
  return commitsOf(state, revOrRange).some(commit => commit.parents.length > 1)
}

export function aheadBehind(state: GitState, branch: string, other: string) {
  return { ahead: commitsOf(state, `${other}..${branch}`).length, behind: commitsOf(state, `${branch}..${other}`).length }
}

/** Where `branch` points on the remote itself (not our possibly stale origin/<branch>). */
export function remoteBranchHead(state: GitState, branch: string): string | null {
  return own(state.origin?.branches, branch) ?? null
}

/** Commits of a branch on the remote, newest first. */
export function remoteCommitsOf(state: GitState, branch: string): Commit[] {
  const tip = remoteBranchHead(state, branch)
  return tip ? range(state.origin!.commits, [tip]) : []
}

/** Our remote-tracking ref origin/<branch>, as of the last fetch, pull or push. */
export function trackingBranchHead(state: GitState, branch: string): string | null {
  return own(state.repo?.remoteBranches, branch) ?? null
}

/** The upstream of a local branch as 'origin/<name>', or null. */
export function upstreamOf(state: GitState, branch: string): string | null {
  const upstream = own(state.repo?.upstream, branch)
  return upstream ? `origin/${upstream}` : null
}

export function unmergedPaths(state: GitState): string[] {
  return state.repo ? Object.keys(state.repo.unmerged).sort() : []
}

export function conflictsInProgress(state: GitState): boolean {
  return unmergedPaths(state).length > 0
}

export function operationInProgress(state: GitState): Operation['type'] | null {
  return state.repo?.operation?.type ?? null
}

/** The file git waits for in the editor during `git rebase -i` (the todo list or a commit message), or null. */
export function waitingEditor(state: GitState): EditorWait | null {
  return state.repo?.operation?.type === 'rebase' ? state.repo.operation.editor : null
}

/** No staged, unstaged, untracked or conflicted files. */
export function isWorkingTreeClean(state: GitState): boolean {
  if (!state.repo) return Object.keys(state.workdir).length === 0
  const status = computeStatus(state.repo, state.workdir)
  return !status.staged.length && !status.unstaged.length && !status.unmerged.length && !status.untracked.length
}

/** Whether a .gitignore in the working tree hides this path from status and add; a tracked path never is. */
export function isIgnored(state: GitState, path: string): boolean {
  if (state.repo?.index[path] !== undefined || state.repo?.unmerged[path] !== undefined) return false
  return ignoreMatcher(state.workdir)(path)
}

export function fileContent(state: GitState, path: string): string | undefined {
  return own(state.workdir, path)
}

export function hasConflictMarkers(content: string): boolean {
  return /^(<{7}|={7}|>{7})( |$)/m.test(content)
}

/** The `git stash` entries, newest first (stash@{0} first). */
export function stashEntries(state: GitState): StashEntry[] {
  return state.repo?.stash ?? []
}

/** A local tag, or null. */
export function tagOf(state: GitState, name: string): Tag | null {
  return own(state.repo?.tags, name) ?? null
}

/** A tag on origin, or null. */
export function remoteTagOf(state: GitState, name: string): Tag | null {
  return own(state.origin?.tags, name) ?? null
}
