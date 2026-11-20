// Corner Bakery's pages in chapter 5, the event loop (ADR 0009): the order page on Lena's old tablet, the pickup menu,
// and the kitchen's screen and import on Maya's tablet. No API this time: the levels are about what the page's own code
// does when (tasks, microtasks, frames, layout), so there is no server.js; app.js is what you fix. The page's timers,
// frames, messages and a customer's taps run on the modelled event loop (loop.ts), and `tablet.js` stands in for real
// work: code that is busy for some milliseconds of the scripted clock.
import type { ProbeStep } from '../debugging/types'
import type { WebSpec } from './backend'
import type { LoopWatch } from './loop'
import { API, WEB_STYLE, webSite } from './site'
import type { WebPageOptions } from './site'

/** tablet.js: work that takes time, as the real code would (the clock moves each time code reads it, the same in every browser). */
export const TABLET = `// Stands in for real work on the bakery's old tablets: keeps the page busy for \`ms\` milliseconds.
// (Grindstone's clock moves each time code reads it, so this takes the same time in every browser.)
export function busy(ms) {
  const end = performance.now() + ms
  while (performance.now() < end) {
    // working
  }
}
`

/** The page's work on the modelled event loop, with what each painted frame records, and what happens once it loaded. */
export function loopSpec(watch: readonly LoopWatch[], scene: readonly ProbeStep[]): WebSpec {
  return { api: API, loop: { watch }, scene }
}

/** A chapter 5 page: the shop's page and style plus the level's CSS, app.js and whatever else it brings. */
export function loopSite(page: WebPageOptions, css: string, files: Readonly<Record<string, string>>): Record<string, string> {
  return { ...webSite(page, files), 'style.css': `${WEB_STYLE}${css}` }
}

/** The spinner and the status line of the order page (5.1 and its practice task). */
export const SPINNER_STYLE = `
.spinner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.spinner::before {
  content: "";
  width: 14px;
  height: 14px;
  border: 2px solid #eadfd0;
  border-top-color: #7a3e12;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner[hidden] {
  display: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.status {
  margin-top: 10px;
  font-weight: 600;
}
`

/** A toast at the bottom of the page: opacity 0, and 1 with `visible`, over 300 ms (5.4 and its practice task). */
export const TOAST_STYLE = `
.toasts {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.toast {
  margin: 0;
  padding: 8px 14px;
  border-radius: 8px;
  background: #2a2118;
  color: #fff;
  font-size: 13px;
  opacity: 0;
  transition: opacity 300ms ease-out;
}

.toast.visible {
  opacity: 1;
}
`
