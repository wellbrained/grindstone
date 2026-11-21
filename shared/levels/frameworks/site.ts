// Corner Bakery's new Vue storefront (ADR 0010, "World"): Jonas moves the basket, the menu and the kitchen screen to
// Vue. Every level's page is the shop's header and an empty `#app` Vue mounts into; app.js imports `vue` (real Vue, in
// the frame) and the money helper from the Debugging track's shop.
import { MONEY, STYLE } from '../debugging/bakery'
import type { PredictionFact } from '../web/types'

/** The page's address bar path. */
export const VUE_PAGE = '/basket'

/** A few things every storefront level needs beside the shop's own style. */
export const VUE_STYLE = `${STYLE}
.line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #eadfd0;
  padding: 8px 0;
}

.special {
  margin-inline-start: 6px;
  border-radius: 4px;
  padding: 0 6px;
  background: #f6e3c8;
  font-size: 12px;
}

.chosen {
  outline: 2px solid #7a3e12;
  outline-offset: 2px;
  border-radius: 6px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}

.out {
  font-variant-numeric: tabular-nums;
}

label {
  display: block;
  margin: 8px 0 4px;
  font-size: 13px;
}

input {
  font: inherit;
  border: 1px solid #c9b9a5;
  border-radius: 6px;
  padding: 6px 8px;
}
`

/** index.html of a storefront page: the shop's header, `#app` for Vue, app.js as a module. */
export function vuePage(title: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>Corner Bakery · ${title}</title>`,
    '  <link rel="stylesheet" href="./style.css">',
    '</head>',
    '<body>',
    '  <header class="top">',
    '    <div>',
    '      <h1>Corner Bakery</h1>',
    '      <p class="tagline">Order today, pick up tomorrow from 7:00</p>',
    '    </div>',
    '  </header>',
    '  <main id="app"></main>',
    '  <script type="module" src="./app.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

/** A level's files: the page, the style, the money helper and the level's own (app.js and whatever else). */
export function vueSite(title: string, files: Readonly<Record<string, string>>, css = ''): Record<string, string> {
  return { 'index.html': vuePage(title), 'style.css': `${VUE_STYLE}${css}`, 'money.js': MONEY, ...files }
}

/** The menu most levels start from (euros as plain numbers, as money.js has them). */
export const MENU_SOURCE = `// Today's menu (Maya updates it every evening). Prices in euros.
export const MENU = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'rye', name: 'Rye loaf', price: 5 },
  { id: 'bun', name: 'Cinnamon bun', price: 3.2 }
]
`

/** A probe of the starting files read this value (the e2e checks every option's fact against the real run). */
export const shows = (probe: string, is: string | number): PredictionFact => ({ probe, is })
