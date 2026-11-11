// The IDE's file explorer: per-file git status from the state, and a folder tree from the flat working tree.
// Pure: no Vue, no DOM.
import type { GitState, Tree } from '#shared/git'

/**
 * A file's status, like an IDE's source-control colours:
 * modified (tracked, changed), added (new and staged), untracked (new, not staged), deleted (gone from the working tree
 * but still in HEAD or the index), conflicted (unmerged).
 */
export type FileStatus = 'modified' | 'added' | 'untracked' | 'deleted' | 'conflicted'

/** The letter next to a file, never the colour alone (VS Code's letters; C for conflicted). */
export const STATUS_LETTER: Record<FileStatus, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  conflicted: 'C'
}

/** Which status a folder shows when its files differ: the most urgent one. */
const PRIORITY: FileStatus[] = ['conflicted', 'modified', 'added', 'untracked', 'deleted']

const headTree = (state: GitState): Tree => {
  const repo = state.repo
  if (!repo) return {}
  const id = repo.head.type === 'branch' ? repo.branches[repo.head.name] : repo.head.commit
  return id ? repo.commits[id]?.tree ?? {} : {}
}

/** The status of every file that differs from HEAD; clean files are left out. Before `git init` nothing has a status. */
export function fileStatuses(state: GitState): Record<string, FileStatus> {
  const repo = state.repo
  if (!repo) return {}
  const head = headTree(state)
  const { index } = repo
  const workdir = state.workdir
  const statuses: Record<string, FileStatus> = {}
  const paths = new Set([...Object.keys(workdir), ...Object.keys(index), ...Object.keys(head), ...Object.keys(repo.unmerged)])
  for (const path of paths) {
    const inWorkdir = workdir[path] !== undefined
    if (repo.unmerged[path] !== undefined) statuses[path] = 'conflicted'
    else if (!inWorkdir) statuses[path] = 'deleted'
    else if (index[path] === undefined) statuses[path] = 'untracked'
    else if (head[path] === undefined) statuses[path] = 'added'
    else if (workdir[path] !== head[path] || index[path] !== head[path]) statuses[path] = 'modified'
  }
  return statuses
}

export interface FileNode {
  type: 'file'
  name: string
  path: string
  status: FileStatus | null
  /** Gone from the working tree (shown so a deletion is visible; it cannot be opened). */
  deleted: boolean
}

export interface FolderNode {
  type: 'folder'
  name: string
  path: string
  children: TreeNode[]
  /** The most urgent status of anything inside, or null when everything inside is clean. */
  status: FileStatus | null
}

export type TreeNode = FileNode | FolderNode

const urgent = (a: FileStatus | null, b: FileStatus | null) => {
  if (!a) return b
  if (!b) return a
  return PRIORITY.indexOf(a) <= PRIORITY.indexOf(b) ? a : b
}

/** Folders first, then files, each alphabetically (case-insensitive, like an IDE). */
const compare = (a: TreeNode, b: TreeNode) =>
  a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || (a.name < b.name ? -1 : 1)

/**
 * A folder tree from the working tree's flat paths plus the deleted files of `statuses`.
 * Folders exist only through their files (git does not track empty folders).
 */
export function buildFileTree(workdir: Tree, statuses: Record<string, FileStatus>): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: '', path: '', children: [], status: null }
  const folders = new Map<string, FolderNode>([['', root]])

  const folderFor = (path: string): FolderNode => {
    const existing = folders.get(path)
    if (existing) return existing
    const slash = path.lastIndexOf('/')
    const parent = folderFor(slash === -1 ? '' : path.slice(0, slash))
    const folder: FolderNode = { type: 'folder', name: path.slice(slash + 1), path, children: [], status: null }
    parent.children.push(folder)
    folders.set(path, folder)
    return folder
  }

  const deleted = Object.keys(statuses).filter(path => statuses[path] === 'deleted' && workdir[path] === undefined)
  for (const path of [...Object.keys(workdir), ...deleted]) {
    const slash = path.lastIndexOf('/')
    const folder = folderFor(slash === -1 ? '' : path.slice(0, slash))
    const status = statuses[path] ?? null
    folder.children.push({ type: 'file', name: path.slice(slash + 1), path, status, deleted: workdir[path] === undefined })
  }

  const finish = (folder: FolderNode): FileStatus | null => {
    folder.children.sort(compare)
    let status: FileStatus | null = null
    for (const child of folder.children) status = urgent(status, child.type === 'folder' ? finish(child) : child.status)
    folder.status = status
    return status
  }
  finish(root)
  return root.children
}

/** Every folder path in a tree (to expand them all by default). */
export function folderPaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap(node => node.type === 'folder' ? [node.path, ...folderPaths(node.children)] : [])
}
