# Git model

Grindstone's own git simulation (`shared/git/`, decision in `docs/adr/0002-git-model.md`). Pure TypeScript: no Vue, DOM or Nuxt imports, plain functions over plain data. Tests: `test/unit/git/`.

## How it works

- **State** (`types.ts`): `GitState` holds the working tree (`workdir`, exists before `git init`), the local `repo` (or `null`), the remote `origin` (or `null`), the `user` and a logical `clock`. A `Repo` holds `commits` (id -> commit), `branches`, `head` (branch or detached commit), `index` (staged snapshot), `unmerged` paths, `remoteBranches` (the local `origin/*` refs), `upstream` config and the `operation` in progress (merge or rebase, with a snapshot for `--abort`). Trees are flat maps `path -> content`. Everything is JSON-serialisable; the UI's undo is a stack of states.
- **Immutability**: every command returns a new state and never mutates its input (the tests deep-freeze every state they pass in).
- **Determinism**: no `Date.now` or randomness. Each new commit advances `clock`; its timestamp is 2026-03-02 09:00 UTC plus `clock` minutes. Ids are a 40-hex FNV-based hash over parents, tree, author, timestamp and message, so a replayed level always yields the same ids.
- **Commands**: `(state, argv) => { state, output, exitCode }`. `run(state, line)` tokenizes the line (quotes, escapes, `>`, `>>`, `&&`, `;`) and dispatches to git or the shell. User errors never throw: they return git-like error lines and a non-zero `exitCode` with the state unchanged.
- **Output**: `OutputLine = { kind: 'out' | 'err' | 'hint', text, refs?, tone? }`. `refs` marks ref names inside the text (`{ start, end, ref }`, e.g. `main`, `origin/main`, `HEAD`) so the UI can colour them from the branch palette; `tone` (`added`, `removed`, `meta`) mirrors git's colours for status entries and diff lines.
- **Content** is line-based text. `diff.ts` is an LCS line diff; `merge3.ts` is a diff3-style three-way merge per file and per tree. Overlapping different changes (including adjacent lines) conflict and get `<<<<<<< HEAD` / `=======` / `>>>>>>> <label>` markers; the label is the branch as typed for merges and `<short id> (<subject>)` for rebases.

## Public API (`shared/git/index.ts`)

- `run(state, line)`, `runArgv(state, argv)`: execute a command line or argv.
- `createState(options?)`, `writeFile(state, path, content)` (for the editor panel).
- Setup: `repo()` / `folder()` return a `SetupBuilder` with `file`, `remove`, `stage`, `commit(message, { author })`, `branch`, `switch(name, { create })`, `merge`, `origin()`, `push(branch?)`, `fetch`, `teammate(author, message, files, { branch })`, `run(line)`, `update(fn)`, `build()`. A failing step throws (levels are author code). `commit` stages everything first; `file` adds a trailing newline.
- Teammates: `teammateCommit(state, { author, message, files, branch? })` commits onto an origin branch (`null` deletes a file); the local repo sees it only after `fetch`/`pull`.
- `ignoreMatcher(workdir)`: a `(path) => boolean` check over the .gitignore files of a tree (goals use it on a committed tree); `isIgnored(state, path)` for one path of the state (a tracked path never is).
- Queries for goals: `currentBranch`, `headCommit`, `resolve`, `branchExists`, `commitsOf(rev | 'a..b')`, `isAncestor`, `hasMergeCommits(rev | 'a..b')`, `aheadBehind`, `remoteBranchHead` (on origin), `remoteCommitsOf`, `trackingBranchHead` (local `origin/x`), `upstreamOf`, `unmergedPaths`, `conflictsInProgress`, `operationInProgress`, `isWorkingTreeClean`, `fileContent`, `hasConflictMarkers`.
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
| `branch` | list, `-a`, `-r`, create (with start point), `-d`, `-D`, `-u` / `--set-upstream-to` |
| `switch` | `<branch>`, `-c <new> [start]`, `--detach <rev>`; creates a tracking branch from `origin/<name>` |
| `checkout` | `<branch>`, `-b <new> [start]`, `<commit>` (detached HEAD), `-- <paths>` |
| `merge` | `<rev>` (or the upstream), fast-forward, `--no-ff`, `--ff-only`, `-m`, `--abort`, `--continue` |
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
- No editor: `commit` without `-m` asks for `-m` (except when concluding a merge or with `--amend`).
- `.gitignore` files only: no `.git/info/exclude`, no global excludes file, no `status --ignored`, no `git check-ignore`. The ignored-file message leaves out git's last hint (`git config set advice.addIgnoredFile false`), since there is no `git config`. Switching branches treats ignored files like untracked ones (git would overwrite them).
