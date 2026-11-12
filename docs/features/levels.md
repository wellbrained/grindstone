# Levels

The scenario engine (`shared/levels/`) and the git track's levels (`shared/levels/git/`). Pure TypeScript: no Vue, DOM or Nuxt imports. Tests: `test/unit/levels/`.

## Public API (`shared/levels/index.ts`)

- `startLevel(level): Session`: a fresh session on the level's setup.
- `submit(session, level, line): SubmitResult`: runs one terminal line. Returns `{ session, output, notices, solvedNow }`.
- `saveFile(session, level, path, content): SubmitResult`: the editor panel's save; counts like a command (`edit <path>` in the history) and can be undone.
- `saveEditor(session, level, text): SubmitResult`: saves the file git waits for in the editor (`git rebase -i`: the todo list or a commit message, `waitingEditor` in the git model) and lets git go on; counts like a command (`edit <path of that file>` in the history, e.g. `edit .git/rebase-merge/git-rebase-todo`) and can be undone (the file opens again with git's text). When git waits for nothing it answers with an error and counts nothing.
- `playStep(session, level, step)`: one solution step, a line through `submit` or `{ save }` through `saveEditor` (the tests replay solutions with it).
- Tracks and chapters (see below): `tracks`, `gitTrack`, `trackById(id)`, `defineTrack(definition)`, `trackLevels(track)`, `trackPlaces(track)`, `placeIn(track, id)`, `placeName(place)`, `levelPlace(id)`, `levelNumber(id)`, `chapterOf(id)`, `chapterProgress(chapter, progress)`, `trackProgress(track, progress)`, `nextUp(track, progress)`, `continueTarget(track, progress)`, `practiseAgainIn(chapter, progress)`, `hasProgress(progress)`, `trackToContinue(progress)`. The lookups take the registry as an optional last argument, so tests run them on a 58-level fixture and a small track with practice tasks (`test/unit/levels/fixtures.ts`).
- `levels` (every level of every track, in play order), `gitLevels`, `levelById(id)`, `nextLevel(id)` (the next level of the same track: a scenario, then its practice tasks, then the next scenario, across chapter boundaries; null after the last), `levelIntro(level)` (a scenario's story or a practice task's task).
- `gitSubcommands(line)`, `levelCommands(level)`: the git commands a level practises, from its solution (level rows, cheat sheet).
- Progress (see below): `emptyProgress()`, `recordSolve`, `recordPlay`, `setPractiseAgain`, `resetEntries`, `lastPlayed`, `summarizeProgress`, `isBetterRun`, `serializeProgress`, `readProgress(text)` (strict, for the backup upload), `parseProgress(text)` (never fails, for storage), `PROGRESS_VERSION`.
- `MAX_SNAPSHOTS` (undo depth, 200), `TRAINER_COMMANDS`, all types (`Level`, `Goal`, `GoalContext`, `TeammateEvent`, `Session`, `TerminalLine`, `Notice`, ...).

## Engine rules

- **Pure and immutable**: every call returns a new session; a session is plain JSON (the UI may store it as is).
- **Output** is `TerminalLine[]`: git's `OutputLine`s plus two markers the UI interprets, `{ kind: 'clear' }` and `{ kind: 'edit', path }` (open the editor panel).
- **Trainer commands** are handled before git and are not counted, recorded or undoable. Matched on the trimmed line, any case:
  - `undo`: restores the previous snapshot (git state, history, fired events). Prints `Undid: <line>`, or `Nothing to undo.`
  - `reset`: back to the setup as a new attempt (history, undo stack, events, `solved` and `commandCount` cleared). Revealed hints stay revealed and counted.
  - `hint`: reveals the next hint (`Hint n/3: ...`, `Hint 1/1: ...` for a practice task, kind `hint`) and counts it; after the last it repeats it.
  - `help`: lists trainer, git and shell commands.
  - `clear`: returns the clear marker. `edit <file>`: returns the edit marker (`usage: edit <file>` otherwise).
- **Empty line**: no-op.
- **Counted commands** (anything else, and `saveFile`), in this order:
  1. Snapshot for undo (oldest dropped beyond 200).
  2. `beforeCommand` events fire if any command in the line (split at `&&` and `;`, whitespace collapsed, redirect targets ignored) equals the prefix or starts with it plus a space. `git push` matches `git   push -u origin x` and `git add . && git push`, not `git pushy` or `echo "git push"`.
  3. The line runs (`run` from the git model).
  4. It is recorded in `history` as `{ line, exitCode }` and `commandCount` goes up.
  5. `afterCommands: N` events fire once the history (the current timeline) has N entries, `when` events once their check passes on the new state.
  6. Goals are recomputed; `solvedNow` is true on the first transition to all goals met. `solved` then stays true for the attempt and the session stays playable.
- **Events** fire once per timeline: `firedEvents` is part of the snapshot, so an undo that rewinds past an event lets it fire again. Each firing returns a `Notice` (`{ eventId, author, text }`).
- **Counts**: `history` is the current timeline (undo shortens it); `commandCount` is the effort of the attempt and includes undone commands. Progress uses `commandCount`.

## Tracks and chapters

`shared/levels/track.ts` (types and helpers) and `shared/levels/tracks.ts` (the registry). Play order, chapter numbers and scenario numbers are derived from the chapter lists, never written by hand.

- **Track**: `{ id, title, scope (one line), tagline (one line for its home card, may be empty), description (the home card's pitch), status: 'live' | 'coming', cheatSheet (its path, or null), chapters }`. Everything the home page, the nav and the track page show about a track comes from here, so a new live track needs data only. `tracks` lists them in home page order: Git (live), then Working with AI, Web fundamentals, Debugging, Framework deep dives (coming: no chapters, no levels, not playable). `defineTrack` numbers the chapters and throws for a level of another track, a level listed twice, a coming track with levels, or a practice task that does not follow its scenario.
- **Chapter**: `{ id (unique in its track, also the section anchor: /git#merging), trackId, number, title, description (one line), colour (a slot of the branch palette, 0-7), levels }`. `levels` is the play order: each scenario followed by its practice tasks. A chapter without levels is *coming*: shown with its description only.
- **Git chapters**: 1 Basics (5 scenarios, 6 practice tasks), 2 Branching (5 scenarios, 6 practice tasks), 3 Merging (5 scenarios, 5 practice tasks), 4 Rewriting history (4 scenarios, 4 practice tasks), 5 Teamwork & remotes (5 scenarios, 5 practice tasks), 6 Undo & recovery (5 scenarios, 7 practice tasks), 7 Disasters (5 scenarios, 6 practice tasks), 8 Workflows (5 scenarios, 7 practice tasks). No git chapter is coming any more. Colours: slot = chapter number - 1; slot 7 exists only for chapters, so branch colours in the graph did not move.
- **Numbers**: a scenario is `chapter.position` counting scenarios only, e.g. `1.2` for Stage only what belongs together, `3.3` for Merge conflict (`levelNumber`, `LevelPlace.number`). A practice task has no number (`number: null`); `LevelPlace.scenario` names its scenario and that scenario's number. `placeName(place)` is the text form: "3.3 Merge conflict", or the title alone for a practice task. The ids and URLs (`git-04-merge-conflict`, `/git/04-merge-conflict`, `/git/practice-stage-one-file`) never change when a level moves or gets renumbered.
- **Counting both kinds**: "n of N solved" for a chapter and a track, **next up** and **Continue** count scenarios and practice tasks alike: a practice task is a level you solve like any other, so leaving one out would make the counts lie.
- **Next up**: the first unsolved entry in play order (`nextUp`), a scenario or a practice task. **Continue** (`continueTarget`, `{ place, reason, at }`): the entry you last played while it is unsolved (`reason: 'resume'`, with the time), else next up (`'next'`); once nothing in the track is unsolved, the first entry flagged "practise again" in play order (`'practise'`); null when everything is solved and nothing is flagged. `practiseAgainIn(chapter, progress)` is the chapter menu's "Practise again". `trackToContinue` picks the track for the home page: the live track of the last played entry, else the first live track with a solve.

## Two kinds: scenarios and practice tasks

ADR 0006 (`docs/adr/0006-git-v1-practice-and-progress.md`). `Level = Scenario | PracticeTask`, told apart by `kind`.

- **Scenario** (`kind: 'scenario'`): a story, goals, three hints, a debrief. Numbered.
- **Practice task** (`kind: 'practice'`, "Practice" in the UI, never "drill"): one short task of 1-3 commands, about 30 seconds, one goal (or a few), one hint, a one-line `why` shown once solved, "Next" and "Again" instead of a debrief. No number.
- **Where a practice task belongs**: it names its scenario in `practises` *and* is listed in the chapter right after that scenario (after the scenario's other practice tasks). The level file says what it trains; the chapter list stays the one place for the order; `defineTrack` checks that both agree, so a moved line fails at start-up instead of drawing a practice task under the wrong scenario. `nextLevel` therefore goes scenario, its practice tasks, next scenario.
- **Difficulty** (`1 | 2 | 3`, drawn as filled dots) and **minutes** (an estimate; a practice task about `0.5`, shown as "~30 s") on every entry.

## Writing levels

The rules are in ADR 0006, "Writing levels"; in short:

- Precise and clear: compact, but never leave out what the learner needs (a file name, a branch name, how many commits). If a goal checks it, the story or task says it.
- File contents and code comments read like a real project other people work on: the Corner Bakery website (the habit tracker only in Basics 1.1's practice tasks), comments that say why ("Agreed with the shop team: orders from 50 euros ship for free"), teammates by name.
- Friendly and personal: we are their friends who help and teach. Second person, no blame, the debrief explains *why*.
- Fictional people and teams only (Maya, Jonas, Ben; a bakery), never real companies; fake keys only (`test-key-not-real-0000`).

## Progress

`shared/levels/progress.ts`, tests in `test/unit/levels/progress.test.ts`.

```ts
Progress = { version: 3, levels: { [id]: LevelProgress } }
LevelProgress = {
  solved: boolean,            // stays true once solved; only a reset clears it
  best: Run | null,           // fewest commands, ties broken by fewest hints
  latest: Run | null,         // the most recent solve
  practiseAgain: boolean,     // "solved, but I don't own it yet"; only a solved entry can carry it; a new solve clears it
  lastPlayed: number | null   // ms since epoch, when you last typed a command in it
}
Run = { commands: number, hints: number }
```

- `recordSolve` stores the run as `latest` and, when it is better (`isBetterRun`), as `best`; replaying never removes `solved` or the flag. An unsolved session changes nothing. `recordPlay` sets the entry's `lastPlayed` (the play page calls it for every line typed and every editor save); `lastPlayed(progress)` is the newest one, for Continue.
- `setPractiseAgain(progress, id, flag)`; `resetEntries(progress, ids)` drops entries completely (solved, runs, flag, last played): an entry, a chapter, a track or everything.
- `readProgress(text)` is strict: broken JSON (`json`), not an object with `levels` (`shape`) or an unknown version (`version`) is an error, so the backup upload can say why and change nothing. Inside valid data a malformed entry (no boolean `solved`) is dropped and a broken field falls back to its blank value (a broken run to null, a non-boolean flag to false, a flag on an unsolved entry to false); an unsolved entry is kept only while it has a `lastPlayed`. `parseProgress(text)` wraps it for storage: anything unreadable is empty progress.
- **Migration on read**: version 1 and 2 entries `{ solved, hintsUsed, commands, bestCommands }` become `latest: { commands, hints: hintsUsed }` and `best: { commands: bestCommands, hints: hintsUsed }` (the hints of the old best run were never stored, so it takes the latest run's hints); unsolved old entries are dropped; version 2's `lastPlayed: { levelId, at }` moves onto that entry (creating an unsolved one if needed).
- Storage is the UI's adapter (`grindstone:progress` in localStorage); the backup file is the same JSON (`serializeProgress`).

## Level file format

Scenarios: one file per scenario in `shared/levels/<track>/NN-slug.ts`, exporting a `Scenario`. Practice tasks: grouped per chapter in `shared/levels/<track>/practice/<chapter>.ts`, each exporting a `PracticeTask`.

| Field | Content |
| --- | --- |
| `id` | a scenario `<track>-NN-slug` (`git-04-merge-conflict`), a practice task `<track>-practice-slug` (`git-practice-stage-one-file`); the URL is the id without the track |
| `track`, `kind`, `title` | `'git'`, `'scenario'` or `'practice'`, a short title |
| `difficulty`, `minutes` | 1-3; the time estimate (a practice task about 0.5) |
| `story` | scenario: 1-3 short paragraphs (joined with a blank line), second person, the situation and what to do |
| `task`, `practises`, `why` | practice task: the task in one or two sentences (one line); the id of its scenario; one line on why it works, shown once solved |
| `setup` | `() => GitState`, built with `repo()` / `folder()` from the git model; must be deterministic |
| `goals` | `{ id, label, check({ state, history }) }`; `label` is one checklist line (`backticks` become code) |
| `teammates` | optional `{ id, author, trigger, apply, notice }`; `trigger` is `{ afterCommands: n }`, `{ beforeCommand: 'git push' }` or `{ when: state => boolean }` (right after the command that makes the check pass, e.g. your branch reached origin); `apply` usually calls `teammateCommit` or `teammateMerge` on origin |
| `hints` | a scenario: exactly three (nudge, concept, exact commands in backticks); a practice task: one |
| `debrief` | scenario: `{ title, paragraphs }`, 2-4 short paragraphs on why it works |
| `solution` | the steps that solve it (a practice task: 1-3), `SolutionStep = string \| { save: string }`: a terminal line, or saving the file git waits for in the editor with this text (`rebase -i`: the todo list, then the message); the tests replay them through `playStep` |

Goal helpers for git levels live in `shared/levels/git/checks.ts`: `conflictFullyResolved(state, rev)`, `treeOf`, `treeHasConflictMarkers`, `changedIn(state, rev)` (paths a commit changed against its first parent), `gitInvocations(history)` (every `git ...` command, also inside chains), `ran(history, command, matches?)` (a successful `git <command>` in the history), `hasFlag(args, short, long?)` (also bundled: `-am` has `-a`), `isBareForcePush`, `isLeasePush`, `isMergeOf(state, rev, first, second)` (a merge commit with exactly these parents), `ranAfter(history, command, after, matches?)` (e.g. a `git log` after the last `git merge`), `ranBefore(history, before, matches)` (a matching command before the first successful one of `before`, e.g. a look before the sync), `logRevisions(args)` (what a `git log` includes and excludes, as typed: `a..b`, `^a`), `logsOnlyOn(args, on, notOn)` (`git log origin/main..main` and its spellings) and `committedOn(state, id, branch)` (HEAD's reflog shows the commit made on that branch, also after the branch is deleted). `ignoreMatcher` from the git model checks a committed `.gitignore`.

Conventions:

- Goals check outcomes in the state, not the commands typed. Use `history` only when the *how* is the lesson (level 6: `--force-with-lease`, never a bare `--force`) or when the command changes nothing (`diff`, `log`: "You looked at both sides").
- A goal that is trivially true at the start is fine when it guards against a wrong path (e.g. "no merge commits", "dist/ and .env are still on your disk"), but it must be listed in the test's `initialGoals` table.
- Every scenario has at least one wrong path in the test's `wrongPaths` table (the obvious shortcut that must not solve it), and every practice task its obvious one.
- Conflict files are written in the solution with `echo ... >` and `echo ... >>` (chained with `&&`), since the editor panel is UI-only.
- A solution that needs a commit id computes it from the deterministic setup (1.4 Read the history, the todo lists of 4.4 and its practice task).
- Editor steps of `git rebase -i` are `{ save: text }` in the solution, one per file git opens: `['git rebase -i main', { save: 'reword 1a2b3c4 ...
fixup ...' }, { save: 'Add gift cards to the shop' }]`. In the app they are Start rebase and Save message; each counts as one command, like the line it replaces.

## Adding a level

1. Add a row for it to `initialGoals` in `test/unit/levels/git-levels.test.ts` (goal ids and their value at the start, in play order) and its wrong paths to `wrongPaths`: red.
2. Write the file (a scenario in `shared/levels/<track>/NN-slug.ts`, a practice task in `practice/<chapter>.ts` with `practises` set) and add it, in one line, to its chapter's `levels` in that track's `index.ts` (plus the import): a practice task right after its scenario. Its number (`3.3`, or none), its place in the play order, its row and lane on the track page and its commands follow from that.
3. `pnpm test`: the shared tests check shape (per kind), a deterministic setup, the start state, and that replaying `solution` solves the level exactly on its last line. `test/unit/levels/tracks.test.ts` pins the chapter of every level; add the new id there.

## The git levels

Chapter 1, Basics (ADR 0006, batch 1; difficulty and minutes):

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 1.1 | **First commit**: a folder with README.md and app.js; `init`, `add`, `commit` | scenario | 1 | ~3 min |
| | Stage only app.js: `git add <file>`, leave style.css unstaged | practice | 1 | ~30 s |
| | Commit tracked changes in one go: `git commit -am`, no `git add` | practice | 1 | ~30 s |
| 1.2 | **Stage only what belongs together**: a README typo fix and a half-finished prices.md become two commits, the typo first (the approved sample text) | scenario | 1 | ~5 min |
| | Show what will be committed: `git diff --staged` (plain `git diff` does not count) | practice | 1 | ~30 s |
| 1.3 | **What changed?**: back from lunch, opening hours (staged in src/hours.js, unstaged in contact.html) and a half-done dark theme (index.html, style.css); commit every hours change and nothing of the theme, after looking with `git diff` and `git diff --staged` | scenario | 1 | ~4 min |
| | Show the changes in one file: `git diff src/cart.js` | practice | 1 | ~30 s |
| 1.4 | **Read the history**: free shipping dropped from 50 to 30 euros; find the commit in `git log` and put `before-shipping-change` on the commit right before it | scenario | 2 | ~5 min |
| | Last three commits, one line each: `git log --oneline -3` | practice | 1 | ~30 s |
| 1.5 | **Ignore build files**: dist/ and a .env with a fake key appear; write and commit a .gitignore, keep the files, clean tree | scenario | 2 | ~6 min |
| | Ignore every log file: append `*.log` with `>>` (a `>` that drops `dist/` does not count) and commit | practice | 1 | ~30 s |

Chapter 2, Branching (ADR 0006, batch 3; preview `.impeccable/mocks/previews/branching-preview.html`). The scenarios share the Corner Bakery website (`shared/levels/git/bakery.ts`):

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 2.1 | **Start a branch** (`git-02-branch`, v0.1's "Branch", renamed): commit a change to `welcome.html` on `feature/welcome-line` (the bakery website); main must not move | scenario | 1 | ~4 min |
| | List your branches: `git branch` (also `--list`, `-a`; `git branch -r` and `git status` do not count) | practice | 1 | ~30 s |
| 2.2 | **Started on the wrong branch**: half a contact form in `contact.html`, uncommitted, on main; `git switch -c feature/contact-form` takes it along, commit there, main unchanged (the approved sample text; "main is unchanged" only counts once the branch exists) | scenario | 1 | ~4 min |
| | Go back to the previous branch: `git switch -` (or `git checkout -`); typing the name does not count (the approved sample, plus a second goal for "without typing its name") | practice | 1 | ~30 s |
| 2.3 | **Pick up a teammate's branch**: Jonas pushed `feature/newsletter` after your last fetch; `git fetch`, `git switch feature/newsletter` (a tracking branch from origin), commit `thanks.html` on top of his two commits, plain `git push`. `switch -c` from main is rejected on push | scenario | 2 | ~5 min |
| | Show the branches on origin: `git branch -r` or `-a` | practice | 1 | ~30 s |
| 2.4 | **Clean up old branches**: `git branch -d feature/opening-hours` (merged), `-d` refused then `-D experiment/parallax` (unmerged; merging it into main does not count), `git branch -m feature/galery feature/gallery` | scenario | 2 | ~6 min |
| | Rename the current branch: `git branch -m feature/cake-order` | practice | 1 | ~30 s |
| | Delete a merged branch: on `fix/menu-note`, `git switch main` then `git branch -d fix/menu-note` | practice | 1 | ~30 s |
| 2.5 | **Look at an old version**: the menu before Jonas's redesign; `git switch --detach <id>` (or `git checkout <id>`), look, `git switch -c old-menu`; main unchanged. The detached look is read from the history (it leaves nothing in the state); the last hint names the real id | scenario | 2 | ~5 min |
| | Start a branch from an older commit: `git switch -c fix/prices HEAD~1` | practice | 1 | ~30 s |

Chapter 3, Merging (ADR 0006, batch 4; preview `.impeccable/mocks/previews/merging-preview.html`). The new entries use the Corner Bakery website; 3.1 and 3.3 are the v0.1 levels (3.3 now uses the Corner Bakery name too). 3.4 and two practice tasks start inside a conflicted merge (`.merge(rev, { conflicts: true })` in the setup), so their goals start unticked:

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 3.1 | **Merge a finished branch** (`git-03-merge`, v0.1's "Merge", renamed): fast-forward `feature/about-page` (the bakery's about page) into main, starting on the feature branch | scenario | 1 | ~4 min |
| | Merge with a merge commit anyway: `git merge --no-ff fix/croissant-price` (a fast-forward does not count) | practice | 1 | ~30 s |
| 3.2 | **Both sides moved on**: Jonas and Maya committed to main while you finished `feature/weekly-specials`; `git switch main`, `git merge` makes a two-parent merge commit (no conflict), then `git log --graph` after the merge. Merging main into the branch, or rebasing first so main only fast-forwards, does not count | scenario | 1 | ~4 min |
| | Merge only if it's a fast-forward: `git merge --ff-only feature/newsletter` (where it does fast-forward; a plain merge does not count) | practice | 1 | ~30 s |
| 3.3 | **Merge conflict** (v0.1, unchanged): main (Ben) and `feature/footer` changed the same line; resolve and conclude with a two-parent merge commit. Committing the markers does not count | scenario | 2 | ~6 min |
| | Keep their version of a conflicted file: `git checkout --theirs prices.json` (or `git restore --theirs`), `git add`, `git commit` (the approved sample) | practice | 1 | ~30 s |
| 3.4 | **Back out of a merge**: your `git merge feature/menu-filter` on `feature/allergens` stopped in Jonas's code; `git merge --abort` (the approved sample text). Starts inside the merge; the branch goal only counts once no merge is in progress. Committing the markers or resolving does not count | scenario | 1 | ~4 min |
| | List the files with conflicts: `git status` (or `-s`) during a conflicted merge | practice | 1 | ~30 s |
| 3.5 | **Catch up with main**: before the pull request, `git merge main` on `feature/order-pickup`, resolve the opening hours line in index.html (Maya's 6:30 and your order link), commit; main must not move. Merging the feature into main, committing the markers or taking main's line (`--theirs`) does not count | scenario | 2 | ~6 min |
| | Merge main into your branch: `git merge main` on `feature/gift-boxes`, no conflict (a rebase does not count) | practice | 1 | ~30 s |

Chapter 6, Undo & recovery (ADR 0006, batch 2; preview `.impeccable/mocks/previews/undo-preview.html`):

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 6.1 | **Fix the last commit**: "Add strak counter" with `src/streak.css` left untracked, not pushed; `git commit --amend` to one commit "Add streak counter" | scenario | 1 | ~4 min |
| | Add a forgotten file to the last commit: `git commit --amend --no-edit` | practice | 1 | ~30 s |
| 6.2 | **Throw away a change**: `git restore menu.html` (a broken grid experiment), `git restore --staged prices.js` (a draft staged by `git add .`), hours.html stays staged | scenario | 1 | ~4 min |
| | Unstage one file: `git restore --staged style.css` | practice | 1 | ~30 s |
| | Discard your changes in one file: `git restore menu.html` | practice | 1 | ~30 s |
| 6.3 | **Undo a local commit**: two unpushed commits; `git reset --hard HEAD~1` drops the blink commit, `git reset HEAD~1` takes back the gift wrap commit and keeps its changes; story, hint and debrief warn that `--hard` throws away uncommitted work for good | scenario | 2 | ~6 min |
| | Undo the last commit, keep its changes staged: `git reset --soft HEAD~1` | practice | 1 | ~30 s |
| | Drop the last two commits completely: `git reset --hard HEAD~2` (on a clean tree) | practice | 1 | ~30 s |
| 6.4 | **Undo a pushed commit**: Jonas pulled "Round prices to whole euros"; `git revert <id>` and `git push` (the approved sample text; the last hint names the real id) | scenario | 2 | ~5 min |
| | Revert the commit before last: `git revert HEAD~1` | practice | 1 | ~30 s |
| 6.5 | **Park unfinished work**: on `feature/gift-cards` with staged and unstaged work, `git switch main` refuses; `git stash`, fix Saturday hours on main, commit, switch back, `git stash pop`; the stash ends empty | scenario | 2 | ~6 min |
| | Stash including new files: `git stash -u` | practice | 1 | ~30 s |

Chapter 4, Rewriting history (ADR 0006, batch 5; preview `.impeccable/mocks/previews/rewriting-preview.html`). The new entries use the Corner Bakery website; 4.1 is v0.1's "Rebase" (recipe app, Chris), retitled. "Give up a rebase" starts inside a conflicted rebase (`.rebase(rev, { conflicts: true })`); 4.4 and its practice task use `git rebase -i` with `{ save }` steps:

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 4.1 | **Put your branch on top of main** (`git-05-rebase`, v0.1's "Rebase", retitled): `feature/search` is behind main; `git rebase main`. Merging main in does not count | scenario | 2 | ~5 min |
| | Rebase your branch onto main: `git rebase main` on `feature/holiday-hours` (a merge does not count) | practice | 1 | ~30 s |
| 4.2 | **Conflict during a rebase**: the second of your three commits on `feature/autumn-menu` clashes with Maya's Sunday hours in index.html; resolve, `git add`, `git rebase --continue`, the third is replayed after it. Merging main in, committing the markers or `--skip` do not count | scenario | 2 | ~6 min |
| | Give up a rebase: `git rebase --abort` inside a conflicted rebase of `feature/price-list` (`--skip` does not count) | practice | 1 | ~30 s |
| 4.3 | **Push a rebased branch**: your `feature/faq` is on origin; `git rebase main`, a plain push is rejected (non-fast-forward), `git push --force-with-lease`. A bare `--force` anywhere in the history fails the lease goal (undo takes it back); `git pull` after the rejection (old commits merged back in) and merging main in do not count | scenario | 2 | ~5 min |
| | Push your rewritten branch safely: `git push --force-with-lease` after a rebase (`--force` and a plain push do not count) | practice | 1 | ~30 s |
| 4.4 | **Tidy up before review** (the approved sample): "Add gift card product page", "wip", "fix typo" on `feature/gift-cards` become one commit "Add gift cards to the shop" with `git rebase -i main` (reword, fixup, fixup, then the message; squash with a new message works too). Amending only the newest, keeping "wip" in the message or dropping the small commits do not count. The last hint names the real ids | scenario | 3 | ~7 min |
| | Fix an old commit message: `git rebase -i HEAD~2`, `reword` "Add newsleter form"; the newest commit keeps its message and files (`--amend` does not count) | practice | 1 | ~1 min |

Chapter 5, Teamwork & remotes (ADR 0006, batch 6; no preview, the owner delegated the texts to the plan). The new entries use the Corner Bakery website with Maya, Jonas and Ben; 5.5 is v0.1's Teammate sync, unchanged. The looks in 5.1, 5.2 and 5.4 are read from the history (they leave nothing in the state), each with an order: 5.1's `git status` after the upstream is set, 5.2's look after a fetch and before the pull, 5.4's ranges before the first pull, merge, rebase, reset or push:

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 5.1 | **Push your first branch**: `feature/stollen-orders` exists only locally; a plain `git push` answers "has no upstream branch", `git push -u origin feature/stollen-orders`, then `git status` (up to date with origin). Pushing without `-u` and `git branch -u` afterwards counts; a status before the upstream is set does not | scenario | 1 | ~4 min |
| | Push a new branch and set its upstream: `git push -u origin fix/allergen-note` (without `-u` does not count) | practice | 1 | ~30 s |
| 5.2 | **Get your teammates' work**: Jonas and Maya pushed to main after your last fetch; the story names no commands (the hints do): `git fetch`, look (`git status` "behind by 2", or `git log main..origin/main` / `origin/main` / `--all`), `git pull` (fast-forward). Pulling without looking, a plain `git log` or a look before the fetch does not count | scenario | 1 | ~5 min |
| | Fetch without touching your branch: `git fetch` while you have an unpushed commit on main (`git pull` does not count) | practice | 1 | ~30 s |
| 5.3 | **Your push was rejected**: your commit on main; right before your first push Ben pushes (`beforeCommand`), so it is rejected "fetch first"; `git pull --rebase`, `git push`. A plain `git pull` (merge commit) and a `--force` that deletes Ben's commit do not count. Ben's commit is found by message (its id depends on when he pushes), and his goal only counts once your commit is on origin too, so nothing ticks the moment he pushes | scenario | 2 | ~5 min |
| | Pull with rebase: `git pull --rebase`, your commit on top of Jonas's (a plain pull does not count) | practice | 1 | ~30 s |
| 5.4 | **Ahead and behind**: after a fetch main and origin/main have diverged (2 and 1); the story names no commands (the hints do); before syncing `git log origin/main..main` (yours) and `git log main..origin/main` (Maya's), then sync (rebase or merge) and push. Syncing first, `log --all` or a force push that drops Maya's commit do not count | scenario | 2 | ~5 min |
| | See what you haven't pushed yet: `git log origin/main..main` (plain `git log` and `git status` do not count) | practice | 1 | ~30 s |
| 5.5 | **Teammate sync** (v0.1, see below) | scenario | 3 | ~8 min |
| | Clean up branches that are gone on origin: Jonas merged and deleted `feature/allergy-labels` on origin, you pulled main; `git fetch --prune`, `git branch -d feature/allergy-labels` (a plain fetch does not count) | practice | 1 | ~30 s |

Teammate sync in detail:

1. **Teammate sync** (5.5): `feature/find-us` has 2 unpushed commits. Right before your first `git push`, Jonas pushes 2 commits to origin/main, one changing the same line of `visit.html`. The push of the new branch succeeds, then you fetch, rebase onto origin/main, resolve, and update the remote branch with `--force-with-lease` (a plain push is rejected). A merge, or any bare `--force` / `-f` in the history, does not count; `undo` takes a bare force back. The file header explains why this flow was chosen over "already pushed in the setup".

Chapter 7, Disasters (ADR 0006, batch 7; no preview, the owner delegated the texts to the plan). The entries use the Corner Bakery website with Maya, Jonas and Ben and lean on the reflog and `git rm` (`docs/features/git-model.md`). The setups run the mistake through the builder (7.2's reset, 7.3's rebase, 7.5's `branch -D`), so the reflog the learner reads is the one git would have. Ids and reflog positions named in the texts (7.2's hint, 7.3's `HEAD@{4}`, 7.5's "Deleted branch ... (was <id>)" and its practice task) are checked against the simulation by the level tests:

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 7.1 | **Committed on main by mistake**: two unpushed commits on main belong on `feature/cake-orders`; `git branch`, `git reset --hard origin/main`, `git switch`; the story asks for `git status` before `--hard`. A soft reset (changes left staged on main) and resetting before the branch exists do not count | scenario | 2 | ~5 min |
| | Move your last commit to a new branch: `git branch feature/gluten-free`, `git reset --hard HEAD~1`, staying on main (`switch -c` alone does not count) | practice | 1 | ~30 s |
| 7.2 | **Lost commits after a reset**: last night's `git reset --hard HEAD~2` dropped two commits on `feature/christmas-menu`; `git reflog` (read from the history), `git reset --hard HEAD@{1}`; the debrief covers `git branch rescue <id>`, that the reflog is local and expires, and that uncommitted work is not in it. A mixed reset (files not back) and `HEAD@{2}` (only the first commit) do not count | scenario | 2 | ~5 min |
| | Find a lost commit in the reflog: `git reflog`, `git reset --hard HEAD@{1}` after a reset dropped "Add the hot drinks page" | practice | 1 | ~30 s |
| 7.3 | **Rebased the wrong branch**: on main you ran `git rebase feature/allergen-labels`, so Maya's and Jonas's commits were copied on top of your branch; `git reset --hard HEAD@{4}` (or `ORIG_HEAD`, `main@{1}`, `origin/main`), then `git switch feature/allergen-labels` and `git rebase main`. Rebasing the feature without fixing main, resetting to the rebase start, or merging origin/main do not count | scenario | 3 | ~7 min |
| | Undo the last rebase: `git reset --hard ORIG_HEAD` (or the reflog line below `rebase (start)`; `HEAD@{1}` does not count) | practice | 1 | ~30 s |
| 7.4 | **Committed a secret**: `git add .` took `.env` into your unpushed last commit; `git rm --cached .env`, `.env` into `.gitignore`, `git commit --amend`; the debrief says to rotate a key that was pushed and to look at `git status` before `git add .`. A new commit that deletes .env (the key stays in the history), a plain `git rm` (your file is gone) and amending without the ignore line do not count | scenario | 2 | ~6 min |
| | Stop tracking a file but keep it: `git rm --cached .vscode/settings.json`, commit (`git rm` without `--cached` does not count) | practice | 1 | ~30 s |
| | Delete a file with git rm: `git rm summer.html`, commit (a plain `rm` leaves nothing staged) | practice | 1 | ~30 s |
| 7.5 | **Deleted a branch with unmerged work**: `feature/loyalty-card` was deleted with `-D` an hour ago, a price fix on main since; `git branch feature/loyalty-card <id from the story>` or `HEAD@{2}` from the reflog. Resetting main onto the lost commits does not count (main's goal only counts once the branch is back) | scenario | 2 | ~5 min |
| | Restore a deleted branch: `git branch fix/price-typo <id>`, the id from git's "Deleted branch" line in the task | practice | 1 | ~30 s |

Chapter 8, Workflows (ADR 0006, batch 8; no preview, the owner delegated the texts to the plan). The entries use the Corner Bakery website with Maya, Jonas and Ben and lean on `cherry-pick` and `tag` (`docs/features/git-model.md`). 8.1's merge on origin is a `when` teammate event (`teammateMerge`, right after your branch reaches origin); 8.2 and 8.5 check in HEAD's reflog that a commit was made on the hotfix or release branch (`committedOn`), so deleting that branch afterwards is fine. The id in 8.3's last hint is checked against the simulation by the level tests:

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 8.1 | **The pull request flow**: your main is behind (Jonas pushed); `git pull`, `git switch -c feature/sunday-hours`, add the Sunday hours, commit, `git push -u`; Maya merges it on origin and deletes the branch there; `git switch main`, `git pull`, `git branch -d`, `git fetch --prune`. A branch from the stale main, and deleting without pulling the merge, do not count (the cleanup goals only count once main has your commit) | scenario | 2 | ~6 min |
| | Clean up after a merged pull request: on main, `git pull`, `git branch -d feature/newsletter-form`, `git fetch --prune` (deleting without pulling does not count) | practice | 1 | ~1 min |
| 8.2 | **Hotfix in the middle of a feature**: unfinished gift card work on the pushed `feature/gift-cards` (`git switch` refuses); `git stash` (or a WIP commit), `git switch -c hotfix/christmas-eve main`, fix banner.html, commit, merge into main, push, back, `git stash pop`, `git merge main`. Committing straight on main, shipping the gift cards, never merging main in and rebasing the pulled branch do not count | scenario | 3 | ~7 min |
| | Put your work aside for a hotfix: `git stash`, `git switch -c hotfix/menu-typo main` (from the feature branch, or without stashing, does not count) | practice | 1 | ~30 s |
| 8.3 | **Bring a fix to the release branch**: main has Maya's unfinished Christmas pages and Jonas's order form fix; `git switch release/1.4`, `git cherry-pick <id>`, `git push`. Merging main in, or picking the Christmas link, does not count | scenario | 2 | ~5 min |
| | Cherry-pick one commit: `git cherry-pick main` on `release/1.4` (a merge does not count) | practice | 1 | ~30 s |
| | Note where a pick came from: `git cherry-pick -x main` (without `-x` does not count) | practice | 1 | ~30 s |
| 8.4 | **Tag a release**: 1.4.0 is the commit below the newest; `git tag -a v1.4.0 -m "Version 1.4.0: online orders" HEAD~1`, `git push origin v1.4.0`; the debrief covers lightweight vs annotated, `--tags` and semantic versioning. A lightweight tag, a tag on the newest commit and a plain `git push` do not count | scenario | 2 | ~5 min |
| | Tag the current commit: `git tag -a v1.5.0 -m "Version 1.5.0"` (a lightweight tag does not count) | practice | 1 | ~30 s |
| | List your tags: `git tag` (or `-l`, `-n`; `git log` does not count) | practice | 1 | ~30 s |
| 8.5 | **A release branch, GitFlow style**: `git switch -c release/1.5 develop`, set version.txt to 1.5.0 and commit, `git merge --no-ff release/1.5` on main, `git tag -a v1.5.0`, merge the release into develop; the debrief compares GitFlow and trunk-based development. A fast-forward into main, a lightweight tag, forgetting develop, or the version commit straight on develop do not count | scenario | 3 | ~8 min |
| | Start a release branch from develop: `git switch -c release/1.6 develop` while on main (`switch -c` from main does not count) | practice | 1 | ~30 s |
