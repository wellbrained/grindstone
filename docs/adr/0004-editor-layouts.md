# 0004 · Editing like in your own IDE: two layouts

Status: accepted, 2026-11-11 (Nik).

## Why

Many developers edit files in their IDE and run git in its built-in terminal. A terminal-only trainer (plus a popup editor for conflicts) does not match how they work.

## Decisions

- **Layouts**, switchable on the play page and remembered per viewer (originally three; see the update below):
  - **Terminal** (today's layout, default): goals left, terminal centre, graph right; `edit <file>` opens the editor panel.
  - **IDE**: like VS Code / WebStorm: file explorer left (working tree, with status colours: modified, untracked, conflicted), editor with tabs centre, terminal as a bottom panel, goals and graph in a right side panel.
  - ~~**Mix**: editor and terminal side by side as equals; open files as tabs (no tree); goals and graph collapsible.~~ Dropped, see below.
- **Editor**: CodeMirror 6 (light, themeable, works on phones), not Monaco.
- **Conflicts**: above each conflict block, "Accept current · Accept incoming · Accept both" actions like VS Code; editing markers by hand still works. Levels only check the result.
- **No source control panel** (staged/unstaged list, commit button) for now: the trainer teaches the commands; a visual mode is on the later list.
- **Not now**: syncing to a real folder (File System Access API, Chrome/Edge only, would confuse the IDE's own git view) and a local CLI with real git; both stay ideas.

## Order

Logo first (waiting on the style choice), then these layouts, then the small UI fixes (graph label widths, undo button), then levels 7–10.

## Update 2026-11-11 (Nik): two layouts, one skeleton

- **Mix is dropped**: in use it was no different from the IDE. What the IDE means is file structure, editor and terminal. A stored `mix` preference reads as `ide`.
- **Switching must not re-shuffle the page.** Both layouts share one skeleton, with the Terminal layout as the anchor: level panel left, terminal centre, commit graph right, switch top right in its own row. IDE opens Files below the level panel and the editor above the terminal, in place (220 ms, off under reduced motion); everything else keeps its position. The IDE's earlier right-hand side panel (level and graph) is gone.
- Phones stack the panels in both layouts (level, [Files, editor,] terminal, graph) instead of the IDE's tabs, so nothing reorders on a switch.
- Why: with different skeletons the level panel jumped sides, the graph changed size, and the terminal was rebuilt on every switch.
