// State & async 4.4: every basket line starts as a spread of DEFAULTS, but a spread copies only the top level: the
// lines share one `options` object (and so does DEFAULTS), so slicing one loaf slices every loaf, even the ones added
// later. Learn: objects are passed by reference; `{ ...x }` is a shallow copy; copy what you change (or structuredClone).
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { DebugScenario } from './types'
import { BASKET_LIST } from './16-object-promise'

const CART = `// The basket. Bread can be sliced at the counter, so every line keeps its own
// options; a new line starts from the defaults (Maya: whole, no paper bag).
const badge = document.querySelector('#cart-count')
const basket = document.querySelector('#basket')

const DEFAULTS = { quantity: 1, options: { sliced: false, paperBag: false } }

export const cart = { items: [] }

// called by the Add buttons (app.js)
export function addToCart(product) {
  const line = { ...DEFAULTS, id: product.id, name: product.name }
  cart.items.push(line)
  renderBasket()
}

function toggleSliced(line) {
  line.options.sliced = !line.options.sliced
  renderBasket()
}

export function renderBasket() {
  badge.textContent = String(cart.items.length)
  basket.replaceChildren(...cart.items.map((line, index) => {
    const row = document.createElement('li')
    row.dataset.line = String(index + 1)
    row.innerHTML = '<strong class="loaf"></strong>, <span class="cut"></span> <button class="add slice" type="button"></button>'
    row.querySelector('.loaf').textContent = line.name
    row.querySelector('.cut').textContent = line.options.sliced ? 'sliced' : 'whole'
    const button = row.querySelector('.slice')
    button.textContent = line.options.sliced ? 'Keep whole' : 'Slice it'
    button.addEventListener('click', () => toggleSliced(line))
    return row
  }))
}
`

const APP = `// The order page: draws today's products and wires up the Add buttons.
import { products } from './products.js'
import { addToCart, cart, renderBasket } from './cart.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')

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

renderBasket()

// Handy while debugging: type cart or products in the Console.
Object.assign(window, { cart, products })
`

export const changesBoth: DebugScenario = {
  id: 'debugging-19-changes-both',
  track: 'debugging',
  kind: 'scenario',
  title: 'Changing one line changes both',
  difficulty: 2,
  minutes: 6,
  teaches: 'shallow copy',
  story: [
    'Anna at the counter: “A customer wanted one sourdough loaf sliced and one whole for the freezer. We sliced both, because the order said so. And the next customer\'s loaf came sliced too.”',
    'Add two sourdough loaves and press Slice it on the first one. Find out why the second one changes with it, then make each line keep its own options. Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'cart.js',
    probes: [
      { id: 'first-cut', steps: [{ click: '[data-id="sourdough"] .add', times: 2 }, { click: '[data-line="1"] .slice' }, { text: '[data-line="1"] .cut' }] },
      { id: 'second-cut', steps: [{ text: '[data-line="2"] .cut' }] },
      { id: 'new-line', steps: [{ click: '[data-id="sourdough"] .add' }, { text: '[data-line="3"] .cut' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'cart.js': CART }, { main: BASKET_LIST }), observed: null, picked: null }),
  goals: [
    probesGoal('own-line', 'Slicing the first of two sourdough loaves slices only that one: the second stays “whole”', { 'first-cut': 'sliced', 'second-cut': 'whole' }),
    probesGoal('fresh-line', 'A loaf added after that starts “whole”', { 'first-cut': 'sliced', 'new-line': 'whole' })
  ],
  hints: [
    'Add two loaves and type `cart.items[0].options === cart.items[1].options` in the Console. Two lines, one object?',
    'A spread (`{ ...DEFAULTS }`) copies the top level only: `options` is an object, so every line gets the same one, the very object inside `DEFAULTS`. Slicing one line changes that object, for every line and every line to come.',
    'In `cart.js`, line 12 builds the line. Give it its own options: `const line = { ...DEFAULTS, options: { ...DEFAULTS.options }, id: product.id, name: product.name }` (or `{ ...structuredClone(DEFAULTS), id: product.id, name: product.name }`). Save, then Reload.'
  ],
  debrief: {
    title: 'Two names for one object',
    paragraphs: [
      'A variable or a property holds a reference to an object, not the object itself. The spread made a new line each time, but copied the reference to `options`, so every line and `DEFAULTS` pointed at the same object. `===` in the Console said so: one object, three names.',
      'That is a shallow copy. Copy the nested object too (`options: { ...DEFAULTS.options }`), copy everything (`structuredClone(DEFAULTS)`), or never change a shared object: `line.options = { ...line.options, sliced: true }` replaces the line\'s options instead of editing the shared ones.',
      'When changing one thing changes another, check whether they are the same object. `Object.assign({}, DEFAULTS)` is a shallow copy too, so it does not help here.'
    ]
  },
  solution: [{ save: 'cart.js', replace: ['{ ...DEFAULTS, id: product.id', '{ ...DEFAULTS, options: { ...DEFAULTS.options }, id: product.id'] }, 'reload']
}
