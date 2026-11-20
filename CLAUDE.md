# CLAUDE.md

Grindstone: a developer practice app with short, game-like scenarios. Live tracks: **Git** (levels solved in a terminal, with a live commit graph and simulated teammates), **Debugging** (small real apps with real bugs, run in a sealed iframe; Console, stack traces, Code, Reload; ADR 0007), **Working with AI** (review the pull requests of Sous, a scripted coding assistant: comment on lines, approve or request changes, run the change in the Debugging sandbox; ADR 0008) and **Web fundamentals** (predict what the browser does, then fix it: the Debugging sandbox with an editable server.js and a modelled browser for CORS, cookies, storage, tokens and HTTP caching, a modelled event loop for tasks, microtasks and frames, and an accessibility tree from the real DOM with a modelled keyboard, focus and screen reader; ADR 0009; chapters 1 to 6 live). Plan and scope: `docs/adr/0001-plan.md`. Domain language: `CONTEXT.md`.

Built on nuxt_template: shared commands and conventions are in the vault note `AI/Stack-Nuxt.md` (disk: `D:\Obsidian- VaultBrain\VaultBrain\AI\Stack-Nuxt.md`). Read it first.

## Project rules

- Browser only: static SPA, no backend, no accounts. Progress lives in localStorage. Hosted as static files behind Caddy on Hetzner at `grindstone.dkiessling.de`.
- The git model (`docs/adr/0002-git-model.md`) is pure TypeScript with no DOM or Vue imports: every command is a function from state to state plus output lines. Build and change it test-first.
- Every level has a `solution`; the test suite replays it and asserts that every goal passes. A level without a passing replay does not ship. Debugging levels are replayed in a real browser too (`e2e/debugging-levels.spec.ts`), and their goals check what the app does, never the code's text.
- A Debugging app runs only in `<iframe sandbox="allow-scripts">` (never `allow-same-origin`) with the sandbox's Content-Security-Policy; everything it posts is read through `readBridgeMessage` and shown as text, never HTML.
- Teammate events fire on command counts or command triggers, never on real time.
- Terminal output follows real git's wording for the supported commands; anything else answers "not in this trainer yet".
- Look: `docs/adr/0003-look.md`. Semantic colour tokens only, never raw hex in components; branch colours come from the shared branch palette.
- UI text in English, always through i18n keys.
- Public repo (MIT): never commit secrets, personal data or real company names in scenarios.

## Feature map

Per-feature docs go in `docs/features/<area>.md` (git model, levels, terminal, graph, teammates, progress) as each area is built.
