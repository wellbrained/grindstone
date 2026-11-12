# Git model

Grindstone's own git simulation (`shared/git/`, decision in `docs/adr/0002-git-model.md`). Pure TypeScript: no Vue, DOM or Nuxt imports, plain functions over plain data. Tests: `test/unit/git/`.

## How it works

- **State** (`types.ts`): `GitState` holds the working tree (`workdir`, exists before `git init`), the local `repo` (or `null`), the remote `origin` (or `null`), the `user` and a logical `clock`. A `Repo` holds `commits` (id -> commit), `branches`, `head` (branch or detached commit), `previous` (where HEAD was before the last switch, git's `@{-1}`; optional, so older saved states stay valid), `index` (staged snapshot), `unmerged` paths, `remoteBranches` (the local `origin/*` refs), `upstream` config, the `reflog` (optional, see "Reflog"), `origHead` (git's `ORIG_HEAD`, optional) and `tags` (optional, see "Tags"), the `operation` in progress (merge, rebase or cherry-pick, with a snapshot for `--abort`; a rebase holds its remaining steps and, for `rebase -i`, the file it waits for in the editor; a cherry-pick the commit it stopped at and the ones still to pick) and the `stash` entries (newest first: id, base commit, message, index, tracked working tree files, untracked files taken with `-u`). Trees are flat maps `path -> content`. Everything is JSON-serialisable; the UI's undo is a stack of states.
- **Immutability**: every command returns a new state and never mutates its input (the tests deep-freeze every state they pass in).
- **Determinism**: no `Date.now` or randomness. Each new commit advances `clock`; its timestamp is 2026-03-02 09:00 UTC plus `clock` minutes. Ids are a 40-hex FNV-based hash over parents, tree, author, timestamp and message, so a replayed level always yields the same ids.
- **Commands**: `(state, argv) => { state, output, exitCode }`. `run(state, line)` tokenizes the line (quotes, escapes, `>`, `>>`, `&&`, `;`) and dispatches to git or the shell. User errors never throw: they return git-like error lines and a non-zero `exitCode` with the state unchanged.
- **Output**: `OutputLine = { kind: 'out' | 'err' | 'hint', text, refs?, tone? }`. `refs` marks ref names inside the text (`{ start, end, ref }`, e.g. `main`, `origin/main`, `HEAD`) so the UI can colour them from the branch palette; `tone` (`added`, `removed`, `meta`) mirrors git's colours for status entries and diff lines.
- **Content** is line-based text. `diff.ts` is an LCS line diff; `merge3.ts` is a diff3-style three-way merge per file and per tree. Overlapping different changes (including adjacent lines) conflict and get `<<<<<<< HEAD` / `=======` / `>>>>>>> <label>` markers; the label is the branch as typed for merges and `<short id> (<subject>)` for rebases.

## Public API (`shared/git/index.ts`)

- `run(state, line)`, `runArgv(state, argv)`: execute a command line or argv.
- `createState(options?)`, `writeFile(state, path, content)` (for the editor panel).
- `submitEditor(state, text)`: saves the file git waits for in the editor (`rebase -i`) and lets git go on; `waitingEditor(state)` is that file (`{ kind: 'todo' | 'message', path, text }`) or null; `TODO_PATH`, `MESSAGE_PATH`. See "Interactive rebase".
- Setup: `repo()` / `folder()` return a `SetupBuilder` with `file`, `remove`, `stage`, `commit(message, { author })`, `branch`, `switch(name, { create })`, `merge(rev, { conflicts })` (with `conflicts: true` the merge must stop with conflicts, for a level that starts inside it), `rebase(upstream, { conflicts })` (the same for a rebase), `origin()` (tags go along), `push(branch?)`, `fetch`, `teammate(author, message, files, { branch })`, `tag(name, { at, message, author })` (annotated with a `message`, tagged by `author`), `run(line)`, `update(fn)`, `build()`. A failing step throws (levels are author code). `commit` stages everything first; `file` adds a trailing newline.
- Teammates: `teammateCommit(state, { author, message, files, branch? })` commits onto an origin branch (`null` deletes a file); the local repo sees it only after `fetch`/`pull`. `teammateMerge(state, { author, branch, into?, message, deleteBranch? })` merges a branch on origin with a merge commit, as a merged pull request does (into origin's default branch unless `into` says otherwise), and with `deleteBranch` deletes it there; it returns null when there is nothing to merge or the merge would conflict.
- `ignoreMatcher(workdir)`: a `(path) => boolean` check over the .gitignore files of a tree (goals use it on a committed tree); `isIgnored(state, path)` for one path of the state (a tracked path never is).
- Queries for goals: `currentBranch`, `headCommit`, `resolve` (every revision form, also `HEAD@{n}` and `ORIG_HEAD`), `branchExists`, `commitsOf(rev | 'a..b')`, `isAncestor`, `hasMergeCommits(rev | 'a..b')`, `aheadBehind`, `remoteBranchHead` (on origin), `remoteCommitsOf`, `trackingBranchHead` (local `origin/x`), `upstreamOf`, `unmergedPaths`, `conflictsInProgress`, `operationInProgress` (`merge`, `rebase`, `cherry-pick` or null), `isWorkingTreeClean`, `fileContent`, `hasConflictMarkers`, `stashEntries` (newest first), `tagOf` (a local tag: `{ commit, annotation? }`), `remoteTagOf` (one on origin).
- Also: `tokenize`, `blobId`, `shortId`, `formatDate`, `gitCommandNames` and `shellCommandNames` (Tab completion), all types.

## Supported commands

| Command | Flags and forms |
| --- | --- |
| `init` | |
| `status` | `-s` / `--short`; long format with tracking info, merge and rebase state, unmerged paths |
| `add` | paths, directories, `.`, `-A`, simple `*` globs, `-f` / `--force`; stages deletions; marks conflicts resolved; skips and refuses ignored files (see "Ignored files") |
| `rm` | `<paths>` (index and working tree), `--cached` (index only, the file stays as untracked), `-r` (folders), `-f` / `--force`, `-q` / `--quiet`, `*` globs; see "git rm" |
| `commit` | `-m` (repeatable), `-a`, `-am`, `--amend` (with `-m` or reusing the message), `--no-edit`, `--allow-empty`; plain `commit` concludes a merge with the prepared message |
| `log` | `--oneline`, `--graph`, `--all` (branches, `origin/*`, tags and HEAD), `--decorate` (always on), `-n N` / `-N`, revisions, `a..b` (an empty side is HEAD: `origin/main..`), `^a`; decorations show tags as `tag: v1.4.0` |
| `diff` | working tree vs index, `--staged` / `--cached`, paths |
| `tag` | list (sorted), `-l` / `--list [<pattern>...]`, `-n`, `<name> [<commit>]` (lightweight), `-a` / `-m <msg>` (annotated), `-f`, `-d <name>...`; see "Tags" |
| `branch` | list, `-a`, `-r`, create (with start point), `-d`, `-D`, `-m` / `--move` and `-M` (`[<old>] <new>`, see "Renaming and going back"), `-u` / `--set-upstream-to` |
| `switch` | `<branch>`, `-c <new> [start]`, `--detach <rev>`, `-` (the previous branch); creates a tracking branch from `origin/<name>` |
| `checkout` | `<branch>`, `-b <new> [start]`, `<commit>` (detached HEAD), `-` (the previous branch or commit), `[--] <paths>` (unmerged files are refused), `--ours` / `--theirs [--] <paths>` (see "Taking one side of a conflict") |
| `restore` | `<paths>` (working tree from the index), `--staged` / `-S` (index from HEAD), `--worktree` / `-W` with `--staged` (both from HEAD), `--ours` / `--theirs`; silent on success; unknown paths and unmerged files are refused like git |
| `reset` | `[--soft \| --mixed \| --hard] [<commit>]` (default mixed, HEAD; any revision: hashes, branches, `HEAD~n`, `HEAD^`, `HEAD@{n}`, `ORIG_HEAD`), `[<commit>] [--] <paths>` (unstage); mixed prints "Unstaged changes after reset:", hard "HEAD is now at ..." |
| `revert` | `<commit>` (one), `--no-edit`; takes git's default message `Revert "<subject>"` + `This reverts commit <id>.` |
| `cherry-pick` | `<commit>...` and `a..b`, `-x`, `-n` / `--no-commit`, `--continue`, `--skip`, `--abort`; see "Cherry-pick" |
| `stash` | `[push] [-u] [-m <msg>]`, `list`, `pop [<n>]`, `apply [<n>]`, `drop [<n>]`, `clear`; entries as `stash@{n}` or `n` |
| `reflog` | `[show] [<branch>]` (HEAD by default), `-n N` / `-N`; see "Reflog" |
| `merge` | `<rev>` (or the upstream), fast-forward, `--no-ff`, `--ff-only`, `--ff`, `-m`, `--no-edit`, `--abort`, `--continue` |
| `rebase` | `<upstream>` (or the upstream), `-i` / `--interactive` (see "Interactive rebase"), `--continue`, `--skip`, `--abort` |
| `fetch` | `[origin [branch]]`, `--prune`; brings origin's tags along |
| `pull` | merge by default, `--rebase`, `--ff-only`, `--no-ff` |
| `push` | to the upstream, `[-u] origin <branch>`, `HEAD`, `--force`, `--force-with-lease`, `origin <tag>`, `[origin] --tags` |
| `remote` | list (`origin`), `-v` / `--verbose` (its URL for fetch and push); other subcommands answer "not in this trainer yet" |

Shell: `ls`, `cat`, `echo` (with `>` / `>>`; any command's output can be redirected), `rm` (`-r`, `-f`), `touch`, `pwd`. `undo`, `reset`, `hint`, `help`, `clear` and `edit` are trainer commands of the level engine (`docs/features/levels.md`).

Revisions, wherever a command takes one: `HEAD` (`@`), branches, `origin/<branch>`, tags (`v1.4.0`, `refs/tags/v1.4.0`), full and short ids, `ORIG_HEAD`, `HEAD@{n}`, `<branch>@{n}` and `@{n}` (the current branch's log), each with `~n` / `^n` (`HEAD@{2}~1`).

Anything else: real git commands answer `git: '<x>' is not in this trainer yet`, typos get git's "not a git command" with the most similar command, unsupported flags answer `git <cmd>: option '<flag>' is not in this trainer yet`, unknown programs answer `<cmd>: command not found`.

## Interactive rebase (`rebase -i`)

`shared/git/commands/rebase.ts`, tests in `test/unit/git/interactive-rebase.test.ts`. The only place git opens an editor in the trainer.

- **`git rebase -i <upstream>`** (also `--interactive`, `HEAD~n`, any revision) checks for local changes like a plain rebase, then prints `hint: Waiting for your editor to close the file...` and waits: the operation exists (`operationInProgress` is `rebase`, with `interactive: true`) and its `editor` is the todo list (`.git/rebase-merge/git-rebase-todo`), but nothing has moved yet. The list is git's: `pick <short id> <subject>` per commit, oldest first, then `# Rebase <upstream>..<head> onto <onto> (N commands)` and git's help block, shortened to the supported commands. With nothing to replay the list is `noop`.
- **While git waits** (todo or message) the terminal is busy, as in a real shell: every line except `git rebase --abort` is refused with `error: git is waiting for you to close <file> in the editor` and a hint (exit 1, state unchanged). Trainer commands (`undo`, `hint`, `reset`, ...) still work, they are not git.
- **`submitEditor(state, text)`** saves the waiting file. For the todo list: `pick`/`p`, `reword`/`r`, `squash`/`s`, `fixup`/`f`, `drop`/`d`, `noop`; lines in any order; text after the commit is ignored; blank and `#` lines are skipped; a deleted line drops the commit. Then git checks out the upstream and replays the list with the plain rebase machinery: a `pick` whose parent is already HEAD is fast-forwarded (same id, like git); conflicts stop like a plain rebase (`--continue`, `--skip`, `--abort`).
- **reword** picks the commit, then opens its message (`.git/COMMIT_EDITMSG`, the message plus git's "Please enter the commit message" comment). **squash** and **fixup** meld the commit into the one before (an amended HEAD); at the end of a chain with at least one squash, git opens git's "This is a combination of N commits." text (fixup messages commented out as "will be skipped"); a chain of fixups keeps the first message and never opens the editor. Saving the message cleans it like git (`#` lines and trailing spaces dropped, blank lines collapsed and trimmed), prints `[detached HEAD <id>] <subject>` with the diffstat and goes on. After a conflict on a reword or squash, `--continue` commits and then opens the message.
- **Errors** in the todo list, as git words them: `error: invalid line N: <line>` (unknown command), `error: missing arguments for <command>`, `error: could not parse '<rev>'`, `error: cannot 'squash' without a previous commit`; `edit`, `exec`, `break`, `label`, `reset`, `merge`, `update-ref` answer `error: '<command>' in the todo list is not in this trainer yet`.
- Simplifications: a broken list keeps the editor open with a hint (git would stop the rebase and point to `git rebase --edit-todo`, which is not here). An empty list (only comments) is git's `error: nothing to do`: the rebase is gone, nothing moved. An empty commit message prints `Aborting commit due to empty commit message.` and `Could not apply <id>... <subject>`; the rebase stops there, the commit keeps the message it had, and `git rebase --continue` goes on (`git commit --amend` works in between). `git status` during an interactive rebase says `interactive rebase in progress; onto <id>` without git's "Last commands done" list. A commit that becomes empty is dropped as in a plain rebase (git would stop and ask). No `--edit-todo`, `--autosquash`, `--exec`, `--onto`, `--root`, no `edit` or `break` stops (on the later list with `commit --fixup`).

## Cherry-pick

`shared/git/commands/cherry-pick.ts`, tests in `test/unit/git/cherry-pick.test.ts`. The mirror of `revert`: each commit's change against its parent is merged three-way onto HEAD (`merge3`).

- **`git cherry-pick <commit>...`** picks one or several commits in the order given; `a..b` picks the range oldest first. Each becomes a new commit with the original message and author and prints `[<branch> <id>] <subject>` with the summary. `-x` appends `(cherry picked from commit <full id>)` to the message. `-n` / `--no-commit` applies the changes to the index and working tree only (several pile up there) and commits nothing.
- **Refused like git**, nothing changes: an unknown revision (`fatal: bad revision '<rev>'`), a merge commit (`error: commit <id> is a merge but no -m option was given.`, `fatal: cherry-pick failed`), staged changes (`error: your local changes would be overwritten by cherry-pick.`), unmerged files, a merge or rebase in progress, a cherry-pick already in progress (`error: cherry-pick is already in progress`). Unstaged changes only when the pick touches those files (git's "would be overwritten by merge").
- **A conflict** stops with markers (`>>>>>>> <short id> (<subject>)`), the conflict report, `error: could not apply <id>... <subject>` and git's hints; the operation is `cherry-pick` (prompt `|CHERRY-PICKING`), and `git status` says `You are currently cherry-picking commit <id>.` with the `--continue` / `--skip` / `--abort` hints. `--continue` (after `git add`) commits with the original message and author and picks the rest; a plain `git commit` concludes the stopped pick too (the rest then waits for `--continue`). `--skip` drops the stopped commit and goes on, `--abort` puts HEAD, index and working tree back to before the command (`reset: moving to <id>` in the reflog when picks had already been committed). `checkout --theirs` takes the picked commit's side. Switching branches, merge, pull and rebase are refused while it lasts.
- **An empty pick** (the change is already there) stops like git: the status, then `The previous cherry-pick is now empty, possibly due to conflict resolution.` with the `git commit --allow-empty` and `git cherry-pick --skip` choices (exit 1).
- Simplifications: no `-m <parent>`, `-e`, `-s`, `--ff`, `--quit`, `--allow-empty`, `--keep-redundant-commits`; no ` Date:` line in the output (the copy gets a new timestamp, the model has only one per commit); `-n` needs a clean index like a plain pick (git allows staged changes there) and a conflict under `-n` stops without an operation to continue.

## Tags

`shared/git/commands/tag.ts`, tests in `test/unit/git/tag.test.ts`.

- **Storage**: `Repo.tags` and `Remote.tags`, name -> `{ commit, annotation? }`. An annotated tag (`-a`, or just `-m`, like git) has an annotation: its own deterministic id (shown by `git tag -d`), the message, the tagger (the user) and the current logical time (the clock does not move). A lightweight tag is only the name.
- **`git tag`** lists in git's byte order (`v1.10.0` before `v1.9.0`); `-l` / `--list` take `*` / `?` patterns; `-n` adds the first line of each annotation (or the commit's subject for a lightweight tag), the name padded to 15 columns. `git tag <name> [<commit>]` is silent on success. Errors as in git: `fatal: tag '<name>' already exists` (exit 128; `-f` moves it and prints `Updated tag '<name>' (was <id>)`), `fatal: '<name>' is not a valid tag name.`, `fatal: Failed to resolve '<rev>' as a valid ref.`, `fatal: too many arguments`, `error: tag '<name>' not found.` for `-d`. `-a` without `-m` would open an editor: the trainer asks for `-m` instead. `git tag -d` prints `Deleted tag '<name>' (was <id>)`.
- **Everywhere else**: tags resolve as revisions, show in `log` decorations as `tag: <name>` (plain text, right after `HEAD -> <branch>`), keep their commits in `log --all` and in the graph (a neutral label, no lane), and complete with Tab. `git push` sends no tags; `git push origin <tag>` and `git push --tags` (or `git push origin --tags`) send them (` * [new tag]         v1.4.0 -> v1.4.0`, `Everything up-to-date` when origin has them). A different tag of the same name on origin is rejected (`! [rejected] ... (already exists)` and git's hint) unless `--force`. `fetch` and `pull` bring every tag origin has and you don't (` * [new tag]`); a tag you already have stays as it is.
- Simplifications: tags only point at commits (no tags of tags or trees), a branch wins over a tag of the same name (git would warn that the name is ambiguous), no `git show <tag>`, `--sort`, `--contains`, `-s` / `-u` (signing), `--delete` on origin; fetch always auto-follows every tag and never says a local tag would be clobbered.

## Reflog

`shared/git/reflog.ts` (recording and `@{n}`), `shared/git/commands/reflog.ts` (the command), tests in `test/unit/git/reflog.test.ts`.

- **What is recorded**: `Repo.reflog` holds one log for `HEAD` and one per local branch (by name), newest entry first, each `{ id, message }` with the id the ref points at after the move. Every command that moves HEAD adds an entry with git's message; when the move goes through the branch (commit, reset, merge, stash), the branch's log gets the same entry. The setup builder runs the same commands, so a level starts with a realistic reflog (7.2's reset from last night is in it).
- **Messages**: `commit: <subject>`, `commit (initial)`, `commit (amend)`, `commit (merge)`; `reset: moving to <rev as typed>`; `checkout: moving from <branch, or the full id when detached> to <target as typed>` (also for `switch`); `merge <name>: Fast-forward` and `merge <name>: Merge made by the 'ort' strategy.`; `pull <args>: Fast-forward` (the whole command line, like git); `revert: Revert "<subject>"`; `cherry-pick: <subject>` per pick (also for `--continue`), `commit (cherry-pick): <subject>` when a plain `git commit` concludes a stopped pick; `reset: moving to HEAD` for `git stash`; `Branch: renamed refs/heads/<a> to refs/heads/<b>`. A rebase writes `rebase (start): checkout <upstream>`, one `rebase (pick)` / `(squash)` / `(fixup)` / `(reword)` / `(continue)` per step, `rebase (finish): returning to refs/heads/<branch>` (and `rebase (finish): refs/heads/<branch> onto <id>` in the branch's log), or `rebase (abort): returning to refs/heads/<branch>` once it had started; `pull --rebase` uses `pull --rebase` instead of `rebase`. A new branch's log starts with `branch: Created from <start as typed>`.
- **`git reflog`** (= `git reflog show HEAD`) prints `<short id> (<decorations>) HEAD@{n}: <message>`, decorations as in `log --oneline` on every line whose commit a ref points at; `git reflog [show] <branch>` shows a branch's log as `<branch>@{n}`. `-n N` / `-N` limit it. An unknown ref, or a deleted branch (its log is deleted with it, like git), answers git's "ambiguous argument"; before the first commit it says the branch has no commits yet. `expire`, `delete`, `exists`, `list` and `drop` answer "not in this trainer yet".
- **Revisions**: `HEAD@{n}`, `<branch>@{n}` and `@{n}` (the current branch) resolve everywhere a revision goes. **`ORIG_HEAD`** is set by `reset` (the old HEAD), `merge` and `pull` (HEAD before the merge, also when it stops with conflicts) and `rebase` (the branch before it).
- **The graph and `log --all`** show only what a branch, `origin/*` or HEAD reaches, as in git: a commit that only the reflog remembers is not drawn (no dimmed ghosts), but `git reflog` lists it and `git log HEAD@{1}` shows it.
- Simplifications: no remote-tracking reflogs (`origin/main@{1}`), no dates (`HEAD@{yesterday}`), no expiry, no `git log -g` / `--walk-reflogs`; `@{-n}` stays the stored previous position ("Renaming and going back"). "Already on" adds no entry (git writes `checkout: moving from main to main`). Fast-forwarded picks of a rebase are recorded as `rebase (pick)` too.

## git rm

`shared/git/commands/rm.ts`, tests in `test/unit/git/rm.test.ts`.

- **`git rm <paths>`** removes tracked files from the index and the working tree and prints `rm '<path>'` per file (sorted; `-q` prints nothing). **`--cached`** removes them from the index only: the file stays on disk as untracked, and a `.gitignore` that names it then hides it. Paths are matched like `git add` (files, `*` globs); a folder or `.` needs **`-r`** (`fatal: not removing '<path>' recursively without -r`). An untracked or unknown path is `fatal: pathspec '<path>' did not match any files`; no path at all is `fatal: No pathspec was given. Which files should I remove?` (both exit 128). A file already deleted from disk is fine; an unmerged file is removed and so resolved.
- **Safety check** (skipped with `-f` / `--force`), as git words it, exit 1, nothing changes: a file whose staged content differs from both HEAD and the working tree is refused even with `--cached` (`error: the following file has staged content different from both the` / `file and the HEAD:` ... `(use -f to force removal)`). Without `--cached` also a file with staged changes (`has changes staged in the index`; a newly added file always has) and one with local modifications (`has local modifications`), each with `(use --cached to keep the file, or -f to force removal)`. Several files use git's plural wording.
- Simplifications: no `--dry-run`, `--ignore-unmatch`, `--pathspec-from-file`; no empty folders to clean up.

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

- One remote (`origin`): `git remote` only lists it (no `add`, `remove`, `rename`, `set-url`, `show`), no `clone` or `config`; `.origin()` in the setup builder stands in for a clone. No `@{u}` / `@{upstream}` revisions: ranges name the branch (`origin/main..main`). No `branch -v` / `-vv`, so a gone upstream shows in `git status` ("the upstream is gone"), not as `[origin/x: gone]`.
- `fetch` and `pull` never prune on their own (git's default without `fetch.prune`): a branch deleted on origin keeps its `origin/<name>` until `git fetch --prune`. `git branch -d` checks HEAD and the upstream, like git; a branch whose upstream is gone counts as merged only when HEAD contains it.
- No file modes, binary files, renames, symlinks or empty directories; one working directory (no `cd`).
- One timestamp per commit (no separate committer date); amend and rebase give a new timestamp, which is what changes the id.
- `merge --abort` and `rebase --abort` restore the snapshot taken when the operation started (files created in between are lost; git would keep untracked ones).
- Rebase drops commits that become empty instead of using patch ids; merge commits on the rebased branch are dropped (git's default without `--rebase-merges`).
- The merge base is the newest best common ancestor (no recursive merge of several bases).
- Merge refuses only when local changes touch files the merge changes; `pull` merges by default without git's "divergent branches" hint; a pull conflict uses `origin/<branch>` as marker label (git shows the commit id).
- `push.default` is effectively `upstream`; no refspecs `src:dst`, no `--delete`, no `--follow-tags`.
- `log --graph` draws basic lanes (`*`, `|`, `|\`, `|/`), not every case git's renderer handles.
- Conflict markers are written but there is no `diff --cc`; `git diff` during a conflict compares against our side.
- No editor for commands: `commit` without `-m` asks for `-m` (except when concluding a merge or with `--amend`); `revert` always takes git's default message (`--edit` is not supported).
- `.gitignore` files only: no `.git/info/exclude`, no global excludes file, no `status --ignored`, no `git check-ignore`. The ignored-file message leaves out git's last hint (`git config set advice.addIgnoredFile false`), since there is no `git config`. Switching branches treats ignored files like untracked ones (git would overwrite them).

## Renaming and going back (`branch -m`, `switch -`)

Tests in `test/unit/git/branch.test.ts`.

- **`git branch -m <new>`** renames the branch you are on (HEAD stays on it); **`git branch -m <old> <new>`** renames any branch. Silent on success, like git. The upstream config moves to the new name. Before the first commit it renames the unborn branch. Errors as in git: `fatal: no branch named '<old>'`, `fatal: a branch named '<new>' already exists` (without `-M`), `fatal: '<new>' is not a valid branch name`, `fatal: branch name required`, `fatal: too many arguments for a rename operation`, `fatal: cannot rename the current branch while not on any` (detached HEAD). **`-M`** renames over an existing branch, except the one you are on (`fatal: cannot force update the branch '<name>' used by worktree at '<cwd>'`). Renaming to the same name is a silent no-op; the branch being rebased is refused.
- **`git switch -`** / **`git checkout -`** go to where HEAD was before the last switch or checkout that moved it (`Repo.previous`, git's `@{-1}`). `switch -c`, `checkout -b` and `switch --detach` count as moves; "Already on" does not. A previous detached HEAD: `checkout -` detaches there again, `switch -` refuses with git's "a branch is expected, got commit" and the `--detach` hint (`switch --detach -` works). Nothing to go back to, or the previous branch was deleted: `switch -` answers `fatal: invalid reference: @{-1}`, `checkout -` falls back to a pathspec and answers `error: pathspec '-' did not match any file(s) known to git`.
- Simplifications: `@{-1}` is one stored position (`Repo.previous`), not read from the reflog: `@{-2}` and spelling `@{-1}` out are not supported, and `-` is only understood as the branch argument of `switch` / `checkout` (not as a start point after `-c`). Renaming or deleting a branch does not update the stored position (git's reflog would not either, it stores the old name). "Already on '<branch>'" does not change it either and adds no reflog entry (git would record a move to the same branch, so `switch -` would stay). A rebase does not change it (its reflog entries are `rebase (...)`, not the `checkout:` entries `@{-1}` reads).

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
- **reset**: no `--keep`, `--merge`, `-p` or `-q`. The first argument is a commit when it resolves to one, everything else a path (a name that is both a branch and a file counts as the branch). A path without `--` that matches nothing is git's "ambiguous argument" error; after `--` it is skipped. `--mixed` and `--hard` end a merge in progress (like git); `--soft` during a merge is refused with git's message; any reset during a rebase is refused ("not in this trainer yet": use `rebase --abort` or finish the rebase). Before the first commit only a plain `git reset` (unstage everything) works. Commits dropped by a reset are gone from the graph and from `log --all`, as in git; they stay in the commit map, so `git reflog`, `HEAD@{n}` and a known id still reach them.
- **revert**: one commit at a time, no `-n`, no `-m` (a merge commit is refused with git's "is a merge but no -m option was given"). A revert that would conflict with later changes is refused and changes nothing (git would stop with conflict markers and `revert --continue`); one that would undo nothing prints the status and fails, like an empty commit. Like git, staged changes are refused, and unstaged changes only when they touch the files the revert changes.
- **stash**: entries are plain data on the repo, not commits, so they never show in the graph or in `log --all` (git shows `refs/stash`). Their id is a deterministic commit-style id (it advances the logical clock like a commit). No `show`, `branch`, `save`, `-p`, `-k`, `-a`, `--index` or pathspecs. Apply and pop do a three-way merge of the stashed working tree onto the current index (base: the commit the entry was made on); like git without `--index`, staged changes come back unstaged and new files come back staged. A merge that would conflict is refused instead of writing markers ("applying a stash with conflicts is not in this trainer yet"); local changes it would overwrite and untracked files that already exist are refused with git's messages; `pop` then keeps the entry and says so. Stashing with unmerged files is refused (`<path>: needs merge`); during a merge or rebase without conflicts it works as in git and the operation stays.
- The trainer commands `reset` and `undo` are matched on the whole line, so `git reset` always reaches git.
