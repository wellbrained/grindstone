// Plain, JSON-serialisable data for the whole simulation (docs/features/git-model.md).

/** A snapshot of files: path -> content. Paths use '/' and have no leading './'. */
export type Tree = Record<string, string>

export interface Author {
  name: string
  email: string
}

export interface Commit {
  id: string
  parents: string[]
  message: string
  author: Author
  /** Seconds since the epoch, derived from the logical clock (never the real time). */
  timestamp: number
  tree: Tree
}

export type Head
  = | { type: 'branch', name: string }
    | { type: 'detached', commit: string }

export type UnmergedKind = 'both modified' | 'both added' | 'deleted by us' | 'deleted by them'

export interface Snapshot {
  index: Tree
  workdir: Tree
}

export interface MergeOperation {
  type: 'merge'
  /** The commit being merged in (MERGE_HEAD). */
  theirs: string
  /** Prepared merge commit message. */
  message: string
  before: Snapshot
}

export interface RebaseOperation {
  type: 'rebase'
  /** The branch being rebased, or null for a detached HEAD. */
  branch: string | null
  origHead: string
  onto: string
  /** Commits still to replay, oldest first. */
  todo: string[]
  /** The commit that stopped with a conflict, if any. */
  stopped: string | null
  before: Snapshot
}

export type Operation = MergeOperation | RebaseOperation

/** One `git stash` entry: what index and working tree held, saved against the commit HEAD was on. */
export interface StashEntry {
  /** Deterministic 40-hex id (shown by `stash pop` and `stash drop`). */
  id: string
  /** The commit HEAD pointed at when the entry was made. */
  base: string
  /** `WIP on main: 1a2b3c4 <subject>`, or `On main: <message>` with `-m`. */
  message: string
  /** The staged snapshot. */
  index: Tree
  /** The tracked files of the working tree (a deleted file is missing). */
  workdir: Tree
  /** Untracked files taken along with `-u` (empty otherwise). */
  untracked: Tree
}

export interface Repo {
  commits: Record<string, Commit>
  /** Local branches: name -> commit id. */
  branches: Record<string, string>
  head: Head
  /** The staged snapshot. */
  index: Tree
  /** Paths with an unresolved conflict. */
  unmerged: Record<string, UnmergedKind>
  /** Remote-tracking refs for origin: branch name on origin -> commit id (shown as origin/<name>). */
  remoteBranches: Record<string, string>
  /** Upstream config: local branch -> branch name on origin. */
  upstream: Record<string, string>
  operation: Operation | null
  /** `git stash` entries, newest first (stash@{0} is the first). */
  stash: StashEntry[]
}

export interface Remote {
  name: string
  url: string
  commits: Record<string, Commit>
  branches: Record<string, string>
  defaultBranch: string
}

export interface GitState {
  /** Shown in messages such as "Initialized empty Git repository in <cwd>/.git/". */
  cwd: string
  /** The working tree. Exists before `git init`. */
  workdir: Tree
  repo: Repo | null
  origin: Remote | null
  user: Author
  /** Logical clock: advances once per created commit, gives deterministic timestamps and ids. */
  clock: number
}

export type OutputKind = 'out' | 'err' | 'hint'

/** Optional colouring hint, like git's colours: staged/added lines, unstaged/removed lines, diff meta lines. */
export type OutputTone = 'added' | 'removed' | 'meta'

/** Marks a ref name inside a line (e.g. 'main', 'origin/main', 'HEAD') so the UI can colour it. */
export interface RefSpan {
  start: number
  end: number
  ref: string
}

export interface OutputLine {
  kind: OutputKind
  text: string
  refs?: RefSpan[]
  tone?: OutputTone
}

export interface CommandResult {
  state: GitState
  output: OutputLine[]
  /** 0 on success; anything else means the command failed (state is then unchanged). */
  exitCode: number
}

export type Command = (state: GitState, args: string[]) => CommandResult
