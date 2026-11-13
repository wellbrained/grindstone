// Incidents 7.5: on staging everything works; in production customers are told their order failed, though the kitchen
// gets it (sometimes twice: they try again). The logs show every order followed by POST /api/stamps 404: the stamps
// service only runs on staging. Jonas's deploy named the production flags `live`, so FLAGS['production'] is undefined
// and `?? FLAGS.staging` hands production staging's flags. Learn: an environment is configuration too; read what the
// logs say production does, and find the flag that differs; fix forward, the deploy's gift cards stay.
import { orderSite } from './bakery'
import { afterFailedFix, probesGoal } from './checks'
import { deployHistory, liveFiles } from './deploys'
import { INCIDENT_MENU, INCIDENT_STYLE, THANKS, accessRow, deployRow, incidentPage, pastLines } from './incident-shop'
import { CART_JS, MENU_JS } from './shop-server'
import type { BackendRoute, DebugScenario } from './types'

const ENV = `// Written by the deploy script: 'staging' on staging.cornerbakery.shop, 'production'
// here. Don't change it by hand.
export const ENVIRONMENT = 'production'
`

const CONFIG = `// What is switched on where. A new feature goes on in staging first, and in
// production once its server side is live there too (Jonas).
import { ENVIRONMENT } from './env.js'

const FLAGS = {
  staging: { giftCards: true },
  production: { giftCards: false }
}

export const flags = FLAGS[ENVIRONMENT]
`

const APP = `// The order page: today's menu from the server, Add and Order, and what the flags switch on.
import { loadMenu } from './menu.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { placeOrder } from './order.js'
import { formatPrice } from './money.js'
import { flags } from './config.js'
import { ENVIRONMENT } from './env.js'

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

document.querySelector('#gift-cards').hidden = !flags.giftCards
// staging says so on every page, so nobody takes it for the real shop
document.querySelector('#test-site').hidden = ENVIRONMENT === 'production'
document.querySelector('#order').addEventListener('click', placeOrder)
renderBadge()
loadMenu().then(renderMenu)

// Handy while debugging: type cart or flags in the Console.
Object.assign(window, { cart, flags })
`

const ORDER = `// Sends the basket to the kitchen. The server answers with the order number (Ben).
import { cart, clearCart } from './cart.js'

const status = document.querySelector('#order-status')

export async function placeOrder() {
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    })
    if (!response.ok) throw new Error(\`The order was answered with \${response.status}\`)
    const order = await response.json()
    clearCart()
    status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
  } catch (error) {
    console.error(error)
    status.textContent = 'Sorry, your order did not go through. Please try again.'
  }
}
`

const STAMP = `
    if (flags.stamps) {
      // a stamp on the customer's loyalty card for every order
      const stamp = await fetch('/api/stamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: order.number })
      })
      if (!stamp.ok) throw new Error(\`The stamp was answered with \${stamp.status}\`)
    }`

const GIFT_CARDS = [
  '<section class="box" id="gift-cards" aria-label="Gift cards" hidden>',
  '  <h2>Gift cards</h2>',
  '  <p class="note">From 10 €, for any of our breads and cakes.</p>',
  '</section>'
]

const BASE = orderSite(
  { 'app.js': APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'order.js': ORDER, 'config.js': CONFIG, 'env.js': ENV, 'style.css': INCIDENT_STYLE },
  incidentPage(false, { header: ['<p class="note" id="test-site" hidden>Test site: orders here are not baked.</p>'], main: GIFT_CARDS }),
  ['products.js']
)

/** Ben's stamps (on staging only) yesterday, Jonas's gift cards this morning (live). */
export const FLAG_DEPLOYS = deployHistory(BASE, [
  {
    id: '7a3c5e9',
    author: 'Ben',
    at: 'Yesterday 15:30',
    message: 'Loyalty stamps, on staging for now: the stamps service runs there',
    edits: [
      { path: 'config.js', replace: ['  staging: { giftCards: true },\n  production: { giftCards: false }', '  staging: { giftCards: true, stamps: true },\n  production: { giftCards: false, stamps: false }'] },
      { path: 'order.js', replace: ['// Sends the basket to the kitchen. The server answers with the order number (Ben).\nimport { cart, clearCart } from \'./cart.js\'\n', '// Sends the basket to the kitchen. The server answers with the order number, and\n// where stamps are on, the customer gets a stamp on their loyalty card (Ben).\nimport { cart, clearCart } from \'./cart.js\'\nimport { flags } from \'./config.js\'\n'] },
      { path: 'order.js', replace: ['    const order = await response.json()\n', `    const order = await response.json()${STAMP}\n`] }
    ]
  },
  {
    id: 'f2b6d18',
    author: 'Jonas',
    at: 'Today 11:05',
    message: 'Gift cards go live today. A new environment gets staging\'s flags until it has its own',
    edits: [
      { path: 'config.js', replace: ['  production: { giftCards: false, stamps: false }', '  live: { giftCards: true, stamps: false }'] },
      { path: 'config.js', replace: ['export const flags = FLAGS[ENVIRONMENT]\n', '// a new environment gets staging\'s flags until it has its own\nexport const flags = FLAGS[ENVIRONMENT] ?? FLAGS.staging\n'] }
    ]
  }
])

const LIVE = liveFiles(FLAG_DEPLOYS)

const NO_STAMPS = 'no route POST /api/stamps on production: the stamps service only runs on staging so far'

const ROUTES: BackendRoute[] = [
  INCIDENT_MENU,
  { method: 'POST', path: '/api/orders', respond: { status: 201, json: { number: 1042 }, delay: 120, log: [{ level: 'info', message: 'order 1042 created: {body}' }] } },
  { method: 'POST', path: '/api/stamps', respond: { status: 404, json: { error: 'Not Found' }, log: [{ level: 'warn', message: NO_STAMPS }] } }
]

/** An order since the gift cards went live: created, then the stamp the server has no route for. */
const orderAndStamp = (at: string, order: string, stamp: string, number: number, body: string) => [
  [at, 'info', 'POST /api/orders', order, `order ${number} created: ${body}`],
  accessRow(at, 'POST', '/api/orders', order, 201, 'Created', 120),
  [at, 'warn', 'POST /api/stamps', stamp, NO_STAMPS],
  accessRow(at, 'POST', '/api/stamps', stamp, 404, 'Not Found', 30)
] as const

const GOALS = [
  probesGoal('orders-in-production', `Orders go through in production: two croissants end in “${THANKS}”, and production doesn't call the stamps service (it only runs on staging so far)`, { 'ordered': THANKS, 'stamp-requests': 0 }),
  probesGoal('gift-cards-stay', 'The gift cards stay on in production, and it still is production (no test-site line)', { 'gift-cards': 'visible', 'test-site': 'display: none', 'ordered': THANKS })
]

export const onlyInProduction: DebugScenario = {
  id: 'debugging-35-only-in-production',
  track: 'debugging',
  kind: 'scenario',
  title: 'Fine on staging, broken in production',
  difficulty: 3,
  minutes: 8,
  teaches: 'feature flag',
  report: {
    author: 'Anna',
    text: 'Customers say their order failed, but the kitchen got it, some of them twice! It started this morning. Jonas says the new gift cards work fine on staging.'
  },
  story: [
    'On staging everything works; in production customers read “Sorry, your order did not go through” for orders the kitchen gets. Find out in the logs what production does, and in the deploys why.',
    'Then fix it so orders go through in production, and keep today\'s gift cards. Fix the code, Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: '/order',
    open: 'config.js',
    probes: [
      { id: 'gift-cards', steps: [{ visible: '#gift-cards' }] },
      { id: 'test-site', steps: [{ visible: '#test-site' }] },
      { id: 'ordered', steps: [{ click: '[data-id="croissant"] .add', times: 2 }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'stamp-requests', steps: [{ requests: 'POST /api/stamps' }] }
    ],
    backend: { routes: ROUTES },
    logs: {
      now: '12:15:00.000',
      firstRequest: 5520,
      history: pastLines([
        ['10:48:31.200', 'info', 'POST /api/orders', 'req-5461', 'order 1170 created: {"items":[{"id":"croissant","quantity":1}]}'],
        accessRow('10:48:31.200', 'POST', '/api/orders', 'req-5461', 201, 'Created', 120),
        deployRow('11:05:00.000', 'f2b6d18', 'Jonas', 'Gift cards go live today'),
        ...orderAndStamp('11:21:07.415', 'req-5480', 'req-5481', 1176, '{"items":[{"id":"sourdough","quantity":1}]}'),
        ...orderAndStamp('11:21:52.880', 'req-5483', 'req-5484', 1177, '{"items":[{"id":"sourdough","quantity":1}]}'),
        ...orderAndStamp('11:46:13.009', 'req-5497', 'req-5498', 1183, '{"items":[{"id":"croissant","quantity":2}]}'),
        ...orderAndStamp('12:02:40.552', 'req-5508', 'req-5509', 1187, '{"items":[{"id":"pain-au-chocolat","quantity":1}]}'),
        ...orderAndStamp('12:03:15.106', 'req-5511', 'req-5512', 1188, '{"items":[{"id":"pain-au-chocolat","quantity":1}]}')
      ])
    },
    deploys: FLAG_DEPLOYS
  },
  setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
  goals: GOALS,
  teammates: [{
    id: 'jonas-environment',
    author: 'Jonas',
    trigger: { when: afterFailedFix(GOALS, LIVE) },
    apply: state => state,
    notice: '`env.js` says production, I checked, and the deploy script writes it anyway. And the gift cards really have to stay: the newsletter about them went out at 11.'
  }],
  hints: [
    'Filter the Logs for `stamps`: since 11:05 every order is followed by `POST /api/stamps 404`. The stamps service only runs on staging. Why does production ask it? Type `flags` in the Console.',
    '`config.js` picks the flags by `ENVIRONMENT`, which is `\'production\'` here (`env.js`). Jonas\'s deploy `f2b6d18` named the production flags `live`, so `FLAGS[\'production\']` is `undefined` and the `??` on line 11 hands production staging\'s flags, stamps on. Rolling back would turn the gift cards off.',
    'In `config.js`, line 7, call the production flags by the environment\'s name again: `production: { giftCards: true, stamps: false }`. Save, then Reload.'
  ],
  debrief: {
    title: 'Production is configuration too',
    paragraphs: [
      'The code was the same on staging and in production; what differed was the configuration it picked. The logs showed what production did that it shouldn\'t: it asked a service that only runs on staging, and the order went through first, so customers who saw "Sorry" ordered again.',
      'The deploy named the production flags `live` while the deploy script calls the environment `production`. `FLAGS[\'production\']` was `undefined`, and the fallback `?? FLAGS.staging` quietly handed production staging\'s flags. A fallback like that hides a missing name; failing loudly (or no fallback at all) would have shown it on the first page load.',
      'It worked on staging because staging is the one place where staging\'s flags are right. Rolling back would have switched the gift cards off again; the one-line fix keeps them on and stamps off in production until their service is live there.'
    ]
  },
  solution: [{ save: 'config.js', replace: ['  live: { giftCards: true, stamps: false }', '  production: { giftCards: true, stamps: false }'] }, 'reload']
}
