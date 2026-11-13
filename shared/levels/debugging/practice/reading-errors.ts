// Reading errors: the practice tasks, two kinds (ADR 0007): find (click the right line in the editor or the right frame
// in a trace; a wrong click says why it isn't that one) and quick fix (one line). Each trains the scenario before it,
// in a small app of its own (chapter preview: .impeccable/mocks/previews/debugging-preview.html).
import { ORDER_PAGE, orderSite } from '../bakery'
import { foundGoal, noErrorsGoal, probeGoal } from '../checks'
import type { DebugPracticeTask, FindTarget } from '../types'

const site = (files: Record<string, string>, page?: Parameters<typeof orderSite>[1]) => () => ({ files: orderSite(files, page), observed: null, picked: null })

// --- 1.1: Click the line that throws (find) -------------------------------------------------------------------------

const SPECIALS = `// Today's specials. Ben writes them on the board in the morning and types them in
// here; a special without a price means "ask in the shop".

export const specials = [
  { name: 'Apricot danish', price: { amount: 3.2 } },
  { name: 'Rye with seeds', price: { amount: 4.9 } },
  { name: 'Birthday cake (to order)' }
]

function specialText(special) {
  return special.name + ' · ' + special.price.amount.toFixed(2)
}

export function renderSpecials(list) {
  for (const special of specials) {
    const item = document.createElement('li')
    item.textContent = specialText(special)
    list.append(item)
  }
}
`

const SPECIALS_APP = `// The order page: today's specials first, then the products.
import { products } from './products.js'
import { renderSpecials } from './specials.js'
import { formatPrice } from './money.js'

renderSpecials(document.querySelector('#specials'))

const list = document.querySelector('#products')
for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.textContent = product.name + ' · ' + formatPrice(product.price)
  list.append(item)
}
`

const LINE_THAT_THROWS: FindTarget = {
  path: 'specials.js',
  lines: [11],
  wrong: {
    'specials.js:17': 'That line calls `specialText`, and the error happens inside it. The top frame is the line that throws.',
    'specials.js:7': 'That\'s why it throws (this special has no price), but not where. Look for the line in the top frame.',
    'app.js:6': 'That\'s where the page starts drawing the specials. The error happens deeper: start at the top frame.'
  },
  otherwise: 'Not that one. The top frame, the first `at` line under the red message, names the file and line that throws.'
}

export const lineThatThrows: DebugPracticeTask = {
  id: 'debugging-practice-line-that-throws',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-01-add-to-cart',
  title: 'Click the line that throws',
  difficulty: 1,
  minutes: 0.5,
  task: 'The order page logs a red error as soon as it opens. Click the line that throws: its frame in the Console, or the line in the editor.',
  sandbox: { page: ORDER_PAGE, open: 'app.js', probes: [], find: LINE_THAT_THROWS },
  setup: site({ 'app.js': SPECIALS_APP, 'specials.js': SPECIALS }, { main: ['<h2>Today\'s specials</h2>', '<ul id="specials" class="list"></ul>'] }),
  goals: [foundGoal('You found the line that throws', LINE_THAT_THROWS)],
  hints: ['The top frame, the first `at` line under the red message, is the line that throws: `specials.js:11`.'],
  why: 'The top frame of a trace is the line that threw; each frame below it is the line that called the one above.',
  solution: [{ pick: 'specials.js', line: 11 }]
}

// --- 1.1: Fix the misspelled property (quick fix) -------------------------------------------------------------------

const MISSPELLED_CART = `// The basket: what the customer picked, and the counter in the header.
const badge = document.querySelector('#cart-count')

export const cart = { items: [] }

export function renderBadge() {
  badge.textContent = String(cart.itesm.length)
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  renderBadge()
}
`

export const misspelledProperty: DebugPracticeTask = {
  id: 'debugging-practice-misspelled-property',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-01-add-to-cart',
  title: 'Fix the misspelled property',
  difficulty: 1,
  minutes: 0.5,
  task: 'The basket counter in the header stays empty, and the Console shows an error as the page opens. Fix the misspelled property (one line), Save and Reload.',
  sandbox: { page: ORDER_PAGE, open: 'cart.js', probes: [{ id: 'badge', steps: [{ text: '#cart-count' }] }] },
  setup: site({ 'cart.js': MISSPELLED_CART }),
  goals: [probeGoal('badge', 'The basket counter shows 0 after a reload', 'badge', '0'), noErrorsGoal()],
  hints: ['The error is about reading `length`, so the thing before it is undefined: line 7 of `cart.js` says `cart.itesm`. Make it `cart.items`.'],
  why: 'A misspelled property is just undefined; the error only comes one step later, from what is read or called on it.',
  solution: [{ save: 'cart.js', replace: ['cart.itesm.length', 'cart.items.length'] }, 'reload']
}

// --- 1.2: Import the right name (quick fix) -------------------------------------------------------------------------

const RENAMED_APP = `// The order page: draws today's products and wires up the Add buttons.
import { products } from './products.js'
import { addToCart, renderBadge } from './cart.js'
import { formatEuro } from './money.js'

const list = document.querySelector('#products')

for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.dataset.id = product.id
  item.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span><span class="name">\${product.name}</span> <span class="price">\${formatEuro(product.price)}</span></span>
    <button class="add" type="button">Add</button>\`
  item.querySelector('.add').addEventListener('click', () => addToCart(product))
  list.append(item)
}

renderBadge()
`

export const importRightName: DebugPracticeTask = {
  id: 'debugging-practice-import-right-name',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-02-prices-vanished',
  title: 'Import the right name',
  difficulty: 1,
  minutes: 0.5,
  task: 'Jonas renamed `formatEuro` to `formatPrice` in `money.js`, and now no products show. Fix the import in `app.js` (one line) so they are back with their prices. Save and Reload.',
  sandbox: { page: ORDER_PAGE, open: 'app.js', probes: [{ id: 'croissant-price', steps: [{ text: '[data-id="croissant"] .price' }] }] },
  setup: site({ 'app.js': RENAMED_APP }),
  goals: [probeGoal('prices', 'The products show with their prices (Butter croissant: 2.40)', 'croissant-price', '2.40'), noErrorsGoal()],
  hints: ['`money.js` no longer exports `formatEuro`. Import the new name under the old one on line 4: `import { formatPrice as formatEuro } from \'./money.js\'`.'],
  why: 'A named import must match a name the module exports, or nothing in the module graph runs; `as` keeps the old name in your file.',
  solution: [{ save: 'app.js', replace: ['import { formatEuro } from', 'import { formatPrice as formatEuro } from'] }, 'reload']
}

// --- 1.3: Move the declaration up (quick fix) -----------------------------------------------------------------------

const HOURS_TDZ = `// Opening hours under the title. Maya changes them for holidays.
const hoursText = document.querySelector('#hours')

renderHours()

const hours = { weekdays: '7:00–18:00', saturday: '7:00–13:00' }

function renderHours() {
  hoursText.textContent = 'Mon–Fri ' + hours.weekdays + ' · Sat ' + hours.saturday
}
`

const HOURS_APP = `// The order page: the opening hours, then today's products.
import './hours.js'
import { products } from './products.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')
for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.textContent = product.name + ' · ' + formatPrice(product.price)
  list.append(item)
}
`

export const moveDeclarationUp: DebugPracticeTask = {
  id: 'debugging-practice-move-declaration-up',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-03-total-not-defined',
  title: 'Move the declaration up',
  difficulty: 1,
  minutes: 0.5,
  task: 'The opening hours under the title are missing, and the Console says why. Move one line in `hours.js` so they show again. Save and Reload.',
  sandbox: { page: ORDER_PAGE, open: 'hours.js', probes: [{ id: 'hours', steps: [{ text: '#hours' }] }] },
  setup: site({ 'app.js': HOURS_APP, 'hours.js': HOURS_TDZ }, { header: ['<p id="hours" class="hours"></p>'] }),
  goals: [probeGoal('hours', 'The opening hours show under the title', 'hours', 'Mon–Fri 7:00–18:00 · Sat 7:00–13:00'), noErrorsGoal()],
  hints: ['`renderHours()` on line 4 reads `hours` before line 6 declares it. Move the `const hours = ...` line above `renderHours()`.'],
  why: '`const` and `let` exist only from the line that declares them; using them earlier throws “Cannot access … before initialization”.',
  solution: [{
    save: 'hours.js',
    replace: ['renderHours()\n\nconst hours = { weekdays: \'7:00–18:00\', saturday: \'7:00–13:00\' }\n', 'const hours = { weekdays: \'7:00–18:00\', saturday: \'7:00–13:00\' }\n\nrenderHours()\n']
  }, 'reload']
}

// --- 1.4: Click the frame that passed the wrong value (find) --------------------------------------------------------

const UNITS = `// Weights for the bread list: grams in, "750 g" or "1.2 kg" out.
export function formatWeight(grams) {
  if (grams >= 1000) return (grams / 1000).toFixed(1) + ' kg'
  return grams.toFixed(0) + ' g'
}
`

const BREADS = `// The bread list: each loaf with its weight.
import { formatWeight } from './units.js'

export const loaves = [
  { name: 'Sourdough loaf', grams: 750 },
  { name: 'Rye with seeds', grams: 1200 }
]

export function loafText(loaf) {
  return loaf.name + ', ' + formatWeight(loaf)
}
`

const BREADS_APP = `// The bread page: every loaf with its weight.
import { loaves, loafText } from './breads.js'

const list = document.querySelector('#breads')

for (const loaf of loaves) {
  const item = document.createElement('li')
  item.textContent = loafText(loaf)
  list.append(item)
}
`

const FRAME_THAT_PASSED: FindTarget = {
  path: 'breads.js',
  lines: [10],
  wrong: {
    'units.js:4': 'That\'s where it broke: `formatWeight` can\'t format what it was given. Which frame handed it that value? One frame down.',
    'units.js:3': 'That line is fine for any number of grams. The value it got was not a number: look one frame down in the trace.',
    'app.js:8': 'That line hands a loaf to `loafText`, which is what `loafText` wants. The wrong value is passed on one frame higher.'
  },
  otherwise: 'Not that one. Read the trace from the top: the frame right below the top one is the line that called it.'
}

export const frameThatPassed: DebugPracticeTask = {
  id: 'debugging-practice-frame-that-passed',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-04-error-in-money',
  title: 'Click the frame that passed the wrong value',
  difficulty: 1,
  minutes: 0.5,
  task: 'The bread list throws as the page opens. `formatWeight` in `units.js` is fine; it was handed the wrong value. Click the frame (or the line) that passed it.',
  sandbox: { page: ORDER_PAGE, open: 'units.js', probes: [], find: FRAME_THAT_PASSED },
  setup: site({ 'app.js': BREADS_APP, 'breads.js': BREADS, 'units.js': UNITS }, { main: ['<h2>Bread by weight</h2>', '<ul id="breads" class="list"></ul>'] }),
  goals: [foundGoal('You found the frame that passed the wrong value', FRAME_THAT_PASSED)],
  hints: ['The top frame is `formatWeight`, where it broke. The frame below it, `loafText` in `breads.js:10`, called it with the whole loaf instead of its grams.'],
  why: 'The frame below the top one is the call that handed the value over; that is where a wrong value usually comes from.',
  solution: [{ pick: 'breads.js', line: 10 }]
}

// --- 1.4: Which file and line? Read a three-frame trace (find) -------------------------------------------------------

const SLOTS = `// Pickup slot times as text: { hour: 7, minute: 30 } is "7:30".
export function slotText(slot) {
  return slot.hour + ':' + String(slot.minute).padStart(2, '0')
}
`

const PICKUP = `// The pickup box: confirms the first free slot tomorrow.
import { slotText } from './slots.js'

const message = document.querySelector('#pickup-message')

export function confirmPickup(slots) {
  const first = slots.find(slot => slot.free)
  message.textContent = 'See you tomorrow at ' + slotText(first)
}
`

const PICKUP_APP = `// The order page: the pickup box under the products.
import { confirmPickup } from './pickup.js'

// Tomorrow's pickup slots; Maya marks the full ones every evening.
const slots = [
  { hour: 7, minute: 0, free: false },
  { hour: 7, minute: 30, free: false },
  { hour: 8, minute: 0, free: false }
]

document.querySelector('#pickup').addEventListener('click', () => {
  confirmPickup(slots)
})
`

const THREE_FRAMES: FindTarget = {
  path: 'app.js',
  lines: [12, 11],
  wrong: {
    'slots.js:3': 'That\'s the top frame: where it broke, the last thing that ran. Your click came in at the other end of the trace.',
    'pickup.js:8': 'That\'s the middle frame. It was called by the frame below it: keep going down.',
    'pickup.js:7': 'That line finds no free slot, which is why it breaks later, but your click was handled before it ran.'
  },
  otherwise: 'Not one of the three frames. They are listed top to bottom: where it broke first, where it all started last.'
}

export const threeFrameTrace: DebugPracticeTask = {
  id: 'debugging-practice-three-frame-trace',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-04-error-in-money',
  title: 'Which file and line? Read a three-frame trace',
  difficulty: 1,
  minutes: 0.5,
  task: 'Click Pick up tomorrow in the app: the Console shows a trace with three frames. Ben asks where your click was handled. Click that frame (or its line).',
  sandbox: { page: ORDER_PAGE, open: 'pickup.js', probes: [], find: THREE_FRAMES },
  setup: site({ 'app.js': PICKUP_APP, 'pickup.js': PICKUP, 'slots.js': SLOTS }, {
    main: ['<section class="box" aria-label="Pickup">', '  <button class="action" id="pickup" type="button">Pick up tomorrow</button>', '  <p id="pickup-message" class="note"></p>', '</section>']
  }),
  goals: [foundGoal('You found the frame that handled your click', THREE_FRAMES)],
  hints: ['A trace lists the frames from where it broke (top) to where it started (bottom). Your click was handled in the bottom one: `app.js:12`.'],
  why: 'A trace is the call chain upside down: the top frame ran last, the bottom frame (here your click handler) started it all.',
  solution: [{ pick: 'app.js', line: 12 }]
}

// --- 1.5: Click the line with the real mistake (find) ---------------------------------------------------------------

const HOURS_UNCLOSED = `// Opening hours, shown under the title. Maya changes them for holidays.
export const hours = {
  weekdays: '7:00–18:00',
  saturday: '7:00–13:00',
  sunday: 'closed'

export function hoursText() {
  return 'Mon–Fri ' + hours.weekdays + ' · Sat ' + hours.saturday + ' · Sun ' + hours.sunday
}
`

const HOURS_TEXT_APP = `// The order page: the opening hours under the title.
import { hoursText } from './hours.js'

document.querySelector('#hours').textContent = hoursText()
`

const REAL_MISTAKE: FindTarget = {
  path: 'hours.js',
  lines: [5, 6],
  wrong: {
    'hours.js:7': 'That\'s where the browser noticed: it expected the hours object to end before this `export`. The mistake is just above.',
    'hours.js:2': 'That `{` is right: it opens the hours. Where should it be closed?'
  },
  otherwise: 'Not that one. The error\'s line is where the browser gave up; the mistake is a little above it.'
}

export const realMistake: DebugPracticeTask = {
  id: 'debugging-practice-real-mistake',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-05-blank-page',
  title: 'Click the line with the real mistake',
  difficulty: 1,
  minutes: 0.5,
  task: 'The page broke when Maya added Sunday to the opening hours. Click the line with the real mistake: not where the error points, but where the code went wrong.',
  sandbox: { page: ORDER_PAGE, open: 'hours.js', probes: [], find: REAL_MISTAKE },
  setup: site({ 'app.js': HOURS_TEXT_APP, 'hours.js': HOURS_UNCLOSED }, { header: ['<p id="hours" class="hours"></p>'] }),
  goals: [foundGoal('You found the line with the real mistake', REAL_MISTAKE)],
  hints: ['The error points at the `export` on line 7. Just above it, the hours object never gets its closing `}`: it belongs after `sunday: \'closed\'` (line 5).'],
  why: 'A syntax error is reported where the browser gave up; the missing bracket is usually just above that line.',
  solution: [{ pick: 'hours.js', line: 5 }]
}

// --- 1.5: Close the open bracket (quick fix) ------------------------------------------------------------------------

const UNCLOSED_CART = `// The basket: what the customer picked, and the counter in the header.
const badge = document.querySelector('#cart-count')

export const cart = { items: [] }

// called by the Add buttons (app.js)
export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  renderBadge()

export function renderBadge() {
  badge.textContent = String(cart.items.length)
}
`

export const closeTheBracket: DebugPracticeTask = {
  id: 'debugging-practice-close-the-bracket',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-05-blank-page',
  title: 'Close the open bracket',
  difficulty: 1,
  minutes: 0.5,
  task: 'Since the last change the order page shows no products, and the Console points at `cart.js`. Add the one missing bracket, Save and Reload.',
  sandbox: { page: ORDER_PAGE, open: 'app.js', probes: [{ id: 'rows', steps: [{ count: '.product' }] }] },
  setup: site({ 'cart.js': UNCLOSED_CART }),
  goals: [probeGoal('rows', 'The three products show again', 'rows', 3), noErrorsGoal()],
  hints: ['`addToCart` never closes, so the browser stops at the next `export`. Add a line with `}` after `renderBadge()` (line 9 of `cart.js`).'],
  why: 'An unclosed `{` makes the browser read on into the next function; it reports the first line that can\'t be there, just after the real mistake.',
  solution: [{ save: 'cart.js', replace: ['  renderBadge()\n\nexport function renderBadge', '  renderBadge()\n}\n\nexport function renderBadge'] }, 'reload']
}
