// Corner Bakery's pages in chapter 6, accessibility (ADR 0009): the menu, the basket, a product's allergens, the
// receipt's email and the pickup time. Two customers use them: Tomás, who is blind and shops with a screen reader, and
// Lena, whose wrist is in a splint this week, so she shops with the keyboard. No API this time: the levels are about what
// the page tells a screen reader and what the keyboard does on it, so there is no server.js; index.html and app.js are
// what you fix. Focus, the keyboard and the reader are the accessibility model's (a11y.ts).
import type { ProbeStep } from '../debugging/types'
import type { WebSpec } from './backend'
import { API, WEB_STYLE, webSite } from './site'
import type { WebPageOptions } from './site'

/** The page's focus, keyboard and screen reader on the accessibility model, and what happens once it loaded. */
export function a11ySpec(scene: readonly ProbeStep[]): WebSpec {
  return { api: API, a11y: true, scene }
}

/** The shop's style plus what the chapter's pages share: a visually hidden helper, icon buttons, small buttons, status lines. */
export const A11Y_STYLE = `
/* Hidden on screen, still read by screen readers (Jonas's helper). */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.icon-button {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 999px;
}

.icon-button svg {
  width: 20px;
  height: 20px;
}

.status {
  min-height: 1.5em;
  margin-top: 10px;
  font-weight: 600;
}

.step {
  min-width: 2.25rem;
  border: 1px solid #c9b8a3;
  border-radius: 6px;
  background: #fff;
  color: #2a2118;
  font: inherit;
  cursor: pointer;
}
`

/** A chapter 6 page: the shop's page and style plus the chapter's, the level's CSS, app.js and whatever else it brings. */
export function a11ySite(page: WebPageOptions, css: string, files: Readonly<Record<string, string>>): Record<string, string> {
  return { ...webSite(page, files), 'style.css': `${WEB_STYLE}${A11Y_STYLE}${css}` }
}

/** The basket icon of the menu's Add buttons (a cart with a plus), hidden from screen readers as decoration. */
export const BASKET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 8.5v4M11 10.5h4" stroke="currentColor" stroke-width="2"/></svg>'
