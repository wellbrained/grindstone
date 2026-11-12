# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: learners.** Junior developers, bootcamp graduates and self-taught developers who know the basics of a skill (for git: `add`, `commit`, `push`) but are unsure or afraid of the parts that matter on a team (rebase, conflicts, keeping branches in sync). They practise in short sessions, mostly on a laptop or desktop with a keyboard; phones must work but are secondary.
- **Secondary: recruiters and hiring developers.** Grindstone is the owner's portfolio project (Dominik Kiessling, frontend/full-stack, Vue/Nuxt/TypeScript). They should meet a polished, real product, not a demo.

## Product Purpose

A practice platform for developers: real skills trained in short, game-like levels that run in the browser. Success in the coming months: real learners finish levels and tracks and come back. The portfolio value follows from a product people actually use.

## Positioning

- **Simulated teammates**: scripted colleagues change `origin` while you work (push to main, later force-push, review comments), so syncing and conflicts are practised the way they happen on a team. Other git trainers are solo.
- **Real wording**: commands and messages follow real git, so the practice carries over to the learner's own terminal.
- **You see what happens**: every command redraws a live commit graph.
- **Work the way you work**: a terminal layout or an IDE layout (files, editor with conflict actions, terminal below).
- Runs entirely in the browser on Grindstone's own git simulation; nothing is sent anywhere.

## Operating Context

- A level: a short story, a live goal checklist, up to three hints, a debrief that explains why, and a replayable solution. Progress is stored per level (solved, hints used, commands vs. best).
- Tracks: Git is the first and only track today (6 levels live, levels 7–10 next). The owner plans **50+ levels** for git and **more tracks**: working with AI (Copilot coach, code review dojo), web fundamentals, debugging, framework deep dives. Later ideas: disaster scenarios, workflow tracks (GitFlow, trunk-based, release branches), a skill profile (radar), daily sessions, visual mode, multiplayer, team onboarding.
- Reference content: a git cheat sheet linked to the levels that practise each command; an About page.

## Capabilities and Constraints

- Static SPA (Nuxt 4, ssr off) served by Caddy on Hetzner at https://grindstone.dkiessling.de; no backend.
- **No accounts** for now; progress lives in the browser (localStorage). Accounts and synced progress are an open decision for later; export/import of progress is possible.
- English UI through i18n keys; German possible later.
- Decisions on record: `docs/adr/` (plan, git model, look, editor layouts, logo).

## Brand Commitments

- Name: Grindstone (lowercase wordmark "grind" + "stone").
- Logo: the skill radar mark with the Tektur wordmark, "stone" in ember (`docs/adr/0005-logo.md`); the wheel mark is kept as a secondary mark (`docs/brand/wheel.svg`).
- Look: terminal-inspired, dark first with an equal light theme, ember-orange accent, Inter + JetBrains Mono (`docs/adr/0003-look.md`).
- Voice: plain, friendly, concrete, second person; fictional teams and companies only.

## Evidence on Hand

- The live product and its levels; the cheat sheet; the About page.
- No testimonials, user numbers, reviews or press exist. Do not invent any.

## Product Principles

1. **Practice over reading**: every surface leads into doing a level; reference pages link back to practice.
2. **Real enough to transfer**: what works in Grindstone works in a real terminal.
3. **Progress you can see**: learners always know where they are, what they have done and what comes next.
4. **Built to grow**: structures hold 50+ levels per track and many tracks without redesign.
5. **Respect the learner's time**: short sessions, no accounts, no friction before the first command.

## Accessibility & Inclusion

Keyboard-first and fully usable without a mouse; WCAG AA contrast in both themes; colour is never the only signal; respects reduced motion.
