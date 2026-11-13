// Elements & CSS 3.5: a long product name that may not wrap (`white-space: nowrap`, cut with `…`) sits in a flex item
// (`.info { flex: 1 }`) that won't shrink below its content (`min-width: auto`), so the row grows wider than a phone:
// the page scrolls sideways and the Add button is off the edge. Learn: box sizes, the overflow badge, min-width.
import { ORDER_PAGE } from './bakery'
import { probeGoal, probesGoal } from './checks'
import { STOREFRONT_PRODUCTS, STOREFRONT_STYLE, lineOf, storefront, swap } from './storefront'
import type { DebugScenario } from './types'

/** Maya's newest loaf, with a name longer than a phone is wide. */
export const WALNUT_LOAF = { id: 'walnut-loaf', name: 'Country loaf with walnuts, honey and sea salt flakes', price: 7.2 }

export const LONG_NAME_STYLE = swap(STOREFRONT_STYLE, '.name {\n  display: block;\n  font-weight: 600;\n}', `/* One line per product: long names end in … (Maya) */
.name {
  display: block;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}`)

const INFO = lineOf(LONG_NAME_STYLE, '.info {')

export const longName: DebugScenario = {
  id: 'debugging-15-long-name',
  track: 'debugging',
  kind: 'scenario',
  title: 'A long name breaks the layout',
  difficulty: 3,
  minutes: 7,
  teaches: 'min-width',
  story: [
    'Maya: “I put the walnut loaf on the menu tonight, and now the page wobbles sideways on my phone. Its Add button is gone off the right edge!”',
    'Long names should end in “…” on one line (Maya\'s rule for `.name`). Find the element that is too wide in the Elements panel (look for the `scroll` badge and the box sizes), fix the CSS, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'page', steps: [{ overflows: 'html' }] },
      { id: 'walnut-add', steps: [{ hit: '[data-id="walnut-loaf"] .add' }] },
      { id: 'walnut-name', steps: [{ overflows: '[data-id="walnut-loaf"] .name' }] }
    ]
  },
  setup: () => ({ files: storefront({ style: LONG_NAME_STYLE, products: [...STOREFRONT_PRODUCTS, WALNUT_LOAF] }), observed: null, picked: null }),
  goals: [
    probeGoal('fits', 'The page fits a phone\'s width (390 px): nothing scrolls sideways', 'page', 'fits'),
    probesGoal('walnut', 'The walnut loaf\'s Add button can be tapped, and its long name ends in “…”', { 'walnut-add': 'itself', 'walnut-name': 'overflows' })
  ],
  hints: [
    'In the Elements panel, `html` has a `scroll` badge: the page is wider than the screen. Open the walnut loaf\'s row and select its `span.info`: how wide is its box, next to the row it sits in?',
    `\`.info\` is a flex item with \`flex: 1\` (\`style.css:${INFO}\`). A flex item doesn't shrink below its content's smallest width (\`min-width: auto\` in Computed), and a name that may not wrap is as wide as the whole name. So \`.name\` never gets narrower, and its “…” never kicks in.`,
    `Let it shrink: add \`min-width: 0;\` to \`.info\` (line ${INFO}). Save, then Reload.`
  ],
  debrief: {
    title: 'Flex items don\'t shrink below their content',
    paragraphs: [
      'A flex item starts with `min-width: auto`: it may not get narrower than the smallest width of its content. With `white-space: nowrap`, the smallest width of the name is the whole name, so `.info` stayed as wide as “Country loaf with walnuts, honey and sea salt flakes” and pushed the Add button off the screen.',
      '`min-width: 0` lets the item shrink to the space the row really has. Then `.name` is narrower than its text, `overflow: hidden` cuts it and `text-overflow: ellipsis` adds the “…”: Maya\'s rule was right, it just never got a narrower box.',
      'The Elements panel shows it in numbers: the box sizes, `min-width` in Computed, and the `scroll` badge on whatever is wider inside than outside. When a layout grows sideways, follow the badges down to the element that refuses to shrink.'
    ]
  },
  solution: [{ save: 'style.css', replace: ['.info {\n  flex: 1;\n', '.info {\n  flex: 1;\n  min-width: 0;\n'] }, 'reload']
}
