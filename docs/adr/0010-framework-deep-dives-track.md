# 0010 · Fifth track: Framework deep dives

Status: accepted, 2026-11-21. Designed on the Mac by Claude (Opus, high effort) with the grilling answered on Claude's own recommendations: the lead thread passed on Nik's "work on the next track until it's finished if possible … you can go with recommendations". Every question below was put and answered with the recommended option; the alternatives considered are named.

## Q1 · Scope: which frameworks, how many chapters

- **Framework deep dives** (`/frameworks`, registry id `frameworks`, the id the coming card already has): how a framework works inside, so its surprises stop being surprises. **Vue reactivity first**, in six chapters:
  1. **ref & reactive** (`refs`): what is reactive and what is the raw object behind it: changing the original instead of the proxy, replacing a reactive object the template still holds, a proxy that is not `===` the object it wraps, where refs are unwrapped and where not.
  2. **Lost reactivity** (`destructuring`): destructuring `props` or a reactive object, spreading it, passing `.value` into a composable; `toRefs`, `toRef`, getters and `toValue`.
  3. **computed** (`computed`): lazy and cached, tracking only what the last run read, a getter that reads something that isn't reactive, a getter that sorts its source in place, `v-model` on a read-only computed.
  4. **watch & watchEffect** (`watchers`): what a watch source is, deep and shallow sources, the old value of a mutated object, what `watchEffect` tracks (nothing after the first `await`), cleanup for a stale answer.
  5. **Scheduling & nextTick** (`scheduling`): updates are batched into one render a tick, the DOM is old until `nextTick`, a watcher's `flush` (`pre`, `post`, `sync`).
  6. **Shallow, raw & readonly** (`depth`): `shallowRef` and `triggerRef`, a class with private fields behind a proxy, `markRaw`, `readonly` props and changes that go up as events.
- **Other frameworks** (React's rendering and effects, Svelte's runes, signals in general) belong in this track as later chapter groups, each with an ADR of its own: the sandbox's library slot (Q3) is generic, so React's ESM build can run there without a new environment. Not in this ADR: designing six Vue chapters well is the work; a second framework designed now would be designed blind.
- **Not here**: Vue's component API surface (slots, provide/inject, the router, Pinia) except where reactivity explains it; SFC tooling; SSR and hydration.
- **Size**: three scenarios and three practice tasks a chapter (36 levels). Web fundamentals has five and five; a reactivity rule needs fewer stories to show and more quick predictions to own, and the track should be finished in one push rather than half built. Considered: five and five (twice the content for the same rules), four chapters (folds scheduling into watchers, but "why is the DOM old" is the most asked Vue question there is).

## Q2 · Mechanic: predict, then fix

- **The Web fundamentals mechanic, unchanged** (ADR 0009): a scenario opens with a prediction (pick one, pick lines, order the lines); answering runs the app and says who was right with the rule in one sentence; a wrong prediction never blocks; then you fix the app's code until the goals pass. A practice task is the prediction only (one question, or three). Best run: fewest wrong predictions, then hints, then reloads; the radar counts a solve with a wrong prediction half.
- **Why**: reactivity is a mental model, and the bug is always "I expected the screen to change". Asking for the expectation first makes the model visible, and the fix then proves it. Considered: plain Debugging (find the bug from a symptom: teaches the hunt, not the rule), a "trace the dependencies" game drawing the effect graph by hand (novel, but it tests a diagram, not code a learner writes) and code review (Working with AI's mechanic: reading, not running).

## Q3 · The sandbox: real Vue, not a model

- **Vue itself runs in the sealed frame**: the repo's own `vue` dependency (3.5), its **development ESM browser build** (`vue.esm-browser.js`), given to the frame as one more module in the import map under the bare name `vue`, so a level's `app.js` says `import { ref, computed } from 'vue'` as real code does. Components are plain JavaScript objects with a `template` string, compiled in the frame by Vue's own runtime compiler (the sandbox's policy already allows `unsafe-eval` outside counting runs), or `h()` where a level needs a render function. No SFCs: there is no compiler step in the frame, and the texts say where `<script setup>` would differ (Vue 3.5's compiled props destructure).
- **Why real**: the subject is Vue's behaviour, so a model could only teach our model, and every edge (array instrumentation, ref unwrapping rules, the scheduler's flush order, the warnings' words) would be ours to get right and keep right. Unlike the event loop (ADR 0009, chapter 5), nothing here needs modelling for determinism: Vue's reactivity and scheduler run on the engine's own microtasks in one thread, the same in Chromium, Firefox and WebKit, with no timers or frames involved. The e2e proves it per level in the three engines. Considered: our own reactivity model (predictable, but a second Vue that can drift from the first), `@vue/reactivity` alone (smaller, but no components, templates or scheduler: chapters 2, 3, 5 and 6 need them), Vue's production build (175 KB instead of 570 KB, but no warnings, no recursion guard and no debug hooks: the panel below needs the hooks, and Vue's own warnings are half the lesson).
- **The development build's one notice** ("You are running a development build of Vue") is taken out of the source before it goes into the frame (a unit test checks the replacement still finds it); everything else Vue prints is shown as Vue prints it.
- **Lazy**: the Vue source (≈570 KB, ≈120 KB gzipped) is its own chunk, fetched only when a Framework deep dives level plays; no other track's page grows by it. The bridge gets it through the sandbox options, never through the shared levels chunk.
- **Isolation** stays ADR 0007's: `sandbox="allow-scripts"`, never `allow-same-origin`, the frame's policy, every message read through `readBridgeMessage` and shown as text.

## Q4 · The Reactivity panel

- **What Vue did, in order** (the track's own panel, like the Event loop panel): each **reaction** is one run Vue made: a component's **render**, a **computed**'s getter, a **watch** callback, a **watchEffect** run; each with what **triggered** it (`set count.value: 1 → 2`, `add items[3]`), as Vue's own debug hooks report it (`onTrigger` for computed and watchers, `renderTriggered` for components), and the Console's lines between them. Text only, at most 1,000 lines a load, each line linked to where its computed or watcher was made.
- **How**: the `vue` module the app imports is a thin facade over the real build: it re-exports everything and wraps `computed`, `watch`, `watchEffect` (and its `post`/`sync` forms) and `createApp` (a global mixin with `renderTriggered` and the render's own hook) so each reaction is posted, never changing what Vue does (the wrappers call the real function with the app's arguments, its own `onTrack`/`onTrigger` kept). The facade takes its channel to the bridge from a one-shot name on the window and deletes it before the app's code runs.
- **Probes and facts**: a probe `{ reactions: 'render Basket' }` counts reactions of a kind (and a component's name) since the probe started; a prediction fact `{ reaction: 'watch' }` holds when the run has one. Goals otherwise read what the customer sees (the page's text after a click or typing) and the Console, never the code's text (CLAUDE.md).
- **Known limit, in #522's class**: the app shares the frame's world with the facade, so it can post or hide what the panel shows by calling Vue's internals; goals that matter read the DOM too.

## Q5 · Environment and play page

- **The Web fundamentals environment, registered for a second track**: `frameworks` registers the same state, records, steps and fields as `web` (`DebugState`, `DebugRecord`, `WebStep`, `WebFields`), so the engine, the prediction card, progress and the Debugging play page run it unchanged. A predicate `isPredictLevel` (web or frameworks) replaces the places that ask `isWebLevel` for the mechanic; `isWebLevel` keeps meaning the web track. Considered: a new environment (a third copy of the sandbox play page), folding the levels into the web track (a different skill, a different radar).
- **No server, no modelled browser**: a level's `WebSpec` is `{ vue: { … } }` only; the panels are App, Code (the app's files, editable), Console and Reactivity. Its strip says "Predict what Vue does, then fix it".

## Q6 · World, release, radar, home

- **World**: Corner Bakery's new Vue storefront; Jonas (who wrote the tablet app in Web fundamentals chapter 5) is moving the basket, the menu and the kitchen screen to Vue, and Lena still shops there. No real company names (CLAUDE.md).
- **Release**: chapter by chapter, each a patch (0.5.4 with the track's foundation and chapter 1, then 0.5.5 …), each with lint, typecheck, unit and the full e2e suite green, a Sonnet code review and an Impeccable critique of the new pages before it ships; the cheat sheet (`/frameworks/cheat-sheet`) last; the finished track as **0.6.0** (approved for the finished track only).
- **Radar**: the track's own radar (an axis per chapter, short labels that fit a phone), and a fifth axis on the home overview radar. The header menu, the phone menu, the home overview and app.config/README name it.
- **Tagline**: "Predict what the framework does, then fix it."

## Q7 · Tests

- Unit: the registry and every level's shape (prediction answers among the options, three hints, a debrief, a solution that ends in a reload), the facade's wrappers and the notice removal, the new bridge messages in `messages.test.ts`, the radar and navigation.
- E2E (`e2e/frameworks-levels.spec.ts`): every level's app with real Vue in a blank page: the table of what the starting files do (probes, Console lines, reactions), every goal but the prediction failing on them, the solution passing, other real fixes passing and tempting non-fixes failing (`fixes-frameworks.ts`), the files a solution edits emptied or deleted never solving; the prediction facts against the run. `e2e/frameworks-play.spec.ts`: a level played with the keyboard to the debrief, the Reactivity panel, phones dark and light. One page of the track in `WARM_PAGES`.
