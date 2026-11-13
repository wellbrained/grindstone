// Reading errors 1.3: `let total` lives inside an `if` block, and the line after the block uses it, so "total is not
// defined" as soon as the page loads (and after every Add). Learn: the error names the variable; find where it lives.
import { ORDER_PAGE, SUMMARY, orderSite } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import type { DebugScenario } from './types'

const CHECKOUT = `// The basket summary under the products: the total, and the free coffee.
import { cart } from './cart.js'
import { formatPrice } from './money.js'

// Agreed with the shop team: orders from 30 euros get a free coffee at pickup.
const FREE_COFFEE_FROM = 30

const totalText = document.querySelector('#order-total')
const coffeeNote = document.querySelector('#coffee')

export function renderTotal() {
  if (cart.items.length > 0) {
    let total = 0
    for (const line of cart.items) total += line.price
    coffeeNote.hidden = total < FREE_COFFEE_FROM
  }
  totalText.textContent = formatPrice(total)
}
`

const APP = `// The order page: draws today's products, wires up the Add buttons, shows the total.
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { renderTotal } from './checkout.js'
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
    renderTotal()
  })
  list.append(item)
}

renderBadge()
renderTotal()

// Handy while debugging: type cart or products in the Console.
Object.assign(window, { cart, products })
`

export const totalNotDefined: DebugScenario = {
  id: 'debugging-03-total-not-defined',
  track: 'debugging',
  kind: 'scenario',
  title: 'Total is not defined',
  difficulty: 2,
  minutes: 5,
  teaches: 'ReferenceError',
  story: [
    'Ben added the free coffee for orders from 30 euros yesterday. Since then the total under the basket stays empty, even after adding things.',
    'Get the total working again: it shows 0.00 for an empty basket and adds up what you put in. Save and Reload to check.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [
      { id: 'total-empty', steps: [{ text: '#order-total' }] },
      { id: 'total-two', steps: [{ click: '[data-id="croissant"] .add' }, { click: '[data-id="croissant"] .add' }, { text: '#order-total' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'checkout.js': CHECKOUT }, { main: SUMMARY }), observed: null, picked: null }),
  goals: [
    probeGoal('empty', 'An empty basket shows a total of 0.00', 'total-empty', '0.00'),
    probeGoal('two', 'Two croissants make a total of 4.80', 'total-two', '4.80'),
    noErrorsGoal()
  ],
  hints: [
    'The error names a variable. Where is it declared, and where is it used?',
    'Click the top frame (`checkout.js:17`). `total` is used there, but it is declared with `let` inside the `if` block above, and a `let` only exists inside its own `{ }`.',
    'In `checkout.js`, move `let total = 0` from inside the `if` to the line above it (right under `export function renderTotal() {`), then Save and Reload.'
  ],
  debrief: {
    title: 'A variable lives inside its own braces',
    paragraphs: [
      '`ReferenceError: total is not defined` means that, at that line, there is no variable called `total` at all. It was declared, but with `let` inside the `if` block, and `let` and `const` only exist between the braces they are declared in.',
      'So read the name in the message, then look for where it is declared and ask whether that place is still "in reach" of the line in the trace. Declaring it before the `if` gives the whole function one `total` that starts at 0, which is also what an empty basket needs.',
      'The coffee rule broke the total because both were changed together: worth a look in the Console after every small change.'
    ]
  },
  solution: [{ save: 'checkout.js', replace: ['  if (cart.items.length > 0) {\n    let total = 0\n', '  let total = 0\n  if (cart.items.length > 0) {\n'] }, 'reload']
}
