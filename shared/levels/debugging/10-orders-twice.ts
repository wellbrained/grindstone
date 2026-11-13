// Network 2.5: the server takes almost a second to answer an order, and nothing stops a second click meanwhile, so a
// double click sends two POSTs and the kitchen gets two orders. Learn: the Network panel shows every request; ignore
// clicks while one is on its way (disable the button or guard the handler), and why the server should be safe too.
import { ORDER_PAGE } from './bakery'
import { probeGoal } from './checks'
import { API_MENU, API_ORDERS, CART_JS, MENU_JS, MENU_ROUTE, ORDER_BOX, apiNotes, networkSite } from './shop-server'
import type { DebugScenario } from './types'

const ORDER = `// Sends the basket to the kitchen. The server takes a moment: it prints the order
// slip in the kitchen before it answers (Ben).
import { cart, clearCart } from './cart.js'

const button = document.querySelector('#order')
const status = document.querySelector('#order-status')

async function placeOrder() {
  status.textContent = 'Sending your order…'
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  const order = await response.json()
  if (!response.ok) {
    status.textContent = order.error
    return
  }
  clearCart()
  status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
}

button.addEventListener('click', placeOrder)
`

const APP = `// The order page: loads today's menu from the server and wires up the Add buttons.
import { loadMenu } from './menu.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { formatPrice } from './money.js'
import './order.js'

const list = document.querySelector('#products')

function renderMenu(products) {
  for (const product of products) {
    const item = document.createElement('li')
    item.className = 'product'
    item.dataset.id = product.id
    item.innerHTML = \`
      <span class="photo" aria-hidden="true"></span>
      <span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span>
      <button class="add" type="button">Add</button>\`
    item.querySelector('.add').addEventListener('click', () => addToCart(product))
    list.append(item)
  }
}

renderBadge()
loadMenu().then(renderMenu)

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

export const CONFIRMED = 'Thanks! Order 1042 is in. Pick it up tomorrow from 7:00.'

export const ordersTwice: DebugScenario = {
  id: 'debugging-10-orders-twice',
  track: 'debugging',
  kind: 'scenario',
  title: 'Orders arrive twice',
  difficulty: 2,
  minutes: 6,
  teaches: 'double POST',
  story: [
    'Maya: “We baked six croissants for a customer who wanted three. The kitchen printer printed his order twice: two order numbers, a second apart. Third time this week.”',
    'The server takes almost a second to answer an order, and some customers click Order twice. Add a croissant, double-click Order and watch the Network panel. Make one order send one request, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'order.js',
    probes: [
      { id: 'orders-sent', steps: [{ click: '[data-id="croissant"] .add' }, { click: '#order', times: 2 }, { requests: 'POST /api/orders' }] },
      { id: 'confirmation', steps: [{ text: '#order-status' }] }
    ],
    backend: {
      routes: [
        MENU_ROUTE,
        { method: 'POST', path: '/api/orders', respond: [{ status: 201, json: { number: 1042 }, delay: 900 }, { status: 201, json: { number: 1043 }, delay: 900 }] }
      ]
    }
  },
  setup: () => ({
    files: networkSite({ 'app.js': APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'order.js': ORDER, 'api.md': apiNotes([API_MENU, API_ORDERS]) }, { main: ORDER_BOX }),
    observed: null,
    picked: null
  }),
  goals: [
    probeGoal('once', 'A double click on Order sends the order once (one `POST /api/orders`)', 'orders-sent', 1),
    probeGoal('one-confirmation', `The customer's confirmation names the one order the kitchen got: “${CONFIRMED}”`, 'confirmation', CONFIRMED)
  ],
  hints: [
    'Double-click Order and look at the Network panel: how many `POST /api/orders` are there, and what is the page doing while the first one is still pending?',
    'Nothing stops a second click while the first request is on its way, so every click sends the basket again. The page has to know it is already sending, and ignore the click.',
    'In `placeOrder` (`order.js`), make `button.disabled = true` the first line, and `button.disabled = false` once the answer is in (right after `await response.json()`). Save, then Reload.'
  ],
  debrief: {
    title: 'Every click is a request',
    paragraphs: [
      'A slow answer invites a second click, and the browser does exactly what the code says: two clicks, two `POST` requests, two orders. The Network panel showed them side by side, both pending, then both `201 Created`, with two order numbers.',
      'A disabled button ignores clicks (so does a handler that checks a "sending" flag). Turning it back on once the answer is in lets the customer try again after an error.',
      'The page can only make duplicates rarer: a retry after a timeout or a reload in the middle can still send twice. Shops that take money also make the server safe, for example with an idempotency key: a unique id per order, so the server answers a repeat with the order it already has.'
    ]
  },
  solution: [
    { save: 'order.js', replace: ['  status.textContent = \'Sending your order…\'', '  button.disabled = true\n  status.textContent = \'Sending your order…\''] },
    { save: 'order.js', replace: ['  const order = await response.json()', '  const order = await response.json()\n  button.disabled = false'] },
    'reload'
  ]
}
