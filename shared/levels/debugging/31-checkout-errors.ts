// Incidents 7.1: since this morning every order fails with "something went wrong on our side". The page shows the
// server's reference for the request (its x-request-id); in the Logs panel that request's lines show what the server got
// and where it failed, three minutes after Ben's deploy went live. The deploy renamed `items` to `lines`, and the
// shorthand `{ lines, note }` renamed the field the server reads. Learn: follow a request id from the customer to the
// logs, line the first failure up with a deploy, read its diff, and fix forward when a rollback would lose a feature.
import { orderSite } from './bakery'
import { afterFailedFix, probesGoal } from './checks'
import { deployHistory, liveFiles } from './deploys'
import { INCIDENT_MENU, INCIDENT_STYLE, THANKS, accessRow, deployRow, incidentPage, pastLines } from './incident-shop'
import { API_MENU, API_ORDERS, CART_JS, MENU_JS, ORDER_APP, apiNotes } from './shop-server'
import type { BackendRoute, DebugScenario } from './types'

const ORDER = `// Sends the basket to the kitchen. The server answers with the order number,
// which the customer shows at the counter when they pick it up (Ben).
import { cart, clearCart } from './cart.js'

const status = document.querySelector('#order-status')

export async function placeOrder() {
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  if (!response.ok) {
    // the reference finds the request in the server's logs
    status.textContent = \`Sorry, something went wrong on our side (reference \${response.headers.get('x-request-id')}). Please try again.\`
    return
  }
  const order = await response.json()
  clearCart()
  status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
}
`

const HOURS = '<p class="hours" id="hours">Mon–Fri 7:00–18:00 · Sat 7:00–13:00</p>'

const BASE = orderSite({
  'app.js': ORDER_APP,
  'cart.js': CART_JS,
  'menu.js': MENU_JS,
  'order.js': ORDER,
  'style.css': INCIDENT_STYLE,
  'api.md': apiNotes([API_MENU, API_ORDERS])
}, incidentPage(false, { header: [HOURS] }), ['products.js'])

/** The shop's last two deploys: Maya's hours yesterday, Ben's order notes this morning (the live one). */
export const CHECKOUT_DEPLOYS = deployHistory(BASE, [
  {
    id: 'a1f0c93',
    author: 'Maya',
    at: 'Yesterday 17:40',
    message: 'Saturday opening hours: until 14:00 from this week',
    edits: [{ path: 'index.html', replace: ['Sat 7:00–13:00', 'Sat 7:00–14:00'] }]
  },
  {
    id: 'b7e41d0',
    author: 'Ben',
    at: 'Today 08:02',
    message: 'Order notes: customers can leave a note for the bakery. Also calls the basket\'s entries lines, like the kitchen app does',
    edits: [
      { path: 'index.html', replace: ['<section class="summary" aria-label="Your order">\n', '<section class="summary" aria-label="Your order">\n      <label class="note" for="note">A note for the bakery (optional)</label>\n      <textarea id="note" rows="2"></textarea>\n'] },
      { path: 'order.js', replace: ['  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))\n', '  const lines = cart.items.map(line => ({ id: line.id, quantity: 1 }))\n  const note = document.querySelector(\'#note\').value.trim()\n'] },
      { path: 'order.js', replace: ['body: JSON.stringify({ items })', 'body: JSON.stringify({ lines, note })'] },
      { path: 'api.md', replace: ['`{ items: [{ id, quantity }] }`', '`{ items: [{ id, quantity }], note }` (the note is optional)'] }
    ]
  }
])

const LIVE = liveFiles(CHECKOUT_DEPLOYS)

/** Where the server failed, as its log has it (server code: you can read the frames, not run them). */
const SERVER_STACK = ['at priceOrder (server/orders.js:41:28)', 'at createOrder (server/orders.js:18:17)', 'at Router.handle (server/router.js:62:5)']
const MAP_ERROR = 'TypeError: Cannot read properties of undefined (reading \'map\')'

const ROUTES: BackendRoute[] = [
  INCIDENT_MENU,
  {
    method: 'POST',
    path: '/api/orders',
    body: '"items":\\[',
    respond: { status: 201, json: { number: 1042 }, delay: 120, log: [{ level: 'info', message: 'order received: {body}' }, { level: 'info', message: 'order 1042 created' }] }
  },
  {
    method: 'POST',
    path: '/api/orders',
    respond: { status: 500, json: { error: 'Internal Server Error' }, delay: 40, log: [{ level: 'info', message: 'order received: {body}' }, { level: 'error', message: MAP_ERROR, stack: SERVER_STACK }] }
  }
]

/** A failed order as the server logged it this morning. */
const failed = (at: string, end: string, request: string, body: string) => [
  [at, 'info', 'POST /api/orders', request, `order received: ${body}`],
  [at, 'error', 'POST /api/orders', request, MAP_ERROR, SERVER_STACK],
  accessRow(end, 'POST', '/api/orders', request, 500, 'Internal Server Error', 40)
] as const

export const NOTE = 'Please slice the sourdough'

const GOALS = [
  probesGoal('orders-again', `Orders go through again: two croissants end in “${THANKS}”, the server gets them as \`items\`, and the basket empties`, { ordered: THANKS, item: 'croissant', basket: '0' }),
  probesGoal('keeps-notes', `The bakery still gets the customer's note (“${NOTE}”) with the order`, { 'with-note': THANKS, 'note': NOTE })
]

export const checkoutErrors: DebugScenario = {
  id: 'debugging-31-checkout-errors',
  track: 'debugging',
  kind: 'scenario',
  title: 'Checkout errors since this morning',
  difficulty: 2,
  minutes: 7,
  teaches: 'logs',
  report: {
    author: 'Anna',
    text: 'Checkout is broken! Since this morning every order ends with “Sorry, something went wrong on our side”. A customer read me the reference on the phone: `req-4093`. Last night it all worked.'
  },
  story: [
    'You\'re on call for the shop this morning. Find out in the server\'s logs (the Logs panel) and the shop\'s deploys (the Deploys panel) what broke checkout.',
    'Then make orders go through again, with the customer\'s note: the bakery has been asking for notes for weeks. Fix the code, Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: '/order',
    open: 'order.js',
    probes: [
      { id: 'ordered', steps: [{ click: '[data-id="croissant"] .add', times: 2 }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'item', steps: [{ sent: 'POST /api/orders', json: 'items.0.id' }] },
      { id: 'basket', steps: [{ text: '#cart-count' }] },
      { id: 'with-note', steps: [{ type: '#note', value: NOTE }, { click: '[data-id="sourdough"] .add' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'note', steps: [{ sent: 'POST /api/orders', json: 'note' }] }
    ],
    backend: { routes: ROUTES },
    logs: {
      now: '09:41:00.000',
      firstRequest: 4127,
      history: pastLines([
        accessRow('07:31:04.112', 'GET', '/api/menu', 'req-4061', 200, 'OK', 80),
        ['07:58:12.224', 'info', 'POST /api/orders', 'req-4071', 'order received: {"items":[{"id":"croissant","quantity":1},{"id":"croissant","quantity":1}]}'],
        ['07:58:12.344', 'info', 'POST /api/orders', 'req-4071', 'order 1039 created'],
        accessRow('07:58:12.344', 'POST', '/api/orders', 'req-4071', 201, 'Created', 120),
        deployRow('08:02:00.000', 'b7e41d0', 'Ben', 'Order notes'),
        accessRow('08:05:31.118', 'GET', '/api/menu', 'req-4079', 200, 'OK', 80),
        ...failed('08:05:47.251', '08:05:47.291', 'req-4080', '{"lines":[{"id":"sourdough","quantity":1}],"note":""}'),
        accessRow('08:31:09.007', 'GET', '/api/menu', 'req-4085', 200, 'OK', 80),
        ...failed('08:31:40.520', '08:31:40.560', 'req-4086', '{"lines":[{"id":"pain-au-chocolat","quantity":1}],"note":"Can you slice it?"}'),
        accessRow('09:12:02.640', 'GET', '/api/menu', 'req-4092', 200, 'OK', 80),
        ...failed('09:12:33.802', '09:12:33.842', 'req-4093', '{"lines":[{"id":"croissant","quantity":1},{"id":"croissant","quantity":1}],"note":"Two of them, please"}'),
        ...failed('09:30:15.410', '09:30:15.450', 'req-4101', '{"lines":[{"id":"sourdough","quantity":1}],"note":""}')
      ])
    },
    deploys: CHECKOUT_DEPLOYS
  },
  setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
  goals: GOALS,
  teammates: [{
    id: 'ben-renamed',
    author: 'Ben',
    trigger: { when: afterFailedFix(GOALS, LIVE) },
    apply: state => state,
    notice: 'Ben here, I deployed this morning. The server\'s code didn\'t change today, only the shop\'s did. And please keep the notes: Maya already told customers about them.'
  }],
  hints: [
    'In the Logs panel, type `req-4093` into the filter: what did the server get, and where did it fail? Then look at this morning\'s deploy in the Deploys panel: when did it go live?',
    'The server got `{"lines": …, "note": …}` and failed reading `items` (`api.md` says an order is `{ items, note }`). Ben\'s deploy `b7e41d0` renamed the variable `items` to `lines`, and the shorthand `{ lines, note }` renamed the field the server reads with it. Rolling back would bring orders back, and take the notes away.',
    'In `order.js`, line 13, send the basket under the name the server reads: `body: JSON.stringify({ items: lines, note })`. Save, then Reload.'
  ],
  debrief: {
    title: 'Read what the server got, then fix forward',
    paragraphs: [
      'The page only knew that something went wrong, but it showed the server\'s reference for the request (its `x-request-id`). In the logs that request had its whole story: the body the server got and the stack where it failed. The first failure came three minutes after Ben\'s deploy went live.',
      'The deploy\'s diff showed why: `{ items }` is short for `{ items: items }`, so renaming the variable renamed the field in the request too. The server didn\'t change, so it read `items` and found nothing to `map`.',
      'Rolling back to `a1f0c93` brings orders back and takes the notes away. With the cause this clear, the fix forward is one line and keeps both. Roll back when you don\'t know the cause yet, or when the fix will take longer than your customers can wait.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['body: JSON.stringify({ lines, note })', 'body: JSON.stringify({ items: lines, note })'] }, 'reload']
}
