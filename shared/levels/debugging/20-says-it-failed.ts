// State & async 4.5: placeOrder is a promise chain whose first `.then` calls `response.json()` without returning it, so
// the next `.then` gets `undefined`, reading `order.number` throws, and a `.catch` that throws the error away tells the
// customer the order failed. The server said 201; customers order again. Learn: a `.then` passes on what its callback
// returns; a catch that swallows errors hides the real one (log it, and catch only what you expect).
import { ORDER_PAGE } from './bakery'
import { probeGoal, probesGoal } from './checks'
import { API_MENU, API_ORDERS, CART_JS, MENU_JS, MENU_ROUTE, ORDER_APP, ORDER_BOX, apiNotes, networkSite } from './shop-server'
import type { DebugScenario } from './types'

const ORDER = `// Sends the basket to the kitchen. The server answers with the order number,
// which the customer shows at the counter when they pick it up (Ben).
import { cart, clearCart } from './cart.js'

const status = document.querySelector('#order-status')

export function placeOrder() {
  status.textContent = 'Sending your order…'
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
    .then((response) => {
      if (!response.ok) throw new Error(\`The server answered \${response.status}\`)
      response.json()
    })
    .then((order) => {
      status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
      clearCart()
    })
    .catch(() => {
      status.textContent = 'Sorry, your order did not go through. Please try again.'
    })
}
`

export const THANKS = 'Thanks! Order 1042 is in. Pick it up tomorrow from 7:00.'
export const SORRY = 'Sorry, your order did not go through. Please try again.'

export const saysItFailed: DebugScenario = {
  id: 'debugging-20-says-it-failed',
  track: 'debugging',
  kind: 'scenario',
  title: 'The order went through, the page says it didn\'t',
  difficulty: 3,
  minutes: 7,
  teaches: 'promise chain',
  story: [
    'Jonas holds up two kitchen slips with the same croissants: “Customers get ‘Sorry, your order did not go through’, so they order again. But the first one did go through. Every time.”',
    'Add a croissant and press Order, then compare the page with the Network panel. The Console stays quiet: find out what the page is hiding. When an order goes through, the customer should read its number and the basket should empty; when the server turns one down, the page should still say so. Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'order.js',
    probes: [
      { id: 'confirmation', steps: [{ click: '[data-id="croissant"] .add' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'basket', steps: [{ text: '#cart-count' }] },
      // the server turns the second order down: the page must still say so
      { id: 'turned-down', steps: [{ click: '[data-id="croissant"] .add' }, { click: '#order' }, { text: '#order-status' }] }
    ],
    backend: {
      routes: [
        MENU_ROUTE,
        { method: 'POST', path: '/api/orders', respond: [{ status: 201, json: { number: 1042 }, delay: 300 }, { status: 503, json: { error: 'The kitchen printer is out of paper.' }, delay: 300 }] }
      ]
    }
  },
  setup: () => ({
    files: networkSite({ 'app.js': ORDER_APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'order.js': ORDER, 'api.md': apiNotes([API_MENU, API_ORDERS]) }, { main: ORDER_BOX }),
    observed: null,
    picked: null
  }),
  goals: [
    probesGoal('confirms', `An order that went through says “${THANKS}”, and one the server turns down still says “${SORRY}”`, { 'confirmation': THANKS, 'turned-down': SORRY }),
    probeGoal('empties', 'After the order went through, the basket is empty (the counter shows 0)', 'basket', '0')
  ],
  hints: [
    'The Network panel says `POST /api/orders` answered `201 Created` with `"number": 1042`: the order went through. So the “Sorry” comes from the `.catch` in `order.js`. What did it catch? It throws the error away without a word.',
    'Make the catch tell you: `.catch((error) => { console.error(error); … })`, Save and Reload. The Console names a TypeError reading `number` of `undefined`: the `.then` before it handed on nothing.',
    'A `.then` passes on what its callback returns, and the first one only calls `response.json()` (line 17 of `order.js`). Make it `return response.json()`. Save, then Reload.'
  ],
  debrief: {
    title: 'A catch that hides the real error',
    paragraphs: [
      'Each `.then` hands the next one what its callback returns. The first one called `response.json()` and returned nothing, so the next got `undefined`, and reading `order.number` threw a TypeError. The `.catch` caught it and said the order failed, while the server had saved it.',
      'That catch made it hard to see: it treated every error as "the server said no" and threw the real one away, so the Console stayed quiet. A catch should log what it does not expect (`console.error(error)`), or only handle the failures it knows about.',
      'With `async`/`await` the same code reads top to bottom: `const response = await fetch(…)`, then `const order = await response.json()`, with one `try`/`catch` around it. Nothing can be forgotten between the steps.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['      response.json()\n', '      return response.json()\n'] }, 'reload']
}
