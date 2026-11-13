// State & async 4.3: Ben's order page from 2019 still declares its loop variables with `var`, and each Add button's
// handler reads `product` when it is clicked: by then the loop has finished and the one shared `product` is the last
// one, the sourdough loaf. Learn: a closure keeps the variable, not its value at the time; `let` and `const` in a loop
// give every round its own.
import { ORDER_PAGE, orderSite } from './bakery'
import { probeGoal } from './checks'
import type { DebugScenario } from './types'
import { BASKET_LIST } from './16-object-promise'

/** The basket with its list under the products: one line per Add, with the name and price. */
export const LISTED_CART = `// The basket: what the customer picked, listed under the products, and the counter.
import { formatPrice } from './money.js'

const badge = document.querySelector('#cart-count')
const basket = document.querySelector('#basket')

export const cart = { items: [] }

export function renderBadge() {
  badge.textContent = String(cart.items.length)
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  const line = document.createElement('li')
  line.textContent = \`\${product.name} · \${formatPrice(product.price)}\`
  basket.append(line)
  renderBadge()
}
`

const APP = `// The order page: draws today's products and wires up the Add buttons. Ben wrote
// it in 2019, before the shop's code used modules; it still works (mostly).
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { formatPrice } from './money.js'

var list = document.querySelector('#products')

for (var i = 0; i < products.length; i++) {
  var product = products[i]
  var item = document.createElement('li')
  item.className = 'product'
  item.dataset.id = product.id
  item.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span>
    <button class="add" type="button">Add</button>\`
  item.querySelector('.add').addEventListener('click', function () {
    addToCart(product)
  })
  list.append(item)
}

renderBadge()

// Handy while debugging: type cart or products in the Console.
Object.assign(window, { cart, products })
`

export const addsSourdough: DebugScenario = {
  id: 'debugging-18-adds-sourdough',
  track: 'debugging',
  kind: 'scenario',
  title: 'Every Add button adds the sourdough',
  difficulty: 2,
  minutes: 6,
  teaches: 'closure',
  story: [
    'Jonas from the kitchen: “A customer ordered a croissant and a pain au chocolat. The slip says two sourdough loaves. He was not amused.”',
    'Click Add on the croissant and look at your basket, or type `cart.items` in the Console: nothing is red. Make every Add button add its own product, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [
      { id: 'croissant', steps: [{ click: '[data-id="croissant"] .add' }, { text: '#basket li:last-child' }] },
      { id: 'pain-au-chocolat', steps: [{ click: '[data-id="pain-au-chocolat"] .add' }, { text: '#basket li:last-child' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'cart.js': LISTED_CART }, { main: BASKET_LIST }), observed: null, picked: null }),
  goals: [
    probeGoal('croissant', 'Add on the croissant adds “Butter croissant · 2.40”', 'croissant', 'Butter croissant · 2.40'),
    probeGoal('pain-au-chocolat', 'Add on the pain au chocolat adds “Pain au chocolat · 2.80”', 'pain-au-chocolat', 'Pain au chocolat · 2.80')
  ],
  hints: [
    'Every button adds the last product of the list. The loop builds the buttons in `app.js`: what does each click handler pass to `addToCart`, and when does it read it?',
    'The handler reads `product` when you click, long after the loop has finished. A `var` is one variable for the whole module, so all three handlers share it, and the loop left the sourdough loaf in it.',
    'In `app.js`, line 10 says `var product = products[i]`. Make it `const product = products[i]`: a `const` (or `let`) inside the loop is a new variable for every round, so each handler keeps its own. Save, then Reload.'
  ],
  debrief: {
    title: 'A closure keeps the variable, not the value',
    paragraphs: [
      'A function made inside a loop does not copy the values it uses: it keeps the variables themselves and reads them when it runs. Your click runs the handler long after the loop has finished, and by then the one `product` that `var` declares holds the last product of the list.',
      '`var` belongs to the whole function or module, so the three handlers shared one variable. `let` and `const` belong to the block, and a loop makes a fresh one for every round, so each handler keeps its own product. `for (const product of products)` or `products.forEach(product => …)` do the same.',
      'Changing `var i` to `let i` alone does not help: `product` is still shared. When a value is right while a loop runs and wrong later, look for a variable that outlives the loop.'
    ]
  },
  solution: [{ save: 'app.js', replace: ['  var product = products[i]', '  const product = products[i]'] }, 'reload']
}
