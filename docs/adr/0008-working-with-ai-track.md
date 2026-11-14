# 0008 · Third track: Working with AI

Status: accepted, 2026-11-14. Nik delegated the design to Claude's recommendations ("go with your recommendations"), as with the Debugging chapters (0007). Each chapter still gets an Opus review before it ships.

## Which track and why

- **Working with AI** (`/ai`, registry id `ai`), before Web fundamentals and Framework deep dives. It is the most original of the four (the side-project brief found no dedicated tool for it), it is what employers ask about right now, and it reuses most of the Debugging environment. Web fundamentals overlaps the Debugging track (CORS, the event loop, performance are already levels); Framework deep dives stays next.
- **Tagline**: "Lead the assistant, then check its work."

## No live AI

- Every level is **scripted**: the assistant's pull requests, answers and claims are written into the level, like Git's teammates. No model is called, nothing leaves the browser, no account, no cost, and every run is the same (testable, fair). The UI never pretends otherwise: the assistant is a character.
- **The assistant**: Sous, Corner Bakery's coding assistant (a sous-chef). Confident, fast, usually right, sometimes wrong in the ways real assistants are wrong.

## Two mechanics

1. **Review** (chapters 1–6): Sous opens a pull request (title, description with its claims, a diff over the shop's files). You review it like on GitHub: comment on a line or a range with a **category** (bug, security, missing test, false claim, scope, unclear), then **Approve** or **Request changes**. The level's **planted issues** are known: a comment counts when it touches the issue's lines with a fitting category. **Solved** = every planted issue found and the right verdict. A comment that finds nothing is a **false alarm**: it doesn't fail the level, but it counts against the best run. You can **run the PR**: the changed app runs in the Debugging sandbox (App, Console, later Tests), so you review with evidence, not just by reading.
2. **Steer** (chapter 7): you write the review that makes Sous fix it. Sous's next commit follows your comments: each planted issue has the feedback that fixes it, and vague feedback ("this looks wrong") gets a plausible but wrong fix. Scripted by matching the comment's category and lines, not free-text understanding.

- **Best run**: fewest hints, then fewest false alarms.
- **Practice tasks**: "spot it" (one small diff, one issue, one comment) and "verdict" (approve or request changes, with a one-line why), about 30 s.

## Chapters

1. **Read the diff** — plain bugs in small PRs (off-by-one, wrong variable, inverted condition, a missing case).
2. **Claims vs. code** — the description says one thing, the code does another ("handles empty baskets", "no behaviour change").
3. **Tests that lie** — tests that assert nothing, mock the thing under test, or were changed to pass. Brings a **Tests** panel (run the PR's tests in the sandbox).
4. **Invented APIs** — functions, options or packages that don't exist, deprecated calls; the Console proves it when you run the PR.
5. **Security** — HTML injection, a secret in code, a missing check on who may do something, trusting the client.
6. **Scope and size** — unrelated changes, a rewrite where a line would do, a PR that should be two.
7. **Steer the assistant** — write the review that gets the right fix.

First release: chapter 1 with the review mechanic, then one chapter at a time, each reviewed and deployed. A cheat sheet after chapter 7 ("what to check in an AI pull request").

## Other decisions

- **World**: Corner Bakery's shop, the same code the Debugging track uses where it fits.
- **Overview radar**: with three live tracks, the home page gets a radar with one axis per track (0007), built with this track's first release.
- **Phones**: the diff stacks per file; tap a line number to comment. Built for desktop first.
- **No new progress version**: the false-alarm count rides in the run like Debugging's reloads.
