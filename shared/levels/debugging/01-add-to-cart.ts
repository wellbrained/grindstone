// Reading errors 1.1: a misspelled property in cart.js. Clicking Add throws a TypeError ("Cannot read properties of
// undefined (reading 'push')" in Chrome); the page itself shows nothing. Read the message, click the top frame, fix
// the name. The approved sample of the chapter preview (.impeccable/mocks/previews/debugging-preview.html).
import { ORDER_PAGE, orderSite } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import type { DebugScenario } from './types'

const CART = `// The basket: what the customer picked, and the counter in the header.
// A line keeps its own copy of name and price, so a price change during the day
// does not change what is already in someone's basket (Jonas).

const badge = document.querySelector('#cart-count')

export const cart = { items: [], count: 0 }

export function renderBadge(count) {
  badge.textContent = String(count)
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  const line = { id: product.id, name: product.name, price: product.price }
  cart.count += 1
  cart.itmes.push(line)
  renderBadge(cart.count)
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
  item.querySelector('.add').addEventListener('click', () => {
    addToCart(product)
  })
  list.append(item)
}

renderBadge(cart.count)
console.log(\`Corner Bakery shop ready · \${products.length} products\`)

// Handy while debugging: type cart or products in the Console.
Object.assign(window, { cart, products })
`

export const addToCart: DebugScenario = {
  id: 'debugging-01-add-to-cart',
  track: 'debugging',
  kind: 'scenario',
  title: 'Add to cart does nothing',
  difficulty: 1,
  minutes: 4,
  teaches: 'TypeError',
  story: [
    'Anna from the shop writes: “Customers say the Add button does nothing since this morning. No error on the page, it just… doesn\'t add. Can you look?”',
    'Click Add in the app on the right and watch the Console. Find what breaks, fix it in the code, then Save and Reload: the goals are checked on every reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [{ id: 'badge-after-add', steps: [{ click: '[data-id="croissant"] .add' }, { text: '#cart-count' }] }]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'cart.js': CART }), observed: null, picked: null }),
  goals: [
    probeGoal('adds', 'Add puts a croissant in the cart (the badge shows 1)', 'badge-after-add', '1'),
    noErrorsGoal()
  ],
  hints: [
    'Click Add, then read the red error from left to right. It names a property: which one, and on what?',
    'The error says the thing before `.push` is undefined. Click the top frame of the trace (`cart.js:17`): it opens the line that ran it. Is `cart.itmes` really what the cart has?',
    'In `cart.js`, line 17 says `cart.itmes`, but the cart\'s list is called `items` (line 7). Change it to `cart.items.push(line)`, Save, then Reload.'
  ],
  debrief: {
    title: 'A typo that only shows up as undefined',
    paragraphs: [
      'JavaScript does not complain when you read a property that does not exist: `cart.itmes` is simply `undefined`. It only breaks one step later, when the code calls `.push` on that `undefined`. That is why the message talks about reading `push`, while the mistake is the name right before it.',
      'The top frame of the trace is where it broke: `addToCart` in `cart.js`. The frame below it, the click handler in `app.js`, is who called it. Start reading at the top, and look at what the message says was undefined.',
      'The page showed nothing because errors go to the Console, not to the screen. When a button "does nothing", open the Console first.'
    ]
  },
  solution: [{ save: 'cart.js', replace: ['cart.itmes.push(line)', 'cart.items.push(line)'] }, 'reload']
}
