// Elements & CSS 3.4: phones should get an Order bar instead of the basket box, but the bar's media query is turned the
// wrong way (`min-width: 600px`): on a phone both are hidden, on a laptop both show. Learn: an element without a box is
// greyed out in the tree, the panel lists only rules whose media query holds at this width, and min-width/max-width.
// The goals check a phone (390px) and a laptop (1024px): a check run gives each width a frame of its own.
import { ORDER_PAGE } from './bakery'
import { probesGoal } from './checks'
import { STOREFRONT_STYLE, lineOf, storefront } from './storefront'
import type { DebugScenario } from './types'

/** A laptop's width, for the check run's second frame. */
export const LAPTOP = 1024

const MAIN = [
  '<section class="basket" aria-label="Your basket">',
  '  <p>Total <strong class="total"></strong> €</p>',
  '  <button class="order" type="button">Order</button>',
  '</section>',
  '<div class="order-bar">',
  '  <p>Total <strong class="total"></strong> €</p>',
  '  <button class="order" type="button">Order</button>',
  '</div>',
  '<p class="status" id="order-status" role="status"></p>'
]

const STYLE = `${STOREFRONT_STYLE}
/* Phones get a big Order bar at the bottom instead of the basket box (Ben) */
.order-bar {
  display: none;
  position: sticky;
  bottom: 0;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  border-top: 2px solid var(--ink);
  padding: 10px 0;
  background: var(--paper);
}

.order-bar p {
  margin: 0;
}

@media (max-width: 600px) {
  .basket {
    display: none;
  }
}

@media (min-width: 600px) {
  .order-bar {
    display: flex;
  }
}
`

const BAR = lineOf(STYLE, '.order-bar {')
const QUERY = lineOf(STYLE, '@media (min-width: 600px)')

export const goneOnPhones: DebugScenario = {
  id: 'debugging-14-gone-on-phones',
  track: 'debugging',
  kind: 'scenario',
  title: 'Gone on phones',
  difficulty: 2,
  minutes: 6,
  teaches: '@media',
  story: [
    'Maya: “On my phone there is no Order button at all! On the laptop in the shop it\'s there.”',
    'The App panel is about as wide as a phone (its width shows next to the address). Find the Order buttons in the Elements panel (greyed out: they have no box on the page), read which rules hide them, then fix the CSS so phones get the Order bar and laptops the basket box. Save and Reload: the goals check both widths.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'bar-phone', steps: [{ visible: '.order-bar' }] },
      { id: 'basket-phone', steps: [{ visible: '.basket' }] },
      { id: 'bar-laptop', width: LAPTOP, steps: [{ visible: '.order-bar' }] },
      { id: 'basket-laptop', width: LAPTOP, steps: [{ visible: '.basket' }] }
    ]
  },
  setup: () => ({ files: storefront({ main: MAIN, style: STYLE }), observed: null, picked: null }),
  goals: [
    probesGoal('phone', 'On a phone (390 px wide) the Order bar shows instead of the basket box', { 'bar-phone': 'visible', 'basket-phone': 'display: none' }),
    probesGoal('laptop', `On a laptop (${LAPTOP} px wide) the basket box shows and the Order bar stays hidden`, { 'bar-laptop': 'display: none', 'basket-laptop': 'visible' })
  ],
  hints: [
    'Open `main` in the Elements panel: `section.basket` and `div.order-bar` are greyed out, they have no box. Select each one and find the `display: none` that hides it, and the `@media` line above its rule.',
    `The basket is hidden by \`@media (max-width: 600px)\` on purpose: phones get the bar instead. The bar is \`display: none\` to start with (\`style.css:${BAR}\`), and the rule that should show it sits in \`@media (min-width: 600px)\` (line ${QUERY}), which holds from 600px up: on laptops, not on phones.`,
    `Turn the bar's query around: on line ${QUERY}, change \`@media (min-width: 600px)\` to \`@media (max-width: 600px)\`. Save, then Reload.`
  ],
  debrief: {
    title: 'min-width means from here up, max-width up to here',
    paragraphs: [
      'A media query is a condition on the width of the page, not on the device. `(min-width: 600px)` holds from 600px wide and up, so the bar showed on laptops (next to the basket box) and never on phones, where the basket box was already hidden.',
      'The Elements panel lists only the rules whose media query holds right now, and greys out elements without a box. That is why the bar showed just its `display: none`: the rule meant to show it did not apply at this width. The App\'s width next to the address tells you which queries hold.',
      'Test a layout change at both ends, a phone and a laptop width. The goals did exactly that: one check run at 390 and one at 1024 pixels.'
    ]
  },
  solution: [{ save: 'style.css', replace: ['@media (min-width: 600px)', '@media (max-width: 600px)'] }, 'reload']
}
