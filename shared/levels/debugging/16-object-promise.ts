// State & async 4.1: Ben moved the prices to the server (bread is cheaper after 16:00, and only the server knows the
// time), but addToCart calls the async priceOf without `await`: the basket line gets a Promise and shows
// "[object Promise]". Nothing is red. Learn: an async function hands back a promise at once; the value comes later
// (the Network panel shows the answer arriving), so `await` it, in an async function.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { BackendRoute, DebugScenario } from './types'

/** GET /api/prices/<id>: today's price of one product, as a number and as the text the page shows. */
export const PRICE_ROUTES: BackendRoute[] = [
  { path: '/api/prices/croissant', respond: { status: 200, json: { id: 'croissant', price: 2.4, label: '2.40 €' }, delay: 250 } },
  { path: '/api/prices/pain-au-chocolat', respond: { status: 200, json: { id: 'pain-au-chocolat', price: 2.8, label: '2.80 €' }, delay: 250 } },
  { path: '/api/prices/sourdough', respond: { status: 200, json: { id: 'sourdough', price: 6.5, label: '6.50 €' }, delay: 250 } }
]

/** The basket under the products: one line per Add. */
export const BASKET_LIST = ['<h2>Your basket</h2>', '<ul id="basket" class="list" aria-label="Your basket"></ul>']

const PRICES = `// Prices come from the shop's server: after 16:00 the day's bread is cheaper, and
// only the server knows the time and the discount (Ben).
export async function priceOf(id) {
  const response = await fetch(\`/api/prices/\${id}\`)
  const answer = await response.json()
  return answer.label
}
`

const BASKET = `// The basket: one line per Add, each with today's price, and the counter.
import { priceOf } from './prices.js'

const list = document.querySelector('#basket')
const badge = document.querySelector('#cart-count')

export const cart = { items: [] }

// called by the Add buttons (app.js)
export function addToCart(product) {
  const price = priceOf(product.id)
  cart.items.push({ id: product.id, name: product.name, price })
  const line = document.createElement('li')
  line.textContent = \`\${product.name} · \${price}\`
  list.append(line)
  badge.textContent = String(cart.items.length)
}
`

const APP = `// The order page: draws today's products and wires up the Add buttons.
import { products } from './products.js'
import { addToCart, cart } from './basket.js'
import { priceOf } from './prices.js'

const list = document.querySelector('#products')

for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.dataset.id = product.id
  item.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span class="name">\${product.name}</span>
    <button class="add" type="button">Add</button>\`
  item.querySelector('.add').addEventListener('click', () => addToCart(product))
  list.append(item)
}

document.querySelector('#cart-count').textContent = '0'

// Handy while debugging: type cart, or await priceOf('croissant'), in the Console.
Object.assign(window, { cart, priceOf })
`

export const CROISSANT_LINE = 'Butter croissant · 2.40 €'
export const SOURDOUGH_LINE = 'Sourdough loaf · 6.50 €'

export const objectPromise: DebugScenario = {
  id: 'debugging-16-object-promise',
  track: 'debugging',
  kind: 'scenario',
  title: 'The basket says [object Promise]',
  difficulty: 1,
  minutes: 5,
  teaches: 'await',
  story: [
    'Ben moved the prices to the server this morning: after 16:00 the day\'s bread gets cheaper, and only the server knows the time. Since then Anna\'s phone shows “Butter croissant · [object Promise]” in the basket.',
    'Add a croissant and a sourdough loaf, then look at the Network panel: the prices do come back. Make every basket line show its price, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'basket.js',
    probes: [
      { id: 'first-line', steps: [{ click: '[data-id="croissant"] .add' }, { text: '#basket li:nth-child(1)' }] },
      { id: 'second-line', steps: [{ click: '[data-id="sourdough"] .add' }, { text: '#basket li:nth-child(2)' }] },
      { id: 'badge', steps: [{ text: '#cart-count' }] }
    ],
    backend: { routes: PRICE_ROUTES }
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'basket.js': BASKET, 'prices.js': PRICES }, { main: BASKET_LIST }, ['cart.js', 'money.js']), observed: null, picked: null }),
  goals: [
    probesGoal('prices', `Adding a croissant and a sourdough loaf lists “${CROISSANT_LINE}” and “${SOURDOUGH_LINE}”, and the counter shows 2`, { 'first-line': CROISSANT_LINE, 'second-line': SOURDOUGH_LINE, 'badge': '2' })
  ],
  hints: [
    'The Network panel shows `GET /api/prices/croissant` answering `"label": "2.40 €"`, so the server is fine. Type `cart.items[0]` in the Console: what is its `price`?',
    'It is a Promise. `priceOf` is `async`: calling it starts the request and hands back a promise right away; the price arrives later. A promise turned into text is `[object Promise]`.',
    'In `basket.js`, make `addToCart` wait for the price: `export async function addToCart(product) {` (line 10) and `const price = await priceOf(product.id)` (line 11). Save, then Reload.'
  ],
  debrief: {
    title: 'An async function answers with a promise',
    paragraphs: [
      'Calling an `async` function never gives you its result. It starts the work and hands back a promise at once; the result comes later, here when the server answers. The code did not wait, so it stored the promise and wrote it into the page, where any object turned into text reads `[object Promise]`.',
      '`await` waits for the promise and gives you what it settles to, the price. It only works inside an `async` function, which is why `addToCart` became `async` too (`priceOf(product.id).then(price => …)` works as well).',
      'The Network panel showed that the answer was right all along: the bug was in when the code read it. In the Console, `await priceOf(\'croissant\')` gives the price, and `priceOf(\'croissant\')` alone shows the promise.'
    ]
  },
  solution: [
    { save: 'basket.js', replace: ['export function addToCart(product) {\n  const price = priceOf(product.id)', 'export async function addToCart(product) {\n  const price = await priceOf(product.id)'] },
    'reload'
  ]
}
