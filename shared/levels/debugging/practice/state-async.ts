// State & async: the practice tasks, the two kinds of the earlier chapters (ADR 0007): find (click the right line, in
// the editor or through a link in the Console or the Network panel; a wrong click says why it isn't that one) and quick
// fix (one line). Each trains the scenario before it, in a small app of its own.
import { ORDER_PAGE, orderSite } from '../bakery'
import { foundGoal, probeGoal, probesGoal } from '../checks'
import { HOURS } from '../shop-server'
import { OPENING_HOURS } from './network'
import type { OrderPageOptions } from '../bakery'
import type { DebugPracticeTask, FindTarget, JsonValue, ProbeStep } from '../types'

/** A practice app: the order page with the task's files, without the shared ones it does not use. */
const site = (files: Record<string, string>, page: OrderPageOptions = {}, omit: readonly string[] = []) => () => ({ files: orderSite(files, page, omit), observed: null, picked: null })

/** The shared files a practice app without products or a basket leaves out. */
const NO_SHOP = ['products.js', 'cart.js', 'money.js']

// --- 4.1: Click the line that forgot to wait (find) ----------------------------------------------------------------

const FORGOT_SLOTS = `// The pickup times for tomorrow, from the server: the oven plan decides them (Maya).
async function loadSlots() {
  const response = await fetch('/api/slots')
  return response.json()
}

export async function showSlots() {
  const slots = loadSlots()
  const list = document.querySelector('#slots')
  list.textContent = slots.map(slot => slot.time).join(' · ')
}
`

const SLOTS_APP = `// The order page: tomorrow's pickup times.
import { showSlots } from './slots.js'

showSlots()
`

const FORGOT_TO_WAIT: FindTarget = {
  path: 'slots.js',
  lines: [8],
  wrong: {
    'slots.js:10': 'That line throws, because `slots` has no `map`: it is not the list. What is it, and which line gave it that value?',
    'slots.js:3': 'That line waits for the server with `await`, as it should. Which line does not wait?',
    'slots.js:4': 'Returning `response.json()` hands on its promise; whoever calls `loadSlots` can wait for it. Who doesn\'t?',
    'app.js:4': 'That line starts `showSlots`; nothing comes back that it needs. The mistake is inside `showSlots`.'
  },
  otherwise: 'Not that one. The error is on the line that uses `slots`; find the line where `slots` got a promise instead of the list.'
}

export const forgotToWait: DebugPracticeTask = {
  id: 'debugging-practice-forgot-to-wait',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-16-object-promise',
  title: 'Click the line that forgot to wait',
  difficulty: 1,
  minutes: 0.5,
  task: 'The pickup times stay empty, and the Console says `slots.map is not a function`. Click the line that should have waited for the server.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'slots.js',
    probes: [],
    find: FORGOT_TO_WAIT,
    backend: { routes: [{ path: '/api/slots', respond: { status: 200, json: [{ time: '7:00' }, { time: '7:30' }, { time: '8:00' }] } }] }
  },
  setup: site({ 'app.js': SLOTS_APP, 'slots.js': FORGOT_SLOTS }, { main: ['<h2>Pick up tomorrow</h2>', '<p class="note" id="slots"></p>'] }, NO_SHOP),
  goals: [foundGoal('You found the line that should have waited', FORGOT_TO_WAIT)],
  hints: ['`loadSlots` is `async`, so line 8 of `slots.js` gets a promise, not the list; `await` is missing there. A promise has no `map`, which is why line 10 throws.'],
  why: 'An error often shows up where a value is used, while the mistake is where it was made: a missing `await` hands on a promise.',
  solution: [{ pick: 'slots.js', line: 8 }]
}

// --- 4.1: Wait for the opening hours (quick fix) -------------------------------------------------------------------

const HOURS_JS = `// The opening hours under the shop's name, from the server (they change on holidays).
async function loadHours() {
  const response = await fetch('/api/hours')
  return response.json()
}

export async function showHours() {
  const hours = loadHours()
  document.querySelector('#hours').textContent = \`Mon–Fri \${hours.weekdays} · Sat \${hours.saturday}\`
}
`

const HOURS_APP = `// The order page: the opening hours under the shop's name.
import { showHours } from './hours.js'

showHours()
`

export const awaitTheHours: DebugPracticeTask = {
  id: 'debugging-practice-await-the-hours',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-16-object-promise',
  title: 'Wait for the opening hours',
  difficulty: 1,
  minutes: 0.5,
  task: 'The opening hours say “Mon–Fri undefined · Sat undefined”, though the server answers them. Make `showHours` wait for them (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'hours.js',
    probes: [{ id: 'hours', steps: [{ text: '#hours' }] }],
    backend: { routes: [{ path: '/api/hours', respond: { status: 200, json: HOURS } }] }
  },
  setup: site({ 'app.js': HOURS_APP, 'hours.js': HOURS_JS }, { header: ['<p class="hours" id="hours"></p>'] }, NO_SHOP),
  goals: [probeGoal('hours', `The opening hours show: “${OPENING_HOURS}”`, 'hours', OPENING_HOURS)],
  hints: ['Line 8 of `hours.js` calls `loadHours()` without `await`, so `hours` is a promise, which has no `weekdays`. Make it `const hours = await loadHours()`.'],
  why: 'A promise has none of the properties of the value it will bring: `await` it first, then read them.',
  solution: [{ save: 'hours.js', replace: ['const hours = loadHours()', 'const hours = await loadHours()'] }, 'reload']
}

// --- 4.2: Click the line that lets the old answer win (find) -------------------------------------------------------

const ALLERGENS_JS = `// The allergens box: tap a product and the box shows what is in it, from the
// kitchen's recipe list on the server (Maya keeps it up to date).
const box = document.querySelector('#allergens')

export async function showAllergens(product) {
  box.querySelector('h2').textContent = product.name
  box.querySelector('p').textContent = 'Looking it up…'
  const response = await fetch(\`/api/allergens/\${product.id}\`)
  const allergens = await response.json()
  box.querySelector('p').textContent = \`Contains: \${allergens.join(', ')}\`
}
`

const ALLERGENS_APP = `// The order page: today's products, each with its allergens a tap away.
import { products } from './products.js'
import { showAllergens } from './allergens.js'

const list = document.querySelector('#products')

for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.dataset.id = product.id
  item.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span class="name">\${product.name}</span>
    <button class="add" type="button">What's in it?</button>\`
  item.querySelector('.add').addEventListener('click', () => showAllergens(product))
  list.append(item)
}
`

const OLD_ANSWER_WINS: FindTarget = {
  path: 'allergens.js',
  lines: [10],
  wrong: {
    'allergens.js:8': 'That line asks for the product you tapped, and both answers are right for their product. Which line shows an answer without checking it is still the product on show?',
    'allergens.js:6': 'That line names the product you tapped last, which is right. The list under the name is the wrong one.',
    'allergens.js:9': 'That line reads the answer, and the answer is right for its product. What happens to it next?',
    'app.js:15': 'Each tap starts its own `showAllergens`, which is fine. The mistake is in what each one does when its answer arrives.'
  },
  otherwise: 'Not that one. Two answers are on their way, the croissant\'s takes longer: find the line that shows whichever arrives, even an old one.'
}

export const oldAnswerWins: DebugPracticeTask = {
  id: 'debugging-practice-old-answer-wins',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-17-wrong-results',
  title: 'Click the line that lets the old answer win',
  difficulty: 1,
  minutes: 0.5,
  task: 'Tap “What\'s in it?” on the butter croissant, then right away on the sourdough loaf: the box names the loaf but lists the croissant\'s milk and egg. Click the line that lets the old answer win.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'allergens.js',
    probes: [],
    find: OLD_ANSWER_WINS,
    backend: {
      routes: [
        { path: '/api/allergens/croissant', respond: { status: 200, json: ['wheat', 'milk', 'egg'], delay: 1200 } },
        { path: '/api/allergens/pain-au-chocolat', respond: { status: 200, json: ['wheat', 'milk', 'egg', 'soy'], delay: 400 } },
        { path: '/api/allergens/sourdough', respond: { status: 200, json: ['wheat', 'rye'], delay: 100 } }
      ]
    }
  },
  setup: site(
    { 'app.js': ALLERGENS_APP, 'allergens.js': ALLERGENS_JS },
    { main: ['<section class="box" id="allergens" aria-live="polite">', '  <h2>Allergens</h2>', '  <p class="note">Tap “What\'s in it?” on a product.</p>', '</section>'] },
    ['cart.js', 'money.js']
  ),
  goals: [foundGoal('You found the line that lets the old answer win', OLD_ANSWER_WINS)],
  hints: ['Line 10 of `allergens.js` shows whatever answer arrives, also the croissant\'s, which comes last. It never checks that its product is still the one on show.'],
  why: 'When requests can overlap, the line that shows an answer must ask whether it is still the one wanted.',
  solution: [{ pick: 'allergens.js', line: 10 }]
}

// --- 4.2: Drop the answer for the day you left (quick fix) ---------------------------------------------------------

const DAYS_JS = `// Pickup times for the day the customer picks, from the server (the oven plan).
const DAYS = { fri: 'Friday', sat: 'Saturday' }
const heading = document.querySelector('#pickup-day')
const list = document.querySelector('#pickup-times')

let selected = null

export async function showDay(day) {
  selected = day
  for (const button of document.querySelectorAll('[data-day]')) button.setAttribute('aria-pressed', String(button.dataset.day === selected))
  heading.textContent = DAYS[day]
  list.textContent = 'Loading…'
  const response = await fetch(\`/api/slots?day=\${day}\`)
  const times = await response.json()
  list.textContent = times.join(' · ')
}
`

const DAYS_APP = `// The order page: pick the day you collect your order.
import { showDay } from './slots.js'

for (const button of document.querySelectorAll('[data-day]')) {
  button.addEventListener('click', () => showDay(button.dataset.day))
}
`

const PICKUP_DAYS = [
  '<section class="box" aria-label="Pickup">',
  '  <p>Pick up on <button class="add" type="button" data-day="fri">Friday</button> <button class="add" type="button" data-day="sat">Saturday</button></p>',
  '  <p><strong id="pickup-day">Pick a day</strong> <span class="note" id="pickup-times"></span></p>',
  '</section>'
]

export const SATURDAY_TIMES = '7:00 · 8:00 · 9:30'

/** A customer who taps Friday and then right away Saturday, and looks once the page is quiet. */
const FRIDAY_THEN_SATURDAY: ProbeStep[] = [{ click: '[data-day="fri"]', settle: false }, { click: '[data-day="sat"]', settle: false }, { settle: true }]

export const dropTheOldDay: DebugPracticeTask = {
  id: 'debugging-practice-drop-the-old-day',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-17-wrong-results',
  title: 'Drop the answer for the day you left',
  difficulty: 1,
  minutes: 0.5,
  task: 'Tap Friday, then right away Saturday: the page says Saturday but shows Friday\'s times, which take the server longer. Drop an answer for a day that is no longer selected (one line in `slots.js`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'slots.js',
    probes: [
      { id: 'day', steps: [...FRIDAY_THEN_SATURDAY, { text: '#pickup-day' }] },
      { id: 'times', steps: [{ text: '#pickup-times' }] }
    ],
    backend: {
      routes: [
        { path: '/api/slots', query: '^day=fri$', respond: { status: 200, json: ['7:30', '9:00', '16:00'], delay: 900 } },
        { path: '/api/slots', query: '^day=sat$', respond: { status: 200, json: ['7:00', '8:00', '9:30'], delay: 100 } }
      ]
    }
  },
  setup: site({ 'app.js': DAYS_APP, 'slots.js': DAYS_JS }, { main: PICKUP_DAYS }, NO_SHOP),
  goals: [probesGoal('saturday', `Friday, then right away Saturday: the page shows Saturday's times, “${SATURDAY_TIMES}”`, { day: 'Saturday', times: SATURDAY_TIMES })],
  hints: ['`selected` always holds the day on show. Before line 15 of `slots.js` writes the times, add `if (day !== selected) return`.'],
  why: 'An answer that arrives after the customer moved on is old news: check that it still belongs to what is on show before you use it.',
  solution: [{ save: 'slots.js', replace: ['  const times = await response.json()\n', '  const times = await response.json()\n  if (day !== selected) return\n'] }, 'reload']
}

// --- 4.3: Click the line every button shares (find) ----------------------------------------------------------------

const SIZES_JS = `// Cake sizes for the birthday cake form (Maya's list from the counter).
const sizes = [
  { name: 'Small', slices: 6 },
  { name: 'Medium', slices: 10 },
  { name: 'Large', slices: 16 }
]

export function renderSizes(box, chosen) {
  let i
  for (i = 0; i < sizes.length; i++) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'add'
    button.textContent = sizes[i].name
    button.addEventListener('click', () => {
      chosen.textContent = \`\${sizes[i].name} cake, \${sizes[i].slices} slices\`
    })
    box.append(button, ' ')
  }
}
`

const SIZES_APP = `// The birthday cake form: pick a size.
import { renderSizes } from './sizes.js'

renderSizes(document.querySelector('#sizes'), document.querySelector('#size'))
`

const SHARED_INDEX: FindTarget = {
  path: 'sizes.js',
  lines: [9, 10],
  wrong: {
    'sizes.js:16': 'That line throws: `sizes[i]` is `undefined`, because by the time you click, `i` is 3. Which line makes the three buttons share one `i`?',
    'sizes.js:14': 'That line runs during the loop, while `i` is still 0, 1 and 2: the names on the buttons are right. The click handler reads `i` later.',
    'sizes.js:15': 'The handler is a closure: it keeps the variable `i`, not its value. Look at where `i` is declared.',
    'sizes.js:2': 'The list has three sizes, all fine. What is `i` when you click?'
  },
  otherwise: 'Not that one. The handler reads `i` when you click; find the line that gives all three buttons the same `i`.'
}

export const sharedIndex: DebugPracticeTask = {
  id: 'debugging-practice-shared-index',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-18-adds-sourdough',
  title: 'Click the line every button shares',
  difficulty: 1,
  minutes: 0.5,
  task: 'Click any cake size: the Console says `Cannot read properties of undefined (reading \'name\')`. Click the line that makes all three buttons share one variable.',
  sandbox: { page: ORDER_PAGE, open: 'sizes.js', probes: [], find: SHARED_INDEX },
  setup: site(
    { 'app.js': SIZES_APP, 'sizes.js': SIZES_JS },
    { main: ['<section class="box" aria-label="Birthday cake">', '  <h2>Birthday cake</h2>', '  <p id="sizes"></p>', '  <p class="note" id="size" role="status">Pick a size.</p>', '</section>'] },
    NO_SHOP
  ),
  goals: [foundGoal('You found the line that every button shares', SHARED_INDEX)],
  hints: ['`let i` on line 9 is declared once, outside the loop, so every handler reads the same `i`, which is 3 after the loop. Declared in the loop (`for (let i = 0; …)`), each round gets its own.'],
  why: 'A closure reads its variables when it runs: one variable declared outside a loop is shared by everything the loop made.',
  solution: [{ pick: 'sizes.js', line: 9 }]
}

// --- 4.3: Give each button its own time (quick fix) ----------------------------------------------------------------

const PICKUP_JS = `// Pickup times for tomorrow: one button per time; the chosen one goes on the order.
const times = ['7:00', '8:00', '9:00']

export function renderTimes(box, chosen) {
  for (var time of times) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'add'
    button.textContent = time
    button.addEventListener('click', () => {
      chosen.textContent = \`Pick up at \${time}\`
    })
    box.append(button, ' ')
  }
}
`

const PICKUP_APP = `// The order page: pick the time you collect your order.
import { renderTimes } from './pickup.js'

renderTimes(document.querySelector('#times'), document.querySelector('#pickup-time'))
`

export const ownTime: DebugPracticeTask = {
  id: 'debugging-practice-own-time',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-18-adds-sourdough',
  title: 'Give each button its own time',
  difficulty: 1,
  minutes: 0.5,
  task: 'Every pickup button picks 9:00, also the one that says 7:00. Give each button its own time (one line in `pickup.js`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'pickup.js',
    probes: [{ id: 'first', steps: [{ click: '#times button' }, { text: '#pickup-time' }] }]
  },
  setup: site(
    { 'app.js': PICKUP_APP, 'pickup.js': PICKUP_JS },
    { main: ['<section class="box" aria-label="Pickup">', '  <p id="times"></p>', '  <p class="note" id="pickup-time" role="status">Pick a time.</p>', '</section>'] },
    NO_SHOP
  ),
  goals: [probeGoal('own-time', 'The 7:00 button says “Pick up at 7:00”', 'first', 'Pick up at 7:00')],
  hints: ['`for (var time of times)` on line 5 of `pickup.js` makes one `time` for the whole function: after the loop it is 9:00. Make it `for (const time of times)`.'],
  why: '`let` and `const` in a loop are new for every round, so each handler keeps its own; `var` is one for all.',
  solution: [{ save: 'pickup.js', replace: ['for (var time of times)', 'for (const time of times)'] }, 'reload']
}

// --- 4.4: Click the line that hands every box the same list (find) -------------------------------------------------

const BOXES_JS = `// Gift boxes: the customer fills each box with pastries, and the kitchen packs
// them one by one. A new box starts empty, with a brown ribbon (Anna).
const EMPTY_BOX = { ribbon: 'brown', pastries: [] }

export const boxes = []

export function newBox(name) {
  const box = { ...EMPTY_BOX, name }
  boxes.push(box)
  return box
}

export function addPastry(box, pastry) {
  box.pastries.push(pastry)
}
`

const BOXES_APP = `// The gift box page: two boxes, each with its own pastries.
import { addPastry, boxes, newBox } from './boxes.js'

const list = document.querySelector('#boxes')

function render() {
  list.replaceChildren(...boxes.map((box) => {
    const item = document.createElement('li')
    item.className = 'product'
    item.innerHTML = '<span class="photo" aria-hidden="true"></span><span><span class="name"></span> <span class="note"></span></span><button class="add" type="button">Add a croissant</button>'
    item.querySelector('.name').textContent = box.name
    item.querySelector('.note').textContent = box.pastries.length ? box.pastries.join(', ') : 'empty'
    item.querySelector('.add').addEventListener('click', () => {
      addPastry(box, 'Butter croissant')
      render()
    })
    return item
  }))
}

newBox('For Grandma')
newBox('For the office')
render()

// Handy while debugging: type boxes in the Console.
Object.assign(window, { boxes })
`

const SAME_LIST: FindTarget = {
  path: 'boxes.js',
  lines: [8],
  wrong: {
    'boxes.js:3': 'That is the empty box every new one starts from; its list is fine there, as long as no box gets that very list. Which line hands it out?',
    'boxes.js:14': 'That line adds to the box\'s own list. Is it really the box\'s own? Look at how a box is made.',
    'boxes.js:9': 'That line keeps the new box; it does not decide what is inside it.',
    'app.js:14': 'The croissant goes into the box you clicked, as it should. Why does the other box see it too?'
  },
  otherwise: 'Not that one. Both boxes show the croissant, so they share one list: find the line that gives every new box the same list.'
}

export const sameList: DebugPracticeTask = {
  id: 'debugging-practice-same-list',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-19-changes-both',
  title: 'Click the line that hands every box the same list',
  difficulty: 1,
  minutes: 0.5,
  task: 'Press “Add a croissant” on Grandma\'s box: the croissant shows up in the office box too. Click the line that gives every new box the same list.',
  sandbox: { page: ORDER_PAGE, open: 'boxes.js', probes: [], find: SAME_LIST },
  setup: site({ 'app.js': BOXES_APP, 'boxes.js': BOXES_JS }, { main: ['<h2>Gift boxes</h2>', '<ul id="boxes" class="products" aria-label="Gift boxes"></ul>'] }, NO_SHOP),
  goals: [foundGoal('You found the line that hands every box the same list', SAME_LIST)],
  hints: ['Line 8 of `boxes.js` copies `EMPTY_BOX` with a spread: the copy gets a reference to the same `pastries` array, not a new one (in the Console: `boxes[0].pastries === boxes[1].pastries`).'],
  why: 'A spread copies one level: arrays and objects inside stay shared until you copy them too.',
  solution: [{ pick: 'boxes.js', line: 8 }]
}

// --- 4.4: Copy last week's order before you change it (quick fix) --------------------------------------------------

const REORDER_JS = `// “Order again”: last week's order, ready to change before it goes out (Jonas).
export const lastWeek = {
  items: [{ name: 'Sourdough loaf', quantity: 1 }, { name: 'Butter croissant', quantity: 4 }]
}

export function orderAgain() {
  const order = lastWeek
  return order
}
`

const REORDER_APP = `// The order page: last week's order, and this week's, which starts from it.
import { lastWeek, orderAgain } from './reorder.js'

let order = null

const text = items => items.map(item => \`\${item.quantity} × \${item.name}\`).join(', ')

function render() {
  document.querySelector('#last-week').textContent = text(lastWeek.items)
  document.querySelector('#this-order').textContent = order ? text(order.items) : 'nothing yet'
}

document.querySelector('#order-again').addEventListener('click', () => {
  order = orderAgain()
  render()
})
document.querySelector('#more-croissants').addEventListener('click', () => {
  order.items[1].quantity += 1
  render()
})
render()
`

const REORDER_BOX = [
  '<section class="box" aria-label="Order again">',
  '  <p>Last week: <span id="last-week"></span></p>',
  '  <p>This week: <span id="this-order"></span></p>',
  '  <p><button class="action" id="order-again" type="button">Order again</button> <button class="action" id="more-croissants" type="button">One more croissant</button></p>',
  '</section>'
]

export const LAST_WEEK = '1 × Sourdough loaf, 4 × Butter croissant'
export const THIS_WEEK = '1 × Sourdough loaf, 5 × Butter croissant'

export const copyLastWeek: DebugPracticeTask = {
  id: 'debugging-practice-copy-last-week',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-19-changes-both',
  title: 'Copy last week\'s order before you change it',
  difficulty: 1,
  minutes: 0.5,
  task: 'Press Order again, then One more croissant: last week\'s order changes too. Make `orderAgain` hand out a copy (one line in `reorder.js`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'reorder.js',
    probes: [
      { id: 'last-week', steps: [{ click: '#order-again' }, { click: '#more-croissants' }, { text: '#last-week' }] },
      { id: 'this-week', steps: [{ text: '#this-order' }] }
    ]
  },
  setup: site({ 'app.js': REORDER_APP, 'reorder.js': REORDER_JS }, { main: REORDER_BOX }, NO_SHOP),
  goals: [probesGoal('copied', `One more croissant changes this week's order (“${THIS_WEEK}”), and last week's stays “${LAST_WEEK}”`, { 'last-week': LAST_WEEK, 'this-week': THIS_WEEK })],
  hints: ['Line 7 of `reorder.js` hands out last week\'s order itself. `structuredClone(lastWeek)` copies it with its items; a spread would still share the `items` array.'],
  why: 'Handing out an object hands out the object itself: copy it, all the way down, before someone changes it.',
  solution: [{ save: 'reorder.js', replace: ['const order = lastWeek', 'const order = structuredClone(lastWeek)'] }, 'reload']
}

// --- 4.5: Click the line that should pass the data on (find) -------------------------------------------------------

const SPECIALS: JsonValue = [{ name: 'Apricot danish', price: 3.2 }, { name: 'Rye with seeds', price: 4.9 }]

const CHAIN_SPECIALS = `// Today's specials, from the server. Ben types them in every morning.
export function loadSpecials() {
  return fetch('/api/specials')
    .then((response) => {
      response.json()
    })
    .then((specials) => {
      const list = document.querySelector('#specials')
      for (const special of specials) {
        const item = document.createElement('li')
        item.textContent = special.name
        list.append(item)
      }
    })
}
`

const SPECIALS_APP = `// The order page: today's specials at the top.
import { loadSpecials } from './specials.js'

loadSpecials()
`

const PASS_THE_DATA_ON: FindTarget = {
  path: 'specials.js',
  lines: [5],
  wrong: {
    'specials.js:9': 'That line throws, because `specials` is `undefined`. The `.then` before it should have handed over the list. Did it?',
    'specials.js:3': 'The request works: `200` in the Network panel, with both specials in the answer.',
    'specials.js:7': 'This callback gets whatever the callback before it returned. Look one step up.',
    'specials.js:4': 'Close: this callback gets the answer. But what does it hand on?',
    'app.js:4': 'Nobody catches the rejection here, which is why the Console says `Uncaught (in promise)`; but the mistake that rejects it is inside `loadSpecials`.'
  },
  otherwise: 'Not that one. The second `.then` gets `undefined`: find the line that should have passed the list on.'
}

export const passTheDataOn: DebugPracticeTask = {
  id: 'debugging-practice-pass-the-data-on',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-20-says-it-failed',
  title: 'Click the line that should pass the data on',
  difficulty: 1,
  minutes: 0.5,
  task: 'The specials stay empty, and the Console says `Uncaught (in promise) TypeError: specials is not iterable`. Click the line that should have passed the list on.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'specials.js',
    probes: [],
    find: PASS_THE_DATA_ON,
    backend: { routes: [{ path: '/api/specials', respond: { status: 200, json: SPECIALS } }] }
  },
  setup: site({ 'app.js': SPECIALS_APP, 'specials.js': CHAIN_SPECIALS }, { main: ['<h2>Today\'s specials</h2>', '<ul id="specials" class="list"></ul>'] }, NO_SHOP),
  goals: [foundGoal('You found the line that should pass the list on', PASS_THE_DATA_ON)],
  hints: ['A `.then` hands the next one what its callback returns. Line 5 of `specials.js` calls `response.json()` but returns nothing; `return response.json()` would pass the list on.'],
  why: 'In a promise chain, a callback that forgets to `return` hands the next step `undefined`.',
  solution: [{ pick: 'specials.js', line: 5 }]
}

// --- 4.5: Catch the rejection (quick fix) --------------------------------------------------------------------------

const RESERVE_JS = `// Reserve a birthday cake: the oven plan on the server decides if there is room.
const message = document.querySelector('#cake-status')

export function showMessage(text) {
  message.textContent = text
}

export async function reserveCake() {
  showMessage('Checking the oven plan…')
  const response = await fetch('/api/cakes', { method: 'POST' })
  const answer = await response.json()
  if (!response.ok) throw new Error(answer.error)
  showMessage(\`Reserved! Your cake number is \${answer.number}.\`)
}
`

const RESERVE_APP = `// The cake page: one button, and the answer under it.
import { reserveCake, showMessage } from './reserve.js'

document.querySelector('#reserve').addEventListener('click', () => reserveCake())
`

export const OVEN_FULL = 'The oven is full on Saturday. Try Sunday?'

export const catchTheRejection: DebugPracticeTask = {
  id: 'debugging-practice-catch-the-rejection',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-20-says-it-failed',
  title: 'Catch the rejection',
  difficulty: 1,
  minutes: 0.5,
  task: 'Reserve a cake: the page hangs on “Checking the oven plan…”, and the Console says `Uncaught (in promise) Error`. Catch it where the click calls `reserveCake` and show its message (one line in `app.js`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [{ id: 'message', steps: [{ click: '#reserve' }, { text: '#cake-status' }] }],
    backend: { routes: [{ method: 'POST', path: '/api/cakes', respond: { status: 409, json: { error: OVEN_FULL }, delay: 300 } }] }
  },
  setup: site(
    { 'app.js': RESERVE_APP, 'reserve.js': RESERVE_JS },
    { main: ['<section class="box" aria-label="Birthday cake">', '  <button class="action" id="reserve" type="button">Reserve a birthday cake for Saturday</button>', '  <p class="note" id="cake-status" role="status"></p>', '</section>'] },
    NO_SHOP
  ),
  goals: [probeGoal('tells', `When the oven is full, the customer reads the server's answer: “${OVEN_FULL}”`, 'message', OVEN_FULL)],
  hints: ['`reserveCake()` rejects when the server says no, and nobody catches it. On line 4 of `app.js`: `() => reserveCake().catch(error => showMessage(error.message))`.'],
  why: '“Uncaught (in promise)” means a promise rejected and nobody handled it: add a `.catch` (or `try`/`catch` around an `await`) where you can tell the customer.',
  solution: [{ save: 'app.js', replace: ['() => reserveCake())', '() => reserveCake().catch(error => showMessage(error.message)))'] }, 'reload']
}
