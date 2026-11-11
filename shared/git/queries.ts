// Read-only questions over the state, for level goals and the UI.
import { isAncestor as reachableFrom, range } from './objects/graph'
import { resolveRev } from './refs'
import { headId } from './state'
import { computeStatus } from './worktree'
import type { Commit, GitState } from './types'

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

export function branchExists(state: GitState, name: string): boolean {
  return state.repo?.branches[name] !== undefined
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
  return state.origin?.branches[branch] ?? null
}

/** Commits of a branch on the remote, newest first. */
export function remoteCommitsOf(state: GitState, branch: string): Commit[] {
  const tip = remoteBranchHead(state, branch)
  return tip ? range(state.origin!.commits, [tip]) : []
}

/** Our remote-tracking ref origin/<branch>, as of the last fetch, pull or push. */
export function trackingBranchHead(state: GitState, branch: string): string | null {
  return state.repo?.remoteBranches[branch] ?? null
}

/** The upstream of a local branch as 'origin/<name>', or null. */
export function upstreamOf(state: GitState, branch: string): string | null {
  const upstream = state.repo?.upstream[branch]
  return upstream ? `origin/${upstream}` : null
}

export function unmergedPaths(state: GitState): string[] {
  return state.repo ? Object.keys(state.repo.unmerged).sort() : []
}

export function conflictsInProgress(state: GitState): boolean {
  return unmergedPaths(state).length > 0
}

export function operationInProgress(state: GitState): 'merge' | 'rebase' | null {
  return state.repo?.operation?.type ?? null
}

/** No staged, unstaged, untracked or conflicted files. */
export function isWorkingTreeClean(state: GitState): boolean {
  if (!state.repo) return Object.keys(state.workdir).length === 0
  const status = computeStatus(state.repo, state.workdir)
  return !status.staged.length && !status.unstaged.length && !status.unmerged.length && !status.untracked.length
}

export function fileContent(state: GitState, path: string): string | undefined {
  return state.workdir[path]
}

export function hasConflictMarkers(content: string): boolean {
  return /^(<{7}|={7}|>{7})( |$)/m.test(content)
}
