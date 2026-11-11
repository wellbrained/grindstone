# UI

The browser UI of the git track (Nuxt 4 SPA, Nuxt UI 4, Tailwind 4). Decisions: `docs/adr/0001-plan.md` (layout, terminal, graph) and `docs/adr/0003-look.md` (look). Pure logic is in `app/utils/` (unit tests in `test/unit/ui/`); the engine and the git model stay in `shared/` and know nothing about the UI.

## Pages

| Route | File | Content |
| --- | --- | --- |
| `/` | `app/pages/index.vue` | Pitch (what it is, the teammate angle), a Start / Continue / Play again button, the track's level list with solved state. |
| `/git/<slug>` | `app/pages/git/[level].vue` | The play page. The slug is the level id without the track: `/git/01-first-commit` for `git-01-first-commit` (`app/utils/level-route.ts`). An unknown slug shows the 404 page. |

Hosting: the app is static; direct links such as `/git/01-first-commit` need the host to fall back to `200.html` (`nuxt generate` writes it) for unknown paths.

## Play page layout

| Width | Layout |
| --- | --- |
| >= lg (1024px) | Three columns in a viewport-high grid: level panel (16rem, 18rem from xl, 20rem from 2xl), terminal (fills), commit graph (20rem, 24rem from xl, 30rem from 2xl). The panel and the graph scroll inside their column; the terminal output scrolls in the terminal. |
| md to lg | One column: level panel (story and goals), graph, terminal. |
| < md | One column: level panel, terminal, graph, with a "best with a keyboard" note on top. The terminal does not autofocus on touch devices (`pointer: coarse`), so the keyboard does not pop up unasked. |

No horizontal page scroll down to 360px: terminal text wraps (`whitespace-pre-wrap`), the graph scrolls inside its own box.

## Components (`app/components/`)

- `AppLogo`: wordmark with a small grindstone-and-sparks mark (replaces the template logo).
- `LevelPanel`: title, story (`InlineText` shows `backticks` as code chips), live goal checklist (each goal has an icon and a hidden "done"/"not done yet" text, never colour alone), files with conflicts (click opens the editor), Hint and Reset buttons, the solved card with Show debrief and Next level.
- `TerminalPane`: the terminal. Output in a `role="log"` region (`aria-live="polite"`), one input line, history, Tab completion, Ctrl+L, Ctrl+C. `TerminalText` renders one output line (`err` in the error colour, `hint` dimmed, `tone` added/removed/meta, `refs` coloured from the branch palette), `TerminalPrompt` renders `you@grindstone ~/project (<branch>) $` with the branch in its palette colour (a merge or rebase in progress adds `|MERGING` / `|REBASING`, a detached HEAD shows `HEAD detached at <id>`).
- `CommitGraph`: the SVG graph (see below). `SparkBurst`: the ember effect when a level is solved.
- `FileEditor`: modal with a monospace textarea; Save (also Ctrl+Enter) calls `saveFile`, Cancel discards. A warning shows while conflict markers are still in the text.
- `DebriefDialog`: debrief title and paragraphs, stats (commands used / shortest solution, hints used), Stay here and Next level (Back to all levels after the last one).
- `LevelList`: the track's levels with solved state (used on the home page inside `<ClientOnly>`, since progress only exists in the browser).

Composables: `useLevelPlay(level)` (session, terminal log, editor, debrief, graph input), `useProgress()` (shared progress state). Utils: `branch-palette`, `graph-layout`, `completion`, `terminal` (prompt and completion names from a state), `progress-storage`, `level-route`.

## Terminal behaviour

- Lines go to `submit(session, level, line)`; `{ kind: 'clear' }` empties the log, `{ kind: 'edit', path }` opens the editor, notices become an inline teammate line (icon plus text, e.g. "Anna pushed 2 commits to main.") inside the live log, so screen readers announce them. After a solve a "Level solved" line is added.
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

- Vitest (`pnpm test`): `test/unit/ui/` covers graph layout (linear, branch, merge, deleted branch, rebase orphans, origin toggle, detached HEAD), the branch palette, completion and the progress storage. The Nuxt-environment test `test/nuxt/AppLogo.spec.ts` still applies (the new logo renders the site name).
- Playwright (`pnpm test:e2e`, `playwright.config.ts`, tests in `e2e/`, outside Vitest's globs): starts `nuxt dev --host localhost` on port 4003 (or reuses a running one) and plays level 1 through the terminal, including Tab completion, the debrief, the graph and the solved state on the home page. First run needs the browser: `pnpm exec playwright install chromium`. The explicit `--host` is a workaround: `@nuxt/cli` 4.0.1 fails at start without it.

## Rough edges

- Phones are usable but the terminal is the whole point: type on a hardware or software keyboard; there are no command buttons.
- The graph scrolls inside its box when pills and messages are wider than the column; text width is estimated from the monospace advance (6.6px at 11px), so a fallback font can be off by a few pixels.
- Undo and Reset are terminal commands (`undo`, `reset`); only Reset has a button.
