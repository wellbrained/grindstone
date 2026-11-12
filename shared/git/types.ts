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

/** What an interactive rebase does with one commit (`drop` never reaches the todo: the line is simply left out). */
export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup'

export interface RebaseStep {
  action: RebaseAction
  commit: string
}

/** A file git opened in the editor and waits for (interactive rebase): the todo list or a commit message. */
export interface EditorWait {
  kind: 'todo' | 'message'
  /** `.git/rebase-merge/git-rebase-todo` or `.git/COMMIT_EDITMSG`. */
  path: string
  /** What git wrote into the file. */
  text: string
}

/** One message of a squash/fixup chain; the first is the commit the others meld into. */
export interface ChainMessage {
  message: string
  /** False for a fixup: its message is dropped. */
  keep: boolean
}

export interface RebaseOperation {
  type: 'rebase'
  /** The branch being rebased, or null for a detached HEAD. */
  branch: string | null
  origHead: string
  onto: string
  /** Steps still to do, oldest first (a plain rebase: all picks). */
  todo: RebaseStep[]
  /** The step that stopped with a conflict (or an empty commit message), if any. */
  stopped: RebaseStep | null
  before: Snapshot
  /** `git rebase -i`. Optional, so states saved before it existed stay valid. */
  interactive?: boolean
  /** The squash/fixup chain the current HEAD commit is built from (interactive rebase). */
  chain?: ChainMessage[]
  /** Git waits for the editor to close this file; until then only `git rebase --abort` runs. */
  editor?: EditorWait | null
  /** The reflog's name for this rebase (`rebase`, or `pull --rebase` for a pull). Optional; `rebase` when missing. */
  action?: string
  /** The upstream as typed (`main`, `origin/main`), for the `rebase (start): checkout <upstream>` entry. */
  upstream?: string
}

/** `git cherry-pick` that stopped: a conflict, or a pick that came out empty. */
export interface CherryPickOperation {
  type: 'cherry-pick'
  /** The commit whose pick stopped (git's CHERRY_PICK_HEAD); null once it is committed and more picks wait for `--continue`. */
  current: string | null
  /** The message the stopped pick is committed with (with the `-x` line, if asked for). */
  message: string
  /** Commits still to pick after the current one, in order. */
  todo: string[]
  /** `-x`: every pick records the commit it came from. */
  recordOrigin: boolean
  /** Where HEAD was before the command, for `--abort`. */
  head: string
  before: Snapshot
}

export type Operation = MergeOperation | RebaseOperation | CherryPickOperation

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

/** One reflog entry: where the ref pointed after the move, and git's message for it. */
export interface ReflogEntry {
  id: string
  /** e.g. `commit: Add the menu`, `reset: moving to HEAD~1`, `checkout: moving from main to feature`. */
  message: string
}

/** An annotated tag's own object (`git tag -a`): who tagged it, when, and the message. */
export interface TagAnnotation {
  /** Deterministic 40-hex id of the tag object (`git tag -d` shows it). */
  id: string
  message: string
  tagger: Author
  /** Seconds since the epoch, from the logical clock. */
  timestamp: number
}

/** A tag (refs/tags/<name>): a fixed name for one commit. A lightweight tag is only the name, an annotated one has an annotation. */
export interface Tag {
  commit: string
  annotation?: TagAnnotation
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
  /**
   * Where HEAD was before the last switch or checkout that moved it (git's `@{-1}`, used by `switch -`).
   * Optional, so states saved before it existed stay valid.
   */
  previous?: Head
  /**
   * Reflogs, newest entry first: `HEAD` and one per local branch (by name). Optional, so states saved before it
   * existed stay valid. See docs/features/git-model.md, "Reflog".
   */
  reflog?: Record<string, ReflogEntry[]>
  /** Where HEAD was before the last reset, merge or rebase (git's ORIG_HEAD). Optional, like `reflog`. */
  origHead?: string
  /** Tags by name. Optional, so states saved before tags existed stay valid. */
  tags?: Record<string, Tag>
}

export interface Remote {
  name: string
  url: string
  commits: Record<string, Commit>
  branches: Record<string, string>
  defaultBranch: string
  /** Tags on origin, by name (optional, like `Repo.tags`). */
  tags?: Record<string, Tag>
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
