// Elements & CSS 3.2: a fixed, transparent message area (140px tall, `z-index: 10`) sits on top of the checkout bar
// (`z-index: 5`), so a tap on Order lands on the empty area: nothing happens, and the Console stays quiet. Learn: Pick
// selects what a click really hits; position and z-index decide what is on top; pointer-events lets clicks through.
import { ORDER_PAGE } from './bakery'
import { probeGoal, probesGoal } from './checks'
import { ORDERED, STOREFRONT_STYLE, lineOf, storefront, storefrontApp, swap } from './storefront'
import type { DebugScenario } from './types'

/** The order page with a checkout bar fixed to the bottom and a free coffee message above it. */
export const CHECKOUT_MAIN = [
  '<p class="status" id="order-status" role="status"></p>',
  '<footer class="checkout">',
  '  <p>Total <strong class="total"></strong> €</p>',
  '  <button class="order" id="order" type="button">Order</button>',
  '</footer>',
  '<div class="toast-area">',
  '  <p class="toast">Free coffee with every order before 9:00 <button class="close" type="button" aria-label="Close the message">✕</button></p>',
  '</div>'
]

export const STYLE = `${swap(STOREFRONT_STYLE, 'main {\n  padding: 0 18px 18px;', 'main {\n  padding: 0 18px 180px;')}
/* The checkout bar stays at the bottom of the screen while you scroll (Ben) */
.checkout {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 2px solid var(--ink);
  padding: 10px 18px;
  background: var(--paper);
}

.checkout p {
  margin: 0;
}

/* Messages pop up at the bottom of the screen, above everything (Ben) */
.toast-area {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  height: 140px;
  display: flex;
  justify-content: center;
  padding: 12px;
}

.toast {
  align-self: flex-start;
  margin: 0;
  border-radius: 8px;
  padding: 6px 6px 6px 14px;
  background: var(--ink);
  color: var(--paper);
  font-size: 13px;
}

.close {
  margin-left: 6px;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
`

export const CLOSE_TOAST = `
// The free coffee message: its ✕ closes it for this visit.
document.querySelector('.close').addEventListener('click', () => {
  document.querySelector('.toast').remove()
})
`

const AREA = lineOf(STYLE, '.toast-area {')
const TOAST = lineOf(STYLE, '.toast {')

export const cantClick: DebugScenario = {
  id: 'debugging-12-cant-click',
  track: 'debugging',
  kind: 'scenario',
  title: 'The button can\'t be clicked',
  difficulty: 2,
  minutes: 6,
  teaches: 'z-index',
  story: [
    'Jonas: “Order does nothing on my phone. No error, no spinner, nothing. Add works fine, and the free coffee message shows.”',
    'Add a croissant, then click Order in the app: nothing happens, and the Console stays quiet. Find out what your click really lands on (Pick in the Elements panel, then click Order), fix it in `style.css`, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'order-hit', steps: [{ hit: '#order' }] },
      { id: 'toast', steps: [{ visible: '.toast' }] },
      // guards: the bar and the messages stay where Ben put them (an emptied stylesheet covers nothing, but fixes nothing either)
      { id: 'checkout-fixed', steps: [{ style: '.checkout', property: 'position' }] },
      { id: 'area-fixed', steps: [{ style: '.toast-area', property: 'position' }] },
      { id: 'ordered', steps: [{ tap: '[data-id="croissant"] .add' }, { tap: '#order' }, { text: '#order-status' }] },
      { id: 'toast-closes', steps: [{ tap: '.close' }, { count: '.toast' }] }
    ]
  },
  setup: () => ({ files: storefront({ main: CHECKOUT_MAIN, style: STYLE, app: storefrontApp(CLOSE_TOAST) }), observed: null, picked: null }),
  goals: [
    probesGoal('lands', 'A tap on Order lands on the button, while the checkout bar stays fixed to the bottom, the free coffee message still pops up there and its ✕ still closes it', { 'order-hit': 'itself', 'toast': 'visible', 'checkout-fixed': 'fixed', 'area-fixed': 'fixed', 'toast-closes': 0 }),
    probeGoal('ordered', `With a croissant in the basket, tapping Order places the order: “${ORDERED}”`, 'ordered', ORDERED)
  ],
  hints: [
    'Click Pick in the Elements panel, then click Order in the app. What gets selected: the button, or something else?',
    `The click lands on \`div.toast-area\`: an empty, see-through box (\`style.css:${AREA}\`) fixed to the bottom, 140px tall, with \`z-index: 10\`, so it sits on top of the checkout bar (\`z-index: 5\`). A click goes to the topmost element under it, even a transparent one.`,
    `Let clicks through the empty area: add \`pointer-events: none;\` to \`.toast-area\` (line ${AREA}) and \`pointer-events: auto;\` to \`.toast\` (line ${TOAST}), so the message and its ✕ still take clicks. Save, then Reload.`
  ],
  debrief: {
    title: 'A click goes to what is on top, even if you can\'t see it',
    paragraphs: [
      'The browser sends a click to the topmost element under the pointer. `.toast-area` is a transparent box, fixed to the bottom of the screen and stacked above the checkout bar by its higher `z-index`, so it took every tap meant for Order. Nothing in the code was broken: the button simply never got the click.',
      'Pick in the Elements panel works like a tap: it selects what is really under the pointer. When a button "does nothing" without an error, that is the first thing to check.',
      '`pointer-events: none` makes an element ignore the pointer, and its children inherit it, which is why `.toast` needs `pointer-events: auto` again. Putting the bar above the area with a higher `z-index`, or moving the area up so it ends above the bar (`bottom: 70px`), works too: what matters is that nothing invisible sits on top of a button.'
    ]
  },
  solution: [
    { save: 'style.css', replace: ['  z-index: 10;\n', '  z-index: 10;\n  pointer-events: none;\n'] },
    { save: 'style.css', replace: ['.toast {\n', '.toast {\n  pointer-events: auto;\n'] },
    'reload'
  ]
}
