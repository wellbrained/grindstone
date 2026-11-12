# Levels

The scenario engine (`shared/levels/`) and the git track's levels (`shared/levels/git/`). Pure TypeScript: no Vue, DOM or Nuxt imports. Tests: `test/unit/levels/`.

## Public API (`shared/levels/index.ts`)

- `startLevel(level): Session`: a fresh session on the level's setup.
- `submit(session, level, line): SubmitResult`: runs one terminal line. Returns `{ session, output, notices, solvedNow }`.
- `saveFile(session, level, path, content): SubmitResult`: the editor panel's save; counts like a command (`edit <path>` in the history) and can be undone.
- Tracks and chapters (see below): `tracks`, `gitTrack`, `trackById(id)`, `defineTrack(definition)`, `trackLevels(track)`, `trackPlaces(track)`, `placeIn(track, id)`, `levelPlace(id)`, `levelNumber(id)`, `chapterOf(id)`, `chapterProgress(chapter, progress)`, `trackProgress(track, progress)`, `nextUp(track, progress)`, `continueTarget(track, progress)`, `hasProgress(progress)`, `trackToContinue(progress)`. The lookups take the registry as an optional last argument, so tests run them on a 58-level fixture (`test/unit/levels/fixtures.ts`).
- `levels` (every level of every track, in play order), `gitLevels`, `levelById(id)`, `nextLevel(id)` (the next level of the same track, across chapter boundaries; null after the last).
- `gitSubcommands(line)`, `levelCommands(level)`: the git commands a level practises, from its solution (level rows, cheat sheet).
- Progress: `emptyProgress()`, `recordSolve(progress, levelId, session)`, `recordPlay(progress, levelId, at)`, `serializeProgress(progress)`, `parseProgress(text)`, `PROGRESS_VERSION`.
- `MAX_SNAPSHOTS` (undo depth, 200), `TRAINER_COMMANDS`, all types (`Level`, `Goal`, `GoalContext`, `TeammateEvent`, `Session`, `TerminalLine`, `Notice`, ...).

## Engine rules

- **Pure and immutable**: every call returns a new session; a session is plain JSON (the UI may store it as is).
- **Output** is `TerminalLine[]`: git's `OutputLine`s plus two markers the UI interprets, `{ kind: 'clear' }` and `{ kind: 'edit', path }` (open the editor panel).
- **Trainer commands** are handled before git and are not counted, recorded or undoable. Matched on the trimmed line, any case:
  - `undo`: restores the previous snapshot (git state, history, fired events). Prints `Undid: <line>`, or `Nothing to undo.`
  - `reset`: back to the setup as a new attempt (history, undo stack, events, `solved` and `commandCount` cleared). Revealed hints stay revealed and counted.
  - `hint`: reveals the next hint (`Hint n/3: ...`, kind `hint`) and counts it; after the third it repeats the last one.
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

`shared/levels/track.ts` (types and helpers) and `shared/levels/tracks.ts` (the registry). Play order, chapter numbers and level numbers are derived from the chapter lists, never written by hand.

- **Track**: `{ id, title, scope (one line), tagline (one line for its home card, may be empty), description (the home card's pitch), status: 'live' | 'coming', cheatSheet (its path, or null), chapters }`. Everything the home page, the nav and the track page show about a track comes from here, so a new live track needs data only. `tracks` lists them in home page order: Git (live), then Working with AI, Web fundamentals, Debugging, Framework deep dives (coming: no chapters, no levels, not playable). `defineTrack` numbers the chapters and throws for a level of another track, a level listed twice, or a coming track with levels.
- **Chapter**: `{ id (unique in its track, also the section anchor: /git#merging), trackId, number, title, description (one line), colour (a slot of the branch palette, 0-7), levels }`. A chapter without levels is *coming*: shown with its description only.
- **Git chapters**: 1 Basics (First commit), 2 Branching (Branch), 3 Merging (Merge, Merge conflict), 4 Rewriting history (Rebase), 5 Teamwork & remotes (Teammate sync), 6 Undo & recovery, 7 Disasters, 8 Workflows (6-8 coming). Colours: slot = chapter number - 1; slot 7 exists only for chapters, so branch colours in the graph did not move.
- **Level number**: `chapter.position`, e.g. `3.2` for Merge conflict (`levelNumber`, `LevelPlace.number`). The ids and URLs (`git-04-merge-conflict`, `/git/04-merge-conflict`) do not change when a level moves.
- **Next up**: the first unsolved level in play order (`nextUp`). **Continue** (`continueTarget`): the level you last played while it is unsolved (`resume: true`, with the time), else next up; null when every level of the track is solved. `trackToContinue` picks the track for the home page: the live track of the last played level, else the first live track with a solve.

## Progress

`Progress = { version: 2, levels: { [id]: { solved, hintsUsed, commands, bestCommands } }, lastPlayed: { levelId, at } | null }`. `recordSolve` takes hints and commands from the latest solve and keeps the fewest commands in `bestCommands`; an unsolved session leaves progress unchanged. `recordPlay` sets `lastPlayed` (the play page calls it for every line typed and every editor save). `parseProgress` returns empty progress for missing, broken or unknown-version data and drops malformed entries; version 1 data (no `lastPlayed`) is migrated on read: its levels are kept, `lastPlayed` is null. A malformed `lastPlayed` is dropped on its own. Storage (localStorage) is the UI's adapter.

## Level file format

One file per level in `shared/levels/<track>/NN-slug.ts`, exporting a `Level`:

| Field | Content |
| --- | --- |
| `id` | `<track>-NN-slug`, e.g. `git-04-merge-conflict` |
| `track`, `title` | `'git'`, a short title |
| `story` | 1-3 short paragraphs (joined with a blank line), second person, the situation and what to do |
| `setup` | `() => GitState`, built with `repo()` / `folder()` from the git model; must be deterministic |
| `goals` | `{ id, label, check({ state, history }) }`; `label` is one checklist line |
| `teammates` | optional `{ id, author, trigger, apply, notice }`; `trigger` is `{ afterCommands: n }` or `{ beforeCommand: 'git push' }`; `apply` usually calls `teammateCommit` on origin |
| `hints` | exactly three: nudge, concept, exact commands (in backticks) |
| `debrief` | `{ title, paragraphs }`, 2-4 short paragraphs on why it works |
| `solution` | the command lines that solve it; the tests replay them through `submit` |

Goal helpers for git levels live in `shared/levels/git/checks.ts`: `conflictFullyResolved(state, rev)`, `treeOf`, `treeHasConflictMarkers`, `gitInvocations(history)` (every `git ...` command, also inside chains), `isBareForcePush`, `isLeasePush`.

Conventions:

- Goals check outcomes in the state, not the commands typed. Use `history` only when the *how* is the lesson (level 6: `--force-with-lease`, never a bare `--force`).
- A goal that is trivially true at the start is fine when it guards against a wrong path (e.g. "no merge commits"), but it must be listed in the test's `initialGoals` table.
- Conflict files are written in the solution with `echo ... >` and `echo ... >>` (chained with `&&`), since the editor panel is UI-only.
- Fictional people and teams only (Anna, Ben, Chris; a bakery, a garden club), never real companies.

## Adding a level

1. Add a row for it to `initialGoals` in `test/unit/levels/git-levels.test.ts` (goal ids and their value at the start) and any wrong-path tests: red.
2. Write `shared/levels/<track>/NN-slug.ts` and add it, in one line, to its chapter's `levels` in that track's `index.ts` (plus the import). Its number (`3.3`), its place in the play order, its row on the track page and its commands follow from that.
3. `pnpm test`: the shared tests check shape, a deterministic setup, the start state, and that replaying `solution` solves the level exactly on its last line. `test/unit/levels/tracks.test.ts` pins the chapter of every level; add the new id there.

## The v0.1 git levels

1. **First commit**: a folder with README.md and app.js; `init`, `add`, `commit`.
2. **Branch**: commit a change on `feature/greeting`; main must not move.
3. **Merge**: fast-forward `feature/about-page` into main, starting on the feature branch.
4. **Merge conflict**: main (Ben) and `feature/footer` changed the same line; resolve and conclude with a two-parent merge commit. Committing the markers does not count.
5. **Rebase**: `feature/search` is behind main (Chris); `git rebase main`. Merging main in does not count.
6. **Teammate sync**: `feature/login` has 2 unpushed commits. Right before your first `git push`, Anna pushes 2 commits to origin/main, one changing the same line of `src/login.ts`. The push of the new branch succeeds, then you fetch, rebase onto origin/main, resolve, and update the remote branch with `--force-with-lease` (a plain push is rejected). A merge, or any bare `--force` / `-f` in the history, does not count; `undo` takes a bare force back. The file header explains why this flow was chosen over "already pushed in the setup".
