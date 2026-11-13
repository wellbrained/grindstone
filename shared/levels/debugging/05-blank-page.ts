// Reading errors 1.5: a missing `}` in cart.js. The module does not parse, so no module runs: no products, no buttons.
// The browser reports the next `export` ("Unexpected token 'export'" in Chrome), a few lines after the real mistake.
// Learn: a blank page means Console first; a syntax error points near the mistake, not at it.
import { ORDER_PAGE, orderSite } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import type { DebugScenario } from './types'

const CART = `// The basket: what the customer picked, and the counter in the header.
const badge = document.querySelector('#cart-count')

export const cart = { items: [] }

// called by the Add buttons (app.js); two croissants are one line with quantity 2
export function addToCart(product) {
  const line = cart.items.find(item => item.id === product.id)
  if (line) {
    line.quantity += 1
  } else {
    cart.items.push({ id: product.id, name: product.name, price: product.price, quantity: 1 })
  renderBadge()
}

export function renderBadge() {
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0)
  badge.textContent = String(count)
}
`

const APP = `// The order page: draws today's products and wires up the Add buttons.
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
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

renderBadge()
console.log(\`Corner Bakery shop ready · \${products.length} products\`)

// Handy while debugging: type cart or products in the Console.
Object.assign(window, { cart, products })
`

export const blankPage: DebugScenario = {
  id: 'debugging-05-blank-page',
  track: 'debugging',
  kind: 'scenario',
  title: 'The whole page is blank',
  difficulty: 2,
  minutes: 6,
  teaches: 'SyntaxError',
  story: [
    'Jonas pushed a change to the basket before lunch: two croissants should be one line with quantity 2. Since then the order page shows only the shop\'s name. No products, no buttons, nothing to click.',
    'Find out why nothing runs and fix it, so the products and the Add buttons are back. Save and Reload to check.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [
      { id: 'rows', steps: [{ count: '.product' }] },
      { id: 'badge-after-add', steps: [{ click: '[data-id="croissant"] .add' }, { text: '#cart-count' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'cart.js': CART }), observed: null, picked: null }),
  goals: [
    probeGoal('rows', 'The three products show again', 'rows', 3),
    probeGoal('adds', 'Add puts a croissant in the cart (the badge shows 1)', 'badge-after-add', '1'),
    noErrorsGoal()
  ],
  hints: [
    'When a page shows nothing at all, nothing ran. The Console says why, and its link says where the browser gave up.',
    'The browser stopped at `export function renderBadge()` in `cart.js`: an `export` can\'t stand inside a function. So the function above never closed. Count the `{` and `}` in `addToCart`.',
    'The `else {` on line 11 is never closed: add a line with `}` right after the `cart.items.push(...)` line (line 12), so `renderBadge()` runs after both branches. Save, then Reload.'
  ],
  debrief: {
    title: 'A syntax error stops everything',
    paragraphs: [
      'A syntax error is found before any code runs, so not a single line of the module runs, nor any module that imports it: no products, no buttons, a blank page. That is why "the page is blank" means: open the Console first.',
      'The browser reports the first spot where the code stops making sense to it. Here that was the next `export`, a few lines after the brace that was missing: inside an unclosed function, an `export` is not allowed. A syntax error points near the mistake, so read the lines above it.',
      'Missing brackets hide well; the indentation often gives them away (`renderBadge()` sits at the level of the `else`, but belongs one level out).'
    ]
  },
  solution: [{ save: 'cart.js', replace: ['quantity: 1 })\n  renderBadge()', 'quantity: 1 })\n  }\n  renderBadge()'] }, 'reload']
}
