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
