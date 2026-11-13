// Performance: the practice tasks, the two kinds of the earlier chapters (ADR 0007): find (click the right line, in the
// editor or a link of the Performance panel: a function, a line that changed the page, a request's Sent from; a wrong
// click says why it isn't that one) and quick fix (one line, or two made one). Each trains the scenario before it, in a
// small app of its own; nothing is wrong in any of them, only slow, so the Performance panel is where the answer shows.
import { ORDER_PAGE, orderSite } from '../bakery'
import { foundGoal, probesGoal } from '../checks'
import type { OrderPageOptions } from '../bakery'
import { SEARCH_STYLE } from '../17-wrong-results'
import { typesWord } from '../26-request-per-key'
import { CATALOGUE, MONEY_CENTS } from '../28-formatted-thousands'
import { RANGE, productsFile } from '../range'
import type { BackendRoute, DebugPracticeTask, FindTarget } from '../types'

/** A practice app: the order page with the task's files, without the shared ones it does not use. */
const site = (files: Record<string, string>, page: OrderPageOptions = {}, omit: readonly string[] = []) => () => ({ files: orderSite(files, page, omit), observed: null, picked: null })

/** The shared files a practice app without products or a basket leaves out. */
const NO_SHOP = ['products.js', 'cart.js', 'money.js']

// --- 6.1: Click the line that sends a request for every key (find) ------------------------------------------------

const POSTCODE = `// Delivery check (Ben): is the customer's postcode in our delivery area?
const field = document.querySelector('#postcode')
const answer = document.querySelector('#delivery')

async function checkPostcode() {
  const code = field.value.trim()
  const response = await fetch(\`/api/delivery?postcode=\${encodeURIComponent(code)}\`)
  const area = await response.json()
  answer.textContent = area.delivers ? \`We deliver to \${code}.\` : \`Sorry, we don't deliver to \${code} yet.\`
}

field.addEventListener('input', checkPostcode)
`

const SENDS_PER_KEY: FindTarget = {
  path: 'postcode.js',
  lines: [7, 12],
  wrong: {
    'postcode.js:5': 'That is where the check starts. Which line in it sends the request? It is the Sent from of every `delivery?postcode=…`.',
    'postcode.js:9': 'That line shows the answer, once it is back. The request goes out before it.',
    'postcode.js:6': 'That line reads the field. The line after it sends the request.'
  },
  otherwise: 'Not that one. Record, type a postcode, Stop: every request under Requests over time links the line that sent it (Sent from).'
}

export const sendsPerKey: DebugPracticeTask = {
  id: 'debugging-practice-sends-per-key',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-26-request-per-key',
  title: 'Click the line that sends a request for every key',
  difficulty: 1,
  minutes: 0.5,
  task: 'Press Record in the Performance panel, type a postcode (`1012`) into the delivery check, then Stop: there is a request per key. Click the line that sends them (a request\'s Sent from, or the line in the editor).',
  sandbox: {
    page: ORDER_PAGE,
    open: 'postcode.js',
    performance: true,
    probes: [],
    find: SENDS_PER_KEY,
    backend: { routes: [{ path: '/api/delivery', respond: { status: 200, json: { delivers: true }, delay: 80 } }] }
  },
  setup: site({ 'app.js': '// The order page: the delivery check.\nimport \'./postcode.js\'\n', 'postcode.js': POSTCODE, 'style.css': SEARCH_STYLE }, {
    main: ['<label class="search">Delivery to your postcode <input id="postcode" autocomplete="postal-code"></label>', '<p class="note" id="delivery" role="status"></p>']
  }, NO_SHOP),
  goals: [foundGoal('You found the line that sends a request for every key', SENDS_PER_KEY)],
  hints: ['Each request\'s Sent from is `postcode.js:7`, the `fetch` in `checkPostcode`; line 12 runs it on every `input` event, every key. Either line answers.'],
  why: 'Sent from names the line that called `fetch`; the listener that calls it on every `input` is why there is one per key.',
  solution: [{ pick: 'postcode.js', line: 7 }]
}

// --- 6.1: Check the voucher once (quick fix) ----------------------------------------------------------------------

const VOUCHER = `// Vouchers (Maya): the server knows which codes are valid, and for how much.
const field = document.querySelector('#voucher')
const message = document.querySelector('#voucher-message')

async function checkVoucher() {
  const code = field.value.trim().toUpperCase()
  const response = await fetch(\`/api/vouchers?code=\${encodeURIComponent(code)}\`)
  const voucher = await response.json()
  message.textContent = voucher.valid ? \`\${code}: \${voucher.percent}% off\` : \`\${code} is not a voucher we know.\`
}

field.addEventListener('input', checkVoucher)
`

export const VOUCHER_TEXT = 'SUMMER10: 10% off'
export const SHORT_VOUCHER_TEXT = 'CAKE5: 5% off'

export const checkOnce: DebugPracticeTask = {
  id: 'debugging-practice-check-once',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-26-request-per-key',
  title: 'Check the voucher once',
  difficulty: 1,
  minutes: 0.5,
  task: 'Typing the voucher `summer10` asks the server eight times. Make it ask once the customer is done (Enter, or leaving the field), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'voucher.js',
    performance: true,
    probes: [
      { id: 'requests', steps: [...typesWord('#voucher', 'summer10'), { requests: 'GET /api/vouchers' }] },
      { id: 'message', steps: [{ text: '#voucher-message' }] },
      // a guard: a short voucher still works (checking only from eight letters on is no fix)
      { id: 'short', steps: [{ type: '#voucher', value: '' }, ...typesWord('#voucher', 'cake5'), { text: '#voucher-message' }] }
    ],
    backend: {
      routes: [
        { path: '/api/vouchers', query: '^code=SUMMER10$', respond: { status: 200, json: { valid: true, percent: 10 }, delay: 100 } },
        { path: '/api/vouchers', query: '^code=CAKE5$', respond: { status: 200, json: { valid: true, percent: 5 }, delay: 100 } },
        { path: '/api/vouchers', respond: { status: 200, json: { valid: false }, delay: 100 } }
      ]
    }
  },
  setup: site({ 'app.js': '// The order page: the voucher field.\nimport \'./voucher.js\'\n', 'voucher.js': VOUCHER, 'style.css': SEARCH_STYLE }, {
    main: ['<label class="search">Voucher <input id="voucher" autocomplete="off"></label>', '<p class="note" id="voucher-message" role="status"></p>']
  }, NO_SHOP),
  goals: [probesGoal('once', `Typing “summer10” and Enter asks the server at most once, and it says “${VOUCHER_TEXT}”; “cake5” still says “${SHORT_VOUCHER_TEXT}”`, { requests: { atMost: 1 }, message: VOUCHER_TEXT, short: SHORT_VOUCHER_TEXT })],
  hints: ['Line 12 checks on every `input` event, every key. Listen for `change` instead: it comes once, when the customer presses Enter or leaves the field.'],
  why: '`input` fires on every key, `change` once the customer is done with the field; a debounce would work too.',
  solution: [{ save: 'voucher.js', replace: ['field.addEventListener(\'input\', checkVoucher)', 'field.addEventListener(\'change\', checkVoucher)'] }, 'reload']
}

// --- 6.2: Click the function that draws all seven days again (find) -----------------------------------------------

const DAYS = `// Pickup days (Maya): the next seven days as buttons; the chosen one is marked.
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const box = document.querySelector('#days')
const chosenText = document.querySelector('#chosen')
let chosen = 'Mon'

function drawDays() {
  box.innerHTML = days.map(day => \`<button class="action\${day === chosen ? ' chosen' : ''}" type="button" data-day="\${day}">\${day}</button>\`).join(' ')
}

function showChosen() {
  chosenText.textContent = \`Pick up on \${chosen}\`
}

box.addEventListener('click', (event) => {
  const button = event.target.closest('[data-day]')
  if (!button) return
  chosen = button.dataset.day
  drawDays()
  showChosen()
})

drawDays()
showChosen()
`

const DRAWS_ALL_DAYS: FindTarget = {
  path: 'days.js',
  lines: [7, 8],
  wrong: {
    'days.js:11': '`showChosen` changes one text, 2 nodes. Which function changed 14 nodes for one pick?',
    'days.js:12': 'That line changes one text, 2 nodes. Which function changed 14 nodes for one pick?',
    'days.js:19': 'That line calls it. Click the function itself: its row under Renders, or its line.',
    'days.js:15': 'That is the click handler: everything the pick does starts there. Which function in it draws all seven days?'
  },
  otherwise: 'Not that one. Record, pick a day, Stop, and choose that click under Show: Renders lists the function that changed the most nodes first.'
}

export const drawsAllDays: DebugPracticeTask = {
  id: 'debugging-practice-draws-all-days',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-27-redraws-menu',
  title: 'Click the function that draws all seven days again',
  difficulty: 1,
  minutes: 0.5,
  task: 'Press Record in the Performance panel, pick Friday, then Stop and choose that click under Show. Click the function that draws all seven days again for one pick (its row under Renders, or its line).',
  sandbox: { page: ORDER_PAGE, open: 'days.js', performance: true, probes: [], find: DRAWS_ALL_DAYS },
  setup: site({ 'app.js': '// The order page: the pickup days.\nimport \'./days.js\'\n', 'days.js': DAYS }, { main: ['<p class="days" id="days"></p>', '<p class="note" id="chosen" role="status"></p>'] }, NO_SHOP),
  goals: [foundGoal('You found the function that draws all seven days again', DRAWS_ALL_DAYS)],
  hints: ['Under Renders for the click, `drawDays` (`days.js:7`) changed 14 nodes: seven buttons out, seven in, to move one mark. `showChosen` changed 2.'],
  why: 'A render that changes many nodes for a small change is the one to look at: here seven buttons drawn again to move one mark.',
  solution: [{ pick: 'days.js', line: 7 }]
}

// --- 6.2: Update only the counter (quick fix) ---------------------------------------------------------------------

const COUNTER_APP = `// The order page: today's products and the basket's counter.
import { products } from './products.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')
const badge = document.querySelector('#cart-count')
const cart = { items: [] }

function renderBadge() {
  badge.textContent = String(cart.items.length)
}

function renderPage() {
  list.innerHTML = products.map(product => \`<li class="product" data-id="\${product.id}"><span class="photo" aria-hidden="true"></span><span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span><button class="add" type="button">Add</button></li>\`).join('')
  renderBadge()
}

list.addEventListener('click', (event) => {
  if (!event.target.closest('.add')) return
  cart.items.push(event.target.closest('.product').dataset.id)
  renderPage()
})

renderPage()
`

export const onlyTheCounter: DebugPracticeTask = {
  id: 'debugging-practice-only-the-counter',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-27-redraws-menu',
  title: 'Update only the counter',
  difficulty: 1,
  minutes: 0.5,
  task: 'Every Add draws all 12 products again, only to count one more in the basket. Make an Add update the counter only (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    performance: true,
    probes: [
      { id: 'list-changes', steps: [{ click: '[data-id="croissant"] .add' }, { wait: 1000 }, { changes: '#products' }] },
      { id: 'badge', steps: [{ click: '[data-id="pain-au-chocolat"] .add' }, { text: '#cart-count' }] },
      { id: 'products', steps: [{ count: '#products .add' }] }
    ]
  },
  setup: site({ 'app.js': COUNTER_APP, 'products.js': productsFile(12) }, {}, ['cart.js']),
  goals: [probesGoal('counter', 'An Add changes nothing in the product list (`#products`), not even a second later, the counter says “2” after two, and all 12 products stay', { 'list-changes': 0, 'badge': '2', 'products': 12 })],
  hints: ['Line 21 calls `renderPage()`, which draws all 12 products again. Call `renderBadge()` there instead: the counter is all that changed.'],
  why: 'Draw only the part whose data changed: one number, not twelve products.',
  solution: [{ save: 'app.js', replace: ['  cart.items.push(event.target.closest(\'.product\').dataset.id)\n  renderPage()', '  cart.items.push(event.target.closest(\'.product\').dataset.id)\n  renderBadge()'] }, 'reload']
}

// --- 6.3: Click the function that does the most work itself (find) ------------------------------------------------

/** One row per product and allergen, from the supplier's sheet (the first 24 products, two or three allergens each). */
const ALLERGEN_NAMES = ['gluten', 'milk', 'eggs', 'nuts', 'sesame', 'soy']
const SHEET = `// The supplier's allergen sheet (Maya copied it in): one row per product and allergen.
export const ALLERGENS = [
${RANGE.slice(0, 24).flatMap(([id], index) => [0, 1, 2].slice(0, 2 + (index % 2)).map(k => `  { product: '${id}', allergen: '${ALLERGEN_NAMES[(index + k * 2) % ALLERGEN_NAMES.length]}' }`)).join(',\n')}
]
`

const ALLERGENS_JS = `// Allergens of a product, from the supplier's sheet.
import { ALLERGENS } from './sheet.js'

export function allergensOf(id) {
  return ALLERGENS.filter(row => row.product === id).map(row => row.allergen)
}
`

const ALLERGEN_APP = `// The allergen list (Maya): every product with what it contains.
import { products } from './products.js'
import { allergensOf } from './allergens.js'

document.querySelector('#products').innerHTML = products.map(product => \`
  <li class="product"><span class="photo" aria-hidden="true"></span>
    <span><span class="name">\${product.name}</span> <span class="note">\${allergensOf(product.id).join(', ')}</span></span></li>\`).join('')
`

const MOST_SELF_WORK: FindTarget = {
  path: 'allergens.js',
  lines: [5],
  wrong: {
    'allergens.js:4': '`allergensOf` has a big total, but most of it is the work of the function it hands to `filter`. Look at the Self column.',
    'app.js:1': 'The top level\'s total has everything in it: all the work happens while the file loads. Self is what a function does itself.',
    'app.js:5': 'That function draws each product\'s row: its total has `allergensOf` in it, but little of the work is its own. Look at the Self column.',
    'app.js:7': 'That line asks for each product\'s allergens, 24 times. Which function does the most work itself, each of those times?'
  },
  otherwise: 'Not that one. Record (the list loads again), Stop, and read the Functions\' Self column: the function with the most work of its own.'
}

export const mostSelfWork: DebugPracticeTask = {
  id: 'debugging-practice-most-self-work',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-28-formatted-thousands',
  title: 'Click the function that does the most work itself',
  difficulty: 1,
  minutes: 0.5,
  task: 'The allergen list is slow. Press Record in the Performance panel (it loads again), Stop, and click the function with the most work of its own, Self (its row under Functions, or its line).',
  sandbox: { page: ORDER_PAGE, open: 'allergens.js', performance: true, probes: [], find: MOST_SELF_WORK },
  setup: site({ 'app.js': ALLERGEN_APP, 'allergens.js': ALLERGENS_JS, 'sheet.js': SHEET, 'products.js': productsFile(24) }, {}, ['cart.js', 'money.js']),
  goals: [foundGoal('You found the function that does the most work itself', MOST_SELF_WORK)],
  hints: ['The function on `allergens.js:5` that `filter` calls (`row => row.product === id`) has the most Self: it looks at every row of the sheet for each of the 24 products.'],
  why: 'Self is a function\'s own work; a small callback that runs for every row of a list, for every product, adds up to the most.',
  solution: [{ pick: 'allergens.js', line: 5 }]
}

// --- 6.3: Look prices up in the Map (quick fix) -------------------------------------------------------------------

const ORDER_LINES = RANGE.map(([id], index) => `  { id: '${id}', quantity: ${1 + (index % 3)} }`)

const STANDING_ORDER = `// The café's standing order (Anna): what it takes every morning.
export const order = [
${ORDER_LINES.join(',\n')}
]
`

const TOTAL = `// The standing order's total (Anna), from the till's prices.
import { PRICES } from './catalogue.js'
import { formatPrice } from './money.js'

// Ben: every price by its id, for quick lookups
export const PRICE_BY_ID = new Map(PRICES.map(entry => [entry.id, entry.cents]))

export function orderTotal(lines) {
  let total = 0
  for (const line of lines) {
    const cents = PRICES.find(entry => entry.id === line.id).cents
    total += cents * line.quantity
  }
  return formatPrice(total)
}
`

const TOTAL_APP = `// The café's standing order: its total.
import { order } from './order.js'
import { orderTotal } from './total.js'

document.querySelector('#order-total').textContent = orderTotal(order)
`

/** The standing order's total (each product of the range, one to three of each). */
export const STANDING_TOTAL = `${(RANGE.reduce((sum, [, , price], index) => sum + Math.round(price * 100) * (1 + (index % 3)), 0) / 100).toFixed(2)} €`
/** The most work the total may take (about 1,400 units as written). */
export const STANDING_WORK = 600

export const mapLookup: DebugPracticeTask = {
  id: 'debugging-practice-map-lookup',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-28-formatted-thousands',
  title: 'Look prices up in the Map',
  difficulty: 1,
  minutes: 0.5,
  task: `For each of the order's 48 lines, \`find\` walks through the price list. Ben made a \`Map\` for that: use it (one line), so the total takes at most ${STANDING_WORK} units of work. Save and Reload.`,
  sandbox: {
    page: ORDER_PAGE,
    open: 'total.js',
    performance: true,
    probes: [
      { id: 'work', steps: [{ work: 'load' }] },
      { id: 'total', steps: [{ text: '#order-total' }] }
    ]
  },
  setup: site({ 'app.js': TOTAL_APP, 'total.js': TOTAL, 'order.js': STANDING_ORDER, 'catalogue.js': CATALOGUE, 'money.js': MONEY_CENTS }, { main: ['<p>Standing order: <strong id="order-total"></strong></p>'] }, ['products.js', 'cart.js']),
  goals: [probesGoal('map', `The total takes at most ${STANDING_WORK} units of work, and it is still “${STANDING_TOTAL}”`, { work: { atMost: STANDING_WORK }, total: STANDING_TOTAL })],
  hints: ['Line 11 walks through `PRICES` for every line of the order. `const cents = PRICE_BY_ID.get(line.id)` finds it in one step.'],
  why: 'A lookup by id in a `Map` is one step; `find` in a list looks at entry after entry, for every line.',
  solution: [{ save: 'total.js', replace: ['    const cents = PRICES.find(entry => entry.id === line.id).cents', '    const cents = PRICE_BY_ID.get(line.id)'] }, 'reload']
}

// --- 6.4: Click the line the next request waits for (find) --------------------------------------------------------

const CAKES = `// Cake orders (Ben): the cakes, and tomorrow's free pickup slots, from the server.
export async function loadCakePage() {
  const cakes = await (await fetch('/api/cakes')).json()
  const slots = await (await fetch('/api/slots')).json()
  document.querySelector('#cakes').textContent = cakes.map(cake => cake.name).join(', ')
  document.querySelector('#slots').textContent = \`Free tomorrow: \${slots.join(', ')}\`
}
`

const CAKE_ROUTES: BackendRoute[] = [
  { path: '/api/cakes', respond: { status: 200, json: [{ name: 'Plum cake' }, { name: 'Carrot cake' }, { name: 'Cheesecake' }], delay: 300 } },
  { path: '/api/slots', respond: { status: 200, json: ['9:00', '11:30', '15:00'], delay: 200 } }
]

const CAKE_PAGE = { main: ['<section class="box" aria-label="Cakes">', '  <h2>Cakes to order</h2>', '  <p id="cakes" class="note">Loading…</p>', '  <p id="slots" class="note"></p>', '</section>'] }

const WAITED_FOR: FindTarget = {
  path: 'cakes.js',
  lines: [3],
  wrong: {
    'cakes.js:4': 'That request is the one that waits: it only goes out once the line before it has its answer. Which line does it wait for?',
    'cakes.js:5': 'That line shows the cakes, once both answers are in. Which request does the second one wait for?'
  },
  otherwise: 'Not that one. Record, Stop, and look at the requests over time: one is sent once the other answered. Click the line of the one it waits for (its Sent from).'
}

export const waitsFirst: DebugPracticeTask = {
  id: 'debugging-practice-waits-first',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-29-one-after-another',
  title: 'Click the line the next request waits for',
  difficulty: 1,
  minutes: 0.5,
  task: 'Press Record in the Performance panel (the page loads again), then Stop: one request is sent only once the other answered. Click the line it waits for (that request\'s Sent from, or the line in the editor).',
  sandbox: { page: ORDER_PAGE, open: 'cakes.js', performance: true, probes: [], find: WAITED_FOR, backend: { routes: CAKE_ROUTES } },
  setup: site({ 'app.js': '// The cake page.\nimport { loadCakePage } from \'./cakes.js\'\n\nloadCakePage()\n', 'cakes.js': CAKES }, CAKE_PAGE, NO_SHOP),
  goals: [foundGoal('You found the line the next request waits for', WAITED_FOR)],
  hints: ['`slots` is sent once `cakes` answered: the `await` on `cakes.js:3` holds line 4 back until the cakes are in.'],
  why: 'An `await` holds back everything after it; a request after it waits for the answer before it, needed or not.',
  solution: [{ pick: 'cakes.js', line: 3 }]
}

// --- 6.4: Load both at once (quick fix) ---------------------------------------------------------------------------

const BREADS = `// The bread page (Maya): today's breads, and how many are left, from the server.
async function getJson(path) {
  const response = await fetch(path)
  return response.json()
}

export async function loadBreadPage() {
  const breads = await getJson('/api/breads')
  const stock = await getJson('/api/stock')
  document.querySelector('#breads').textContent = breads.map(bread => \`\${bread.name} (\${stock[bread.id]} left)\`).join(', ')
}
`

export const BREADS_TEXT = 'Sourdough loaf (4 left), Rye with seeds (7 left)'

export const bothAtOnce: DebugPracticeTask = {
  id: 'debugging-practice-both-at-once',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-29-one-after-another',
  title: 'Load both at once',
  difficulty: 1,
  minutes: 0.5,
  task: 'The bread page waits for the breads (300 ms), then asks how many are left (200 ms). Ask for both at once with `Promise.all`, so it waits at most 300 ms, Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'breads.js',
    performance: true,
    probes: [
      { id: 'waited', steps: [{ waited: 'load' }] },
      { id: 'breads', steps: [{ text: '#breads' }] },
      // guards: both still come from the server (an answer written into the code is no request)
      { id: 'breads-requests', steps: [{ requests: 'GET /api/breads' }] },
      { id: 'stock-requests', steps: [{ requests: 'GET /api/stock' }] }
    ],
    backend: {
      routes: [
        { path: '/api/breads', respond: { status: 200, json: [{ id: 'sourdough', name: 'Sourdough loaf' }, { id: 'rye', name: 'Rye with seeds' }], delay: 300 } },
        { path: '/api/stock', respond: { status: 200, json: { sourdough: 4, rye: 7 }, delay: 200 } }
      ]
    }
  },
  setup: site({ 'app.js': '// The bread page.\nimport { loadBreadPage } from \'./breads.js\'\n\nloadBreadPage()\n', 'breads.js': BREADS }, { main: ['<p id="breads" class="note">Loading…</p>'] }, NO_SHOP),
  goals: [probesGoal('at-once', `The breads show after at most 300 ms of server time (now 500 ms): “${BREADS_TEXT}”, both still asked from the server once`, { 'waited': { atMost: 300 }, 'breads': BREADS_TEXT, 'breads-requests': 1, 'stock-requests': 1 })],
  hints: ['Replace lines 8 and 9 with `const [breads, stock] = await Promise.all([getJson(\'/api/breads\'), getJson(\'/api/stock\')])`: both go out at once.'],
  why: 'Two requests that don\'t need each other\'s answer can be on their way together; `Promise.all` waits for both.',
  solution: [{ save: 'breads.js', replace: ['  const breads = await getJson(\'/api/breads\')\n  const stock = await getJson(\'/api/stock\')\n', '  const [breads, stock] = await Promise.all([getJson(\'/api/breads\'), getJson(\'/api/stock\')])\n'] }, 'reload']
}

// --- 6.5: Click the line that asks for the hours again (find) -----------------------------------------------------

const HOURS = `// Opening hours (Maya): shown and hidden again when the customer taps "Opening hours".
const box = document.querySelector('#hours')

async function toggleHours() {
  const hours = await (await fetch('/api/hours')).json()
  box.textContent = \`Mon–Fri \${hours.weekdays} · Sat \${hours.saturday}\`
  box.hidden = !box.hidden
}

document.querySelector('#hours-button').addEventListener('click', toggleHours)
`

const ASKS_AGAIN: FindTarget = {
  path: 'hours.js',
  lines: [5],
  wrong: {
    'hours.js:10': 'That line runs `toggleHours` on each tap, which is what a tap should do. What it should not do every time happens inside it.',
    'hours.js:6': 'That line shows the hours, once they are back. The request goes out before it.',
    'hours.js:4': 'That is where the work of a tap starts. Which line in it asks the server, every tap?'
  },
  otherwise: 'Not that one. Record, tap Opening hours a few times, Stop: the requests marked “the same request again” link the line that sent them.'
}

export const asksForHoursAgain: DebugPracticeTask = {
  id: 'debugging-practice-asks-for-hours-again',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-30-asks-again',
  title: 'Click the line that asks for the hours again',
  difficulty: 1,
  minutes: 0.5,
  task: 'Press Record in the Performance panel, tap Opening hours three times, then Stop. Click the line that asks the server for the same hours on every tap (a repeated request\'s Sent from, or the line).',
  sandbox: {
    page: ORDER_PAGE,
    open: 'hours.js',
    performance: true,
    probes: [],
    find: ASKS_AGAIN,
    backend: { routes: [{ path: '/api/hours', respond: { status: 200, json: { weekdays: '7:00–18:00', saturday: '7:00–13:00' }, delay: 150 } }] }
  },
  setup: site({ 'app.js': '// The order page: the opening hours.\nimport \'./hours.js\'\n', 'hours.js': HOURS }, {
    header: ['<button class="action" id="hours-button" type="button">Opening hours</button>', '<p class="hours" id="hours" hidden></p>']
  }, NO_SHOP),
  goals: [foundGoal('You found the line that asks for the hours again', ASKS_AGAIN)],
  hints: ['Every tap\'s `GET hours` is sent from `hours.js:5`; from the second tap on, the panel marks it as the same request again.'],
  why: 'A request the page already made, made again, is the one to keep: the Performance panel marks it, Sent from names its line.',
  solution: [{ pick: 'hours.js', line: 5 }]
}

// --- 6.5: Keep the answer (quick fix) -----------------------------------------------------------------------------

const STAMPS = `// The coffee card (Jonas): the customer's stamps, from the server, shown on a tap.
const box = document.querySelector('#stamps')
let card = null

async function showStamps() {
  card = await (await fetch('/api/stamps')).json()
  box.textContent = \`\${card.stamps} of 10 stamps\`
}

document.querySelector('#stamps-button').addEventListener('click', showStamps)
`

export const STAMPS_TEXT = '7 of 10 stamps'

export const keepTheAnswer: DebugPracticeTask = {
  id: 'debugging-practice-keep-the-answer',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-30-asks-again',
  title: 'Keep the answer',
  difficulty: 1,
  minutes: 0.5,
  task: 'Every tap on My stamps asks the server again, though `card` could keep the answer. Make it ask only the first time (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'stamps.js',
    performance: true,
    probes: [
      { id: 'requests', steps: [{ click: '#stamps-button' }, { click: '#stamps-button' }, { click: '#stamps-button' }, { requests: 'GET /api/stamps' }] },
      { id: 'stamps', steps: [{ text: '#stamps' }] }
    ],
    backend: { routes: [{ path: '/api/stamps', respond: { status: 200, json: { stamps: 7 }, delay: 150 } }] }
  },
  setup: site({ 'app.js': '// The order page: the coffee card.\nimport \'./stamps.js\'\n', 'stamps.js': STAMPS }, {
    main: ['<button class="action" id="stamps-button" type="button">My stamps</button>', '<p class="note" id="stamps" role="status"></p>']
  }, NO_SHOP),
  goals: [probesGoal('once', `Three taps ask the server once, and the card still says “${STAMPS_TEXT}”`, { requests: 1, stamps: STAMPS_TEXT })],
  hints: ['Line 6 asks every time, though `card` keeps the answer. `card ??= await (await fetch(\'/api/stamps\')).json()` asks only while `card` is still `null`.'],
  why: '`??=` assigns only when the variable is still null or undefined, so the request runs once and later taps use the kept answer.',
  solution: [{ save: 'stamps.js', replace: ['  card = await (await fetch', '  card ??= await (await fetch'] }, 'reload']
}
