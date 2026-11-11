# Context: Grindstone glossary

- **Track**: one skill area of the app, with its own levels (Git first; later Working with AI, Web fundamentals, Debugging, ...).
- **Level**: one scenario in a track. Written as one TypeScript file: setup, goals, teammate events, hints, debrief, solution.
- **Setup**: the starting state of a level (local repo, `origin`, files, current branch), built with the setup builder.
- **Goal**: a named check over the state, shown as one line of the live checklist. A level is solved when every goal passes.
- **Hint**: up to three per level, from a nudge to the exact command.
- **Debrief**: the short text shown when a level is solved, explaining *why* the solution works.
- **Solution**: the command list that solves a level; tests replay it.
- **Git model**: Grindstone's own simulation of git (objects, refs, HEAD, index, working tree), not real git.
- **Origin**: the simulated remote repository. Your repo sees it only through `fetch`, `pull` and `push`; teammates write only to it.
- **Teammate**: a scripted colleague (e.g. Anna) who acts on `origin`.
- **Teammate event**: one thing a teammate does (push commits, force-push, leave a review comment), fired by a **trigger**: after N of your commands, or right before a given command.
- **Shell**: the small fake shell around git (`ls`, `cat`, `echo >`, `echo >>`, `rm`, `touch`, `edit`).
- **Graph**: the SVG commit graph that redraws after every command; local branches solid, `origin/*` outlined.
- **Progress**: per level: solved, hints used, commands used versus the solution. Stored in localStorage.
