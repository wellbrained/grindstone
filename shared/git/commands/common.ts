// Helpers shared by the git commands.
import { countChanges } from '../diff'
import { range } from '../objects/graph'
import { err, fail, hint, out, plural, ref } from '../output'
import { trackingRef } from '../refs'
import { headId } from '../state'
import { changedPaths } from '../worktree'
import type { Commit, CommandResult, GitState, OutputLine, Repo, Tree } from '../types'

export const notARepo = (state: GitState) =>
  fail(state, [err('fatal: not a git repository (or any of the parent directories): .git')], 128)

export const fatal = (state: GitState, message: string, code = 128) =>
  fail(state, message.split('\n').map(text => err(text)), code)

export const withRepo = (state: GitState, repo: Repo): GitState => ({ ...state, repo })

export function storeCommit(repo: Repo, commit: Commit): Repo {
  return { ...repo, commits: { ...repo.commits, [commit.id]: commit } }
}

/** Points HEAD (its branch, or the detached HEAD) at `id`. */
export function moveHead(repo: Repo, id: string): Repo {
  if (repo.head.type === 'branch') return { ...repo, branches: { ...repo.branches, [repo.head.name]: id } }
  return { ...repo, head: { type: 'detached', commit: id } }
}

/** " 2 files changed, 3 insertions(+), 1 deletion(-)" plus the create/delete mode lines. */
export function summary(from: Tree, to: Tree): OutputLine[] {
  const paths = changedPaths(from, to)
  if (!paths.length) return []
  let insertions = 0
  let deletions = 0
  for (const path of paths) {
    const counts = countChanges(from[path], to[path])
    insertions += counts.insertions
    deletions += counts.deletions
  }
  let text = ` ${plural(paths.length, 'file')} changed`
  if (insertions || !deletions) text += `, ${insertions} insertion${insertions === 1 ? '' : 's'}(+)`
  if (deletions || !insertions) text += `, ${deletions} deletion${deletions === 1 ? '' : 's'}(-)`
  return [
    out(text),
    ...paths.flatMap((path) => {
      if (from[path] === undefined) return [out(` create mode 100644 ${path}`)]
      if (to[path] === undefined) return [out(` delete mode 100644 ${path}`)]
      return []
    })
  ]
}

/** Per-file diffstat (" app.txt | 2 +-") followed by the summary, as merge and pull print it. */
export function diffstat(from: Tree, to: Tree): OutputLine[] {
  const paths = changedPaths(from, to)
  const counts = paths.map(path => countChanges(from[path], to[path]))
  const width = Math.max(0, ...paths.map(path => path.length))
  const digits = Math.max(1, ...counts.map(count => String(count.insertions + count.deletions).length))
  const biggest = Math.max(0, ...counts.map(count => count.insertions + count.deletions))
  const scale = biggest > 50 ? 50 / biggest : 1
  const rows = paths.map((path, i) => {
    const { insertions, deletions } = counts[i]!
    const bar = '+'.repeat(Math.ceil(insertions * scale)) + '-'.repeat(Math.ceil(deletions * scale))
    return out(` ${path.padEnd(width)} | ${String(insertions + deletions).padStart(digits)} ${bar}`.trimEnd())
  })
  return [...rows, ...summary(from, to)]
}

export function aheadBehind(repo: Repo, local: string, upstream: string) {
  return {
    ahead: range(repo.commits, [local], [upstream]).length,
    behind: range(repo.commits, [upstream], [local]).length
  }
}

/** "Your branch is ahead of 'origin/main' by 1 commit." and friends, for status and switch. */
export function trackingInfo(repo: Repo, branch: string): OutputLine[] {
  const upstream = repo.upstream[branch]
  const local = repo.branches[branch]
  if (!upstream || !local) return []
  const name = trackingRef(upstream)
  const remote = repo.remoteBranches[upstream]
  if (!remote) {
    return [
      out('Your branch is based on \'', ref(name), '\', but the upstream is gone.'),
      hint('  (use "git branch --unset-upstream" to fixup)')
    ]
  }
  const { ahead, behind } = aheadBehind(repo, local, remote)
  if (!ahead && !behind) return [out('Your branch is up to date with \'', ref(name), '\'.')]
  if (!behind) {
    return [
      out('Your branch is ahead of \'', ref(name), `' by ${plural(ahead, 'commit')}.`),
      hint('  (use "git push" to publish your local commits)')
    ]
  }
  if (!ahead) {
    return [
      out('Your branch is behind \'', ref(name), `' by ${plural(behind, 'commit')}, and can be fast-forwarded.`),
      hint('  (use "git pull" to update your local branch)')
    ]
  }
  return [
    out('Your branch and \'', ref(name), '\' have diverged,'),
    out(`and have ${ahead} and ${behind} different commits each, respectively.`),
    hint('  (use "git pull" if you want to integrate the remote branch with yours)')
  ]
}

export function requireCommit(state: GitState, repo: Repo): string | CommandResult {
  const id = headId(repo)
  if (id) return id
  const name = repo.head.type === 'branch' ? repo.head.name : 'HEAD'
  return fatal(state, `fatal: your current branch '${name}' does not have any commits yet`)
}

/** The "on branch" label used in commit and rebase output: the branch name, or "detached HEAD". */
export const headLabel = (repo: Repo) => repo.head.type === 'branch' ? ref(repo.head.name) : 'detached HEAD'
