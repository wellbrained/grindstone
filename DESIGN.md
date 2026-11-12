---
name: Grindstone
description: A terminal-inspired practice platform for developer skills, Nord-grey ground with one ember accent, progress drawn as commits.
colors:
  ground: "#232831"
  surface: "#2a303b"
  surface-accented: "#353c4a"
  border-strong: "#434c5e"
  terminal: "#1b1f27"
  text: "#e5e9f0"
  text-highlighted: "#eceff4"
  text-toned: "#d8dee9"
  text-muted: "#a7b0c0"
  text-dimmed: "#8e97a8"
  ember: "#ff8a3d"
  violet: "#bb9af7"
  success-green: "#9ece6a"
  warning-amber: "#f0c05a"
  info-blue: "#7fb4ff"
  error-rose: "#f7768e"
  page-light: "#e9ecf0"
  card-light: "#ffffff"
  terminal-light: "#f6f7f9"
  text-light: "#1c2533"
  text-muted-light: "#475467"
  ember-light: "#b23a08"
  branch-0: "#7fb4ff"
  branch-1: "#8fd16a"
  branch-2: "#c4a2f5"
  branch-3: "#f0c05a"
  branch-4: "#5fd6c6"
  branch-5: "#f78fb3"
  branch-6: "#a9b8d9"
  branch-7: "#e394e8"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
    fontFeature: "'tnum'"
  terminal:
    fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  wordmark:
    fontFamily: "Tektur, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  rail: "300px"
  page-max: "1760px"
components:
  button-primary:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.terminal}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-highlighted}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  continue-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-highlighted}"
    rounded: "{rounded.xl}"
    padding: "20px"
  track-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-toned}"
    rounded: "{rounded.2xl}"
    padding: "40px"
  level-row:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-highlighted}"
    rounded: "{rounded.lg}"
    padding: "12px"
  level-row-next:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-highlighted}"
  chapter-nav-item:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-toned}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  chapter-nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-highlighted}"
  command-tag:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
  commit-dot:
    backgroundColor: "{colors.branch-0}"
    rounded: "{rounded.full}"
    size: "12px"
  terminal-pane:
    backgroundColor: "{colors.terminal}"
    textColor: "{colors.text-highlighted}"
    typography: "{typography.terminal}"
    rounded: "{rounded.lg}"
---

# Design System: Grindstone

## Overview

**Creative North Star: "The Practice Log"**

Grindstone looks like a terminal session that keeps a branch history of your practice. A cool Nord-grey ground carries quiet text, one ember orange marks the single thing that is active or next, and every chapter owns one colour from a shared branch palette. Progress is not a bar chart bolted onto a menu: a level is a commit dot, a chapter is a lane, and the page reads like `git log --graph` of what you have done.

The system is dark first with a light theme of equal quality (a cool grey page with white cards). Density is working-tool, not marketing: 14px body, thin hairline dividers, tonal surfaces instead of shadows, mono for anything that is data (numbers, counts, commands, the terminal). The page uses the full header width (1760px max) and lays itself out per page; running text keeps a readable measure.

It rejects the flat card grid of tracks or levels, locked-level gamification, and anything that signals a demo instead of a tool. State is never colour alone: every dot is decoration beside written text.

**Key Characteristics:**
- Nord-grey tonal ground; depth from surface steps and hairlines, not shadows.
- One ember accent (`--ui-primary`) reserved for active, next up, the primary action and the wordmark's "stone".
- Branch palette of 8 slots, one colour per branch or chapter, identical in graph, terminal and track page.
- Commit-dot progress: filled solved, hollow open, ember ring next up.
- Mono for data and the terminal, Inter for reading, Tektur only in the wordmark.
- Motion is rare and authored: ember sparks, a lane drawing in, panels opening in place; all off under reduced motion.

## Colors

A grey-blue ground with off-white text, one warm ember and a ring of muted, contrast-checked branch hues. Every accent and branch colour is at least 4.5:1 on the page, card and terminal backgrounds of its theme. Colours are used as semantic Nuxt UI tokens (`--ui-*`) in components, never raw hex.

### Primary
- **Ember** (#ff8a3d dark, #b23a08 light): the one accent. Primary button fill, the ring on the next-up dot, "Next up" status text, focus outlines, text selection tint (32% mix), progress bar of a whole track, the "stone" in the wordmark, the spark effect. In light the darker ember keeps white text on it and the orange itself at AA.

### Secondary
- **Violet** (#bb9af7 dark, #6d28d9 light): the secondary token; in the editor it colours keywords. Rare in chrome.

### Neutral
- **Nord Ground** (#232831 dark, #e9ecf0 light): page background (`--ui-bg`).
- **Elevated Surface** (#2a303b dark, #ffffff light): cards, the Continue card, the next-up row, active rail item (`--ui-bg-elevated`).
- **Accented Surface** (#353c4a dark, #e2e6eb light): progress bar tracks, hover on elevated cards, dark borders.
- **Terminal Well** (#1b1f27 dark, #f6f7f9 light): the terminal and editor surface (`--app-terminal`), darker than the page in dark, lighter in light.
- **Border Strong** (#434c5e dark, #aeb6c2 light): the Continue card border and accented strokes.
- **Text ladder** (dark / light): highlighted #eceff4 / #0b1220 for headings and titles, text #e5e9f0 / #1c2533, toned #d8dee9 / #334155 for body prose, muted #a7b0c0 / #475467 for meta and counts, dimmed #8e97a8 / #5d6b7e for terminal intro and coming-state rings.

### Semantic
- **Success green** #9ece6a / #1c7437 (solved, added files, conflict "current" tint), **Warning amber** #f0c05a / #8a5a00 (modified), **Info blue** #7fb4ff / #1d63c9 (teammate notices, conflict "incoming" tint), **Error rose** #f7768e / #be123c (errors, conflicted, deleted).

### Branch palette
Eight slots, `--branch-0` to `--branch-7` (dark values in the frontmatter, light values in the sidecar). `main` is always slot 0; other branches hash to slots 1 to 6; slot 7 is used only by chapters so the graph's colours never moved. `--branch-ink` (#1b1f27 dark, #ffffff light) is text on a filled pill. A `.branch-c-N` class sets `color`, so SVG and borders use `currentColor`.

### Named Rules
**The One Ember Rule.** Ember means active or next. Never decorate with it; a screen holds one primary action and one next-up marker.
**The One Colour Per Line Rule.** A branch or chapter has exactly one palette slot everywhere (dot, rail marker, mini bar, lane, graph line, prompt). Never recolour it per surface.
**The Text Beside Colour Rule.** A colour never carries a state alone; the dot, status letter or tint always has written text next to it.

## Typography

**Display / UI Font:** Inter (with ui-sans-serif, system-ui fallbacks)
**Mono Font:** JetBrains Mono (with ui-monospace, Menlo, Consolas)
**Wordmark Font:** Tektur, used only in AppLogo

**Character:** Inter reads calmly for story and chrome; JetBrains Mono does the work of a terminal and of every number, so data looks like output. Headings are semibold with tight tracking (-0.025em), never light or shouting.

### Hierarchy
- **Display** (600, 1.875rem scaling to 3rem at lg, 1.1): home page title only.
- **Headline** (600, 1.875rem, 2.125rem at lg, tight): the track page title in the rail; track card titles use 1.875rem.
- **Title** (600, 1.25rem): chapter section headings, "Coming tracks" heading; the Continue card heading is 1.125rem semibold with a mono level number at 1rem.
- **Body** (400, 0.875rem, comfortable): descriptions, meta, level titles (500 weight, highlighted). Lead paragraphs go to 1.125rem to 1.25rem. Prose keeps `max-w-2xl` to `max-w-3xl`, balanced or pretty wrapped.
- **Label** (mono 400, 0.75rem, tabular numerals): level numbers (2.1), "n of N solved", n/m counts, command tags.
- **Terminal** (mono, 0.875rem, relaxed 1.625): output, prompt, input.

### Named Rules
**The Mono Is Data Rule.** Numbers, counts, commands, branch names and terminal output are mono; prose and headings are Inter. Do not set reading text in mono.
**The Wordmark Only Rule.** Tektur appears in the logo and nowhere else.

## Layout

Full-width pages inside a 1760px container (`max-w-[110rem]`) with `px-4 sm:px-6 lg:px-8`, so content lines up with the logo. Each page lays out its own content. Track page: from lg a sticky rail (17rem, 18.75rem from xl) beside a fluid column with 3rem to 3.5rem gutter; below lg the rail heading scrolls away and chapters become a sticky chip strip under the header, scrolling sideways. Home: pitch with the Continue card beside it from lg, track cards two-column inside (copy and chapter list, 24 to 28rem), coming tracks as a two-column quiet list from md. Play page: three-column viewport-high grid (level panel, terminal, commit graph) at lg; the IDE layout is the same skeleton with Files and the editor opening in place; stacked below lg. Cheat sheet uses CSS columns of at least 20rem; About three columns from xl.

Rhythm is Tailwind's 4px base: row padding 12px, section gaps 48 to 56px, page padding 40 to 64px vertical. Level rows are a four-to-five track grid (dot 0.75rem, number 2.25 to 2.75rem, title, commands up to 15rem, status 6rem). No horizontal page scroll down to 360px.

## Elevation & Depth

Flat and tonal. Depth is a step in surface (ground, elevated, accented, terminal well) plus a 1px hairline border; there are no resting shadows. The sole exception is the ember spark, a soft 8px glow on 8px dots thrown when a level is solved. The sticky chapter strip uses 90% ground with a small backdrop blur to stay legible over scrolling content.

### Named Rules
**The Tonal Step Rule.** To lift something, move it one surface step (ground to elevated) and give it a hairline; do not add a shadow.
**The Spark Only Rule.** The only glow in the system is the ember spark and its ring; nothing else glows.

## Shapes

Soft but restrained. Rows and buttons use 0.5rem (rounded-lg), the Continue card 0.75rem, track cards 1rem, tags and "Coming" labels 0.25rem, chips and progress bars fully round, dots are circles. Borders are 1px hairlines (`--ui-border`, muted variant between rows); commit dots are 12px (10px small) with a 2px current-colour border. A 2px lane in the chapter colour runs vertically through the dots of a chapter, solid between two solved levels and 35% opacity around open ones.

## Components

### Buttons
- **Shape:** 0.5rem radius; sizes lg (Continue) and xl (track card).
- **Primary:** solid ember fill with the terminal-well ink, trailing arrow icon (Lucide through UIcon). One per context.
- **Default (outline):** every other button is outlined, transparent, with a visible hover (15% tint of its colour and a coloured ring; neutral goes to accented fill) and a pointer cursor. Active is 25% tint.
- **Focus:** 2px ember outline.

### Continue card
Elevated surface, 1px strong border, 0.75rem radius, 16 to 20px padding, container-query layout (row from 42rem of its own width). Heading is the level ("3.2 Merge conflict") with a mono number, a muted meta line, a two-line story, an ember button. Done state shows a success check and links to the cheat sheet.

### Track card
Elevated 1rem-radius card on the home page, title 1.875rem linking to the track, tagline, description, count line plus an ember 6px progress bar, a primary action that never repeats Continue, and the chapter list divided by a hairline.

### Level row
The whole row is the link: commit dot, mono number, title (medium, highlighted), command tags, status text. Hover and the next-up row sit on the elevated surface; rows are separated by a muted top border. Status: "Solved" success, "Next up" ember medium weight, "Not solved" muted. Command tags are mono 12px in a 1px bordered 0.25rem box.

### Navigation (rail, strip, header)
Rail item: commit dot (small), chapter name, 44px mini bar in the chapter colour, mono n/m; active is the elevated surface with highlighted medium text and `aria-current`; coming chapters are muted with "Coming". Below lg the same items become rounded-full chips. Header is Nuxt UI's `UHeader` with the logo, nav from md (menu button below md) and a colour-mode toggle; footer repeats the nav in muted 14px text.

### Commit dot (signature)
Filled in the chapter colour when solved, hollow (filled with the ground behind it, so lanes do not show through) when open, hollow plus a 2px ember outline offset 2px when next up, plain dimmed ring when coming. Chapter markers repeat the same dots and mean: filled = all solved, ember ring = holds next up. Always `aria-hidden`.

### Progress meter
A thin fully-round bar on an accented track; the fill is `currentColor`, so a chapter colour or ember sets it. The count is always written beside it.

### Terminal pane
0.5rem radius, 1px terminal border, terminal-well fill, mono 14px; header strip with a terminal icon and key hints; focus ring is 2px ember on the whole pane. Output is a polite `role="log"`. Prompt shows the branch in its palette colour; errors in error colour, hints dimmed, teammate notices an info-bordered 10% tint line with an icon, "Level solved" in semibold success.

### Logo
The skill-radar mark (hexagon, spokes, inner rings, ember filled polygon with a dot per axis) beside the lowercase Tektur wordmark: "grind" at weight 900 in current text colour, "stone" at 500 in ember.

### Motion
- **Panel reveal:** 260ms `cubic-bezier(0.4, 0, 0.2, 1)` size change; content fades in 160ms after a 110ms delay and out in 90ms.
- **Lane draw:** 180ms linear `scaleY` from the top, four chained halves 180ms apart after a 300ms delay, once, only after solving a level for the first time.
- **Spark:** 0.9s ease-out embers flying out of the terminal, plus a 0.6 to 2.6 scale ring on a new graph commit.
- All of it switches off under `prefers-reduced-motion: reduce`; chapter jumps scroll instantly then.

## Do's and Don'ts

### Do:
- **Do** use semantic tokens (`text-muted`, `bg-elevated`, `text-primary`, `border-default`) in components; hex lives only in `app/assets/css/main.css`.
- **Do** give each chapter or branch its one `--branch-N` slot and draw its level state as a commit dot with the state also written as text.
- **Do** keep a single ember primary action per context and let the next-up level carry the ember ring.
- **Do** set numbers, counts, commands and terminal output in JetBrains Mono with tabular numerals.
- **Do** lift surfaces by a tonal step plus a 1px hairline; keep both themes at AA (4.5:1 for every accent and branch colour).
- **Do** keep every interactive element keyboard reachable with the 2px ember focus outline, and respect reduced motion.

### Don't:
- **Don't** replace the chapter rail and sections with a flat grid of cards, and don't lock levels; all levels are open.
- **Don't** use Tektur outside the wordmark, or ember as decoration.
- **Don't** add resting shadows, gradients or glows; the ember spark is the only glow.
- **Don't** encode state in colour alone, or show invented numbers, claims, titles or testimonials.
- **Don't** reorder panels when the play layout switches; panels open and close in place.
- **Don't** run a second animation on the track page beyond the one lane draw.

## Not canonized (carried by the build)

- Contract mentions a kicker label ("Track") in mono above the rail title; the shipped rail has none. Not a system element.
- The contract's ground hex #1d2129 differs from the shipped `--ui-bg` #232831; the shipped token is the one recorded.
- The sticky chip strip uses `backdrop-blur-sm` over a translucent ground, a one-off for legibility; do not extend to other surfaces.
