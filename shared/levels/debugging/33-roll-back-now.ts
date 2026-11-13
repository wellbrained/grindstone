// Incidents 7.3: Friday, 17:52. Jonas's new checkout (17:40) waits for pickup times from a slots service that isn't on
// the production server yet: the Order button stays grey and nobody can order. Jonas has left; Ben decides: roll back
// now, fix on Monday. Learn: when the fix needs something you don't have, a rollback is the fastest way back to a known
// good state; roll back to the last good version (yesterday's), not further, and check it.
import { orderSite } from './bakery'
import { afterFailedFix, probesGoal } from './checks'
import { deployHistory, liveFiles } from './deploys'
import { INCIDENT_MENU, INCIDENT_STYLE, accessRow, deployRow, incidentPage, pastLines } from './incident-shop'
import { CART_JS, MENU_JS, ORDER_APP } from './shop-server'
import type { BackendRoute, DebugScenario } from './types'

const ORDER = `// Sends the basket to the kitchen. The server answers with the order number (Ben).
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
    status.textContent = 'Sorry, your order did not go through. Please try again.'
    return
  }
  const order = await response.json()
  clearCart()
  status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
}
`

const HOURS = '<p class="hours" id="hours">Mon–Fri 7:00–18:00 · Sat 7:00–13:00</p>'

const BASE = orderSite({ 'app.js': ORDER_APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'order.js': ORDER, 'style.css': INCIDENT_STYLE }, incidentPage(false, { header: [HOURS] }), ['products.js'])

const SLOTS = `

// The pickup times come from the new slots service (Jonas).
const pickup = document.querySelector('#pickup')
const button = document.querySelector('#order')

export async function loadSlots() {
  const response = await fetch('/api/slots')
  const slots = await response.json()
  pickup.innerHTML = slots.map(slot => \`<option>\${slot}</option>\`).join('')
  pickup.disabled = false
  button.disabled = false
}
`

/** The week's deploys: Maya's Saturday hours, Ben's thank-you with the count (the last good one), Jonas's new checkout (live). */
export const WEEK_DEPLOYS = deployHistory(BASE, [
  {
    id: '2c7d9e4',
    author: 'Maya',
    at: 'Wednesday 11:20',
    message: 'Saturday opening hours: until 14:00 from this week',
    edits: [{ path: 'index.html', replace: ['Sat 7:00–13:00', 'Sat 7:00–14:00'] }]
  },
  {
    id: '5e1b8c3',
    author: 'Ben',
    at: 'Yesterday 16:05',
    message: 'The thank-you says how many items you ordered',
    edits: [{ path: 'order.js', replace: ['`Thanks! Order ${order.number} is in.', '`Thanks! Order ${order.number} (${items.length} items) is in.'] }]
  },
  {
    id: 'a90f3e7',
    author: 'Jonas',
    at: 'Today 17:40',
    message: 'New checkout: customers pick their pickup time',
    edits: [
      { path: 'index.html', replace: ['      <button class="action" id="order" type="button">', '      <label class="note" for="pickup">Pickup time</label>\n      <select id="pickup" disabled><option>Loading pickup times…</option></select>\n      <button class="action" id="order" type="button" disabled>'] },
      { path: 'order.js', replace: ['const status = document.querySelector(\'#order-status\')\n', `const status = document.querySelector('#order-status')${SLOTS}`] },
      { path: 'order.js', replace: ['    body: JSON.stringify({ items })', '    body: JSON.stringify({ items, pickup: pickup.value })'] },
      { path: 'order.js', replace: ['is in. Pick it up tomorrow from 7:00.`', 'is in. Pick it up at ${pickup.value}.`'] },
      { path: 'app.js', replace: ['import { placeOrder } from \'./order.js\'', 'import { loadSlots, placeOrder } from \'./order.js\''] },
      { path: 'app.js', replace: ['loadMenu().then(renderMenu)\n', 'loadMenu().then(renderMenu)\nloadSlots()\n'] }
    ]
  }
])

const LIVE = liveFiles(WEEK_DEPLOYS)

const NO_SLOTS = 'no route GET /api/slots on production: the slots service goes live on Monday'

const ROUTES: BackendRoute[] = [
  INCIDENT_MENU,
  { path: '/api/slots', respond: { status: 404, json: { error: 'Not Found' }, log: [{ level: 'warn', message: NO_SLOTS }] } },
  { method: 'POST', path: '/api/orders', respond: { status: 201, json: { number: 1042 }, delay: 120, log: [{ level: 'info', message: 'order 1042 created: {body}' }] } }
]

export const THANKS_COUNT = 'Thanks! Order 1042 (2 items) is in. Pick it up tomorrow from 7:00.'
export const SATURDAY_HOURS = 'Mon–Fri 7:00–18:00 · Sat 7:00–14:00'

const GOALS = [
  probesGoal('like-yesterday', `Orders go through like yesterday: two croissants end in “${THANKS_COUNT}”, and the page asks for no pickup times`, { 'ordered': THANKS_COUNT, 'slots-requests': 0 }),
  probesGoal('keeps-the-week', `The week's other changes stay: the hours say “${SATURDAY_HOURS}”`, { hours: SATURDAY_HOURS, ordered: THANKS_COUNT })
]

/** A visit since the new checkout: the menu, then the slots the server doesn't have. */
const visit = (at: string, menu: string, slots: string) => [
  accessRow(at, 'GET', '/api/menu', menu, 200, 'OK', 80),
  [at, 'warn', 'GET /api/slots', slots, NO_SLOTS],
  accessRow(at, 'GET', '/api/slots', slots, 404, 'Not Found', 30)
] as const

export const rollBackNow: DebugScenario = {
  id: 'debugging-33-roll-back-now',
  track: 'debugging',
  kind: 'scenario',
  title: 'Roll back now, fix later',
  difficulty: 2,
  minutes: 6,
  teaches: 'rollback',
  report: {
    author: 'Anna',
    text: 'Nobody can order since twenty to six! The Order button is grey and the pickup time says “Loading pickup times…” forever. Saturday is our busiest day.'
  },
  story: [
    'Friday, 17:52: the shop takes orders for Saturday until 18:00. Jonas deployed a new checkout at 17:40 and has left for the weekend. Ben, who leads the team: “Roll it back. We fix the new checkout on Monday.”',
    'Find the version to go back to, roll back to it, then Reload and check that orders go through like yesterday.'
  ].join('\n\n'),
  sandbox: {
    page: '/order',
    open: 'order.js',
    probes: [
      { id: 'hours', steps: [{ text: '#hours' }] },
      { id: 'ordered', steps: [{ click: '[data-id="croissant"] .add', times: 2 }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'slots-requests', steps: [{ requests: 'GET /api/slots' }] }
    ],
    backend: { routes: ROUTES },
    logs: {
      now: '17:52:00.000',
      firstRequest: 9714,
      history: pastLines([
        accessRow('17:31:10.402', 'GET', '/api/menu', 'req-9671', 200, 'OK', 80),
        ['17:31:44.950', 'info', 'POST /api/orders', 'req-9672', 'order 1311 created: {"items":[{"id":"sourdough","quantity":1}]}'],
        accessRow('17:31:44.950', 'POST', '/api/orders', 'req-9672', 201, 'Created', 120),
        deployRow('17:40:00.000', 'a90f3e7', 'Jonas', 'New checkout'),
        ...visit('17:41:03.250', 'req-9688', 'req-9689'),
        ...visit('17:44:27.811', 'req-9695', 'req-9696'),
        ...visit('17:47:52.032', 'req-9703', 'req-9704'),
        ...visit('17:50:18.674', 'req-9710', 'req-9711')
      ])
    },
    deploys: WEEK_DEPLOYS
  },
  setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
  goals: GOALS,
  teammates: [{
    id: 'ben-roll-back',
    author: 'Ben',
    trigger: { when: afterFailedFix(GOALS, LIVE) },
    apply: state => state,
    notice: 'Please don\'t fix the new checkout tonight: the slots service isn\'t even on our server yet. Roll back to the last version that worked, and not further: Maya\'s hours and my thank-you have to stay.'
  }],
  hints: [
    'Filter the Logs for `slots`: what does the server say about `GET /api/slots`? That can\'t be fixed in the shop\'s code tonight.',
    'The last version that worked is the one before Jonas\'s `a90f3e7`: Ben\'s `5e1b8c3` from yesterday. Rolling back further would also take back yesterday\'s thank-you and Wednesday\'s hours.',
    'In the Deploys panel, click Roll back on `5e1b8c3` and confirm, then Reload.'
  ],
  debrief: {
    title: 'Roll back first, debug later',
    paragraphs: [
      'The new checkout needed a slots service that isn\'t on the production server yet, so no change to the shop\'s code could make it work tonight. Rolling back took eight minutes of customers who couldn\'t order down to one click and a reload.',
      'You went back to the last version that worked, `5e1b8c3`, and no further: an older one would have taken Wednesday\'s hours and yesterday\'s thank-you with it. A rollback is a deploy like any other: check what it changes, then check the shop.',
      'On Monday the new checkout comes back, once the slots service is live, behind a feature flag (you\'ll meet one in 7.5) so it can be switched off without another deploy.'
    ]
  },
  solution: [{ rollback: '5e1b8c3' }, 'reload']
}
