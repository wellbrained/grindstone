// Network 2.3: the order body sends `qty` where the API reads `quantity`; the server ignores the unknown field, takes
// its default of 1 and answers 201, so nothing looks broken. Learn: read the request payload in the Network panel and
// compare it with the API's description and with what the server answered.
import { ORDER_PAGE } from './bakery'
import { probeGoal } from './checks'
import { API_MENU, apiNotes, networkSite } from './shop-server'
import type { BackendRoute, DebugScenario } from './types'

const BASKET = `// The basket: a line has a quantity, so three croissants are one line with qty 3.
// While Jonas rebuilds the basket page, the order page starts with Anna's test basket.
export const basket = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4, qty: 3 }
]

export function renderBasket(list) {
  for (const line of basket) {
    const item = document.createElement('li')
    item.textContent = \`\${line.qty} × \${line.name}\`
    list.append(item)
  }
  const count = basket.reduce((sum, line) => sum + line.qty, 0)
  document.querySelector('#cart-count').textContent = String(count)
}
`

const ORDER = `// Sends the basket to the kitchen. The kitchen screen shows what the server got,
// and the customer sees the server's answer (Ben).
import { basket } from './basket.js'

const status = document.querySelector('#order-status')

export async function placeOrder() {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: basket.map(line => ({ id: line.id, qty: line.qty })) })
  })
  const order = await response.json()
  if (!response.ok) {
    status.textContent = order.error
    return
  }
  const lines = order.items.map(item => \`\${item.quantity} × \${item.name}\`)
  status.textContent = \`Order \${order.number}: \${lines.join(', ')}\`
}
`

const APP = `// The order page: Anna's test basket and the Order button.
import { renderBasket } from './basket.js'
import { placeOrder } from './order.js'

renderBasket(document.querySelector('#basket'))
document.querySelector('#order').addEventListener('click', placeOrder)
`

const API = apiNotes([
  API_MENU,
  ['POST', '/api/orders', 'Takes an order; answers `{ number, items: [{ id, name, quantity }] }` (201) or `{ error }` (400)']
], [
  'An order\'s body:',
  '',
  '    { "items": [{ "id": "croissant", "quantity": 3 }] }',
  '',
  '`quantity` is a number from 1 to 20. Without one the server takes 1.'
])

const confirmed = (quantity: number) => ({ number: 1042, items: [{ id: 'croissant', name: 'Butter croissant', quantity }] })

/** The order routes of 2.3 and its practice task: what the server makes of each body (it reads `quantity`, a number). */
export const QUANTITY_ROUTES: readonly BackendRoute[] = [
  { method: 'POST', path: '/api/orders', body: '"quantity":\\s*"', respond: { status: 400, json: { error: 'items[0].quantity must be a number' }, delay: 200 } },
  { method: 'POST', path: '/api/orders', body: '"quantity":\\s*3\\s*[,}]', respond: { status: 201, json: confirmed(3), delay: 200 } },
  { method: 'POST', path: '/api/orders', respond: { status: 201, json: confirmed(1), delay: 200 } }
]

export const wrongQuantity: DebugScenario = {
  id: 'debugging-08-wrong-quantity',
  track: 'debugging',
  kind: 'scenario',
  title: 'Wrong quantity in the kitchen',
  difficulty: 2,
  minutes: 6,
  teaches: 'payload',
  story: [
    'Maya in the kitchen: “Anna ordered three croissants to try the new basket. The kitchen screen says one. And the page confirms one, too!”',
    'The server answers `201 Created`, so nothing looks broken. Press Order, select the request in the Network panel and compare what the page sent with what the server expects (`api.md`). Fix the code, Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'order.js',
    probes: [
      { id: 'quantity-sent', steps: [{ click: '#order' }, { sent: 'POST /api/orders', json: 'items.0.quantity' }] },
      { id: 'confirmation', steps: [{ text: '#order-status' }] }
    ],
    backend: { routes: QUANTITY_ROUTES }
  },
  setup: () => ({
    files: networkSite({ 'app.js': APP, 'basket.js': BASKET, 'order.js': ORDER, 'api.md': API }, {
      main: [
        '<section class="summary" aria-label="Your order">',
        '  <h2>Your basket</h2>',
        '  <ul id="basket" class="list"></ul>',
        '  <button class="action" id="order" type="button">Order for pickup</button>',
        '  <p class="note" id="order-status" role="status"></p>',
        '</section>'
      ]
    }, ['cart.js', 'money.js']),
    observed: null,
    picked: null
  }),
  goals: [
    probeGoal('sends-quantity', 'The order tells the server 3 croissants, in the field `api.md` describes', 'quantity-sent', 3),
    probeGoal('confirmed', 'The confirmation reads “Order 1042: 3 × Butter croissant”', 'confirmation', 'Order 1042: 3 × Butter croissant')
  ],
  hints: [
    'Press Order and select `POST /api/orders` in the Network panel. Read the request body: what does each item carry?',
    'The page sends `qty`, but `api.md` says the server reads `quantity` (and takes 1 when it is missing). The response shows what the server understood. Find where `order.js` builds the body.',
    'On line 11 of `order.js`, send `quantity: line.qty` instead of `qty: line.qty`. Save, then Reload.'
  ],
  debrief: {
    title: 'A 201 can still be wrong',
    paragraphs: [
      'Nothing failed: the server answered `201 Created`. It just didn\'t read what the page meant. It looks for `quantity`, found none and used its default, 1. A field a server doesn\'t know is usually ignored without a word.',
      'The Network panel shows both sides of the conversation: the request body the page sent, and the response the server built from it. Comparing them with the API\'s description (`api.md`) finds the mismatch in a minute.',
      'When data arrives wrong somewhere else, check the payload first: it tells you whether the page sent the wrong thing or the server read it wrong.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['qty: line.qty', 'quantity: line.qty'] }, 'reload']
}
