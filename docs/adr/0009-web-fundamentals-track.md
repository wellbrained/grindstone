# 0009 · Fourth track: Web fundamentals

Status: accepted, 2026-11-17. Grilled with Nik (Q1–Q9, all on Claude's recommendations: "yes, run it with your recommendations"). Each chapter gets an Opus review before it ships.

## Scope

- **Web fundamentals** (`/web`, registry id `web`): the rules the browser enforces that bite in production. Seven chapters:
  1. **Same-origin & CORS**: simple vs. preflighted requests, `Access-Control-Allow-Origin` / `-Credentials` / `-Headers` / `-Methods`, `*` with credentials.
  2. **Cookies & sessions**: `SameSite` (Lax, Strict, None), `Secure`, `HttpOnly`, `Domain`, `Path`; CSRF from another site.
  3. **Auth & tokens**: where a token lives (cookie vs. storage), XSS vs. CSRF, expiry and refresh, logout.
  4. **HTTP caching**: `max-age`, `no-cache`, `no-store`, `ETag` and 304, a CDN in between, a stale deploy.
  5. **The event loop**: tasks, microtasks, rendering; predicting order, not hunting async bugs.
  6. **Accessibility**: names, roles, state, focus order, keyboard, live regions.
  7. **Security headers & CSP**: `Content-Security-Policy`, `frame-ancestors`, the headers a shop sends.
- **Not here**: performance (Debugging chapter 6) and async bugs (Debugging chapter 4). The home card's text drops "performance".

## Mechanic: predict, then fix

- A **scenario** starts with a **prediction**: before the app runs, a card asks one question in one of three forms: **pick one** (what happens), **order the lines** (the console's order), **pick lines** (which requests carry the cookie). Answering runs the app and shows who was right, with one sentence on the rule. A wrong prediction never blocks: you go on to **fix** it (the app's code or the server's).
- A **practice task** is prediction only (one question, or a set of three).
- **Best run**: fewest wrong predictions, then fewest hints, then fewest reloads.

## The environment

- The Debugging sandbox (sealed frame, fake backend, Console, Code, Network) plus an **editable server**: `server.js` in Code next to the app's files, routes and the headers they send. The fake backend runs it.
- **A modelled browser** for CORS, cookies and caching (the frame has no network, so no real cross-origin request happens): our own model, following the Fetch and cookie specs where a level needs them, like the Git track's own git. Predictable, and the Network panel can name every block's reason. **Real browser** for CSP (a real policy) and accessibility (the real DOM).
- **Model scope**: CORS (simple vs. preflight, the four `Access-Control-*` headers, `*` with credentials); cookies (`SameSite`, `Secure`, `HttpOnly`, `Domain`, `Path`); caching (`max-age`, `no-cache`, `no-store`, `ETag`/304, a CDN). Left out: cross-origin redirects, Private Network Access, partitioned cookies (CHIPS), `Vary` edge cases. A "what the model simplifies" section in the feature doc, as for git; an edge case comes in only with a level that needs it, with a test against the spec text.
- **Panels**, each with the first chapter that needs it: request/response **headers** in Network and a blocked line that names its reason, and an **address bar** with the page's origin (chapter 1); **Application** (cookies per site with their flags, the cache with age and hits) and the **attacker site** `cheap-flour.example`, readable, not editable (chapter 2); **Accessibility** (the tree: role, name, state; what a screen reader reads) (chapter 6).
- **Accessibility checks** use **axe-core** (MPL-2.0), loaded only on accessibility levels (check frames and the panel). Goals check concrete facts ("the Buy button has a name", "focus reaches the dialog"), never "axe finds nothing", so silencing the checker solves nothing.

## Other decisions

- **World**: Corner Bakery grows up: an API on its own origin (`api.cornerbakery.shop`), customer logins, a CDN.
- **Release**: one chapter at a time, each Opus-reviewed and deployed (patch versions from 0.4.1); the cheat sheet at the end; 0.5.0 when Nik calls the track complete.
- **Radar**: the track gets its own radar and an axis on the home overview, as the registry gives every live track.
