// Incidents: the practice tasks, the two kinds of the earlier chapters (ADR 0007): find (click the right line, in the
// editor, a stack frame in the Logs panel or a line of a deploy's diff; or name a deploy; a wrong click says why it isn't
// that one) and quick fix (one line, or a rollback, then Reload). Each trains the scenario before it, in a small app of
// its own whose server keeps logs.
import { MONEY, ORDER_PAGE, orderSite } from '../bakery'
import type { OrderPageOptions } from '../bakery'
import { foundGoal, noErrorsGoal, probesGoal } from '../checks'
import { deployHistory, liveFiles } from '../deploys'
import { INCIDENT_MENU, INCIDENT_STYLE, accessRow, deployRow, pastLines } from '../incident-shop'
import type { PastLine } from '../incident-shop'
import { MENU_JS } from '../shop-server'
import type { DebugPracticeTask, DeployHistory, FindTarget, LogsSpec } from '../types'

/** A practice app's files: the order page with the task's own, without the shared ones it does not use. */
const files = (own: Record<string, string>, page: OrderPageOptions = {}, omit: readonly string[] = []) =>
  orderSite({ 'style.css': INCIDENT_STYLE, ...own }, page, ['products.js', 'cart.js', ...omit])

const site = (own: Record<string, string>, page: OrderPageOptions = {}, omit: readonly string[] = []) => () => ({ files: files(own, page, omit), observed: null, picked: null })

const live = (history: DeployHistory) => () => ({ files: { ...liveFiles(history) }, observed: null, picked: null })

const logs = (now: string, firstRequest: number, rows: readonly PastLine[]): LogsSpec => ({ now, firstRequest, history: pastLines(rows) })

// --- 7.1: Click the line the customer's error happened on (find) -------------------------------------------------

const SAVED_MENU = `// Today's products, as the order page shows them (Maya updates the list).
export const MENU = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
]
`

const BASKET = `// The basket the customer left last time, kept with their account (Ben).
import { MENU } from './menu.js'

const list = document.querySelector('#basket')

function lineText(id) {
  const product = MENU.find(each => each.id === id)
  return \`\${product.name} · \${product.price.toFixed(2)}\`
}

export function renderBasket(ids) {
  list.innerHTML = ''
  for (const id of ids) {
    const item = document.createElement('li')
    item.textContent = lineText(id)
    list.append(item)
  }
}
`

const RESTORE_APP = `// The order page: the basket the customer left last time.
import { renderBasket } from './basket.js'

async function restore() {
  const response = await fetch('/api/basket')
  renderBasket(await response.json())
}

restore()
`

const CUSTOMER_ERROR: FindTarget = {
  path: 'basket.js',
  lines: [8, 7],
  wrong: {
    'basket.js:15': 'That frame called `lineText`, which is where the error happened. Go one frame up.',
    'basket.js:11': 'That is where `renderBasket` starts. The error happened inside `lineText`, which it calls.',
    'app.js:6': 'That frame passed the saved basket on. The error happened further up the stack, in `basket.js`.',
    'app.js:5': 'That line asks the server for the basket; the server answered fine. Read the stack in the error\'s log line.'
  },
  otherwise: 'Not that one. In the Logs, the client error from the customer\'s phone has a stack: its top frame in the app\'s files is the line.'
}

export const customerError: DebugPracticeTask = {
  id: 'debugging-practice-customer-error',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-31-checkout-errors',
  title: 'Click the line the customer\'s error happened on',
  difficulty: 1,
  minutes: 0.5,
  task: 'A customer\'s phone sent the shop an error (the page reports its errors to the server). In the Logs panel, find it and click the line of the app where it happened: a link in its stack, or the line in the editor.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'basket.js',
    probes: [],
    find: CUSTOMER_ERROR,
    backend: { routes: [{ path: '/api/basket', respond: { status: 200, json: ['croissant'] } }] },
    logs: logs('10:20:00.000', 3320, [
      accessRow('09:58:41.300', 'GET', '/api/basket', 'req-3301', 200, 'OK', 30),
      ['09:58:41.912', 'error', 'POST /api/client-errors', 'req-3302', 'error on a customer\'s phone (Safari): TypeError: undefined is not an object (evaluating \'product.name\')', ['at lineText (basket.js:8:22)', 'at renderBasket (basket.js:15:26)', 'at restore (app.js:6:3)']],
      accessRow('09:58:41.912', 'POST', '/api/client-errors', 'req-3302', 204, 'No Content', 30),
      ['09:58:41.913', 'info', 'GET /api/basket', 'req-3301', 'saved basket of that customer: ["croissant","gingerbread"] (gingerbread is off the menu since Monday)']
    ])
  },
  setup: site({ 'app.js': RESTORE_APP, 'basket.js': BASKET, 'menu.js': SAVED_MENU }, { main: ['<h2>Your basket from last time</h2>', '<ul id="basket" class="list"></ul>'] }, ['money.js']),
  goals: [foundGoal('You found the line the customer\'s error happened on', CUSTOMER_ERROR)],
  hints: ['The error\'s log line has the stack from the customer\'s phone: `at lineText (basket.js:8:22)` is the top frame. Its link (or line 8 of `basket.js`) is the answer; a product that is off the menu gives `undefined` on line 7.'],
  why: 'A shop that reports its errors to the server gets the stack from the customer\'s browser: the top frame in the app\'s files is where it happened.',
  solution: [{ pick: 'basket.js', line: 8 }]
}

// --- 7.1: Send the field the server reads (quick fix) --------------------------------------------------------------

const GIFT = `// Gift cards (Maya): the customer picks an amount, the server makes the card.
const amount = document.querySelector('#amount')
const message = document.querySelector('#gift-message')

export async function buyGiftCard() {
  const response = await fetch('/api/gift-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Number(amount.value) })
  })
  const answer = await response.json()
  message.textContent = response.ok
    ? \`Your gift card \${answer.code} for \${answer.value.toFixed(2)} € is ready.\`
    : \`Sorry, no gift card this time (\${answer.error}).\`
}
`

const GIFT_APP = `// The gift card page.
import { buyGiftCard } from './gift.js'

document.querySelector('#buy').addEventListener('click', buyGiftCard)
`

export const GIFT_READY = 'Your gift card GC-7731 for 20.00 € is ready.'

export const fieldTheServerReads: DebugPracticeTask = {
  id: 'debugging-practice-field-the-server-reads',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-31-checkout-errors',
  title: 'Send the field the server reads',
  difficulty: 1,
  minutes: 0.5,
  task: 'Buying a gift card says “Sorry, no gift card this time (Bad Request)”. The server\'s log says which field it wants: send that one (one line in `gift.js`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'gift.js',
    probes: [
      { id: 'twenty', steps: [{ type: '#amount', value: '20' }, { click: '#buy' }, { text: '#gift-message' }] },
      { id: 'fifty', steps: [{ type: '#amount', value: '50' }, { click: '#buy' }, { sent: 'POST /api/gift-cards', json: 'value' }] }
    ],
    backend: {
      routes: [
        { method: 'POST', path: '/api/gift-cards', body: '"value":\\d', respond: { status: 201, json: { code: 'GC-7731', value: 20 }, log: [{ level: 'info', message: 'gift card GC-7731 made: {body}' }] } },
        { method: 'POST', path: '/api/gift-cards', respond: { status: 400, json: { error: 'Bad Request' }, log: [{ level: 'warn', message: 'gift card refused: "value" (in euros) is required, got {body}' }] } }
      ]
    },
    logs: logs('15:05:00.000', 7720, [
      ['14:48:12.090', 'warn', 'POST /api/gift-cards', 'req-7702', 'gift card refused: "value" (in euros) is required, got {"amount":25}'],
      accessRow('14:48:12.090', 'POST', '/api/gift-cards', 'req-7702', 400, 'Bad Request', 30)
    ])
  },
  setup: site({ 'app.js': GIFT_APP, 'gift.js': GIFT }, { main: ['<h2>Gift cards</h2>', '<label class="note">Amount in euros <input id="amount" inputmode="numeric"></label>', '<button class="action" id="buy" type="button">Buy a gift card</button>', '<p class="note" id="gift-message" role="status"></p>'] }, ['money.js']),
  goals: [probesGoal('gift-card', `A gift card can be bought: “${GIFT_READY}”, and the server gets the amount the customer typed (50)`, { twenty: GIFT_READY, fifty: 50 })],
  hints: ['The Logs say `"value" (in euros) is required, got {"amount":25}`: on line 9 of `gift.js`, send `value: Number(amount.value)`.'],
  why: 'The page only heard “Bad Request”; the server\'s log said which field it missed.',
  solution: [{ save: 'gift.js', replace: ['JSON.stringify({ amount: Number(amount.value) })', 'JSON.stringify({ value: Number(amount.value) })'] }, 'reload']
}

// --- 7.2: Click the deploy that broke the hours (find) -------------------------------------------------------------

const HOURS = `// The opening hours under the shop's name, from the server (they change on holidays).
export async function showHours() {
  const response = await fetch('/api/hours')
  const hours = await response.json()
  document.querySelector('#hours').textContent = \`Mon–Fri \${hours.weekdays} · Sat \${hours.saturday}\`
}
`

const HOURS_APP = `// The order page: the opening hours from the server.
import { showHours } from './hours.js'

showHours()
`

const HOURS_DEPLOYS = deployHistory(files({ 'app.js': HOURS_APP, 'hours.js': HOURS }, { header: ['<p class="hours" id="hours"></p>'] }, ['money.js']), [
  {
    id: '1a2b3c4',
    author: 'Maya',
    at: 'Today 08:15',
    message: 'Darker text for the opening hours',
    edits: [{ path: 'style.css', replace: ['  font-size: 12px;\n  color: #7a6a58;\n}\n\n.cart', '  font-size: 12px;\n  color: #5c4a38;\n}\n\n.cart'] }]
  },
  {
    id: '5d6e7f8',
    author: 'Jonas',
    at: 'Today 10:38',
    message: 'Shorter names in the hours code',
    edits: [{ path: 'hours.js', replace: ['Mon–Fri ${hours.weekdays} · Sat ${hours.saturday}', 'Mon–Fri ${hours.weekday} · Sat ${hours.sat}'] }]
  },
  {
    id: '9f0e1d2',
    author: 'Ben',
    at: 'Today 11:20',
    message: 'A bigger cart counter on phones',
    edits: [{ path: 'style.css', replace: ['  padding: 3px 10px;\n  font-size: 13px;', '  padding: 4px 12px;\n  font-size: 14px;'] }]
  }
])

const BROKE_THE_HOURS: FindTarget = {
  path: 'hours.js',
  lines: [5],
  deploys: ['5d6e7f8'],
  wrong: {
    'deploy:1a2b3c4': 'That one only made the hours darker, at 08:15, and they still read right until 10:38.',
    'deploy:9f0e1d2': 'That one went out at 11:20, after the hours had broken at 10:38, and only touched the cart counter\'s size.',
    'hours.js:3': 'That line asks the server for the hours, and it answers fine (`200`, `{ weekdays, saturday }`). Which line reads the answer?'
  },
  otherwise: 'Not that one. The hours say “undefined” since 10:38: which deploy went out then, and what did it change?'
}

export const brokeTheHours: DebugPracticeTask = {
  id: 'debugging-practice-broke-the-hours',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-32-which-deploy',
  title: 'Click the deploy that broke the hours',
  difficulty: 1,
  minutes: 0.5,
  task: 'Since 10:38 the opening hours say “Mon–Fri undefined”, and the server still answers fine. Three deploys went out today: in the Deploys panel, answer with the one that broke it (or click its line in the diff).',
  sandbox: {
    page: ORDER_PAGE,
    open: 'hours.js',
    probes: [],
    find: BROKE_THE_HOURS,
    backend: { routes: [{ path: '/api/hours', respond: { status: 200, json: { weekdays: '7:00–18:00', saturday: '7:00–13:00' } } }] },
    logs: logs('11:40:00.000', 4410, [
      deployRow('08:15:00.000', '1a2b3c4', 'Maya', 'Darker text for the opening hours'),
      accessRow('09:30:12.004', 'GET', '/api/hours', 'req-4380', 200, 'OK', 30),
      deployRow('10:38:00.000', '5d6e7f8', 'Jonas', 'Shorter names in the hours code'),
      accessRow('10:52:40.718', 'GET', '/api/hours', 'req-4395', 200, 'OK', 30),
      deployRow('11:20:00.000', '9f0e1d2', 'Ben', 'A bigger cart counter on phones'),
      accessRow('11:31:05.551', 'GET', '/api/hours', 'req-4403', 200, 'OK', 30)
    ]),
    deploys: HOURS_DEPLOYS
  },
  setup: live(HOURS_DEPLOYS),
  goals: [foundGoal('You found the deploy that broke the hours', BROKE_THE_HOURS)],
  hints: ['The hours broke at 10:38, when Jonas\'s `5d6e7f8` went live: its diff reads `hours.weekday` and `hours.sat`, names the server\'s answer doesn\'t have. Answer with that deploy.'],
  why: 'Line the moment it broke up with the deploys, then read that deploy\'s diff: the latest one is not always the culprit.',
  solution: [{ pickDeploy: '5d6e7f8' }]
}

// --- 7.2: Keep the euro sign, fix the delivery (quick fix) --------------------------------------------------------

const DELIVERY = `// Delivery (Ben): free from 25 €, else 3.50 €.
import { formatPrice } from './money.js'

export function deliveryText(total) {
  const amount = parseFloat(formatPrice(total))
  return amount >= 25 ? 'Free delivery' : \`Delivery: \${formatPrice(3.5)}\`
}
`

const DELIVERY_APP = `// The basket page: what is in the basket, and what delivery costs.
import { deliveryText } from './delivery.js'
import { formatPrice } from './money.js'

const prices = { croissant: 2.4, sourdough: 6.5 }
const basket = []

function show() {
  const total = basket.reduce((sum, id) => sum + prices[id], 0)
  document.querySelector('#total').textContent = formatPrice(total)
  document.querySelector('#delivery').textContent = deliveryText(total)
}

for (const button of document.querySelectorAll('[data-add]')) {
  button.addEventListener('click', () => {
    basket.push(button.dataset.add)
    show()
  })
}
show()
`

const EURO_DEPLOYS = deployHistory(files({ 'app.js': DELIVERY_APP, 'delivery.js': DELIVERY }, {
  main: [
    '<button class="add" type="button" data-add="croissant">Add a croissant</button>',
    '<button class="add" type="button" data-add="sourdough">Add a sourdough loaf</button>',
    '<p>Total <strong id="total"></strong></p>',
    '<p class="note" id="delivery"></p>'
  ]
}), [
  {
    id: '3e8b2f1',
    author: 'Maya',
    at: 'Yesterday 12:10',
    message: 'Say what the total is',
    edits: [{ path: 'index.html', replace: ['<p>Total <strong id="total"></strong></p>', '<p>Total: <strong id="total"></strong></p>'] }]
  },
  {
    id: 'b40d6a7',
    author: 'Jonas',
    at: 'Today 09:12',
    message: 'Prices with the euro sign first, like the card terminal: € 2.40',
    edits: [{ path: 'money.js', replace: ['  return amount.toFixed(2)', '  return `€ ${amount.toFixed(2)}`'] }]
  }
])

export const FREE_DELIVERY = 'Free delivery'
export const PAID_DELIVERY = 'Delivery: € 3.50'

export const keepTheEuroSign: DebugPracticeTask = {
  id: 'debugging-practice-keep-the-euro-sign',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-32-which-deploy',
  title: 'Keep the euro sign, fix the delivery',
  difficulty: 1,
  minutes: 0.5,
  task: 'Since Jonas\'s deploy this morning prices read “€ 2.40”, and delivery is never free any more, even from 25 €. Keep the euro sign and fix the one line in `delivery.js` that reads the price back. Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'delivery.js',
    probes: [
      { id: 'small', steps: [{ click: '[data-add="croissant"]' }, { text: '#delivery' }] },
      { id: 'big', steps: [{ click: '[data-add="sourdough"]' }, { click: '[data-add="sourdough"]' }, { click: '[data-add="sourdough"]' }, { click: '[data-add="sourdough"]' }, { text: '#delivery' }] },
      { id: 'total', steps: [{ text: '#total' }] }
    ],
    backend: { routes: [INCIDENT_MENU] },
    logs: logs('10:05:00.000', 2290, [deployRow('09:12:00.000', 'b40d6a7', 'Jonas', 'Prices with the euro sign first')]),
    deploys: EURO_DEPLOYS
  },
  setup: live(EURO_DEPLOYS),
  goals: [probesGoal('free-again', `From 25 € delivery is free again (“${FREE_DELIVERY}”), below it costs “${PAID_DELIVERY}”, and the total keeps its euro sign (“€ 28.40”)`, { small: PAID_DELIVERY, big: FREE_DELIVERY, total: '€ 28.40' })],
  hints: ['`parseFloat(\'€ 28.40\')` is `NaN` (line 5 of `delivery.js`), and `NaN >= 25` is false. Compare the number itself: `const amount = total`.'],
  why: 'Text with a euro sign is for people; compare the number, and the page can show the price however it likes.',
  solution: [{ save: 'delivery.js', replace: ['  const amount = parseFloat(formatPrice(total))', '  const amount = total'] }, 'reload']
}

// --- 7.3: Click the version to roll back to (find) -----------------------------------------------------------------

const MENU_APP = `// The order page: today's menu from the server.
import { loadMenu } from './menu.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')

loadMenu().then((products) => {
  for (const product of products) {
    const item = document.createElement('li')
    item.className = 'product'
    item.textContent = \`\${product.name} · \${formatPrice(product.price)}\`
    list.append(item)
  }
})
`

const MENU_DEPLOYS = deployHistory(files({ 'app.js': MENU_APP, 'menu.js': MENU_JS, 'money.js': MONEY }), [
  {
    id: '0b7f3a2',
    author: 'Maya',
    at: 'Monday 09:00',
    message: 'Pick up from 6:30 from this week',
    edits: [{ path: 'index.html', replace: ['pick up tomorrow from 7:00', 'pick up tomorrow from 6:30'] }]
  },
  {
    id: '4c1d8e5',
    author: 'Ben',
    at: 'Tuesday 14:30',
    message: 'Gluten-free products get a tag',
    edits: [{ path: 'app.js', replace: ['    item.textContent = `${product.name} · ${formatPrice(product.price)}`', '    item.textContent = `${product.name}${product.glutenFree ? \' (gluten-free)\' : \'\'} · ${formatPrice(product.price)}`'] }]
  },
  {
    id: 'd93a6b0',
    author: 'Maya',
    at: 'Yesterday 17:15',
    message: 'The page title says what it is for',
    edits: [{ path: 'index.html', replace: ['<title>Corner Bakery · Order</title>', '<title>Order bread and cakes · Corner Bakery</title>'] }]
  },
  {
    id: 'f61c2e8',
    author: 'Jonas',
    at: 'Today 17:40',
    message: 'The menu from the new menu service',
    edits: [{ path: 'menu.js', replace: ['fetch(\'/api/menu\')', 'fetch(\'/api/v2/menu\')'] }]
  }
])

const LAST_GOOD: FindTarget = {
  path: 'menu.js',
  lines: [],
  deploys: ['d93a6b0'],
  wrong: {
    'deploy:f61c2e8': 'That is the broken one, live right now: rolling back to it changes nothing.',
    'deploy:4c1d8e5': 'Too far back: that also takes back yesterday\'s page title, which works fine.',
    'deploy:0b7f3a2': 'Much too far back: that takes back Tuesday\'s gluten-free tags and yesterday\'s title too.'
  },
  otherwise: 'Not that one. Roll back to the newest version that still worked: the one right before the deploy that broke it.'
}

export const lastGoodVersion: DebugPracticeTask = {
  id: 'debugging-practice-last-good-version',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-33-roll-back-now',
  title: 'Answer with the version to roll back to',
  difficulty: 1,
  minutes: 0.5,
  task: 'Today\'s deploy broke the menu (the Logs say why), and Ben says: roll back. In the Deploys panel, answer with the version you would roll back to.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'menu.js',
    probes: [],
    find: LAST_GOOD,
    backend: { routes: [INCIDENT_MENU, { path: '/api/v2/menu', respond: { status: 404, json: { error: 'Not Found' }, log: [{ level: 'warn', message: 'no route GET /api/v2/menu: the new menu service is not live yet' }] } }] },
    logs: logs('17:55:00.000', 6610, [
      deployRow('17:40:00.000', 'f61c2e8', 'Jonas', 'The menu from the new menu service'),
      ['17:43:20.100', 'warn', 'GET /api/v2/menu', 'req-6588', 'no route GET /api/v2/menu: the new menu service is not live yet'],
      accessRow('17:43:20.100', 'GET', '/api/v2/menu', 'req-6588', 404, 'Not Found', 30)
    ]),
    deploys: MENU_DEPLOYS
  },
  setup: live(MENU_DEPLOYS),
  goals: [foundGoal('You picked the version to roll back to', LAST_GOOD)],
  hints: ['The menu broke with Jonas\'s `f61c2e8` today; the newest version before it is Maya\'s `d93a6b0` from yesterday. Answer with that one: anything older takes good changes back too.'],
  why: 'Roll back to the newest version that worked, the one right before the broken deploy: anything older also takes back changes that were fine.',
  solution: [{ pickDeploy: 'd93a6b0' }]
}

// --- 7.3: Roll it back (quick fix) ---------------------------------------------------------------------------------

const SPECIALS = `// Today's specials, from the server (Ben types them in every morning).
export async function showSpecials() {
  const response = await fetch('/api/specials')
  const specials = await response.json()
  document.querySelector('#specials').textContent = specials.map(special => special.name).join(' · ')
}
`

const SPECIALS_APP = `// The order page: today's specials from the server.
import { showSpecials } from './specials.js'

showSpecials()
`

const SPECIALS_DEPLOYS = deployHistory(files({ 'app.js': SPECIALS_APP, 'specials.js': SPECIALS }, { main: ['<h2 id="specials-title">Specials</h2>', '<p class="note" id="specials"></p>'] }, ['money.js']), [
  {
    id: '2f9e4c7',
    author: 'Maya',
    at: 'Yesterday 08:30',
    message: 'The specials heading says when they are for',
    edits: [{ path: 'index.html', replace: ['<h2 id="specials-title">Specials</h2>', '<h2 id="specials-title">Today\'s specials</h2>'] }]
  },
  {
    id: '8a5d1b3',
    author: 'Jonas',
    at: 'Today 16:10',
    message: 'Specials from the new specials service',
    edits: [{ path: 'specials.js', replace: ['fetch(\'/api/specials\')', 'fetch(\'/api/v2/specials\')'] }]
  }
])

export const SPECIALS_TEXT = 'Plum cake · Apricot danish'

export const rollItBack: DebugPracticeTask = {
  id: 'debugging-practice-roll-it-back',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-33-roll-back-now',
  title: 'Roll it back',
  difficulty: 1,
  minutes: 0.5,
  task: 'Jonas\'s deploy at 16:10 emptied today\'s specials, and he is on a train. Roll back to the version before it (Deploys panel), then Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'specials.js',
    probes: [
      { id: 'specials', steps: [{ text: '#specials' }] },
      { id: 'title', steps: [{ text: '#specials-title' }] }
    ],
    backend: {
      routes: [
        { path: '/api/specials', respond: { status: 200, json: [{ name: 'Plum cake' }, { name: 'Apricot danish' }] } },
        { path: '/api/v2/specials', respond: { status: 404, json: { error: 'Not Found' }, log: [{ level: 'warn', message: 'no route GET /api/v2/specials: the specials service is not live yet' }] } }
      ]
    },
    logs: logs('16:30:00.000', 5130, [
      deployRow('16:10:00.000', '8a5d1b3', 'Jonas', 'Specials from the new specials service'),
      ['16:12:44.380', 'warn', 'GET /api/v2/specials', 'req-5109', 'no route GET /api/v2/specials: the specials service is not live yet'],
      accessRow('16:12:44.380', 'GET', '/api/v2/specials', 'req-5109', 404, 'Not Found', 30)
    ]),
    deploys: SPECIALS_DEPLOYS
  },
  setup: live(SPECIALS_DEPLOYS),
  goals: [probesGoal('specials-back', `Today's specials show again (“${SPECIALS_TEXT}”), under yesterday's heading “Today's specials”`, { specials: SPECIALS_TEXT, title: 'Today\'s specials' })],
  hints: ['In the Deploys panel, click Roll back on Maya\'s `2f9e4c7` (the one before Jonas\'s `8a5d1b3`), confirm, then Reload.'],
  why: 'One click back to the version that worked, and the specials are there while Jonas fixes his on Monday.',
  solution: [{ rollback: '2f9e4c7' }, 'reload']
}

// --- 7.4: Click the line that builds the body by hand (find) -------------------------------------------------------

const CAKE = `// Birthday cakes (Maya): the customer picks a cake and writes what goes on it.
const cake = document.querySelector('#cake')
const message = document.querySelector('#cake-message')
const status = document.querySelector('#cake-status')

export async function orderCake() {
  const text = message.value.trim()
  const response = await fetch('/api/cakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"cake":"' + cake.value + '","message":"' + text + '"}'
  })
  status.textContent = response.ok ? 'Your cake is ordered.' : 'Sorry, we could not take that order.'
}
`

const CAKE_APP = `// The cake page.
import { orderCake } from './cake.js'

document.querySelector('#order-cake').addEventListener('click', orderCake)
`

const BODY_BY_HAND: FindTarget = {
  path: 'cake.js',
  lines: [11],
  wrong: {
    'cake.js:8': 'That line sends the request, with whatever body it is given. Which line puts the body together?',
    'cake.js:7': 'That line reads the message as the customer typed it, quotes and all. That is fine: where does it go wrong?',
    'cake.js:13': 'That line only says what the server answered. The server could not read what it got.'
  },
  otherwise: 'Not that one. The failed orders in the Logs all have a quote in their message: find the line that writes the message into the body.'
}

export const bodyByHand: DebugPracticeTask = {
  id: 'debugging-practice-body-by-hand',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-34-some-customers',
  title: 'Click the line that builds the body by hand',
  difficulty: 1,
  minutes: 0.5,
  task: 'Some cake orders fail, most don\'t. Compare the failed ones in the Logs with the others, then click the line that breaks them.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'cake.js',
    probes: [],
    find: BODY_BY_HAND,
    backend: { routes: [{ method: 'POST', path: '/api/cakes', respond: { status: 201, json: { ok: true } } }] },
    logs: logs('16:00:00.000', 3990, [
      ['11:02:40.300', 'info', 'POST /api/cakes', 'req-3951', 'cake ordered: {"cake":"plum","message":"Happy birthday Lena"}'],
      accessRow('11:02:40.300', 'POST', '/api/cakes', 'req-3951', 201, 'Created', 30),
      ['12:45:18.022', 'warn', 'POST /api/cakes', 'req-3960', 'the order is not valid JSON: {"cake":"chocolate","message":"Happy 30th, "Big Tom"!"}'],
      accessRow('12:45:18.022', 'POST', '/api/cakes', 'req-3960', 400, 'Bad Request', 30),
      ['14:30:55.871', 'info', 'POST /api/cakes', 'req-3972', 'cake ordered: {"cake":"lemon","message":"Congratulations!"}'],
      accessRow('14:30:55.871', 'POST', '/api/cakes', 'req-3972', 201, 'Created', 30),
      ['15:12:09.640', 'warn', 'POST /api/cakes', 'req-3981', 'the order is not valid JSON: {"cake":"plum","message":"For our "little" Max, 5 today"}'],
      accessRow('15:12:09.640', 'POST', '/api/cakes', 'req-3981', 400, 'Bad Request', 30)
    ])
  },
  setup: site({ 'app.js': CAKE_APP, 'cake.js': CAKE }, {
    main: ['<h2>Birthday cakes</h2>', '<select id="cake"><option value="plum">Plum cake</option><option value="chocolate">Chocolate cake</option></select>', '<textarea id="cake-message" rows="2"></textarea>', '<button class="action" id="order-cake" type="button">Order the cake</button>', '<p class="note" id="cake-status" role="status"></p>']
  }, ['money.js']),
  goals: [foundGoal('You found the line that builds the body by hand', BODY_BY_HAND)],
  hints: ['Every failed message has a `"` in it: line 11 of `cake.js` glues the message into the JSON as it is, so its quote ends the string early.'],
  why: 'A body glued together by hand breaks on the characters JSON gives a meaning to; the logs show it once you compare the requests that failed.',
  solution: [{ pick: 'cake.js', line: 11 }]
}

// --- 7.4: Let JSON escape the name (quick fix) ---------------------------------------------------------------------

const NEWSLETTER = `// The newsletter (Maya): new breads and cakes once a month.
export async function signUp() {
  const name = document.querySelector('#name').value.trim()
  const email = document.querySelector('#email').value.trim()
  const response = await fetch('/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name":"' + name + '","email":"' + email + '"}'
  })
  document.querySelector('#signed-up').textContent = response.ok ? \`Thanks, \${name}! See you in your inbox.\` : 'Sorry, that did not work. Please try again.'
}
`

const NEWSLETTER_APP = `// The newsletter page.
import { signUp } from './newsletter.js'

document.querySelector('#sign-up').addEventListener('click', signUp)
`

export const QUOTED_NAME = 'Zoë "Zo" Brandt'
const READABLE_NAME = String.raw`^(?=.*"email":"[^"\\]+")(?=.*"name":"(?:[^"\\\n]|\\.)*"[,}])`

export const escapeTheName: DebugPracticeTask = {
  id: 'debugging-practice-escape-the-name',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-34-some-customers',
  title: 'Let JSON escape the name',
  difficulty: 1,
  minutes: 0.5,
  task: `Customers with a quote in their name can't sign up for the newsletter (the Logs show what the server got). Let JSON write the body in \`newsletter.js\`, Save and Reload.`,
  sandbox: {
    page: ORDER_PAGE,
    open: 'newsletter.js',
    probes: [
      { id: 'signed-up', steps: [{ type: '#name', value: QUOTED_NAME }, { type: '#email', value: 'zo@example.com' }, { click: '#sign-up' }, { text: '#signed-up' }] },
      { id: 'name', steps: [{ sent: 'POST /api/newsletter', json: 'name' }] }
    ],
    backend: {
      routes: [
        { method: 'POST', path: '/api/newsletter', body: READABLE_NAME, respond: { status: 201, json: { ok: true }, log: [{ level: 'info', message: 'signed up: {body}' }] } },
        { method: 'POST', path: '/api/newsletter', respond: { status: 400, json: { error: 'Bad Request' }, log: [{ level: 'warn', message: 'the sign-up is not valid JSON: {body}' }] } }
      ]
    },
    logs: logs('18:10:00.000', 1240, [
      ['17:20:31.950', 'warn', 'POST /api/newsletter', 'req-1221', 'the sign-up is not valid JSON: {"name":"Ana "Nana" Silva","email":"nana@example.com"}'],
      accessRow('17:20:31.950', 'POST', '/api/newsletter', 'req-1221', 400, 'Bad Request', 30)
    ])
  },
  setup: site({ 'app.js': NEWSLETTER_APP, 'newsletter.js': NEWSLETTER }, {
    main: ['<h2>Our newsletter</h2>', '<label class="note">Name <input id="name"></label>', '<label class="note">E-mail <input id="email" type="email"></label>', '<button class="action" id="sign-up" type="button">Sign up</button>', '<p class="note" id="signed-up" role="status"></p>']
  }, ['money.js']),
  goals: [probesGoal('signs-up', `${QUOTED_NAME} can sign up, and the server gets the name as typed`, { 'signed-up': `Thanks, ${QUOTED_NAME}! See you in your inbox.`, 'name': QUOTED_NAME })],
  hints: ['Line 8 of `newsletter.js` glues the name into the JSON, so its `"` ends the string early. Write `body: JSON.stringify({ name, email })` instead.'],
  why: '`JSON.stringify` escapes what JSON gives a meaning to (`\\"`), so the server reads the name as it was typed.',
  solution: [{ save: 'newsletter.js', replace: ['    body: \'{"name":"\' + name + \'","email":"\' + email + \'"}\'', '    body: JSON.stringify({ name, email })'] }, 'reload']
}

// --- 7.5: Click the flag that is wrong in production (find) --------------------------------------------------------

const ENV = `// Written by the deploy script: 'staging' on staging.cornerbakery.shop, 'production'
// here. Don't change it by hand.
export const ENVIRONMENT = 'production'
`

const RECOMMEND_CONFIG = `// What is switched on where (Jonas).
import { ENVIRONMENT } from './env.js'

const FLAGS = {
  staging: { recommendations: true, giftCards: true },
  production: { recommendations: true, giftCards: true }
}

export const flags = FLAGS[ENVIRONMENT]
`

const RECOMMEND = `// "Customers also bought": recommendations from the new service (Jonas).
import { flags } from './config.js'

export async function showRecommendations() {
  if (!flags.recommendations) return
  const response = await fetch('/api/recommendations')
  if (!response.ok) return
  const products = await response.json()
  document.querySelector('#also-bought').textContent = products.join(', ')
}
`

const RECOMMEND_APP = `// The order page, with what the flags switch on.
import { showRecommendations } from './recommend.js'

showRecommendations()
`

const NO_RECOMMENDATIONS = 'no route GET /api/recommendations on production: the recommendations service only runs on staging'

const FLAG_IN_PRODUCTION: FindTarget = {
  path: 'config.js',
  lines: [6],
  wrong: {
    'config.js:5': 'That is staging\'s line: there the recommendations service runs, so it is right to have them on.',
    'env.js:3': 'That is right: this is production. What is switched on for production?',
    'recommend.js:6': 'That line asks for the recommendations, but only where the flag is on. Where is it switched on?',
    'config.js:9': 'That line picks the flags of this environment, production. Which of them is wrong?'
  },
  otherwise: 'Not that one. The Logs say the recommendations service only runs on staging: find the line that switches it on for production.'
}

export const flagInProduction: DebugPracticeTask = {
  id: 'debugging-practice-flag-in-production',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-35-only-in-production',
  title: 'Click the flag that is wrong in production',
  difficulty: 1,
  minutes: 0.5,
  task: 'In production every page asks for recommendations and gets a 404 (see the Logs). Click the line that switches them on there.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'config.js',
    probes: [],
    find: FLAG_IN_PRODUCTION,
    backend: { routes: [{ path: '/api/recommendations', respond: { status: 404, json: { error: 'Not Found' }, log: [{ level: 'warn', message: NO_RECOMMENDATIONS }] } }] },
    logs: logs('09:20:00.000', 2050, [
      ['09:01:15.410', 'warn', 'GET /api/recommendations', 'req-2031', NO_RECOMMENDATIONS],
      accessRow('09:01:15.410', 'GET', '/api/recommendations', 'req-2031', 404, 'Not Found', 30)
    ])
  },
  setup: site({ 'app.js': RECOMMEND_APP, 'recommend.js': RECOMMEND, 'config.js': RECOMMEND_CONFIG, 'env.js': ENV }, { main: ['<p class="note" id="also-bought"></p>'] }, ['money.js']),
  goals: [foundGoal('You found the flag that is wrong in production', FLAG_IN_PRODUCTION)],
  hints: ['Line 6 of `config.js` switches recommendations on for production, where the Logs say the service doesn\'t run yet.'],
  why: 'The logs say what production does; the flags of its environment say why.',
  solution: [{ pick: 'config.js', line: 6 }]
}

// --- 7.5: Switch it off in production (quick fix) -----------------------------------------------------------------

const REVIEWS_CONFIG = `// What is switched on where (Jonas).
import { ENVIRONMENT } from './env.js'

const FLAGS = {
  staging: { reviews: true, giftCards: true },
  production: { reviews: true, giftCards: true }
}

export const flags = FLAGS[ENVIRONMENT]
`

const REVIEWS_APP = `// The order page, with what the flags switch on.
import { flags } from './config.js'

document.querySelector('#gift-cards').hidden = !flags.giftCards

async function showReviews() {
  const response = await fetch('/api/reviews')
  const reviews = await response.json()
  document.querySelector('#reviews').textContent = reviews.map(review => review.text).join(' · ')
}

if (flags.reviews) showReviews()
`

const NO_REVIEWS = 'no route GET /api/reviews on production: the reviews service only runs on staging'

export const switchItOff: DebugPracticeTask = {
  id: 'debugging-practice-switch-it-off',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-35-only-in-production',
  title: 'Switch it off in production',
  difficulty: 1,
  minutes: 0.5,
  task: 'In production the shop asks for reviews, which only exist on staging (see the Logs), and the Console is red. Switch reviews off for production only (one line in `config.js`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'config.js',
    probes: [
      { id: 'reviews-requests', steps: [{ requests: 'GET /api/reviews' }] },
      { id: 'gift-cards', steps: [{ visible: '#gift-cards' }] }
    ],
    backend: { routes: [{ path: '/api/reviews', respond: { status: 404, json: { error: 'Not Found' }, log: [{ level: 'warn', message: NO_REVIEWS }] } }] },
    logs: logs('13:40:00.000', 4800, [
      ['13:21:50.006', 'warn', 'GET /api/reviews', 'req-4772', NO_REVIEWS],
      accessRow('13:21:50.006', 'GET', '/api/reviews', 'req-4772', 404, 'Not Found', 30)
    ])
  },
  setup: site({ 'app.js': REVIEWS_APP, 'config.js': REVIEWS_CONFIG, 'env.js': ENV }, { main: ['<section class="box" id="gift-cards" aria-label="Gift cards" hidden><h2>Gift cards</h2></section>', '<p class="note" id="reviews"></p>'] }, ['money.js']),
  goals: [probesGoal('reviews-off', 'Production asks for no reviews, and its gift cards stay on', { 'reviews-requests': 0, 'gift-cards': 'visible' }), noErrorsGoal()],
  hints: ['On line 6 of `config.js`, switch reviews off for production: `production: { reviews: false, giftCards: true }`.'],
  why: 'A feature whose service isn\'t in production yet stays off there, by its flag, without touching staging.',
  solution: [{ save: 'config.js', replace: ['  production: { reviews: true, giftCards: true }', '  production: { reviews: false, giftCards: true }'] }, 'reload']
}
