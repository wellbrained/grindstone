# 0007 · Second track: Debugging, and the skill radar

Status: accepted, 2026-11-13 (Nik, grilling). Replaces the line in 0001 "no skill radar until a second track exists": the radar ships first, on Git.

## Order

1. **Skill radar on Git**: preview, then build and deploy as one small change. Easy to take out again if Nik doesn't keep it.
2. **Debugging track**: preview (play page + chapter 1's five scenario ideas), then split the level engine from git (0001 says git code stays apart; the import graph doesn't follow that yet: `engine.ts`, `types.ts`, `useLevelPlay.ts`), then chapter 1, deployed. Later chapters one at a time, each with a preview, as in 0006.

## Skill radar

- **One radar per track**, its axes are the track's chapters. Shown on the track page next to the chapter list and in the debrief, where the axis that grew moves once (not under reduced motion). A chapter that is still coming is a dashed axis.
- **An axis** = the share of the chapter's levels you solved (scenarios and practice tasks). A solve that needed the last hint (the one that gives the answer away) counts half; a later solve without it counts full. Replays can raise an axis, nothing lowers it. No command weighting, no skill decay.
- **No overview radar** across tracks until three tracks are live (two axes are a line, not a shape). **No placement check.**
- **Look**: the logo's radar mark (0005), filled in the track's accent, each axis ending in its chapter's colour dot and name. Empty: the outline and "Solve levels to fill your radar". Screen readers get a list ("Basics: 4 of 11 solved").
- Needs from progress: whether a solve used the last hint (stored with the best run).

## Debugging track

- **Name and address**: "Debugging", `/debugging`, tagline "Find the bug before your customers do." Live on home and in the menu once chapter 1 ships.
- **Environment (sandbox)**: each level is a small, real app (HTML, CSS, plain JavaScript modules) that runs in a sealed iframe. Grindstone's own panels read what it does: **Console** (logs, warnings, errors; stack traces with clickable lines that open the file at that line; an input line that runs an expression inside the app; no filters or groups yet), **Code** (the existing editor), **Reload** (restarts the app after an edit), and with later chapters Network, Elements and more. A scripted **fake backend** answers the app's requests (a 500 or a slow answer on cue), so levels are repeatable and there is still no server. Not chosen: a fully simulated browser (you would never fix real code) and the browser's own DevTools (Grindstone can't check goals, no phones).
- **Solved** = the app behaves: goals check what you can observe ("no errors in the console", "the order button sends one request", "the total shows 12.50"). The debrief explains why.
- **Best run** = fewest hints, then fewest reloads before it worked. No clock (it would push guessing).
- **Practice tasks**: one or two per scenario, about 30 s, two kinds: **find** (click the line that throws) and **quick fix** (one line in a tiny app). Shown on a side branch as in 0006.
- **Language**: plain JavaScript in the early chapters, so traces are clear. Vue apps may come in a later chapter.
- **World**: Corner Bakery's ordering website; colleagues report the bugs in the story. No colleague events during play in chapter 1; they come with Incidents. Triggers stay generic for that.
- **Chapters**: 1 Reading errors (console, stack traces, `undefined is not a function`, typos, wrong imports), 2 Network (failed requests, status codes, payloads, CORS), 3 Elements & CSS, 4 State & async, 5 Breakpoints & stepping, 6 Performance, 7 Incidents (logs, the latest change, rollback). First release: chapter 1 with about five scenarios and their practice tasks; the rest show as coming.
- **Phones**: playable, panels stacked as tabs (App, Console, Code); designed for desktop first.
- **Cheat sheet**: none in the first release; a "reading errors" sheet may come with chapter 2.

## Update 2026-11-13 (built as 0.2.5)

- **No names on the radar** (approved preview): the rail is 300px wide, so each axis ends only in its chapter's colour dot and the chapter list below is the legend.
- **Hint use is stored as `fewestHints`** per level (the fewest hints any solve revealed, only ever lower), not with the best run, which is chosen by commands and may not be the clean solve. Optional field, no progress version 4: 0.2.4 still loads a 0.2.5 backup. Saved data from before takes it from the best and latest run; a clean solve that was neither counts half until replayed (docs/features/levels.md).

## Update 2026-11-13: the engine split (built as 0.2.7, step 2 part 1)

The level engine is split from git, with no visible change for Git (docs/features/levels.md, "Environments"; docs/features/ui.md, "Play page").

- **One core, generic over an environment**: `shared/levels/` (types, engine, progress, track, radar) is track-agnostic and generic over a level's state, what its history records and its solution steps; it never imports an environment (a test checks the imports). Git is one environment in `shared/levels/git/` (its engine with the trainer commands, `CommandRecord`, `SolutionStep`, `levelCommands`, checks, levels) on the git model in `shared/git/`. Why generic functions over an environment object: the core stays plain functions over plain data, as before, and an environment calls them with its own actions (`act`, `undoLast`, `restart`, `takeHint`) and words the result itself; Debugging's input is clicks, saves and reloads, not a terminal.
- **Environments register by declaration merging** (`interface Environments` in the core, filled from each environment's folder), so `Level` is the union of the registered environments' levels (git's alone today, which keeps every existing type and test as it was) and `Level<'git'>` is one of them, told apart by `track`. Why not a plain `Level<unknown>`: every git level, test fixture and UI component would need casts, and goals would lose their state type.
- **Best run is a per-track measure** (`Track.bestRun`, an ordered list of run counters): Git `['commands', 'hints']` (unchanged), Debugging `['hints', 'reloads']`. A run gets an optional `reloads`; `commands` stays the count of counted actions in every track. **No progress version 4**: the field is optional and git runs never carry it, so 0.2.6 data and backups load and save back unchanged, and 0.2.6 still reads a newer file (it ignores `reloads`). `fewestHints` and the radar are untouched.
- **The play page dispatches by track**: `[level].vue` hands the level to its track's play component (`GitPlay`); shared are `usePlaySession` (session in memory, goals, recording with the track's measure, stats events, spark, debrief, Again), `PlayFrame` (the three-column frame), `LevelPanel` and `DebriefDialog` (the radar; each track's run in its `stats` slot, git's `GitRunStats`). Git's are `useGitPlay`, `GitWorkbench` and its panels.
- **Left for chapter 1**: Debugging's seven chapters stay out of the registry until its levels arrive (the tests pin a coming track to no chapters); its environment, play component and panels; a measure-aware best-run line on the track page's rows (it shows commands, right for Git only); Debugging's tagline and description from this ADR.
