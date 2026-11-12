# Levels

The scenario engine (`shared/levels/`) and the git track's levels (`shared/levels/git/`). Pure TypeScript: no Vue, DOM or Nuxt imports. Tests: `test/unit/levels/`.

## Public API (`shared/levels/index.ts`)

- `startLevel(level): Session`: a fresh session on the level's setup.
- `submit(session, level, line): SubmitResult`: runs one terminal line. Returns `{ session, output, notices, solvedNow }`.
- `saveFile(session, level, path, content): SubmitResult`: the editor panel's save; counts like a command (`edit <path>` in the history) and can be undone.
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
  5. `afterCommands: N` events fire once the history (the current timeline) has N entries.
  6. Goals are recomputed; `solvedNow` is true on the first transition to all goals met. `solved` then stays true for the attempt and the session stays playable.
- **Events** fire once per timeline: `firedEvents` is part of the snapshot, so an undo that rewinds past an event lets it fire again. Each firing returns a `Notice` (`{ eventId, author, text }`).
- **Counts**: `history` is the current timeline (undo shortens it); `commandCount` is the effort of the attempt and includes undone commands. Progress uses `commandCount`.

## Tracks and chapters

`shared/levels/track.ts` (types and helpers) and `shared/levels/tracks.ts` (the registry). Play order, chapter numbers and scenario numbers are derived from the chapter lists, never written by hand.

- **Track**: `{ id, title, scope (one line), tagline (one line for its home card, may be empty), description (the home card's pitch), status: 'live' | 'coming', cheatSheet (its path, or null), chapters }`. Everything the home page, the nav and the track page show about a track comes from here, so a new live track needs data only. `tracks` lists them in home page order: Git (live), then Working with AI, Web fundamentals, Debugging, Framework deep dives (coming: no chapters, no levels, not playable). `defineTrack` numbers the chapters and throws for a level of another track, a level listed twice, a coming track with levels, or a practice task that does not follow its scenario.
- **Chapter**: `{ id (unique in its track, also the section anchor: /git#merging), trackId, number, title, description (one line), colour (a slot of the branch palette, 0-7), levels }`. `levels` is the play order: each scenario followed by its practice tasks. A chapter without levels is *coming*: shown with its description only.
- **Git chapters**: 1 Basics (5 scenarios, 6 practice tasks), 2 Branching (5 scenarios, 6 practice tasks), 3 Merging (Merge, Merge conflict), 4 Rewriting history (Rebase), 5 Teamwork & remotes (Teammate sync), 6 Undo & recovery (5 scenarios, 7 practice tasks), 7 Disasters, 8 Workflows (7-8 coming). Colours: slot = chapter number - 1; slot 7 exists only for chapters, so branch colours in the graph did not move.
- **Numbers**: a scenario is `chapter.position` counting scenarios only, e.g. `1.2` for Stage only what belongs together, `3.2` for Merge conflict (`levelNumber`, `LevelPlace.number`). A practice task has no number (`number: null`); `LevelPlace.scenario` names its scenario and that scenario's number. `placeName(place)` is the text form: "3.2 Merge conflict", or the title alone for a practice task. The ids and URLs (`git-04-merge-conflict`, `/git/04-merge-conflict`, `/git/practice-stage-one-file`) never change when a level moves or gets renumbered.
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
- File contents and code comments read like a real project other people work on: a bakery shop, a garden club planner, comments that say why ("Agreed with the shop team: orders from 50 euros ship for free"), teammates by name.
- Friendly and personal: we are their friends who help and teach. Second person, no blame, the debrief explains *why*.
- Fictional people and teams only (Anna, Ben, Chris, Maya; a bakery, a garden club), never real companies; fake keys only (`test-key-not-real-0000`).

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
| `teammates` | optional `{ id, author, trigger, apply, notice }`; `trigger` is `{ afterCommands: n }` or `{ beforeCommand: 'git push' }`; `apply` usually calls `teammateCommit` on origin |
| `hints` | a scenario: exactly three (nudge, concept, exact commands in backticks); a practice task: one |
| `debrief` | scenario: `{ title, paragraphs }`, 2-4 short paragraphs on why it works |
| `solution` | the command lines that solve it (a practice task: 1-3); the tests replay them through `submit` |

Goal helpers for git levels live in `shared/levels/git/checks.ts`: `conflictFullyResolved(state, rev)`, `treeOf`, `treeHasConflictMarkers`, `changedIn(state, rev)` (paths a commit changed against its first parent), `gitInvocations(history)` (every `git ...` command, also inside chains), `ran(history, command, matches?)` (a successful `git <command>` in the history), `hasFlag(args, short, long?)` (also bundled: `-am` has `-a`), `isBareForcePush`, `isLeasePush`. `ignoreMatcher` from the git model checks a committed `.gitignore`.

Conventions:

- Goals check outcomes in the state, not the commands typed. Use `history` only when the *how* is the lesson (level 6: `--force-with-lease`, never a bare `--force`) or when the command changes nothing (`diff`, `log`: "You looked at both sides").
- A goal that is trivially true at the start is fine when it guards against a wrong path (e.g. "no merge commits", "dist/ and .env are still on your disk"), but it must be listed in the test's `initialGoals` table.
- Every scenario has at least one wrong path in the test's `wrongPaths` table (the obvious shortcut that must not solve it), and every practice task its obvious one.
- Conflict files are written in the solution with `echo ... >` and `echo ... >>` (chained with `&&`), since the editor panel is UI-only.
- A solution that needs a commit id computes it from the deterministic setup (1.4 Read the history).

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
| 2.1 | **Start a branch** (`git-02-branch`, v0.1's "Branch", renamed): commit a change on `feature/greeting`; main must not move | scenario | 1 | ~4 min |
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

Chapter 6, Undo & recovery (ADR 0006, batch 2; preview `.impeccable/mocks/previews/undo-preview.html`):

| | Entry | Kind | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 6.1 | **Fix the last commit**: "Add strak counter" with `src/streak.css` left untracked, not pushed; `git commit --amend` to one commit "Add streak counter" | scenario | 1 | ~4 min |
| | Add a forgotten file to the last commit: `git commit --amend --no-edit` | practice | 1 | ~30 s |
| 6.2 | **Throw away a change**: `git restore menu.html` (a broken grid experiment), `git restore --staged prices.js` (a draft staged by `git add .`), hours.html stays staged | scenario | 1 | ~4 min |
| | Unstage one file: `git restore --staged style.css` | practice | 1 | ~30 s |
| | Discard your changes in one file: `git restore src/beds.js` | practice | 1 | ~30 s |
| 6.3 | **Undo a local commit**: two unpushed commits; `git reset --hard HEAD~1` drops the blink commit, `git reset HEAD~1` takes back the gift wrap commit and keeps its changes; story, hint and debrief warn that `--hard` throws away uncommitted work for good | scenario | 2 | ~6 min |
| | Undo the last commit, keep its changes staged: `git reset --soft HEAD~1` | practice | 1 | ~30 s |
| | Drop the last two commits completely: `git reset --hard HEAD~2` (on a clean tree) | practice | 1 | ~30 s |
| 6.4 | **Undo a pushed commit**: Jonas pulled "Round prices to whole euros"; `git revert <id>` and `git push` (the approved sample text; the last hint names the real id) | scenario | 2 | ~5 min |
| | Revert the commit before last: `git revert HEAD~1` | practice | 1 | ~30 s |
| 6.5 | **Park unfinished work**: on `feature/gift-cards` with staged and unstaged work, `git switch main` refuses; `git stash`, fix Saturday hours on main, commit, switch back, `git stash pop`; the stash ends empty | scenario | 2 | ~6 min |
| | Stash including new files: `git stash -u` | practice | 1 | ~30 s |

Chapters 3-5 (v0.1):

1. **Merge** (3.1): fast-forward `feature/about-page` into main, starting on the feature branch.
2. **Merge conflict** (3.2): main (Ben) and `feature/footer` changed the same line; resolve and conclude with a two-parent merge commit. Committing the markers does not count.
3. **Rebase** (4.1): `feature/search` is behind main (Chris); `git rebase main`. Merging main in does not count.
4. **Teammate sync** (5.1): `feature/login` has 2 unpushed commits. Right before your first `git push`, Anna pushes 2 commits to origin/main, one changing the same line of `src/login.ts`. The push of the new branch succeeds, then you fetch, rebase onto origin/main, resolve, and update the remote branch with `--force-with-lease` (a plain push is rejected). A merge, or any bare `--force` / `-f` in the history, does not count; `undo` takes a bare force back. The file header explains why this flow was chosen over "already pushed in the setup".
