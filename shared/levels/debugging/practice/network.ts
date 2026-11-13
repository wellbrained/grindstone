// Network: the practice tasks, the two kinds of chapter 1 (ADR 0007): find (click the right line, in the editor or
// through a link in the Console or the Network panel; a wrong click says why it isn't that one) and quick fix (one
// line). Each trains the scenario before it, in a small app of its own with its own scripted server.
import { ORDER_PAGE } from '../bakery'
import { foundGoal, noErrorsGoal, probeGoal } from '../checks'
import { QUANTITY_ROUTES } from '../08-wrong-quantity'
import { API_HOURS, API_MENU, API_SPECIALS, HOURS, MENU_JS, MENU_ROUTE, apiNotes, networkSite } from '../shop-server'
import type { OrderPageOptions } from '../bakery'
import type { BackendRoute, DebugPracticeTask, FindTarget, JsonValue } from '../types'

const site = (files: Record<string, string>, page: OrderPageOptions = {}, omit: readonly string[] = []) => () => ({ files: networkSite(files, page, omit), observed: null, picked: null })

const SPECIALS: JsonValue = [{ name: 'Apricot danish', price: 3.2 }, { name: 'Rye with seeds', price: 4.9 }]

/** A small app.js that draws the menu as plain rows (the practice apps have no Add buttons). */
const MENU_ROWS = `function renderMenu(products) {
  const list = document.querySelector('#products')
  for (const product of products) {
    const item = document.createElement('li')
    item.className = 'product'
    item.textContent = product.name + ' · ' + formatPrice(product.price)
    list.append(item)
  }
}`

// --- 2.1: Click the line that builds the address (find) -------------------------------------------------------------

const CONFIG = `// The addresses on the shop's server, in one place, so a move is a one-line change (Ben).
const API = '/api'

export const MENU_URL = \`\${API}/menu\`
export const SPECIALS_URL = \`\${API}/special\`
export const HOURS_URL = \`\${API}/hours\`
`

const BUILT_SPECIALS = `// Today's specials, from the shop's server. Ben types them in every morning.
import { SPECIALS_URL } from './config.js'

export async function loadSpecials(list) {
  const response = await fetch(SPECIALS_URL)
  // no specials today (or no answer): the box just stays empty
  if (!response.ok) return
  for (const special of await response.json()) {
    const item = document.createElement('li')
    item.textContent = special.name
    list.append(item)
  }
}
`

const BUILT_APP = `// The order page: today's specials first, then the menu, both from the shop's server.
import { MENU_URL } from './config.js'
import { loadSpecials } from './specials.js'
import { formatPrice } from './money.js'

${MENU_ROWS}

loadSpecials(document.querySelector('#specials'))
fetch(MENU_URL).then(response => response.json()).then(renderMenu)
`

const BUILDS_THE_ADDRESS: FindTarget = {
  path: 'config.js',
  lines: [5],
  wrong: {
    'specials.js:5': 'That line sends the request, with whatever address `SPECIALS_URL` holds. Where is that address put together?',
    'config.js:2': 'The base `/api` is right: the menu loads with it. Which address built on it is wrong?',
    'config.js:4': 'The menu\'s address works (`200` in the Network panel). Look for the request that failed.',
    'app.js:16': 'That line starts loading the specials; the address comes from somewhere else. Follow `SPECIALS_URL`.',
    'app.js:17': 'That line sends the menu request, which works (`200`). The failed one is the specials.'
  },
  otherwise: 'Not that one. The red request in the Network panel is `/api/special`: find the line that puts that address together.'
}

export const buildsTheAddress: DebugPracticeTask = {
  id: 'debugging-practice-builds-the-address',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-06-menu-wont-load',
  title: 'Click the line that builds the address',
  difficulty: 1,
  minutes: 0.5,
  task: 'Today\'s specials stay empty, and the Network panel has a red `404`. Click the line that builds the wrong address (compare with `api.md`).',
  sandbox: {
    page: ORDER_PAGE,
    open: 'specials.js',
    probes: [],
    find: BUILDS_THE_ADDRESS,
    backend: { routes: [MENU_ROUTE, { path: '/api/specials', respond: { status: 200, json: SPECIALS } }] }
  },
  setup: site(
    { 'app.js': BUILT_APP, 'config.js': CONFIG, 'specials.js': BUILT_SPECIALS, 'api.md': apiNotes([API_MENU, API_SPECIALS, API_HOURS]) },
    { main: ['<h2>Today\'s specials</h2>', '<ul id="specials" class="list"></ul>'] },
    ['cart.js']
  ),
  goals: [foundGoal('You found the line that builds the wrong address', BUILDS_THE_ADDRESS)],
  hints: ['The Network panel shows `GET /api/special 404`; `api.md` lists `/api/specials`. The address is put together on line 5 of `config.js`.'],
  why: 'The line that sends a request is often not where its address comes from: follow the variable back to where it is built.',
  solution: [{ pick: 'config.js', line: 5 }]
}

// --- 2.1: Ask for the right path (quick fix) ------------------------------------------------------------------------

const WRONG_HOURS = `// The opening hours under the shop's name, from the server (they change on holidays).
export async function loadHours() {
  const response = await fetch('/api/opening-hours')
  const hours = await response.json()
  return \`Mon–Fri \${hours.weekdays} · Sat \${hours.saturday}\`
}
`

const HOURS_APP = `// The order page: the opening hours and the menu, from the shop's server.
import { loadHours } from './hours.js'
import { loadMenu } from './menu.js'
import { formatPrice } from './money.js'

${MENU_ROWS}

loadHours().then((text) => {
  document.querySelector('#hours').textContent = text
})
loadMenu().then(renderMenu)
`

export const OPENING_HOURS = 'Mon–Fri 7:00–18:00 · Sat 7:00–13:00'

export const rightPath: DebugPracticeTask = {
  id: 'debugging-practice-right-path',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-06-menu-wont-load',
  title: 'Ask for the right path',
  difficulty: 1,
  minutes: 0.5,
  task: 'The opening hours under the shop\'s name are missing, and the Network panel shows a `404`. Ask the server for the path `api.md` lists (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'hours.js',
    probes: [{ id: 'hours', steps: [{ text: '#hours' }] }],
    backend: { routes: [MENU_ROUTE, { path: '/api/hours', respond: { status: 200, json: HOURS } }] }
  },
  setup: site(
    { 'app.js': HOURS_APP, 'hours.js': WRONG_HOURS, 'menu.js': MENU_JS, 'api.md': apiNotes([API_MENU, API_HOURS]) },
    { header: ['<p class="hours" id="hours"></p>'] },
    ['cart.js']
  ),
  goals: [probeGoal('hours', `The opening hours show: “${OPENING_HOURS}”`, 'hours', OPENING_HOURS), noErrorsGoal()],
  hints: ['Line 3 of `hours.js` asks for `/api/opening-hours`; `api.md` says the hours are at `/api/hours`.'],
  why: 'A 404 means the server has nothing at that address: compare the path in the Network panel with the paths the server really has.',
  solution: [{ save: 'hours.js', replace: ['fetch(\'/api/opening-hours\')', 'fetch(\'/api/hours\')'] }, 'reload']
}

// --- 2.2: Click the line that sent the failing request (find) -------------------------------------------------------

const LOADS_HOURS = `// The opening hours under the shop's name, from the server.
export async function loadHours() {
  const response = await fetch('/api/hours')
  if (!response.ok) return
  const hours = await response.json()
  document.querySelector('#hours').textContent = \`Mon–Fri \${hours.weekdays} · Sat \${hours.saturday}\`
}
`

const LOADS_SPECIALS = `// Today's specials, from the server. Ben types them in every morning.
export async function loadSpecials() {
  const list = document.querySelector('#specials')
  const response = await fetch('/api/specials')
  // no specials today (or no answer): the box just stays empty
  if (!response.ok) return
  for (const special of await response.json()) {
    const item = document.createElement('li')
    item.textContent = special.name
    list.append(item)
  }
}
`

const THREE_REQUESTS_APP = `// The order page: the opening hours, today's specials and the menu, all from the shop's server.
import { loadHours } from './hours.js'
import { loadSpecials } from './specials.js'
import { loadMenu } from './menu.js'
import { formatPrice } from './money.js'

${MENU_ROWS}

loadHours()
loadSpecials()
loadMenu().then(renderMenu)
`

const FAILING_REQUEST: FindTarget = {
  path: 'specials.js',
  lines: [4],
  wrong: {
    'hours.js:3': 'That request came back `200 OK`: the hours show. Look for the red one.',
    'menu.js:4': 'The menu came back `200 OK`: the products show. Look for the red one.',
    'specials.js:6': 'That line notices the failure and leaves the box empty. Which line sent the request?',
    'app.js:18': 'That line starts loading the specials; the request itself is sent inside `loadSpecials`.'
  },
  otherwise: 'Not that one. The red request in the Network panel (or the browser\'s red line in the Console) links the line that sent it.'
}

export const failingRequest: DebugPracticeTask = {
  id: 'debugging-practice-failing-request',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-07-nothing-happens',
  title: 'Click the line that sent the failing request',
  difficulty: 1,
  minutes: 0.5,
  task: 'The specials box is empty, and the code throws no error. One of the page\'s three requests failed: click the line that sent it (its link in the Console or the Network panel, or the line in the editor).',
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [],
    find: FAILING_REQUEST,
    backend: {
      routes: [
        MENU_ROUTE,
        { path: '/api/hours', respond: { status: 200, json: HOURS } },
        { path: '/api/specials', respond: { status: 503, json: { error: 'The specials board is being updated.' }, delay: 60 } }
      ]
    }
  },
  setup: site(
    { 'app.js': THREE_REQUESTS_APP, 'hours.js': LOADS_HOURS, 'specials.js': LOADS_SPECIALS, 'menu.js': MENU_JS },
    { header: ['<p class="hours" id="hours"></p>'], main: ['<h2>Today\'s specials</h2>', '<ul id="specials" class="list"></ul>'] },
    ['cart.js']
  ),
  goals: [foundGoal('You found the line that sent the failing request', FAILING_REQUEST)],
  hints: ['The browser\'s red line in the Console, `GET …/api/specials 503 (Service Unavailable)`, links `specials.js:4` on its right: the line that sent it.'],
  why: 'The Network panel\'s initiator (and the browser\'s red line in the Console) links the code that sent a request: the place to start reading.',
  solution: [{ pick: 'specials.js', line: 4 }]
}

// --- 2.2: Show the server's answer (quick fix) ----------------------------------------------------------------------

const VOUCHER = `// Voucher codes from the shop's flyers. The server knows which ones still work.
const message = document.querySelector('#voucher-message')

export async function checkVoucher(code) {
  const response = await fetch('/api/vouchers/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })
  const answer = await response.json()
  message.textContent = 'Voucher applied: 10% off your order.'
}
`

const VOUCHER_APP = `// The order page: the menu from the server, and the voucher box.
import { loadMenu } from './menu.js'
import { checkVoucher } from './voucher.js'
import { formatPrice } from './money.js'

${MENU_ROWS}

document.querySelector('#voucher-apply').addEventListener('click', () => {
  checkVoucher(document.querySelector('#voucher').value)
})
loadMenu().then(renderMenu)
`

export const VOUCHER_EXPIRED = 'SUMMER10 expired on 31 August.'

export const checkResponseOk: DebugPracticeTask = {
  id: 'debugging-practice-check-response-ok',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-07-nothing-happens',
  title: 'Show the server\'s answer',
  difficulty: 1,
  minutes: 0.5,
  task: 'The flyer code SUMMER10 has expired, but Apply still says “10% off”. When the answer is not ok, show the server\'s message instead (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'voucher.js',
    probes: [{ id: 'voucher', steps: [{ click: '#voucher-apply' }, { text: '#voucher-message' }] }],
    backend: { routes: [MENU_ROUTE, { method: 'POST', path: '/api/vouchers/check', respond: { status: 400, json: { error: VOUCHER_EXPIRED }, delay: 120 } }] }
  },
  setup: site(
    { 'app.js': VOUCHER_APP, 'voucher.js': VOUCHER, 'menu.js': MENU_JS },
    {
      main: [
        '<section class="summary" aria-label="Voucher">',
        '  <p><input id="voucher" value="SUMMER10" aria-label="Voucher code"> <button class="action" id="voucher-apply" type="button">Apply</button></p>',
        '  <p class="note" id="voucher-message" role="status"></p>',
        '</section>'
      ]
    },
    ['cart.js']
  ),
  goals: [probeGoal('voucher', `An expired voucher shows the server's message: “${VOUCHER_EXPIRED}”`, 'voucher', VOUCHER_EXPIRED)],
  hints: ['The Network panel shows `400` with `{"error": …}`. On line 11 of `voucher.js` write `message.textContent = response.ok ? \'Voucher applied: 10% off your order.\' : answer.error`.'],
  why: 'A 4xx or 5xx answer still resolves the `fetch` promise: only `response.ok` (or the status) tells success from failure.',
  solution: [{ save: 'voucher.js', replace: ['message.textContent = \'Voucher applied: 10% off your order.\'', 'message.textContent = response.ok ? \'Voucher applied: 10% off your order.\' : answer.error'] }, 'reload']
}

// --- 2.3: Send the quantity as a number (quick fix) -----------------------------------------------------------------

const QUICK_ORDER = `// The quick order box: croissants for tomorrow morning, in one click.
const input = document.querySelector('#quantity')
const status = document.querySelector('#order-status')

export async function orderCroissants() {
  const item = { id: 'croissant', quantity: input.value }
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [item] })
  })
  const order = await response.json()
  status.textContent = response.ok ? \`Order \${order.number}: \${order.items[0].quantity} × \${order.items[0].name}\` : order.error
}
`

const QUICK_ORDER_APP = `// The order page: the quick order box.
import { orderCroissants } from './order.js'

document.querySelector('#order').addEventListener('click', orderCroissants)
`

export const quantityAsNumber: DebugPracticeTask = {
  id: 'debugging-practice-quantity-as-number',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-08-wrong-quantity',
  title: 'Send the quantity as a number',
  difficulty: 1,
  minutes: 0.5,
  task: 'The quick order box answers “items[0].quantity must be a number”. Look at the request body in the Network panel and send the quantity as a number (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'order.js',
    probes: [
      { id: 'quantity-sent', steps: [{ click: '#order' }, { sent: 'POST /api/orders', json: 'items.0.quantity' }] },
      { id: 'confirmation', steps: [{ text: '#order-status' }] }
    ],
    backend: { routes: QUANTITY_ROUTES }
  },
  setup: site(
    { 'app.js': QUICK_ORDER_APP, 'order.js': QUICK_ORDER },
    {
      main: [
        '<section class="summary" aria-label="Quick order">',
        '  <p><label>Croissants <input id="quantity" type="number" value="3" min="1" max="20"></label> <button class="action" id="order" type="button">Order</button></p>',
        '  <p class="note" id="order-status" role="status"></p>',
        '</section>'
      ]
    },
    ['cart.js', 'money.js']
  ),
  goals: [
    probeGoal('number', 'The request sends the quantity as a number (3, not "3")', 'quantity-sent', 3),
    probeGoal('confirmed', 'The order is confirmed: “Order 1042: 3 × Butter croissant”', 'confirmation', 'Order 1042: 3 × Butter croissant')
  ],
  hints: ['An input\'s `value` is always text, so the body says `"quantity":"3"`. On line 6 of `order.js` send `Number(input.value)` (or `input.valueAsNumber`).'],
  why: 'Form fields give you strings, and JSON keeps the type: for the server `"3"` and `3` are different values.',
  solution: [{ save: 'order.js', replace: ['quantity: input.value', 'quantity: Number(input.value)'] }, 'reload']
}

// --- 2.4: Sign up through the shop's own address (quick fix) --------------------------------------------------------

const NEWSLETTER = `// The newsletter box: Ben sends the bake sale dates once a month.
const message = document.querySelector('#signup-message')

export async function signUp(email) {
  const response = await fetch('https://api.cornerbakery.shop/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
  message.textContent = response.ok ? 'Thanks! You\\'re on the list.' : 'Sorry, that did not work. Please try again.'
}
`

const NEWSLETTER_APP = `// The order page: the menu from the server, and the newsletter box.
import { loadMenu } from './menu.js'
import { signUp } from './newsletter.js'
import { formatPrice } from './money.js'

${MENU_ROWS}

document.querySelector('#signup').addEventListener('click', () => {
  signUp(document.querySelector('#email').value)
})
loadMenu().then(renderMenu)
`

const SIGNED_UP: BackendRoute['respond'] = { status: 201, json: { email: 'anna@example.com' }, delay: 120 }

export const ownOrigin: DebugPracticeTask = {
  id: 'debugging-practice-own-origin',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-09-works-on-my-machine',
  title: 'Sign up through the shop\'s own address',
  difficulty: 1,
  minutes: 0.5,
  task: 'Sign up fails with a CORS error about a “preflight request”. Send it to the shop\'s own `/api/newsletter` instead (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'newsletter.js',
    probes: [{ id: 'signup', steps: [{ click: '#signup' }, { text: '#signup-message' }] }],
    backend: {
      routes: [
        MENU_ROUTE,
        { method: 'POST', path: 'https://api.cornerbakery.shop/newsletter', respond: SIGNED_UP },
        { method: 'POST', path: '/api/newsletter', respond: SIGNED_UP }
      ]
    }
  },
  setup: site(
    { 'app.js': NEWSLETTER_APP, 'newsletter.js': NEWSLETTER, 'menu.js': MENU_JS, 'api.md': apiNotes([API_MENU, ['POST', '/api/newsletter', 'Signs up `{ email }` for the newsletter']], ['The shop\'s server passes every /api/... request on to our API server, https://api.cornerbakery.shop.']) },
    {
      main: [
        '<section class="summary" aria-label="Newsletter">',
        '  <p><input id="email" type="email" value="anna@example.com" aria-label="Your email"> <button class="action" id="signup" type="button">Sign up</button></p>',
        '  <p class="note" id="signup-message" role="status"></p>',
        '</section>'
      ]
    },
    ['cart.js']
  ),
  goals: [probeGoal('signed-up', 'Sign up works: “Thanks! You\'re on the list.”', 'signup', 'Thanks! You\'re on the list.'), noErrorsGoal()],
  hints: ['A JSON `POST` to another origin is checked first (the preflight), and the API server allows no other site. On line 5 of `newsletter.js` fetch `\'/api/newsletter\'`: the shop\'s server passes it on.'],
  why: 'A request to the page\'s own origin needs no CORS permission; the shop\'s server forwards it to the API, server to server.',
  solution: [{ save: 'newsletter.js', replace: ['fetch(\'https://api.cornerbakery.shop/newsletter\'', 'fetch(\'/api/newsletter\''] }, 'reload']
}

// --- 2.5: Disable the button while it sends (quick fix) -------------------------------------------------------------

const CAKE = `// Birthday cakes are made to order. Reserve asks the kitchen, which checks the
// oven plan before it answers, so it takes a moment.
const button = document.querySelector('#reserve')
const message = document.querySelector('#reserve-message')

button.addEventListener('click', async () => {
  message.textContent = 'Checking the oven plan…'
  const response = await fetch('/api/cakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cake: 'chocolate', day: 'Saturday' })
  })
  const reservation = await response.json()
  message.textContent = \`Reserved: cake \${reservation.number}, ready on Saturday.\`
})
`

const CAKE_APP = `// The order page: the menu from the server, and the birthday cake box.
import { loadMenu } from './menu.js'
import { formatPrice } from './money.js'
import './cake.js'

${MENU_ROWS}

loadMenu().then(renderMenu)
`

export const disableWhileSending: DebugPracticeTask = {
  id: 'debugging-practice-disable-while-sending',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-10-orders-twice',
  title: 'Disable the button while it sends',
  difficulty: 1,
  minutes: 0.5,
  task: 'A double click on Reserve books two cakes: two `POST /api/cakes` in the Network panel. Disable the button as the click handler starts (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'cake.js',
    probes: [{ id: 'reservations', steps: [{ click: '#reserve', times: 2 }, { requests: 'POST /api/cakes' }] }],
    backend: {
      routes: [
        MENU_ROUTE,
        { method: 'POST', path: '/api/cakes', respond: [{ status: 201, json: { number: 'C-17' }, delay: 800 }, { status: 201, json: { number: 'C-18' }, delay: 800 }] }
      ]
    }
  },
  setup: site(
    { 'app.js': CAKE_APP, 'cake.js': CAKE, 'menu.js': MENU_JS },
    {
      main: [
        '<section class="summary" aria-label="Birthday cake">',
        '  <p>Chocolate birthday cake for Saturday <button class="action" id="reserve" type="button">Reserve</button></p>',
        '  <p class="note" id="reserve-message" role="status"></p>',
        '</section>'
      ]
    },
    ['cart.js']
  ),
  goals: [probeGoal('once', 'A double click on Reserve sends one reservation (one `POST /api/cakes`)', 'reservations', 1)],
  hints: ['Make `button.disabled = true` the first line of the click handler in `cake.js` (line 7, before the message). A disabled button ignores clicks.'],
  why: 'While a request is on its way, the page has to ignore new clicks for it, or every click sends it again.',
  solution: [{ save: 'cake.js', replace: ['  message.textContent = \'Checking the oven plan…\'', '  button.disabled = true\n  message.textContent = \'Checking the oven plan…\''] }, 'reload']
}
