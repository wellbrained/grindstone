# Git model

Grindstone's own git simulation (`shared/git/`, decision in `docs/adr/0002-git-model.md`). Pure TypeScript: no Vue, DOM or Nuxt imports, plain functions over plain data. Tests: `test/unit/git/`.

## How it works

- **State** (`types.ts`): `GitState` holds the working tree (`workdir`, exists before `git init`), the local `repo` (or `null`), the remote `origin` (or `null`), the `user` and a logical `clock`. A `Repo` holds `commits` (id -> commit), `branches`, `head` (branch or detached commit), `previous` (where HEAD was before the last switch, git's `@{-1}`; optional, so older saved states stay valid), `index` (staged snapshot), `unmerged` paths, `remoteBranches` (the local `origin/*` refs), `upstream` config, the `operation` in progress (merge or rebase, with a snapshot for `--abort`) and the `stash` entries (newest first: id, base commit, message, index, tracked working tree files, untracked files taken with `-u`). Trees are flat maps `path -> content`. Everything is JSON-serialisable; the UI's undo is a stack of states.
- **Immutability**: every command returns a new state and never mutates its input (the tests deep-freeze every state they pass in).
- **Determinism**: no `Date.now` or randomness. Each new commit advances `clock`; its timestamp is 2026-03-02 09:00 UTC plus `clock` minutes. Ids are a 40-hex FNV-based hash over parents, tree, author, timestamp and message, so a replayed level always yields the same ids.
- **Commands**: `(state, argv) => { state, output, exitCode }`. `run(state, line)` tokenizes the line (quotes, escapes, `>`, `>>`, `&&`, `;`) and dispatches to git or the shell. User errors never throw: they return git-like error lines and a non-zero `exitCode` with the state unchanged.
- **Output**: `OutputLine = { kind: 'out' | 'err' | 'hint', text, refs?, tone? }`. `refs` marks ref names inside the text (`{ start, end, ref }`, e.g. `main`, `origin/main`, `HEAD`) so the UI can colour them from the branch palette; `tone` (`added`, `removed`, `meta`) mirrors git's colours for status entries and diff lines.
- **Content** is line-based text. `diff.ts` is an LCS line diff; `merge3.ts` is a diff3-style three-way merge per file and per tree. Overlapping different changes (including adjacent lines) conflict and get `<<<<<<< HEAD` / `=======` / `>>>>>>> <label>` markers; the label is the branch as typed for merges and `<short id> (<subject>)` for rebases.

## Public API (`shared/git/index.ts`)

- `run(state, line)`, `runArgv(state, argv)`: execute a command line or argv.
- `createState(options?)`, `writeFile(state, path, content)` (for the editor panel).
- Setup: `repo()` / `folder()` return a `SetupBuilder` with `file`, `remove`, `stage`, `commit(message, { author })`, `branch`, `switch(name, { create })`, `merge(rev, { conflicts })` (with `conflicts: true` the merge must stop with conflicts, for a level that starts inside it), `origin()`, `push(branch?)`, `fetch`, `teammate(author, message, files, { branch })`, `run(line)`, `update(fn)`, `build()`. A failing step throws (levels are author code). `commit` stages everything first; `file` adds a trailing newline.
- Teammates: `teammateCommit(state, { author, message, files, branch? })` commits onto an origin branch (`null` deletes a file); the local repo sees it only after `fetch`/`pull`.
- `ignoreMatcher(workdir)`: a `(path) => boolean` check over the .gitignore files of a tree (goals use it on a committed tree); `isIgnored(state, path)` for one path of the state (a tracked path never is).
- Queries for goals: `currentBranch`, `headCommit`, `resolve`, `branchExists`, `commitsOf(rev | 'a..b')`, `isAncestor`, `hasMergeCommits(rev | 'a..b')`, `aheadBehind`, `remoteBranchHead` (on origin), `remoteCommitsOf`, `trackingBranchHead` (local `origin/x`), `upstreamOf`, `unmergedPaths`, `conflictsInProgress`, `operationInProgress`, `isWorkingTreeClean`, `fileContent`, `hasConflictMarkers`, `stashEntries` (newest first).
- Also: `tokenize`, `blobId`, `shortId`, `formatDate`, `gitCommandNames` and `shellCommandNames` (Tab completion), all types.

## Supported commands

| Command | Flags and forms |
| --- | --- |
| `init` | |
| `status` | `-s` / `--short`; long format with tracking info, merge and rebase state, unmerged paths |
| `add` | paths, directories, `.`, `-A`, simple `*` globs, `-f` / `--force`; stages deletions; marks conflicts resolved; skips and refuses ignored files (see "Ignored files") |
| `commit` | `-m` (repeatable), `-a`, `-am`, `--amend` (with `-m` or reusing the message), `--no-edit`, `--allow-empty`; plain `commit` concludes a merge with the prepared message |
| `log` | `--oneline`, `--graph`, `--all`, `-n N` / `-N`, revisions, `a..b`, `^a` |
| `diff` | working tree vs index, `--staged` / `--cached`, paths |
| `branch` | list, `-a`, `-r`, create (with start point), `-d`, `-D`, `-m` / `--move` and `-M` (`[<old>] <new>`, see "Renaming and going back"), `-u` / `--set-upstream-to` |
| `switch` | `<branch>`, `-c <new> [start]`, `--detach <rev>`, `-` (the previous branch); creates a tracking branch from `origin/<name>` |
| `checkout` | `<branch>`, `-b <new> [start]`, `<commit>` (detached HEAD), `-` (the previous branch or commit), `[--] <paths>` (unmerged files are refused), `--ours` / `--theirs [--] <paths>` (see "Taking one side of a conflict") |
| `restore` | `<paths>` (working tree from the index), `--staged` / `-S` (index from HEAD), `--worktree` / `-W` with `--staged` (both from HEAD), `--ours` / `--theirs`; silent on success; unknown paths and unmerged files are refused like git |
| `reset` | `[--soft \| --mixed \| --hard] [<commit>]` (default mixed, HEAD; hashes, branches, `HEAD~n`, `HEAD^`), `[<commit>] [--] <paths>` (unstage); mixed prints "Unstaged changes after reset:", hard "HEAD is now at ..." |
| `revert` | `<commit>` (one), `--no-edit`; takes git's default message `Revert "<subject>"` + `This reverts commit <id>.` |
| `stash` | `[push] [-u] [-m <msg>]`, `list`, `pop [<n>]`, `apply [<n>]`, `drop [<n>]`, `clear`; entries as `stash@{n}` or `n` |
| `merge` | `<rev>` (or the upstream), fast-forward, `--no-ff`, `--ff-only`, `--ff`, `-m`, `--no-edit`, `--abort`, `--continue` |
| `rebase` | `<upstream>` (or the upstream), `--continue`, `--skip`, `--abort` |
| `fetch` | `[origin [branch]]`, `--prune` |
| `pull` | merge by default, `--rebase`, `--ff-only`, `--no-ff` |
| `push` | to the upstream, `[-u] origin <branch>`, `HEAD`, `--force`, `--force-with-lease` |

Shell: `ls`, `cat`, `echo` (with `>` / `>>`; any command's output can be redirected), `rm` (`-r`, `-f`), `touch`, `pwd`. `undo`, `reset`, `hint`, `help`, `clear` and `edit` are trainer commands of the level engine (`docs/features/levels.md`).

Anything else: real git commands answer `git: '<x>' is not in this trainer yet`, typos get git's "not a git command" with the most similar command, unsupported flags answer `git <cmd>: option '<flag>' is not in this trainer yet`, unknown programs answer `<cmd>: command not found`.

## Ignored files (`.gitignore`)

`shared/git/ignore.ts`, tests in `test/unit/git/ignore.test.ts`.

- **Where the patterns come from**: every `.gitignore` in the working tree (like git, not the committed copy: an uncommitted .gitignore already works, a deleted one no longer does). A file in a subfolder applies to paths under that folder and wins over the ones above it (the last matching line counts).
- **Patterns**: blank lines and `#` comments are skipped, trailing spaces trimmed; exact names (`.env`, at any depth); `*` and `?` (never across a slash); `**` (`**/temp`, `logs/**`, `a/**/b`); `[abc]` classes; `dir/` (directories only, with everything inside); `/root-only` and a slash in the middle (anchored to the .gitignore's folder); `!negation` (the last match wins; like git, a file inside an ignored directory cannot be re-included, but `dist/*` plus `!dist/keep.txt` works); `\#` and `\!` for names that start with those characters.
- **Only untracked paths are ignored**: a tracked file (in the index) stays tracked and shows its changes even when a pattern matches it.
- **status** (long and `-s`) leaves ignored files out of "Untracked files"; a folder that holds only ignored files is not listed. `isWorkingTreeClean` follows status, so ignored files do not make a tree dirty.
- **add**: `git add .`, `-A` and a folder quietly skip ignored files. A pathspec that names only ignored files (`git add .env`, `git add dist`, `git add dist/app.js`) is refused like real git, with exit code 1, while the other paths of the same command are still added. The listed name is the topmost ignored part (`dist` for `dist/app.js`). `-f` / `--force` adds them anyway; from then on they are tracked.

  ```
  The following paths are ignored by one of your .gitignore files:
  dist
  hint: Use -f if you really want to add them.
  ```
- The IDE explorer marks ignored files with a dimmed `I`; they do not colour their folder.

## Simplifications versus real git

- One remote (`origin`), no `git remote`, `clone` or `config`; `.origin()` in the setup builder stands in for a clone.
- No file modes, binary files, renames, symlinks or empty directories; one working directory (no `cd`).
- One timestamp per commit (no separate committer date); amend and rebase give a new timestamp, which is what changes the id.
- `merge --abort` and `rebase --abort` restore the snapshot taken when the operation started (files created in between are lost; git would keep untracked ones).
- Rebase drops commits that become empty instead of using patch ids; merge commits on the rebased branch are dropped (git's default without `--rebase-merges`).
- The merge base is the newest best common ancestor (no recursive merge of several bases).
- Merge refuses only when local changes touch files the merge changes; `pull` merges by default without git's "divergent branches" hint; a pull conflict uses `origin/<branch>` as marker label (git shows the commit id).
- `push.default` is effectively `upstream`; no tags, no refspecs `src:dst`, no `--delete`.
- `log --graph` draws basic lanes (`*`, `|`, `|\`, `|/`), not every case git's renderer handles.
- Conflict markers are written but there is no `diff --cc`; `git diff` during a conflict compares against our side.
- No editor: `commit` without `-m` asks for `-m` (except when concluding a merge or with `--amend`); `revert` always takes git's default message (`--edit` is not supported).
- `.gitignore` files only: no `.git/info/exclude`, no global excludes file, no `status --ignored`, no `git check-ignore`. The ignored-file message leaves out git's last hint (`git config set advice.addIgnoredFile false`), since there is no `git config`. Switching branches treats ignored files like untracked ones (git would overwrite them).

## Renaming and going back (`branch -m`, `switch -`)

Tests in `test/unit/git/branch.test.ts`.

- **`git branch -m <new>`** renames the branch you are on (HEAD stays on it); **`git branch -m <old> <new>`** renames any branch. Silent on success, like git. The upstream config moves to the new name. Before the first commit it renames the unborn branch. Errors as in git: `fatal: no branch named '<old>'`, `fatal: a branch named '<new>' already exists` (without `-M`), `fatal: '<new>' is not a valid branch name`, `fatal: branch name required`, `fatal: too many arguments for a rename operation`, `fatal: cannot rename the current branch while not on any` (detached HEAD). **`-M`** renames over an existing branch, except the one you are on (`fatal: cannot force update the branch '<name>' used by worktree at '<cwd>'`). Renaming to the same name is a silent no-op; the branch being rebased is refused.
- **`git switch -`** / **`git checkout -`** go to where HEAD was before the last switch or checkout that moved it (`Repo.previous`, git's `@{-1}`). `switch -c`, `checkout -b` and `switch --detach` count as moves; "Already on" does not. A previous detached HEAD: `checkout -` detaches there again, `switch -` refuses with git's "a branch is expected, got commit" and the `--detach` hint (`switch --detach -` works). Nothing to go back to, or the previous branch was deleted: `switch -` answers `fatal: invalid reference: @{-1}`, `checkout -` falls back to a pathspec and answers `error: pathspec '-' did not match any file(s) known to git`.
- Simplifications: there is no reflog, so `@{-1}` is one stored position, not a history: `@{-2}` and spelling `@{-1}` out are not supported, and `-` is only understood as the branch argument of `switch` / `checkout` (not as a start point after `-c`). Renaming or deleting a branch does not update the stored position (git's reflog would not either, it stores the old name). "Already on '<branch>'" does not change it either (git would record a move to the same branch, so `switch -` would stay). A rebase does not change it (git records its own checkouts in the reflog, but not as `checkout:` entries that `@{-1}` reads).

## Taking one side of a conflict (`--ours`, `--theirs`)

`shared/git/commands/restore.ts` (`conflictSide`, shared with checkout), tests in `test/unit/git/ours-theirs.test.ts`; outputs checked against git 2.55.

- **`git checkout --ours|--theirs <paths>`** writes that side of each unmerged file into the working tree and prints `Updated N paths from the index`. The file stays unmerged until `git add` (or `rm` and `git add`), like git. "Ours" is HEAD, "theirs" the commit being merged in; in a rebase, ours is the branch you rebase onto and theirs the commit being replayed. With both flags the last one wins.
- A side that deleted the file is refused and nothing changes: `error: path '<p>' does not have our version` (or `their version`), exit 1. **`git restore --ours|--theirs`** removes the file instead, silently, like git.
- Paths without a conflict (also outside a merge) come from the index, as with a plain `checkout --`; they count in "Updated N paths" only when the file changed (git's "Updated 0 paths from the index"). A side of an unmerged file always counts. A pathspec like `.` takes every matching file.
- Errors as in git: `fatal: '--ours/--theirs' needs the paths to check out` (no path), `fatal: '--ours/--theirs' cannot be used with switching branches` (the first name is a branch or commit and there is no `--`), `fatal: '--ours' or '--theirs' cannot be used with --staged` (restore), and the usual unknown pathspec. A plain `git checkout [--] <path>` of an unmerged file is refused with `error: path '<p>' is unmerged`.
- Simplifications: the model has no index stages, so the sides are read from HEAD and from the merged-in (or replayed) commit, which is what git's stages 2 and 3 hold. No `--merge` / `--conflict` to re-create the markers, no `--ours` / `--theirs` with `--staged --worktree`.

## Undo commands (`restore`, `reset`, `revert`, `stash`)

Tests in `test/unit/git/undo.test.ts`. Simplifications versus real git:

- **restore**: no `--source`, no `-p`. Without `--staged`, the file comes from the index; `--worktree` only adds something together with `--staged`.
- **reset**: no `--keep`, `--merge`, `-p` or `-q`. The first argument is a commit when it resolves to one, everything else a path (a name that is both a branch and a file counts as the branch). A path without `--` that matches nothing is git's "ambiguous argument" error; after `--` it is skipped. `--mixed` and `--hard` end a merge in progress (like git); `--soft` during a merge is refused with git's message; any reset during a rebase is refused ("not in this trainer yet": use `rebase --abort` or finish the rebase). Before the first commit only a plain `git reset` (unstage everything) works. There is no reflog, so commits dropped by a reset are gone from the graph and from `log --all` (they stay in the commit map, so a known id still resolves).
- **revert**: one commit at a time, no `-n`, no `-m` (a merge commit is refused with git's "is a merge but no -m option was given"). A revert that would conflict with later changes is refused and changes nothing (git would stop with conflict markers and `revert --continue`); one that would undo nothing prints the status and fails, like an empty commit. Like git, staged changes are refused, and unstaged changes only when they touch the files the revert changes.
- **stash**: entries are plain data on the repo, not commits, so they never show in the graph or in `log --all` (git shows `refs/stash`). Their id is a deterministic commit-style id (it advances the logical clock like a commit). No `show`, `branch`, `save`, `-p`, `-k`, `-a`, `--index` or pathspecs. Apply and pop do a three-way merge of the stashed working tree onto the current index (base: the commit the entry was made on); like git without `--index`, staged changes come back unstaged and new files come back staged. A merge that would conflict is refused instead of writing markers ("applying a stash with conflicts is not in this trainer yet"); local changes it would overwrite and untracked files that already exist are refused with git's messages; `pop` then keeps the entry and says so. Stashing with unmerged files is refused (`<path>: needs merge`); during a merge or rebase without conflicts it works as in git and the operation stays.
- The trainer commands `reset` and `undo` are matched on the whole line, so `git reset` always reaches git.
