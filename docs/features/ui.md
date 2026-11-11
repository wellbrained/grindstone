# UI

The browser UI of the git track (Nuxt 4 SPA, Nuxt UI 4, Tailwind 4). Decisions: `docs/adr/0001-plan.md` (layout, terminal, graph), `docs/adr/0003-look.md` (look) and `docs/adr/0004-editor-layouts.md` (the two layouts, CodeMirror). Pure logic is in `app/utils/` (unit tests in `test/unit/ui/`); the engine and the git model stay in `shared/` and know nothing about the UI.

## Pages

| Route | File | Content |
| --- | --- | --- |
| `/` | `app/pages/index.vue` | Pitch (what it is, the teammate angle), a Start / Continue / Play again button, the track's level list with solved state. |
| `/git/<slug>` | `app/pages/git/[level].vue` | The play page. The slug is the level id without the track: `/git/01-first-commit` for `git-01-first-commit` (`app/utils/level-route.ts`). An unknown slug shows the 404 page. |

Hosting: the app is static; direct links such as `/git/01-first-commit` need the host to fall back to `200.html` (`nuxt generate` writes it) for unknown paths.

## Play page layouts

A segmented control above the play area (`LayoutSwitch`, a radio group: Tab reaches the chosen one, arrow keys move the choice) switches between two layouts, **Terminal** (default) and **IDE**. The choice is stored per viewer in localStorage (`grindstone:layout`, read through `parseLayout`, every access guarded; with storage blocked it lasts for the visit; a stored `mix` from the dropped Mix layout reads as `ide`) and shared by all levels (`usePlayLayout`).

Both layouts are one skeleton (`PlayWorkbench`), so a switch feels like panels opening and closing in place, not a re-shuffle: the level panel, the terminal, the commit graph and the switch keep their place. IDE only adds two panels: **Files** (`FileExplorer`) below the level panel and the **editor** (`EditorArea`) above the terminal. Nothing is rebuilt on a switch: the terminal (log, input, scroll), the editor tabs and the explorer stay mounted; when the terminal gets shorter and its log was at the end, it stays at the end (a `ResizeObserver` in `TerminalPane`), so the prompt does not slide out of view. A closed panel is `inert` (no focus, hidden from screen readers) and takes no space. The switch sits right-aligned in its own row and never moves; the "best with a keyboard" note on its left shows on phones in both layouts and keeps its space (invisible) from md up.

| Width | Terminal | IDE |
| --- | --- | --- |
| >= lg (1024px) | Three columns in a viewport-high grid: level panel (16rem, 18rem from xl, 20rem from 2xl), terminal (fills), commit graph (20rem, 24rem from xl, 30rem from 2xl). The panel and the graph scroll inside their column; the terminal output scrolls in the terminal. | Same columns. Files opens below the level panel (`min(14rem, 36%)` of the column; the level panel scrolls above it), the editor opens above the terminal (editor 1.6 : terminal 1, the terminal at least 10rem). The terminal keeps its bottom edge and only gets shorter. |
| md to lg | One column: level panel, graph, terminal. | Level panel, Files (16rem), graph, editor (26rem), terminal. |
| < md | One column: level panel, terminal, graph. The terminal does not autofocus on touch devices (`pointer: coarse`), so the keyboard does not pop up unasked. | Level panel, Files (14rem), editor (26rem), terminal, graph. Opening a file scrolls the editor into view (without the keyboard). |

Motion: a panel opens and closes in 260 ms (ease-in-out, it moves things already on screen), as plain CSS (`.reveal` in `main.css`): stacked, its row grows from `0fr` to `1fr`; in the lg grid it is a flex item whose `flex-grow` (editor) or `flex-basis` (Files) grows from 0. The panel's content fades in once the box is mostly open (160 ms after a 110 ms delay) and fades out first when it closes (90 ms), so it is never seen squeezed. Off under `prefers-reduced-motion: reduce`.

Modals (file picker, editor panel, debrief) do not shift the page: `html` keeps a stable scrollbar gutter, so `<UApp :scroll-body="false">` stops the scroll lock from adding the scrollbar width as body padding.

No horizontal page scroll down to 360px: terminal text wraps (`whitespace-pre-wrap`), the graph scrolls inside its own box. In the Terminal layout `edit <file>` and the conflicted-files list open the editor panel (`FileEditor`, a modal); in the IDE they open a tab. **Open file** in the editor header (`FilePicker`, a command palette over the working tree with status letters) is the keyboard way to a file.

### File explorer (`FileExplorer`)

The engine's working tree as a folder tree (`UTree`: arrow keys move, Enter opens; folders start expanded and remember being collapsed). `buildFileTree(workdir, statuses)` and `fileStatuses(state)` in `app/utils/file-tree.ts` (pure, tested):

| Status | Letter | Colour | When |
| --- | --- | --- | --- |
| conflicted | C | error | unmerged path |
| modified | M | warning | tracked, working tree or index differs from HEAD |
| added | A | success | not in HEAD, staged |
| untracked | U | success | not in the index |
| deleted | D | error, struck through | in HEAD or the index but gone from the working tree; listed, cannot be opened |

The letter sits next to the name and the status is also in the accessible name (`footer.ts (conflicted)`), never colour alone. A folder shows a dot in the colour of its most urgent status. Before `git init` there are no statuses. A legend under the tree explains the letters.

## Components (`app/components/`)

- `AppLogo`: wordmark with a small grindstone-and-sparks mark (replaces the template logo).
- `LevelPanel`: title, story (`InlineText` shows `backticks` as code chips), live goal checklist (each goal has an icon and a hidden "done"/"not done yet" text, never colour alone), files with conflicts (click opens the editor), Hint and Reset buttons, the solved card with Show debrief and Next level.
- `TerminalPane`: the terminal. Output in a `role="log"` region (`aria-live="polite"`), one input line, history, Tab completion, Ctrl+L, Ctrl+C. `TerminalText` renders one output line (`err` in the error colour, `hint` dimmed, `tone` added/removed/meta, `refs` coloured from the branch palette), `TerminalPrompt` renders `you@grindstone ~/project (<branch>) $` with the branch in its palette colour (a merge or rebase in progress adds `|MERGING` / `|REBASING`, a detached HEAD shows `HEAD detached at <id>`).
- `CommitGraph`: the SVG graph (see below). `SparkBurst`: the ember effect when a level is solved.
- `FileEditor`: the Terminal layout's editor panel, a modal with `CodeEditor`; Save (Ctrl/Cmd+S, also Ctrl+Enter) calls `saveFile`, Cancel discards. A warning shows while conflict markers are still in the text.
- `CodeEditor`: CodeMirror for one file at a time; always used as `<LazyCodeEditor>`, so CodeMirror is its own chunk and loads only when an editor shows. Switching `path` keeps each file's undo history and cursor.
- `EditorArea`: the editor of the IDE layout: a strip of open tabs (name, `●` for unsaved edits, a warning icon when the file changed on disk, close button; closing a tab with unsaved edits asks first), Open file and Save buttons, the changed-on-disk notice, CodeMirror for the active tab.
- `FileExplorer`, `FilePicker`, `PlayWorkbench`, `LayoutSwitch`: see Play page layouts.
- `DebriefDialog`: debrief title and paragraphs, stats (commands used / shortest solution, hints used), Stay here and Next level (Back to all levels after the last one).
- `LevelList`: the track's levels with solved state (used on the home page inside `<ClientOnly>`, since progress only exists in the browser).

Composables: `useLevelPlay(level, { onEdit })` (session, terminal log, editor panel, editor tabs, file tree, debrief, graph input; `onEdit` decides where `edit <file>` opens a file), `useEditorTabs(workdir)` (open tabs that follow the working tree), `usePlayLayout()` (the layout choice), `useProgress()` (shared progress state). Utils: `branch-palette`, `graph-layout`, `completion`, `terminal` (prompt and completion names from a state), `progress-storage`, `level-route`, `conflicts`, `file-tree`, `editor-tabs`, `play-layout`. The CodeMirror setup is `app/editor/codemirror.ts` (outside `utils/`, so it is never auto-imported into the main bundle).

## Editor

- CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `language`, `@lezer/highlight`): line numbers, undo history, bracket matching, active line, soft line wrapping (no sideways scrolling on phones). Tab is not bound, so keyboard users can leave the editor. Ctrl/Cmd+S saves.
- Languages by file extension, each loaded as its own chunk the first time such a file opens: JavaScript (`js`, `mjs`, `cjs`, `jsx`), TypeScript (`ts`, `mts`, `cts`, `tsx`), JSON, Markdown; everything else is plain text.
- Theme from the app's tokens (`EditorView.theme` with `var(--ui-*)` and `--app-terminal*`), so one theme serves dark and light; syntax colours are semantic tokens (keywords secondary, strings success, numbers warning, comments dimmed, functions info, headings primary).
- **Conflicts** (`app/utils/conflicts.ts`, pure, tested): `parseConflicts(text)` finds complete `<<<<<<<` / optional `|||||||` / `=======` / `>>>>>>>` blocks (exactly seven marker characters at the start of a line; an unclosed block is ignored; a second `<<<<<<<` starts over). Current (ours) lines get the `--app-conflict-current` tint (success), incoming (theirs) `--app-conflict-incoming` (info), the marker lines a stronger tint and a "(current change)" / "(incoming change)" tag. Above each block a bar with **Accept current · Accept incoming · Accept both** (real buttons, accessible name "Conflict n: accept the current change", ...) rewrites the block in the editor buffer (`resolveConflict`; Accept both keeps ours then theirs; a diff3 base section is dropped; a block that ends the file without a line break leaves none). Nothing is saved until Save. Editing the markers by hand keeps working: the decorations follow the text.

## Sync rules (editor tabs and the engine)

The editor shows the engine's working tree (`session.state.workdir`); a tab never writes to it except through Save. Each tab keeps the disk content its draft is based on (`base`), the draft, and an optional "changed on disk" notice (`app/utils/editor-tabs.ts`, pure, tested; `useEditorTabs` applies it whenever the working tree changes):

- A command (or `undo`, `reset`, a teammate event) that leaves the file as the tab's base: nothing happens; a notice that no longer applies (e.g. after `undo`) disappears.
- The file changed and the tab has **no unsaved edits**: the tab reloads.
- The file was deleted and the tab has no unsaved edits: the tab closes.
- The file changed under **unsaved edits**: the draft stays, the tab gets a warning icon and the editor a notice with **Reload from disk** (take the disk version) and **Keep mine** (the draft stays and counts as an edit of the new disk version; saving overwrites it).
- The file was deleted under unsaved edits: the tab is struck through and marked deleted; the notice offers **Close tab** and **Keep mine** (saving brings the file back).
- `edit <file>` in the IDE opens the file in a tab or focuses its tab (on phones it scrolls the editor into view, without popping up the keyboard); a file that does not exist yet opens as an empty tab and is created on Save. In the Terminal layout `edit <file>` opens the editor panel as before.
- Save (Ctrl/Cmd+S or the Save button) writes the draft through `saveFile`, prints `Saved <path>.` in the terminal and counts as a command (undoable with `undo`). Saving a tab with a notice is the same as Keep mine plus Save.

## Terminal behaviour

- Lines go to `submit(session, level, line)`; `{ kind: 'clear' }` empties the log, `{ kind: 'edit', path }` opens the file (editor panel in the Terminal layout, a tab in the IDE), notices become an inline teammate line (icon plus text, e.g. "Anna pushed 2 commits to main.") inside the live log, so screen readers announce them. After a solve a "Level solved" line is added.
- Up/Down walk the history (kept for the whole visit, shared by all levels; the line being typed is restored at the bottom). Ctrl+L clears (like `clear`, not counted). Ctrl+C drops the current input.
- Tab completes (`app/utils/completion.ts`): trainer commands, `git` and shell commands at the start; git subcommands after `git`; branch names (local, `origin/<name>`, names on origin) for `switch`, `checkout`, `merge`, `rebase`, `branch`, `log`, `push`, `pull`, `fetch`, `diff`; `origin` for `push`/`pull`/`fetch`; file names for `add`, `checkout`, `diff`, `commit` and for `cat`, `edit`, `rm`, `touch`, `ls`. One match completes with a trailing space, several extend to the common prefix, and when nothing can be added the choices are printed. Flags are not completed. Tab on an empty line is left to the browser, so keyboard users can leave the field with Tab (and Shift+Tab always works).
- A click anywhere in the terminal focuses the input unless text is selected. After the editor or the debrief closes, the focus goes back to the terminal.
- The session lives in memory (`useState`): leaving the page and coming back keeps it, a reload restarts the level. Solving a level stores progress in localStorage (`grindstone:progress`, through `parseProgress` / `serializeProgress`, every access guarded; the app works with storage blocked, it just forgets).

## Theme

`app/assets/css/main.css` (tokens) and `app/app.config.ts` (Nuxt UI colours, outlined buttons with a visible hover and pointer cursor).

- Dark first (Nord-like greys), light with a cool grey page and white cards. Semantic Nuxt UI tokens only (`text-muted`, `bg-elevated`, `text-primary`, ...); no raw hex or palette colours in components.
- Accent `--ui-primary`: ember orange, `#ff8a3d` in dark, a darker `#b23a08` in light (text on it and the orange itself stay at AA).
- Fonts: Inter (UI) and JetBrains Mono (terminal, graph, goals, labels) via `@nuxt/fonts`.
- `--app-terminal` and `--app-terminal-border`: the terminal surface.
- Branch palette: `--branch-0` ... `--branch-6` plus `--branch-ink` (text on a filled pill), per theme, each at least 4.5:1 against the page, card and terminal backgrounds (checked with a script when the tokens were chosen; the ink at least 5.5:1 on every fill). A `.branch-c-N` class per slot sets `color`, so SVG can use `currentColor`.
- `app/utils/branch-palette.ts`: `branchIndex(name)` maps a branch name to a stable slot, shared by terminal and graph. `main` (and `origin/main`) is always slot 0, everything else lands on 1 to 6 by a hash of the name; `origin/x` and `x` share a slot. `branchClass(name)` returns the CSS class.
- Motion: the spark (`.spark`, `spark-ring` keyframes) and the graph transitions are CSS and switched off under `prefers-reduced-motion: reduce`.

## Graph layout (`app/utils/graph-layout.ts`)

`layoutGraph(input)` is a pure function: commits, local branches, `origin/*` refs, HEAD and optionally origin's own state in, rows, lanes and edges out. `CommitGraph` turns them into coordinates.

- Which commits: everything reachable from a ref (local branch, `origin/*` ref, a detached HEAD, and with the toggle on origin's own branch heads). Commits no ref reaches, such as the old commits a rebase replaced, are not drawn.
- Rows: topological, children before parents, newest first (logical timestamp, then id as tie-break). Row 0 is on top.
- Lanes: one per branch line. Refs claim commits in order (`main`, the checked-out branch, other branches by name, a detached HEAD, `origin/*`, origin's own heads); a ref claims its first-parent chain until it meets a commit another ref already claimed. A branch fast-forwarded onto main therefore owns nothing and shares main's lane. Commits nobody claims (the merged-in side of a merge whose branch is gone) get their own lane named `line:<id>` with a colour from that name. Lane order is the order of claiming, so `main` is lane 0.
- Colour: the node's colour comes from its lane's branch (`origin/x` colours as `x`). A fork edge takes the colour of the branch that starts there, a merge edge (second or later parent) the colour of the merged-in line (`merge: true` on the edge).
- Labels per commit: local branches (`kind: 'local'`, filled pill, `head: true` draws `HEAD -> name`), `origin/*` refs (`remote`, outlined), a detached HEAD (`head`), and with the toggle on origin's own branch heads that your `origin/*` ref does not show yet (`origin`, dashed, `origin: main`).
- Drawing: row height 42px, lane width 22px. A commit with labels shows the pills above and the first message line below; short id, message and labels are also in the SVG `<title>` (hover) and in a screen-reader list. HEAD is the commit with a ring. Rows move with a CSS transform transition, new rows fade in and their dot pops with a spark ring (`@starting-style`), edges animate their path (CSS `d`, where the browser supports it; otherwise they jump).
- The "Show origin" switch (only when the level has an origin) adds origin's own commits and heads, so you see what a teammate pushed before you fetch.

## Tests

- Vitest (`pnpm test`): `test/unit/ui/` covers graph layout (linear, branch, merge, deleted branch, rebase orphans, origin toggle, detached HEAD), the branch palette, completion, the progress storage, conflict parsing and the three accept actions, file statuses and the file tree, the tab sync decisions, and the stored layout. The Nuxt-environment test `test/nuxt/AppLogo.spec.ts` still applies (the new logo renders the site name).
- Playwright (`pnpm test:e2e`, `playwright.config.ts`, tests in `e2e/`, outside Vitest's globs): starts `nuxt dev --host localhost` on port 4003 (or reuses a running one). `level-1.spec.ts` plays level 1 through the terminal, including Tab completion, the debrief, the graph and the solved state on the home page; `level-4-ide.spec.ts` switches to the IDE layout, merges in the bottom terminal, opens the conflicted file from the explorer, uses Accept both, saves with Ctrl/Cmd+S, adds and commits, sees the debrief and checks that the layout survives a reload. First run needs the browser: `pnpm exec playwright install chromium`. The explicit `--host` is a workaround: `@nuxt/cli` 4.0.1 fails at start without it.

## Rough edges

- Phones are usable but the terminal is the whole point: type on a hardware or software keyboard; there are no command buttons.
- The graph scrolls inside its box when pills and messages are wider than the column; text width is estimated from the monospace advance (6.6px at 11px), so a fallback font can be off by a few pixels.
- Undo and Reset are terminal commands (`undo`, `reset`); only Reset has a button.
- The IDE's terminal panel has a fixed height (no drag handle yet). Tabs live as long as the play page: leaving the level and coming back keeps the session but starts with no open tabs.
- No source control panel (staged/unstaged lists, commit button): the trainer teaches the commands (ADR 0004).
