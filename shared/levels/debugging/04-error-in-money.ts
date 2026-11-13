// Reading errors 1.4: checkout.js passes the whole cart to formatPrice, which throws inside money.js
// ("amount.toFixed is not a function"). The top frame is where it broke; one frame down is where it went wrong.
import { ORDER_PAGE, SUMMARY, orderSite } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import type { DebugScenario } from './types'

const CHECKOUT = `// The basket summary under the products.
import { cart } from './cart.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

// called after every Add (app.js) and once when the page opens
export function renderTotal() {
  const total = cart.items.reduce((sum, line) => sum + line.price, 0)
  totalText.textContent = formatPrice(cart)
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

export const errorInMoney: DebugScenario = {
  id: 'debugging-04-error-in-money',
  track: 'debugging',
  kind: 'scenario',
  title: 'The error is in money.js, the bug isn\'t',
  difficulty: 2,
  minutes: 6,
  teaches: 'TypeError',
  story: [
    'Maya: “The total under the basket stopped working. Jonas had a quick look and says the error is in `money.js`, but nobody has touched `money.js` in weeks.”',
    'Find the line that really went wrong and fix it there, so the total adds up what is in the basket. Save and Reload to check.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'money.js',
    probes: [{ id: 'total', steps: [{ click: '[data-id="croissant"] .add' }, { click: '[data-id="sourdough"] .add' }, { text: '#order-total' }] }]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'checkout.js': CHECKOUT }, { main: SUMMARY }), observed: null, picked: null }),
  goals: [
    probeGoal('total', 'A croissant and a sourdough loaf make a total of 8.90', 'total', '8.90'),
    noErrorsGoal()
  ],
  hints: [
    '`formatPrice` has worked for weeks. If it suddenly can\'t do its job, maybe it was handed something it was never meant to get.',
    'Walk down the trace: the top frame is `formatPrice` in `money.js`, the one below it is `renderTotal` in `checkout.js`, which called it. What does that line pass in? Try `cart` in the Console input.',
    'In `checkout.js`, line 10 passes the whole `cart` to `formatPrice`. Pass the number it just added up instead: `formatPrice(total)`. Save, then Reload.'
  ],
  debrief: {
    title: 'Where it broke is not always where it went wrong',
    paragraphs: [
      'The top frame of a trace is the line that threw: here `amount.toFixed(2)` in `money.js`, because `amount` was the cart object, which has no `toFixed`. The helper was right; the value it got was wrong.',
      'Each frame below is the line that called the one above it. One step down, `renderTotal` passed `cart` where it meant `total`. That is where the fix belongs: making `formatPrice` accept a cart would only hide the mistake (and print NaN).',
      'So read a trace from the top, and when the top frame is code that has worked for a long time, step down until you reach the code that changed.'
    ]
  },
  solution: [{ save: 'checkout.js', replace: ['formatPrice(cart)', 'formatPrice(total)'] }, 'reload']
}
