// Security 5.4: "Price from the basket". Orders were slow, so Sous drops the server's price lookups: the page sends
// each line's price and the total, and the server charges the total it gets. The request is the customer's: with
// `cart.items[0].price = 0.01` in Run the PR's Console, the next order sends 0.01 and the server takes it (the Network
// panel shows the body; main's request carries no prices at all). The fix is the code Sous removed: the server looks
// the prices up (and checks the quantities). Tempting: `requireLogin` (who orders is checked, not what they pay).
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, emptyReview, serverShop, withEdits } from './shop'
import { CART_JS, MENU_ROUTE, ORDER_BOX } from '../debugging/shop-server'
import type { BackendSpec } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

const ORDER = `// Sends the basket to the kitchen; the server charges the customer's card on file (Ben).
import { cart, clearCart } from './cart.js'

const status = document.querySelector('#order-status')

async function placeOrder() {
  status.textContent = 'Sending your order…'
  const items = cart.items.map(item => ({ id: item.id, quantity: 1 }))
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

document.querySelector('#order').addEventListener('click', placeOrder)
`

const SERVER = `// The shop's server: orders from the order page (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'
import { charge } from './payments.js'

export function orderRoutes(app) {
  // an order, { items: [{ id, quantity }] }, charged to the customer's card on file
  app.post('/api/orders', requireLogin, async (req, res) => {
    const lines = []
    for (const { id, quantity } of req.body.items) {
      const product = await db.products.find(id)
      if (!product || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'That isn\\'t on today\\'s menu.' })
      lines.push({ id, quantity, price: product.price })
    }
    const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    await charge(req.user, total)
    const order = await db.orders.create({ customer: req.user.id, lines, total })
    res.status(201).json({ number: order.number })
  })
}
`

const base = serverShop({ 'cart.js': CART_JS, 'order.js': ORDER, 'server/order-routes.js': SERVER }, { imports: ['./order.js'], main: ORDER_BOX })

const head = withEdits(base, [
  {
    path: 'order.js',
    replace: ['  const items = cart.items.map(item => ({ id: item.id, quantity: 1 }))\n', `  const items = cart.items.map(item => ({ id: item.id, quantity: 1, price: item.price }))
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
`]
  },
  { path: 'order.js', replace: ['body: JSON.stringify({ items })', 'body: JSON.stringify({ items, total })'] },
  {
    path: 'server/order-routes.js',
    replace: [`  // an order, { items: [{ id, quantity }] }, charged to the customer's card on file
  app.post('/api/orders', requireLogin, async (req, res) => {
    const lines = []
    for (const { id, quantity } of req.body.items) {
      const product = await db.products.find(id)
      if (!product || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'That isn\\'t on today\\'s menu.' })
      lines.push({ id, quantity, price: product.price })
    }
    const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    await charge(req.user, total)
    const order = await db.orders.create({ customer: req.user.id, lines, total })
`, `  // an order, { items: [{ id, quantity, price }], total }, charged to the customer's card on file
  app.post('/api/orders', requireLogin, async (req, res) => {
    // the page knows the prices already: no lookups, so orders go through faster
    const { items, total } = req.body
    await charge(req.user, total)
    const order = await db.orders.create({ customer: req.user.id, lines: items, total })
`]
  }
])

const backend: BackendSpec = {
  routes: [MENU_ROUTE, { method: 'POST', path: '/api/orders', respond: { status: 201, json: { number: 1043 }, delay: 150 } }]
}

const pr: PullRequest = {
  number: 84,
  title: 'Faster orders: prices from the basket',
  branch: 'sous/faster-orders',
  description: [
    'Placing an order was slow: the server looked every product up again, one query per line.',
    'The basket already knows the prices, so the page now sends them with the order, and the server charges the total it gets.'
  ],
  claims: [
    'Orders go through faster: no product lookups',
    'Prices can\'t be changed: they come from our own menu',
    'Orders still need a signed-in customer',
    'The confirmation is the same as before'
  ],
  base,
  head
}

export const priceFromBasket: ReviewScenario = {
  id: 'ai-24-price-from-basket',
  track: 'ai',
  kind: 'scenario',
  title: 'Price from the basket',
  difficulty: 2,
  minutes: 5,
  teaches: 'trusting the client',
  story: [
    'Ben says orders take a second to go through at the morning rush. Sous found why: the server looks up every product again, though the basket on the page already has the prices.',
    'Sous\'s fix changes the page and the server (`server/order-routes.js`, server code: it never runs in the browser). Run the PR on a scripted server that answers as that code would, and watch what the page sends.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'client-price',
    path: 'server/order-routes.js',
    lines: [9, 11],
    removed: [9, 15],
    also: [{ path: 'server/order-routes.js', lines: [12, 12] }, { path: 'order.js', lines: [8, 9] }, { path: 'order.js', lines: [13, 13] }, paragraphAt(pr, 1), claimAt(pr, 1)],
    categories: ['security', 'false-claim'],
    title: 'the server charges the total the browser sends: anyone can pay what they like, down to 0.01 €',
    explanation: 'The request is built in the customer\'s browser, and the customer can change anything in it. The server takes `total` and the prices from `req.body` and charges that, where it used to look every price up itself.'
  }],
  tempting: [
    { path: 'server/order-routes.js', lines: [8, 8], why: 'the route still needs a signed-in customer, as before (`requireLogin`). That checks who orders, though, not what they pay.' },
    { ...claimAt(pr, 0), why: 'it does: no product lookups at all. Faster, and wrong: the lookups were the point.' },
    { ...claimAt(pr, 2), why: 'they do: `requireLogin` is still on the route.' },
    { ...claimAt(pr, 3), why: 'it is: the server answers with the order\'s number, and the page thanks the customer as before.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'order.js', backend },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR, add a sourdough loaf and click Order for pickup. In the Network panel, open the order: what does the page send, and what does the server do with it?',
    'The request is built in the customer\'s browser, so it says whatever the customer wants. In the Console, `cart.items[0].price = 0.01`, then Order again. Which side should know what a loaf costs?',
    '`server/order-routes.js:10` takes the items and the total from the request, and the line after it charges that total. Comment on it as security (the server looks the prices up itself), then Request changes.'
  ],
  debrief: {
    title: 'The browser is the customer\'s',
    paragraphs: [
      'Everything in the order request comes from the customer\'s browser, and the customer controls their browser: the Console, the browser\'s own tools or curl send any price they like. `cart.items[0].price = 0.01` was enough, and the server charged what the request said, because it now takes `total` from `req.body`. On main the request carries no prices at all: there was nothing to change.',
      'The fix is the code Sous removed: the page sends only what the customer chooses (ids and quantities), and the server looks every price up and works out the total itself, checking the quantities too (a whole number from 1, or someone orders −3 loaves). If the lookups are slow, the answer is one query for all the ids, not trusting the page. The prices `order.js` now sends go too: the server must not read them.',
      'How you would have caught it: for every value the server uses, ask where it comes from. From the request means from the customer: fine for what they choose, never for what they pay, who they are or what they may do.'
    ]
  },
  solution: [
    { comment: 'server/order-routes.js', lines: [10, 11], category: 'security', text: 'The total comes from the request, so a customer can pay 0.01 €. Look the prices up on the server, as before.' },
    { submit: 'request-changes', summary: 'The server charges whatever total the browser sends.' }
  ]
}
