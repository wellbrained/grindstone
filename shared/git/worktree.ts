// Working tree and index bookkeeping shared by checkout, merge, rebase and status.
import { ignoreMatcher } from './ignore'
import { err, out } from './output'
import { headTree, withEntry } from './state'
import type { OutputLine, Repo, Tree } from './types'

/** Every path of the given trees, sorted. */
export const union = (...trees: Tree[]) => [...new Set(trees.flatMap(tree => Object.keys(tree)))].sort()

/** Whether any path has an unresolved conflict. */
export const hasUnmerged = (repo: Repo) => Object.keys(repo.unmerged).length > 0

/** The paths with an unresolved conflict, sorted. */
export const unmergedOf = (repo: Repo) => Object.keys(repo.unmerged).sort()

export function changedPaths(a: Tree, b: Tree): string[] {
  return union(a, b).filter(path => a[path] !== b[path])
}

export const treesEqual = (a: Tree, b: Tree) => changedPaths(a, b).length === 0

export interface LocalChanges {
  staged: boolean
  unstaged: boolean
}

/** Whether tracked files differ between HEAD and index, or between index and working tree. */
export function localChanges(repo: Repo, workdir: Tree): LocalChanges {
  const head = headTree(repo)
  return {
    staged: !treesEqual(head, repo.index),
    unstaged: Object.keys(repo.index).some(path => workdir[path] !== repo.index[path])
  }
}

export type MoveResult
  = | { ok: true, index: Tree, workdir: Tree, carried: OutputLine[] }
    | { ok: false, output: OutputLine[] }

/**
 * Moves index and working tree from `from` to `to` like git's two-way checkout: files that differ
 * between the two trees are replaced; local changes elsewhere are carried; collisions abort.
 */
export function moveTrees(repo: Repo, workdir: Tree, from: Tree, to: Tree, verb: 'checkout' | 'merge'): MoveResult {
  let index = repo.index
  let files = workdir
  const overwritten: string[] = []
  const untracked: string[] = []

  for (const path of union(from, to, repo.index)) {
    if (from[path] === to[path]) continue
    const tracked = repo.index[path] !== undefined || from[path] !== undefined
    if (!tracked) {
      if (workdir[path] !== undefined && workdir[path] !== to[path]) untracked.push(path)
    } else {
      const dirty = repo.index[path] !== from[path] || workdir[path] !== repo.index[path]
      if (dirty && !(repo.index[path] === to[path] && workdir[path] === to[path])) overwritten.push(path)
    }
    index = withEntry(index, path, to[path])
    files = withEntry(files, path, to[path])
  }

  if (overwritten.length || untracked.length) {
    const output: OutputLine[] = []
    const action = verb === 'checkout' ? 'switch branches' : 'merge'
    if (overwritten.length) {
      output.push(err(`error: Your local changes to the following files would be overwritten by ${verb}:`))
      output.push(...overwritten.map(path => err(`\t${path}`)))
      output.push(err(`Please commit your changes or stash them before you ${action}.`))
    }
    if (untracked.length) {
      output.push(err(`error: The following untracked working tree files would be overwritten by ${verb}:`))
      output.push(...untracked.map(path => err(`\t${path}`)))
      output.push(err(`Please move or remove them before you ${action}.`))
    }
    output.push(err('Aborting'))
    return { ok: false, output }
  }

  // like git, list the local changes that were carried over: M, A or D per path
  const carried = union(to, index)
    .filter(path => index[path] !== to[path] || (index[path] !== undefined && files[path] !== index[path]))
    .map(path => out(`${files[path] === undefined ? 'D' : to[path] === undefined ? 'A' : 'M'}\t${path}`))
  return { ok: true, index, workdir: files, carried }
}

export interface StatusEntry {
  path: string
  label: string
}

export interface Status {
  staged: StatusEntry[]
  unstaged: StatusEntry[]
  unmerged: StatusEntry[]
  /** Untracked paths that no .gitignore pattern matches; a folder with nothing tracked inside collapses to "dir/". */
  untracked: string[]
}

export function computeStatus(repo: Repo, workdir: Tree): Status {
  const head = headTree(repo)
  const conflicted = (path: string) => repo.unmerged[path] !== undefined

  const staged = changedPaths(head, repo.index).filter(path => !conflicted(path)).map(path => ({
    path,
    label: head[path] === undefined ? 'new file' : repo.index[path] === undefined ? 'deleted' : 'modified'
  }))
  const unstaged = Object.keys(repo.index).sort()
    .filter(path => !conflicted(path) && workdir[path] !== repo.index[path])
    .map(path => ({ path, label: workdir[path] === undefined ? 'deleted' : 'modified' }))
  const unmerged = Object.keys(repo.unmerged).sort().map(path => ({ path, label: repo.unmerged[path]! }))

  // untracked directories collapse to "dir/" when nothing inside is tracked
  const tracked = [...Object.keys(repo.index), ...Object.keys(repo.unmerged)]
  const untracked = new Set<string>()
  const ignored = ignoreMatcher(workdir)
  for (const path of Object.keys(workdir)) {
    if (repo.index[path] !== undefined || conflicted(path) || ignored(path)) continue
    const parts = path.split('/')
    let shown = path
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = `${parts.slice(0, depth).join('/')}/`
      if (!tracked.some(other => other.startsWith(dir))) {
        shown = dir
        break
      }
    }
    untracked.add(shown)
  }

  return { staged, unstaged, unmerged, untracked: [...untracked].sort() }
}
