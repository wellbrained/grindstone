// Breakpoints & stepping: the practice tasks, the two kinds of the earlier chapters (ADR 0007): find (click the right
// line, in the editor, in the Debugger's Call stack or with its Answer button at a recorded step; a wrong click says why
// it isn't that one) and quick fix (one line). Each trains the scenario before it, in a small app of its own; nothing is
// red in any of them, so the Debugger's recording is where the answer shows.
import { ORDER_PAGE, orderSite } from '../bakery'
import { foundGoal, probeGoal, probesGoal } from '../checks'
import type { OrderPageOptions } from '../bakery'
import type { DebugPracticeTask, FindTarget } from '../types'

/** A practice app: the order page with the task's files, without the shared ones it does not use. */
const site = (files: Record<string, string>, page: OrderPageOptions = {}, omit: readonly string[] = []) => () => ({ files: orderSite(files, page, omit), observed: null, picked: null })

/** The shared files a practice app without products or a basket leaves out. */
const NO_SHOP = ['products.js', 'cart.js', 'money.js']

// --- 5.1: Click the line that calls it a second time (find) --------------------------------------------------------

const GREETING = `// The welcome line above the products (Maya changes it with the seasons).
export function showWelcome() {
  const line = document.createElement('p')
  line.className = 'note'
  line.textContent = 'Good morning! Croissants are warm until 11:00.'
  document.querySelector('#welcome').append(line)
}
`

const MENU = `// Today's products, each with its price.
import { products } from './products.js'
import { formatPrice } from './money.js'
import { showWelcome } from './greeting.js'

export function showMenu() {
  const list = document.querySelector('#products')
  for (const product of products) {
    const item = document.createElement('li')
    item.className = 'product'
    item.innerHTML = \`<span class="photo" aria-hidden="true"></span><span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span>\`
    list.append(item)
  }
  showWelcome()
}
`

const WELCOME_APP = `// The order page: the welcome line, then today's products.
import { showWelcome } from './greeting.js'
import { showMenu } from './menu.js'

showWelcome()
showMenu()
`

const SECOND_CALLER: FindTarget = {
  path: 'menu.js',
  lines: [14],
  wrong: {
    'app.js:5': 'That is the first call: the page starts with it. Which line calls `showWelcome` again?',
    'app.js:6': 'That line calls `showMenu`, not `showWelcome`. Which line inside `showMenu` calls it?',
    'greeting.js:5': 'That line is inside `showWelcome`. One frame down the Call stack is who called it the second time.',
    'greeting.js:6': 'That line is inside `showWelcome`. One frame down the Call stack is who called it the second time.'
  },
  otherwise: 'Not that one. Put a breakpoint inside `showWelcome`, Record, Stop and Resume to its second stop: the frame under it in the Call stack is the line.'
}

export const secondCaller: DebugPracticeTask = {
  id: 'debugging-practice-second-caller',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-21-discount-twice',
  title: 'Click the line that calls it a second time',
  difficulty: 1,
  minutes: 0.5,
  task: 'The welcome line shows twice. Put a breakpoint inside `showWelcome`, Record, Stop, and click the line that calls it the second time (in the Call stack or the editor).',
  sandbox: { page: ORDER_PAGE, open: 'greeting.js', debugger: true, probes: [], find: SECOND_CALLER },
  setup: site({ 'app.js': WELCOME_APP, 'greeting.js': GREETING, 'menu.js': MENU }, { header: ['<div id="welcome"></div>'] }, ['cart.js']),
  goals: [foundGoal('You found the line that calls it the second time', SECOND_CALLER)],
  hints: ['Resume (F8) to the breakpoint\'s second stop: the Call stack says `showMenu` at `menu.js:14`. That call is the extra one; `app.js:5` was the first.'],
  why: 'At each stop of a breakpoint the Call stack names who called the function that time, so a call too many shows its line.',
  solution: [{ pick: 'menu.js', line: 14 }]
}

// --- 5.1: Count each stamp once (quick fix) ------------------------------------------------------------------------

const STAMPS = `// The coffee card: one stamp per order, the tenth coffee is free.
export const card = { stamps: 0 }

export function addStamp() {
  card.stamps += 1
  document.querySelector('#stamps').textContent = \`\${card.stamps} of 10 stamps\`
}
`

const STAMP_ORDER = `// Ordering: the kitchen gets the basket, the customer a stamp (Ben).
import { addStamp } from './stamps.js'

export function placeOrder() {
  document.querySelector('#order-status').textContent = 'Thanks! Your order is in.'
  addStamp()
}
`

const STAMP_APP = `// The order page: Order sends the basket and stamps the coffee card.
import { addStamp } from './stamps.js'
import { placeOrder } from './order.js'

document.querySelector('#order').addEventListener('click', () => {
  addStamp()
  placeOrder()
})
`

export const countOnce: DebugPracticeTask = {
  id: 'debugging-practice-count-once',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-21-discount-twice',
  title: 'Count each stamp once',
  difficulty: 1,
  minutes: 0.5,
  task: 'One order gives two stamps on the coffee card. Make one order give one stamp (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    debugger: true,
    probes: [
      { id: 'first', steps: [{ click: '#order' }, { text: '#stamps' }] },
      { id: 'second', steps: [{ click: '#order' }, { text: '#stamps' }] }
    ]
  },
  setup: site({ 'app.js': STAMP_APP, 'stamps.js': STAMPS, 'order.js': STAMP_ORDER }, {
    main: ['<button class="action" id="order" type="button">Order</button>', '<p class="note" id="order-status" role="status"></p>', '<p class="note" id="stamps">0 of 10 stamps</p>']
  }, NO_SHOP),
  goals: [probesGoal('stamps', 'One order gives “1 of 10 stamps”, two give “2 of 10 stamps”', { first: '1 of 10 stamps', second: '2 of 10 stamps' })],
  hints: ['`addStamp` runs twice per order: a breakpoint in it stops under `app.js:6` and again under `placeOrder` (`order.js:6`). Delete one of the two calls, e.g. line 6 of `app.js`.'],
  why: 'When something happens twice, find both callers before you delete one: the Call stack lists them.',
  solution: [{ save: 'app.js', replace: ['  addStamp()\n  placeOrder()', '  placeOrder()'] }, 'reload']
}

// --- 5.2: Click the line where the loop starts in the wrong place (find) -------------------------------------------

const TIMES = `// Tomorrow's pickup times, from the oven plan (Maya).
const times = ['7:00', '7:30', '8:00', '8:30']

export function showTimes() {
  const list = document.querySelector('#times')
  for (let i = 1; i < times.length; i++) {
    const button = document.createElement('button')
    button.className = 'action'
    button.textContent = times[i]
    list.append(button)
  }
}
`

const LOOP_START: FindTarget = {
  path: 'times.js',
  lines: [6],
  wrong: {
    'times.js:2': 'The list has all four times, 7:00 first. Which line decides where the loop starts?',
    'times.js:9': 'That line names each button after `times[i]`: right for every `i` it gets. Which `i` does it never get?',
    'app.js:3': 'That line starts `showTimes`; the mistake is inside it.'
  },
  otherwise: 'Not that one. Step through the loop: what is `i` the first time a button is made?'
}

export const loopStart: DebugPracticeTask = {
  id: 'debugging-practice-loop-start',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-22-misses-last-item',
  title: 'Click the line where the loop starts in the wrong place',
  difficulty: 1,
  minutes: 0.5,
  task: 'The pickup times start at 7:30: the first one, 7:00, is missing. Record, step through the loop in `times.js` and click the line that makes it start in the wrong place.',
  sandbox: { page: ORDER_PAGE, open: 'times.js', debugger: true, probes: [], find: LOOP_START },
  setup: site({ 'app.js': 'import { showTimes } from \'./times.js\'\n\nshowTimes()\n', 'times.js': TIMES }, { main: ['<h2>Pick up tomorrow</h2>', '<p id="times" class="note"></p>'] }, NO_SHOP),
  goals: [foundGoal('You found the line that starts the loop in the wrong place', LOOP_START)],
  hints: ['In the first round of the loop the Scope shows `i: 1`, so `times[0]`, 7:00, is never shown: the `for` on line 6 of `times.js` starts at 1.'],
  why: 'Arrays count from 0: a loop over every item starts at `i = 0`.',
  solution: [{ pick: 'times.js', line: 6 }]
}

// --- 5.2: Drop the extra size (quick fix) --------------------------------------------------------------------------

const SIZES = `// Birthday cake sizes (Maya bakes three).
const sizes = ['Small', 'Medium', 'Large']

export function showSizes() {
  const list = document.querySelector('#sizes')
  for (let i = 0; i <= sizes.length; i++) {
    const button = document.createElement('button')
    button.className = 'action'
    button.textContent = \`\${sizes[i]}\`
    list.append(button)
  }
}
`

export const noExtraSize: DebugPracticeTask = {
  id: 'debugging-practice-no-extra-size',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-22-misses-last-item',
  title: 'Drop the extra size',
  difficulty: 1,
  minutes: 0.5,
  task: 'The cake sizes end with a fourth button that says “undefined”. Make the loop stop after Large (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'sizes.js',
    debugger: true,
    probes: [
      { id: 'count', steps: [{ count: '#sizes button' }] },
      { id: 'last', steps: [{ text: '#sizes button:last-child' }] }
    ]
  },
  setup: site({ 'app.js': 'import { showSizes } from \'./sizes.js\'\n\nshowSizes()\n', 'sizes.js': SIZES }, { main: ['<h2>Birthday cakes</h2>', '<p id="sizes" class="note"></p>'] }, NO_SHOP),
  goals: [probesGoal('sizes', 'Three size buttons, the last one “Large”', { count: 3, last: 'Large' })],
  hints: ['The loop runs while `i <= sizes.length`, so its last round has `i` = 3, and `sizes[3]` is undefined. Line 6 of `sizes.js`: `i < sizes.length`.'],
  why: 'The last index of an array is `length - 1`: loop while `i < length`.',
  solution: [{ save: 'sizes.js', replace: ['i <= sizes.length', 'i < sizes.length'] }, 'reload']
}

// --- 5.3: Click the line that compares what the page rounds (find) -------------------------------------------------

const TIPS = `// The tip jar on the order page: the team shares it on Fridays.
let tips = 0

export function addTip(amount) {
  tips += amount
  document.querySelector('#tips').textContent = \`Tips today: \${tips.toFixed(2)} €\`
  if (tips === 0.3) document.querySelector('#thanks').hidden = false
}
`

const TIPS_APP = `// The order page: two tip buttons.
import { addTip } from './tips.js'

document.querySelector('#tip-10').addEventListener('click', () => addTip(0.1))
document.querySelector('#tip-20').addEventListener('click', () => addTip(0.2))
`

const UNROUNDED: FindTarget = {
  path: 'tips.js',
  lines: [7],
  wrong: {
    'tips.js:5': 'That line adds the tip: 0.1 + 0.2 makes 0.30000000000000004, as floating point sums do. Which line expects exactly 0.3?',
    'tips.js:6': 'That line shows the tips rounded to cents, 0.30, which is why the page looks right. Which line uses the unrounded value?',
    'app.js:5': 'That line gives the right tip, 0.2. Which line then expects the sum to be exactly 0.3?'
  },
  otherwise: 'Not that one. Look at `tips` in the Scope after the second tip, then find the line that compares it.'
}

export const unroundedCompare: DebugPracticeTask = {
  id: 'debugging-practice-unrounded-compare',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-23-no-free-delivery',
  title: 'Click the line that compares what the page rounds',
  difficulty: 1,
  minutes: 0.5,
  task: 'Tip 0.10 € and then 0.20 €: the jar says 0.30 €, but the thank-you never shows. Record that, step through `addTip`, and click the line that compares a value the page rounds.',
  sandbox: { page: ORDER_PAGE, open: 'tips.js', debugger: true, probes: [], find: UNROUNDED },
  setup: site({ 'app.js': TIPS_APP, 'tips.js': TIPS }, {
    main: [
      '<p class="note"><button class="action" id="tip-10" type="button">Tip 0.10 €</button> <button class="action" id="tip-20" type="button">Tip 0.20 €</button></p>',
      '<p class="note" id="tips">Tips today: 0.00 €</p>',
      '<p class="note" id="thanks" hidden>Thank you! That is our first 30 cents today.</p>'
    ]
  }, NO_SHOP),
  goals: [foundGoal('You found the line that compares the unrounded sum', UNROUNDED)],
  hints: ['After both tips the Scope shows `tips: 0.30000000000000004`. Line 7 of `tips.js` checks `tips === 0.3`, which is never exactly true.'],
  why: 'A floating point sum is rarely exactly what the page shows: compare money rounded to cents, or in whole cents.',
  solution: [{ pick: 'tips.js', line: 7 }]
}

// --- 5.3: Start the box price at six (quick fix) -------------------------------------------------------------------

const BOX = `// Croissants: 2.40 each, or 2.00 each from six (the box price).
export const BOX_FROM = 6

export function pricePerCroissant(count) {
  if (count > BOX_FROM) return 2
  return 2.4
}
`

const BOX_APP = `// The order page: Add croissants and see the price per croissant.
import { pricePerCroissant } from './box.js'
import { formatPrice } from './money.js'

let count = 0

document.querySelector('#add-croissant').addEventListener('click', () => {
  count += 1
  document.querySelector('#count').textContent = String(count)
  document.querySelector('#each').textContent = \`\${formatPrice(pricePerCroissant(count))} each\`
})
`

export const boxFromSix: DebugPracticeTask = {
  id: 'debugging-practice-box-from-six',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-23-no-free-delivery',
  title: 'Start the box price at six',
  difficulty: 1,
  minutes: 0.5,
  task: 'Six croissants should cost 2.00 each (the box price), but the page wants a seventh first. Fix the comparison (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'box.js',
    debugger: true,
    probes: [
      { id: 'five', steps: [{ click: '#add-croissant', times: 5 }, { text: '#each' }] },
      { id: 'six', steps: [{ click: '#add-croissant' }, { text: '#each' }] }
    ]
  },
  setup: site({ 'app.js': BOX_APP, 'box.js': BOX }, {
    main: ['<p><button class="action" id="add-croissant" type="button">Add a croissant</button></p>', '<p class="note"><span id="count">0</span> croissants, <span id="each">2.40 each</span></p>']
  }, ['products.js', 'cart.js']),
  goals: [probesGoal('box', 'Five croissants cost “2.40 each”, six “2.00 each”', { five: '2.40 each', six: '2.00 each' })],
  hints: ['With six croissants `count > BOX_FROM` is `6 > 6`, false. Line 5 of `box.js`: `if (count >= BOX_FROM) return 2`.'],
  why: '“From six” includes six: `>=`. Test a limit with the limit itself.',
  solution: [{ save: 'box.js', replace: ['count > BOX_FROM', 'count >= BOX_FROM'] }, 'reload']
}

// --- 5.4: Click the line that sets the stock to 0 (find) -----------------------------------------------------------

const STOCK = `// Stock: how many of each are left today, shown next to the name.
export const stock = { 'croissant': 12, 'pain-au-chocolat': 8, 'sourdough': 3 }

export function stockText(id) {
  let left = stock[id]
  if (left = 0) return 'Sold out'
  return \`\${left} left\`
}
`

const STOCK_APP = `// The order page: today's products and how many are left.
import { products } from './products.js'
import { stockText } from './stock.js'

const list = document.querySelector('#products')

for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.innerHTML = \`<span class="photo" aria-hidden="true"></span><span><span class="name">\${product.name}</span> <span class="price">\${stockText(product.id)}</span></span>\`
  list.append(item)
}
`

const STOCK_ZERO: FindTarget = {
  path: 'stock.js',
  lines: [6],
  wrong: {
    'stock.js:2': 'The stock is filled: 12, 8 and 3. Which line turns it into 0?',
    'stock.js:5': 'After this line `left` holds the right number (12 for the croissant). Step over the next line and watch it.',
    'stock.js:7': 'That line only prints `left`. By then it is 0 already: which line made it 0?',
    'app.js:10': 'That line shows what `stockText` gives it. The 0 comes from inside `stockText`.'
  },
  otherwise: 'Not that one. Step through `stockText` and watch `left` in the Scope: after which line is it 0?'
}

export const stockZero: DebugPracticeTask = {
  id: 'debugging-practice-stock-zero',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-24-always-pickup',
  title: 'Click the line that sets the stock to 0',
  difficulty: 1,
  minutes: 0.5,
  task: 'Every product says “0 left”, though Maya filled the stock this morning. Record, step through `stockText` until `left` becomes 0, and click the line that did it.',
  sandbox: { page: ORDER_PAGE, open: 'stock.js', debugger: true, probes: [], find: STOCK_ZERO },
  setup: site({ 'app.js': STOCK_APP, 'stock.js': STOCK }, {}, ['cart.js', 'money.js']),
  goals: [foundGoal('You found the line that sets the stock to 0', STOCK_ZERO)],
  hints: ['At line 6 of `stock.js` the Scope shows `left: 12`; Step over and it is 0: `if (left = 0)` assigns instead of comparing.'],
  why: 'An assignment in a condition changes the value it was meant to check: step over the line and the Scope shows it.',
  solution: [{ pick: 'stock.js', line: 6 }]
}

// --- 5.4: Compare the day, don't change it (quick fix) -------------------------------------------------------------

const HOURS_ON = `// Opening hours: every day 7:00–18:00, Sundays closed.
export function hoursOn(day) {
  if (day = 'Sunday') return 'closed'
  return '7:00–18:00'
}
`

const DAYS_APP = `// The order page: tap a day to see its opening hours.
import { hoursOn } from './hours.js'

for (const button of document.querySelectorAll('#days button')) {
  button.addEventListener('click', () => {
    document.querySelector('#hours').textContent = \`\${button.textContent}: \${hoursOn(button.textContent)}\`
  })
}
`

export const compareTheDay: DebugPracticeTask = {
  id: 'debugging-practice-compare-the-day',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-24-always-pickup',
  title: 'Compare the day, don\'t change it',
  difficulty: 1,
  minutes: 0.5,
  task: 'Every day says “closed”, even Monday. Make `hoursOn` compare the day instead of changing it (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'hours.js',
    debugger: true,
    probes: [
      { id: 'monday', steps: [{ click: '#days button:nth-child(1)' }, { text: '#hours' }] },
      { id: 'sunday', steps: [{ click: '#days button:nth-child(3)' }, { text: '#hours' }] }
    ]
  },
  setup: site({ 'app.js': DAYS_APP, 'hours.js': HOURS_ON }, {
    main: [
      '<p id="days" class="note"><button class="action" type="button">Monday</button> <button class="action" type="button">Saturday</button> <button class="action" type="button">Sunday</button></p>',
      '<p class="note" id="hours"></p>'
    ]
  }, NO_SHOP),
  goals: [probesGoal('hours', 'Monday shows “7:00–18:00”, Sunday still “closed”', { monday: 'Monday: 7:00–18:00', sunday: 'Sunday: closed' })],
  hints: ['Line 3 of `hours.js` assigns: `day = \'Sunday\'` makes every day Sunday. Compare with `===`: `if (day === \'Sunday\') return \'closed\'`.'],
  why: '`=` stores a value, `===` compares it; a non-empty string stored in a condition is always true.',
  solution: [{ save: 'hours.js', replace: ['if (day = \'Sunday\')', 'if (day === \'Sunday\')'] }, 'reload']
}

// --- 5.5: Click the cake with the wrong slices (find) --------------------------------------------------------------

const CAKES = `// The cakes for Saturday's street party: how many slices each gives (Maya).
export const cakes = [
  { name: 'Lemon drizzle', slices: 8 },
  { name: 'Carrot cake', slices: 12 },
  { name: 'Chocolate cake', slices: 8 },
  { name: 'Apple pie', slices: 10 },
  { name: 'Cheesecake', slices: 12 },
  { name: 'Victoria sponge', slices: 8 },
  { name: 'Sheet cake', slices: 16 },
  { name: 'Banana bread', slices: 8 },
  { name: 'Plum cake', slices: 80 },
  { name: 'Marble cake', slices: 12 },
  { name: 'Ginger loaf', slices: 10 },
  { name: 'Almond tart', slices: 8 }
]
`

const PARTY = `// How many guests Saturday's cakes feed: one slice each.
import { cakes } from './cakes.js'

export function guests() {
  let total = 0
  for (const cake of cakes) {
    total += cake.slices
  }
  return total
}

document.querySelector('#guests').textContent = \`The cakes feed \${guests()} guests.\`
`

const WRONG_SLICES: FindTarget = {
  path: 'cakes.js',
  lines: [11],
  wrong: {
    'party.js:7': 'That line adds each cake\'s slices, as it should. One cake has far too many: which one?',
    'cakes.js:9': 'A sheet cake does give 16 slices. Which cake gives far more than a cake can?'
  },
  otherwise: 'Not that one. A breakpoint on line 7 of `party.js` with the condition `cake.slices > 20` stops at the cake whose slices are wrong.'
}

export const wrongSlices: DebugPracticeTask = {
  id: 'debugging-practice-wrong-slices',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-25-seventh-item',
  title: 'Click the cake with the wrong slices',
  difficulty: 1,
  minutes: 0.5,
  task: 'The party page says the cakes feed 192 guests; Maya planned for about 120. Find the cake with the wrong number of slices with a conditional breakpoint, and click its line in `cakes.js`.',
  sandbox: { page: ORDER_PAGE, open: 'party.js', debugger: true, probes: [], find: WRONG_SLICES },
  setup: site({ 'app.js': 'import { guests } from \'./party.js\'\n\n// Handy while debugging: type guests() in the Console.\nObject.assign(window, { guests })\n', 'party.js': PARTY, 'cakes.js': CAKES }, {
    main: ['<h2>Saturday\'s street party</h2>', '<p class="note" id="guests"></p>']
  }, NO_SHOP),
  goals: [foundGoal('You found the cake with the wrong slices', WRONG_SLICES)],
  hints: ['A breakpoint on line 7 of `party.js` with the condition `cake.slices > 20`: Record, Stop, Resume, and it stops once, at the Plum cake with 80 slices, line 11 of `cakes.js`.'],
  why: 'A condition lets a breakpoint skip the rounds that are fine and stop at the one that isn\'t.',
  solution: [{ pick: 'cakes.js', line: 11 }]
}

// --- 5.5: Fix the price with a comma (quick fix) -------------------------------------------------------------------

/** What the pastry box costs once every price is a number. */
export const BOX_TOTAL = '37.30'

const PASTRIES = `// Saturday's pastry box: twelve pastries for the party, prices from Maya's list.
export const box = [
  { name: 'Butter croissant', price: 2.4 },
  { name: 'Pain au chocolat', price: 2.8 },
  { name: 'Almond croissant', price: 3.1 },
  { name: 'Cinnamon roll', price: 3.3 },
  { name: 'Apple turnover', price: 2.9 },
  { name: 'Raisin swirl', price: 2.7 },
  { name: 'Cheese danish', price: 3.4 },
  { name: 'Lemon tart', price: 3.6 },
  { name: 'Eclair', price: 3.5 },
  { name: 'Fruit tartlet', price: 3.8 },
  { name: 'Plum slice', price: '3,20' },
  { name: 'Brownie', price: 2.6 }
]
`

const PASTRY_BOX = `// The price of the pastry box: every pastry's price, added up.
import { box } from './pastries.js'
import { formatPrice } from './money.js'

let total = 0
for (const pastry of box) {
  total += Number(pastry.price)
}

document.querySelector('#box-total').textContent = formatPrice(total)
`

export const commaPrice: DebugPracticeTask = {
  id: 'debugging-practice-comma-price',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-25-seventh-item',
  title: 'Fix the price with a comma',
  difficulty: 1,
  minutes: 0.5,
  task: 'The pastry box costs “NaN €”. Find the price that isn\'t a number (a breakpoint with a condition helps), fix it in `pastries.js` (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'box.js',
    debugger: true,
    probes: [{ id: 'total', steps: [{ text: '#box-total' }] }]
  },
  setup: site({ 'app.js': 'import \'./box.js\'\n', 'box.js': PASTRY_BOX, 'pastries.js': PASTRIES }, {
    main: ['<h2>Pastry box for the party</h2>', '<p>Twelve pastries: <strong id="box-total"></strong> €</p>']
  }, ['products.js', 'cart.js']),
  goals: [probeGoal('total', `The pastry box costs “${BOX_TOTAL}”`, 'total', BOX_TOTAL)],
  hints: ['A breakpoint on line 7 of `box.js` with the condition `Number.isNaN(Number(pastry.price))` stops at the Plum slice: `price: \'3,20\'`, with a comma. Line 13 of `pastries.js`: `price: 3.2`.'],
  why: '`Number(\'3,20\')` is NaN, and NaN spoils every sum after it: find the first value that is not a number, then fix the data.',
  solution: [{ save: 'pastries.js', replace: ['price: \'3,20\'', 'price: 3.2'] }, 'reload']
}
