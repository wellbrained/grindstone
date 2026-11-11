// Commit graph algorithms over a commit map.
import type { Commit } from '../types'

export type Commits = Record<string, Commit>

/** Every commit reachable from `tips`, tips included. */
export function reachable(commits: Commits, tips: Array<string | null | undefined>): Set<string> {
  const seen = new Set<string>()
  const stack = tips.filter((tip): tip is string => !!tip && !!commits[tip])
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const parent of commits[id]?.parents ?? []) if (!seen.has(parent)) stack.push(parent)
  }
  return seen
}

export function isAncestor(commits: Commits, ancestor: string, descendant: string): boolean {
  return reachable(commits, [descendant]).has(ancestor)
}

/** The best common ancestor of two commits (the newest one if several qualify). */
export function mergeBase(commits: Commits, a: string, b: string): string | null {
  const fromA = reachable(commits, [a])
  const common = [...reachable(commits, [b])].filter(id => fromA.has(id))
  const best = common.filter(candidate => !common.some(other => other !== candidate && isAncestor(commits, candidate, other)))
  best.sort((x, y) => commits[y]!.timestamp - commits[x]!.timestamp)
  return best[0] ?? null
}

/** Commits reachable from `include` but not from `exclude`, newest first. */
export function range(commits: Commits, include: string[], exclude: string[] = []): Commit[] {
  const hidden = reachable(commits, exclude)
  return [...reachable(commits, include)]
    .filter(id => !hidden.has(id))
    .map(id => commits[id]!)
    .sort((x, y) => y.timestamp - x.timestamp)
}

/** Children before parents, keeping each line of history together (like `git log --topo-order`). */
export function topoOrder(commits: Commits, tips: string[], exclude: string[] = []): string[] {
  const hidden = reachable(commits, exclude)
  const visited = new Set<string>()
  const post: string[] = []
  const sortedTips = [...new Set(tips)]
    .filter(tip => commits[tip])
    .sort((x, y) => commits[x]!.timestamp - commits[y]!.timestamp)

  for (const tip of sortedTips) {
    // iterative depth-first search, first parent first
    const stack: Array<{ id: string, next: number }> = []
    const enter = (id: string) => {
      if (visited.has(id) || hidden.has(id)) return
      visited.add(id)
      stack.push({ id, next: 0 })
    }
    enter(tip)
    while (stack.length) {
      const frame = stack[stack.length - 1]!
      const parents = commits[frame.id]!.parents
      if (frame.next < parents.length) enter(parents[frame.next++]!)
      else post.push(stack.pop()!.id)
    }
  }
  return post.reverse()
}

/** Commits to replay for a rebase: reachable from `head`, not from `upstream`, oldest first, merges dropped. */
export function commitsToReplay(commits: Commits, head: string, upstream: string): Commit[] {
  return topoOrder(commits, [head], [upstream])
    .reverse()
    .map(id => commits[id]!)
    .filter(commit => commit.parents.length <= 1)
}
