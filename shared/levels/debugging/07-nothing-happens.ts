// Network 2.2: the server answers the first order with a 500 and a message, but placeOrder never checks `response.ok`:
// it empties the basket and shows nothing (it only confirms when there is an order number). Learn: fetch resolves on
// any answer, so check the status and show the server's message; change nothing before you know it worked.
import { ORDER_PAGE } from './bakery'
import { probeGoal } from './checks'
import { API_MENU, API_ORDERS, CART_JS, MENU_JS, MENU_ROUTE, ORDER_APP, ORDER_BOX, apiNotes, networkSite } from './shop-server'
import type { DebugScenario } from './types'

const ORDER = `// Sends the basket to the kitchen. The server answers with the order number,
// which the customer shows at the counter when they pick it up (Ben).
import { cart, clearCart } from './cart.js'

const status = document.querySelector('#order-status')

export function showStatus(text) {
  status.textContent = text
}

export async function placeOrder() {
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  const order = await response.json()
  clearCart()
  if (order.number) showStatus(\`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`)
}
`

export const SAVE_FAILED = 'We could not save your order. Please try again.'

export const nothingHappens: DebugScenario = {
  id: 'debugging-07-nothing-happens',
  track: 'debugging',
  kind: 'scenario',
  title: 'Order sent, nothing happens',
  difficulty: 2,
  minutes: 6,
  teaches: '500',
  story: [
    'Anna at the counter: “Two customers came in for orders we never got. They pressed Order, the basket emptied, and then nothing: no thank-you, no error.”',
    'Ben says the server had a hiccup this morning and turned some orders away; he is on it. Your part: when the server says no, the page has to tell the customer why and keep the basket. Add two croissants, press Order and watch the Network panel. Fix `order.js`, Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'order.js',
    probes: [
      { id: 'after-error', steps: [{ click: '[data-id="croissant"] .add', times: 2 }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'basket-after-error', steps: [{ text: '#cart-count' }] }
    ],
    backend: {
      routes: [
        MENU_ROUTE,
        { method: 'POST', path: '/api/orders', respond: [{ status: 500, json: { error: SAVE_FAILED }, delay: 250 }, { status: 201, json: { number: 1042 }, delay: 250 }] }
      ]
    }
  },
  setup: () => ({
    files: networkSite({ 'app.js': ORDER_APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'order.js': ORDER, 'api.md': apiNotes([API_MENU, API_ORDERS]) }, { main: ORDER_BOX }),
    observed: null,
    picked: null
  }),
  goals: [
    probeGoal('tells-customer', `When the order fails, the customer reads the server's message: “${SAVE_FAILED}”`, 'after-error', SAVE_FAILED),
    probeGoal('keeps-basket', 'A failed order keeps the basket (the counter still shows 2)', 'basket-after-error', '2')
  ],
  hints: [
    'Press Order and look at the Network panel: what did the server answer to `POST /api/orders`? Select the request to read its response.',
    'The server answered `500` with a message in the body. `fetch` does not throw for that: the request worked, the order didn\'t. Look at what `placeOrder` does with the answer: it never checks `response.ok`.',
    'In `order.js`, right after `const order = await response.json()` (line 18), add `if (!response.ok) return showStatus(order.error)`, before `clearCart()` so the basket stays. Save, then Reload.'
  ],
  debrief: {
    title: 'fetch only fails when no answer comes back',
    paragraphs: [
      '`fetch` rejects only when no answer arrives at all: no connection, or the browser blocks it. A `500` is an answer, so the promise resolves and `response.ok` is `false`. Code that never looks at it treats every answer as a success.',
      'The server even said what went wrong, in the body. The Network panel showed both: the red status and the JSON with the message. Your check hands that message to the customer and keeps the basket for a second try, which works: the server\'s second answer is a `201 Created`.',
      'Check `response.ok` (or the status) right after every `fetch`, before you read the body as a success or change anything on the page.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['  const order = await response.json()\n  clearCart()', '  const order = await response.json()\n  if (!response.ok) return showStatus(order.error)\n  clearCart()'] }, 'reload']
}
