---
version: 1
slug: "app-pages-git-index-vue"
primary_target: "app/pages/git/index.vue"
related_targets: ["app/pages/index.vue"]
---

# Track page and tracks home

Scope: the track page (`/git`, one per track) and the home page (`/`, all tracks). Visitor mode: **Operate** (find where you are, pick the next level, see progress). Code-led.

Audience and job: learners returning to continue, and first-time visitors choosing where to start; recruiters see a real product. Task: continue with one click; browse 50+ levels in chapters; see progress per track, chapter and level; see which tracks exist and which are coming.

Content and constraints: git has 8 chapters (Basics, Branching, Merging, Rewriting history, Teamwork & remotes, Undo & recovery, Disasters, Workflows); today 6 levels exist across the first five; chapters without levels show "coming" with their description only. No invented level titles, user numbers or claims. All levels open (no locks). Upcoming tracks (Working with AI, Web fundamentals, Debugging, Framework deep dives) shown honestly as not playable yet. No accounts: progress in localStorage.

Unresolved: estimated level length and difficulty are not in the level data yet (omit until they exist).

## Direction contract

THESIS: A track is a chapter rail plus chapter sections on one page, so a learner sees the whole track and their place in it at once; it refuses the flat card grid and the one-chapter-at-a-time browser.

OWN-WORLD: The existing Grindstone world (ADR 0003, 0005): Nord-grey dark ground (#1d2129, elevated #262b35/#2a303b), ember #ff8a3d for the active and next-up state, Inter text, JetBrains Mono for numbers, tags and kickers, Tektur only in the wordmark. Every chapter owns one colour from the branch palette; that colour is its dot, its rail marker, its progress bar and its level commit dots.

STORY: The visitor sees the track's size and their progress, continues where they left off with one button, scans chapters in the rail, jumps to one, and starts any level from its row.

FIRST VIEWPORT: Left, a sticky 300px rail: kicker "Track", the track name at 34px, a one-line scope, overall progress bar and "n of N solved", then the eight chapters (colour dot, name, mini progress bar, n/m). Right: a "Continue" card (chapter, level title, one-line story, ember Continue button) above the chapter sections; each section has a colour dot heading, n of m, a one-line description and level rows (commit dot, number like 2.1, title, command tags, status).

FORM: Chapter rail + sections, position 3 on my ordered list (dealt lead). seed:f3b45669881279ca

SIGNATURE MOVE: level progress drawn as commits: every level row starts with a commit dot in its chapter's colour, filled when solved, hollow when open, ringed in ember when it is next up; the rail's chapter markers repeat the same dots, so the page reads like a branch history of your practice.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
