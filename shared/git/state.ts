import type { Author, GitState, Repo, Tree } from './types'

export const DEFAULT_USER: Author = { name: 'You', email: 'you@example.com' }
export const DEFAULT_CWD = '/home/you/project'
export const DEFAULT_ORIGIN_URL = 'https://git.example.com/team/project.git'
export const DEFAULT_BRANCH = 'main'
/** Timestamps are BASE_TIME + clock minutes: 2026-03-02 09:00 UTC. */
export const BASE_TIME = Date.UTC(2026, 2, 2, 9, 0, 0) / 1000

export interface StateOptions {
  cwd?: string
  user?: Author
  workdir?: Tree
}

/** A folder without a repository. */
export function createState(options: StateOptions = {}): GitState {
  return {
    cwd: options.cwd ?? DEFAULT_CWD,
    workdir: { ...options.workdir },
    repo: null,
    origin: null,
    user: options.user ?? DEFAULT_USER,
    clock: 0
  }
}

export function emptyRepo(branch = DEFAULT_BRANCH): Repo {
  return {
    commits: {},
    branches: {},
    head: { type: 'branch', name: branch },
    index: {},
    unmerged: {},
    remoteBranches: {},
    upstream: {},
    operation: null
  }
}

/** Advances the logical clock and returns the timestamp for the next commit. */
export function tick(state: GitState): { state: GitState, timestamp: number } {
  const clock = state.clock + 1
  return { state: { ...state, clock }, timestamp: BASE_TIME + clock * 60 }
}

export function headId(repo: Repo): string | null {
  return repo.head.type === 'branch' ? repo.branches[repo.head.name] ?? null : repo.head.commit
}

export function headTree(repo: Repo): Tree {
  const id = headId(repo)
  return id ? repo.commits[id]!.tree : {}
}

export function branchName(repo: Repo): string | null {
  return repo.head.type === 'branch' ? repo.head.name : null
}

/** Makes paths canonical: forward slashes, no './', no leading or trailing '/'. */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part !== '' && part !== '.')
    .join('/')
}

/** Pure helper for the editor panel: writes one working tree file. */
export function writeFile(state: GitState, path: string, content: string): GitState {
  return { ...state, workdir: { ...state.workdir, [normalizePath(path)]: content } }
}

export function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

/** A copy with `key` set to `value`, or without `key` when `value` is undefined. */
export function withEntry<T>(record: Record<string, T>, key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? without(record, key) : { ...record, [key]: value }
}
