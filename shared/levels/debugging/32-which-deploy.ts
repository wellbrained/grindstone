// Incidents 7.2: three deploys went live today and orders fail since a quarter past nine (the server answers 422: the
// total is null). Each author says theirs is harmless. The culprit is the middle one: Jonas made formatPrice add a euro
// sign, and order.js, which no deploy touched, turned the total into text and back (`Number('4.80 €')` is NaN, sent as
// null). Learn: line the first failure up with the deploys, bisect by rolling back and reloading, read the diff for
// what else uses the changed code, and fix forward so every change of the day stays.
import { MONEY, orderSite } from './bakery'
import { probesGoal } from './checks'
import { deployHistory, liveFiles } from './deploys'
import { INCIDENT_MENU, INCIDENT_STYLE, THANKS, accessRow, deployRow, incidentPage, pastLines } from './incident-shop'
import { MENU_JS, ORDER_APP } from './shop-server'
import type { BackendRoute, DebugScenario } from './types'

/** The basket with its total (the server checks it against its own prices). */
const CART = `// The basket: what the customer picked, and the counter in the header.
const badge = document.querySelector('#cart-count')

export const cart = { items: [] }

export function basketTotal() {
  return cart.items.reduce((sum, line) => sum + line.price, 0)
}

export function renderBadge() {
  badge.textContent = String(cart.items.length)
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  renderBadge()
}

// after an order went through: a fresh basket for the next one
export function clearCart() {
  cart.items = []
  renderBadge()
}
`

const ORDER = `// Sends the basket to the kitchen. The server checks the total against its own
// prices, so the order carries it too, rounded to cents (Ben).
import { basketTotal, cart, clearCart } from './cart.js'
import { formatPrice } from './money.js'

const status = document.querySelector('#order-status')

export async function placeOrder() {
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  const total = Number(formatPrice(basketTotal()))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, total })
  })
  if (!response.ok) {
    status.textContent = \`Sorry, your order did not go through (reference \${response.headers.get('x-request-id')}). Please try again.\`
    return
  }
  const order = await response.json()
  clearCart()
  status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
}
`

const BASE = orderSite({ 'app.js': ORDER_APP, 'cart.js': CART, 'menu.js': MENU_JS, 'order.js': ORDER, 'money.js': MONEY, 'style.css': INCIDENT_STYLE }, incidentPage(false), ['products.js'])

/** Today's three deploys, oldest first: Maya's colours, Jonas's euro signs (the culprit), Ben's basket total (live). */
export const TODAYS_DEPLOYS = deployHistory(BASE, [
  {
    id: 'c41e9a2',
    author: 'Maya',
    at: 'Today 07:48',
    message: 'Softer brown for the buttons, like the new paper bags',
    edits: [{ path: 'style.css', replace: ['  background: #7a3e12;\n  color: #fff;', '  background: #8a4a1c;\n  color: #fff;'] }]
  },
  {
    id: '8d03f5b',
    author: 'Jonas',
    at: 'Today 09:12',
    message: 'Prices with the euro sign, like on the paper menu: 2.40 €',
    edits: [{ path: 'money.js', replace: ['  return amount.toFixed(2)', '  return `${amount.toFixed(2)} €`'] }]
  },
  {
    id: 'e7a2c14',
    author: 'Ben',
    at: 'Today 10:30',
    message: 'Show the basket\'s total above the Order button',
    edits: [
      { path: 'index.html', replace: ['<section class="summary" aria-label="Your order">\n', '<section class="summary" aria-label="Your order">\n      <p>Total <strong id="basket-total"></strong></p>\n'] },
      { path: 'cart.js', replace: ['// The basket: what the customer picked, and the counter in the header.\nconst badge = document.querySelector(\'#cart-count\')\n', '// The basket: what the customer picked, the counter in the header and the total.\nimport { formatPrice } from \'./money.js\'\n\nconst badge = document.querySelector(\'#cart-count\')\nconst total = document.querySelector(\'#basket-total\')\n'] },
      { path: 'cart.js', replace: ['  badge.textContent = String(cart.items.length)\n', '  badge.textContent = String(cart.items.length)\n  total.textContent = formatPrice(basketTotal())\n'] }
    ]
  }
])

const LIVE = liveFiles(TODAYS_DEPLOYS)

const ROUTES: BackendRoute[] = [
  INCIDENT_MENU,
  {
    method: 'POST',
    path: '/api/orders',
    body: '"total":\\d',
    respond: { status: 201, json: { number: 1042 }, delay: 120, log: [{ level: 'info', message: 'order received: {body}' }, { level: 'info', message: 'order 1042 created, total checked' }] }
  },
  {
    method: 'POST',
    path: '/api/orders',
    respond: { status: 422, json: { error: 'total must be a number' }, delay: 30, log: [{ level: 'warn', message: 'order refused: "total" must be a number, got {body}' }] }
  }
]

/** A refused order as the server logged it. */
const refused = (at: string, end: string, request: string, body: string) => [
  [at, 'warn', 'POST /api/orders', request, `order refused: "total" must be a number, got ${body}`],
  accessRow(end, 'POST', '/api/orders', request, 422, 'Unprocessable Entity', 30)
] as const

/** A good order as the server logged it. */
const ordered = (at: string, end: string, request: string, number: number, body: string) => [
  [at, 'info', 'POST /api/orders', request, `order received: ${body}`],
  [end, 'info', 'POST /api/orders', request, `order ${number} created, total checked`],
  accessRow(end, 'POST', '/api/orders', request, 201, 'Created', 120)
] as const

export const BASKET_TOTAL = '4.80 €'
export const CROISSANT_PRICE = '2.40 €'

const GOALS = [
  probesGoal('orders-again', `Orders go through again, their totals sent as numbers: \`4.8\` for two croissants, \`6.5\` for a sourdough loaf (“${THANKS}”)`, { 'first': THANKS, 'first-total': 4.8, 'second': THANKS, 'second-total': 6.5 }),
  probesGoal('keeps-today', `Today's changes stay: prices show “${CROISSANT_PRICE}” and the basket's total “${BASKET_TOTAL}”`, { 'price': CROISSANT_PRICE, 'shown-total': BASKET_TOTAL, 'first': THANKS })
]

export const whichDeploy: DebugScenario = {
  id: 'debugging-32-which-deploy',
  track: 'debugging',
  kind: 'scenario',
  title: 'Which deploy broke it?',
  difficulty: 3,
  minutes: 8,
  teaches: 'bisect',
  report: {
    author: 'Anna',
    text: 'Orders keep failing: “Sorry, your order did not go through”. Three deploys went out today, and Maya, Jonas and Ben each say theirs only changed something small.'
  },
  story: [
    'Find the deploy that broke ordering: the Logs panel says since when, the Deploys panel what changed and when. To be sure, roll back to a version (Roll back, then Reload) and order in the app.',
    'Then fix it forward: orders go through, and every change of today stays. Fix the code, Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: '/order',
    open: 'order.js',
    probes: [
      { id: 'price', steps: [{ text: '[data-id="croissant"] .price' }] },
      { id: 'shown-total', steps: [{ click: '[data-id="croissant"] .add', times: 2 }, { text: '#basket-total' }] },
      { id: 'first', steps: [{ click: '#order' }, { text: '#order-status' }] },
      { id: 'first-total', steps: [{ sent: 'POST /api/orders', json: 'total' }] },
      { id: 'second', steps: [{ click: '[data-id="sourdough"] .add' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'second-total', steps: [{ sent: 'POST /api/orders', json: 'total' }] }
    ],
    backend: { routes: ROUTES },
    logs: {
      now: '10:52:00.000',
      firstRequest: 6230,
      history: pastLines([
        ...ordered('07:41:20.330', '07:41:20.450', 'req-6188', 1031, '{"items":[{"id":"croissant","quantity":1}],"total":2.4}'),
        deployRow('07:48:00.000', 'c41e9a2', 'Maya', 'Softer brown for the buttons'),
        ...ordered('08:20:05.112', '08:20:05.232', 'req-6197', 1035, '{"items":[{"id":"sourdough","quantity":1}],"total":6.5}'),
        ...ordered('08:57:40.008', '08:57:40.128', 'req-6203', 1038, '{"items":[{"id":"croissant","quantity":1},{"id":"pain-au-chocolat","quantity":1}],"total":5.2}'),
        deployRow('09:12:00.000', '8d03f5b', 'Jonas', 'Prices with the euro sign'),
        ...refused('09:14:31.570', '09:14:31.600', 'req-6209', '{"items":[{"id":"sourdough","quantity":1}],"total":null}'),
        ...refused('09:40:12.215', '09:40:12.245', 'req-6214', '{"items":[{"id":"croissant","quantity":1}],"total":null}'),
        deployRow('10:30:00.000', 'e7a2c14', 'Ben', 'Show the basket\'s total'),
        ...refused('10:41:55.902', '10:41:55.932', 'req-6225', '{"items":[{"id":"pain-au-chocolat","quantity":1},{"id":"croissant","quantity":1}],"total":null}')
      ])
    },
    deploys: TODAYS_DEPLOYS
  },
  setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
  goals: GOALS,
  teammates: [{
    id: 'maya-colours',
    author: 'Maya',
    trigger: { afterCommands: 6 },
    apply: state => state,
    notice: 'Mine was only colours, promise! Did you check when the first order failed? The logs have the time, and so do the deploys.'
  }],
  hints: [
    'Filter the Logs for `422`: when did the first order fail, and which deploy went live just before it? To be sure, roll back to the deploy before that one, then Reload and order: does it work there?',
    'Jonas\'s `8d03f5b` made `formatPrice` add ` €`. `order.js` (no deploy touched it) sends the total through `formatPrice` and back through `Number` on line 10: `Number(\'4.80 €\')` is `NaN`, and JSON sends `NaN` as `null`. Rolling back takes the euro signs away, and Ben\'s basket total uses `formatPrice` too.',
    'Keep `formatPrice` for the page and round the number yourself: in `order.js`, line 10, `const total = Math.round(basketTotal() * 100) / 100`. Save, then Reload.'
  ],
  debrief: {
    title: 'The deploy that broke it, and the code it broke',
    paragraphs: [
      'The logs had a timeline: orders worked until 09:12, the first `422` came at 09:14. Rolling back to `c41e9a2` and ordering proved it: `8d03f5b` is the one. With three suspects you can also bisect: roll back to the middle, check, and keep halving.',
      'Its diff looked harmless: one line in `money.js`. The damage was in a file it never touched: `order.js` used `formatPrice` to round the total and `Number` to read it back. Once the text had a ` €`, that read `NaN`, which `JSON.stringify` sends as `null`. When a deploy breaks something, look at who uses what it changed.',
      'Text for people and numbers for machines are two jobs: round the number with `Math.round(total * 100) / 100` (or `Number(total.toFixed(2))`) and leave `formatPrice` to the page. Every change of the day stays live.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['  const total = Number(formatPrice(basketTotal()))', '  const total = Math.round(basketTotal() * 100) / 100'] }, 'reload']
}
