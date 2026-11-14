// Security 5.5: "Your order, by its number" (planned as an open redirect; see ADR 0008, chapter 5: a redirect would
// navigate the sealed frame away, so it became two practice tasks of 5.4). Customers want their receipts, and Sous adds
// `GET /api/orders/:number` with `requireLogin` and no check that the order is the customer's: order numbers count up,
// so Sam's 1042 says 1041 exists, and `fetch('/api/orders/1041')` in Run the PR's Console gets Lena's order, email and
// all (main has no such route: 404). Tempting: the my-orders route that does it right, `requireLogin`'s claim (it
// holds), the receipt's `textContent`.
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, serverShop, withEdits } from './shop'
import { MENU_ROUTE } from '../debugging/shop-server'
import type { BackendRoute, JsonValue } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

const ACCOUNT = `// Who is signed in: the shop's server knows from the login cookie (Ben).
export async function whoAmI() {
  const response = await fetch('/api/me')
  return response.json()
}
`

const ORDERS = `// The signed-in customer's orders, under the products (Ben).
const list = document.querySelector('#orders')

async function loadMyOrders() {
  const response = await fetch('/api/my-orders')
  if (!response.ok) return
  for (const order of await response.json()) {
    const item = document.createElement('li')
    item.textContent = \`Order \${order.number} · \${order.placed}\`
    list.append(item)
  }
}

loadMyOrders()
`

const ORDERS_HEAD = `// The signed-in customer's orders, under the products (Ben); a click shows the receipt (Sous).
import { formatPrice } from './money.js'

const list = document.querySelector('#orders')
const receipt = document.querySelector('#receipt')

async function loadMyOrders() {
  const response = await fetch('/api/my-orders')
  if (!response.ok) return
  for (const order of await response.json()) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.className = 'action'
    button.type = 'button'
    button.textContent = \`Order \${order.number} · \${order.placed}\`
    button.addEventListener('click', () => showReceipt(order.number))
    item.append(button)
    list.append(item)
  }
}

// one order's lines and total, under the list
async function showReceipt(number) {
  const response = await fetch(\`/api/orders/\${number}\`)
  if (!response.ok) return
  const order = await response.json()
  const rows = order.lines.map((line) => {
    const row = document.createElement('li')
    row.textContent = \`\${line.quantity} × \${line.name}  \${formatPrice(line.price * line.quantity)}\`
    return row
  })
  const total = document.createElement('li')
  total.textContent = \`Total  \${formatPrice(order.total)} €\`
  receipt.replaceChildren(...rows, total)
}

loadMyOrders()
`

const SERVER = `// The shop's server: a customer's orders (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function orderRoutes(app) {
  // the signed-in customer's orders, newest first
  app.get('/api/my-orders', requireLogin, async (req, res) => {
    res.json(await db.orders.list({ customer: req.user.id }))
  })
}
`

const ORDERS_BOX = [
  '<section class="summary" aria-label="Your orders">',
  '  <h2>Your orders</h2>',
  '  <ul id="orders" class="list"></ul>',
  '  <ul id="receipt" class="list" aria-label="Receipt"></ul>',
  '</section>'
]

const base = serverShop({ 'account.js': ACCOUNT, 'orders.js': ORDERS, 'server/order-routes.js': SERVER }, { whoAmI: true, imports: ['./orders.js'], main: ORDERS_BOX })

const head = withEdits(base, [
  {
    path: 'server/order-routes.js',
    replace: ['  })\n}\n', `  })

  // one order with its lines, for the receipt
  app.get('/api/orders/:number', requireLogin, async (req, res) => {
    const order = await db.orders.find(Number(req.params.number))
    if (!order) return res.status(404).json({ error: 'No such order' })
    res.json(order)
  })
}
`]
  },
  { path: 'orders.js', replace: [ORDERS, ORDERS_HEAD] }
])

/** Sam's orders, and the one before Sam's latest: Lena's, with what an order holds about its customer. */
const ORDER_DATA: Record<number, JsonValue> = {
  1036: { number: 1036, customer: 'c-1187', name: 'Sam', email: 'sam@example.com', placed: 'last Saturday', lines: [{ name: 'Butter croissant', quantity: 4, price: 2.4 }], total: 9.6 },
  1041: { number: 1041, customer: 'c-2231', name: 'Lena B.', email: 'lena.b@example.com', placed: 'yesterday', note: 'Birthday cake: Happy 40th, Jonas!', lines: [{ name: 'Chocolate cake', quantity: 1, price: 32 }, { name: 'Pain au chocolat', quantity: 6, price: 2.8 }], total: 48.8 },
  1042: { number: 1042, customer: 'c-1187', name: 'Sam', email: 'sam@example.com', placed: 'yesterday', lines: [{ name: 'Butter croissant', quantity: 2, price: 2.4 }, { name: 'Sourdough loaf', quantity: 1, price: 6.5 }], total: 11.3 }
}

/** Both sides: Sam, a customer, and Sam's orders. */
const SHARED: BackendRoute[] = [
  { path: '/api/me', respond: { status: 200, json: { name: 'Sam', role: 'customer' } } },
  MENU_ROUTE,
  { path: '/api/my-orders', respond: { status: 200, json: [{ number: 1042, placed: 'yesterday' }, { number: 1036, placed: 'last Saturday' }] } }
]

/** This pull request's server: any order, to anyone signed in. */
const RECEIPTS: BackendRoute[] = Object.entries(ORDER_DATA).map(([number, order]) => ({ path: `/api/orders/${number}`, respond: { status: 200, json: order } }))

const pr: PullRequest = {
  number: 85,
  title: 'Receipts for past orders',
  branch: 'sous/receipts',
  description: [
    'Customers asked to see what they ordered, not just the order numbers.',
    'Each order under Your orders is now a button that shows its receipt, from a new route on the server.'
  ],
  claims: [
    'A click on an order shows its receipt',
    'Only signed-in customers can open a receipt',
    'Customers see only their own orders',
    'The receipt\'s lines are shown as text'
  ],
  base,
  head
}

export const orderByNumber: ReviewScenario = {
  id: 'ai-25-order-by-number',
  track: 'ai',
  kind: 'scenario',
  title: 'Your order, by its number',
  difficulty: 3,
  minutes: 5,
  teaches: 'whose data',
  story: [
    'Under the products, signed-in customers see their past orders, just the numbers. They asked what was in them, and Sous made each one open its receipt.',
    'The pull request adds a route to the server (`server/order-routes.js`, server code). Run the PR as Sam on a scripted server that answers as that code would, open your own receipts, then think about the ones that aren\'t yours.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'other-orders',
    path: 'server/order-routes.js',
    lines: [12, 15],
    also: [claimAt(pr, 2)],
    categories: ['security', 'false-claim'],
    title: 'the receipt route checks that someone is signed in, not that the order is theirs: any customer can read anyone\'s order by trying numbers',
    explanation: '`requireLogin` says who is asking; nothing checks that `order.customer` is that customer, and order numbers count up, so 1041 is someone else\'s order, with their name and email.'
  }],
  tempting: [
    { path: 'server/order-routes.js', lines: [8, 8], why: 'this route does it right: it asks for the signed-in customer\'s orders only (`req.user.id`). The route the pull request adds asks for any order.' },
    { path: 'orders.js', lines: [29, 29], why: '`textContent` puts the receipt\'s lines in as text: a product name from the server can\'t become markup.' },
    { ...claimAt(pr, 1), why: 'that holds: `requireLogin` is on the route. Signed in says who is asking, though, not whose order it is.' },
    { ...claimAt(pr, 3), why: 'they are: every line goes in with `textContent`.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'orders.js', backend: { routes: [...SHARED, ...RECEIPTS] }, baseBackend: { routes: SHARED } },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR as Sam and open one of your orders. Then ask for one that isn\'t in your list: `fetch(\'/api/orders/1041\')` in the Console, and open it in the Network panel. Whose is it?',
    'Order numbers count up, so anyone can guess them. The new route checks that someone is signed in. Does it check whose order it is? Compare it with the route above it.',
    '`server/order-routes.js:13` finds any order by its number, and the route sends it to whoever asked. Comment on the route as security (check that the order is the customer\'s, and answer 404 when it isn\'t), then Request changes.'
  ],
  debrief: {
    title: 'Signed in is not allowed',
    paragraphs: [
      'The new route has `requireLogin`, so only signed-in customers get receipts: that claim holds. But it hands any order to any of them: nothing checks that `order.customer` is the customer asking. Order numbers count up, so Sam\'s 1042 says 1041 exists, and `/api/orders/1041` gives Lena\'s order, with her email and her birthday cake note.',
      'The fix: answer only with the customer\'s own order (find it, then compare `order.customer` with `req.user.id`, as the my-orders route asks for `req.user.id`), and answer 404 when it isn\'t theirs, the same as when there is no such order, so nobody learns which numbers are taken. Random ids instead of counting numbers make guessing harder, but they are no check: links get shared and logged.',
      'How you would have caught it: for every route that takes an id, ask whose thing it is and where that is checked. It tops OWASP\'s list of API risks (broken object level authorization), and it is easy to miss, because the code works perfectly whenever you open your own order.'
    ]
  },
  solution: [
    { comment: 'server/order-routes.js', lines: [13, 15], category: 'security', text: 'Any signed-in customer gets any order: check order.customer against req.user.id, 404 when it isn\'t theirs.' },
    { submit: 'request-changes', summary: 'The receipt route doesn\'t check that the order belongs to the customer.' }
  ]
}
