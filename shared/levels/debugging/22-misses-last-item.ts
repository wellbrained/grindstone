// Breakpoints & stepping 5.2: Ben's receipt loop stops one round early (`i < items.length - 1`): the last thing you add
// is never listed and the receipt's total leaves it out. Nothing is red. Learn: step through a loop and watch its counter
// against the condition at every round; the round that does not happen is the bug.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { DebugScenario } from './types'

/** The receipt under the products: one line per item, then the total. */
export const RECEIPT_SUMMARY = [
  '<section class="summary" aria-label="Your receipt">',
  '  <h2>Your receipt</h2>',
  '  <ul id="receipt" class="list"></ul>',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const RECEIPT = `// The receipt under the basket: one line per item, then the total (Ben, 2021).
import { formatPrice } from './money.js'

const list = document.querySelector('#receipt')
const totalText = document.querySelector('#order-total')

export function renderReceipt(items) {
  list.textContent = ''
  let total = 0
  for (let i = 0; i < items.length - 1; i++) {
    const line = document.createElement('li')
    line.textContent = \`\${items[i].name} · \${formatPrice(items[i].price)}\`
    list.append(line)
    total += items[i].price
  }
  totalText.textContent = formatPrice(total)
}
`

const APP = `// The order page: today's products with their Add buttons, and the receipt.
import { products } from './products.js'
import { addToCart, cart } from './cart.js'
import { renderReceipt } from './receipt.js'
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
    renderReceipt(cart.items)
  })
  list.append(item)
}

renderReceipt(cart.items)

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

export const missesLastItem: DebugScenario = {
  id: 'debugging-22-misses-last-item',
  track: 'debugging',
  kind: 'scenario',
  title: 'The receipt misses the last item',
  difficulty: 2,
  minutes: 6,
  teaches: 'off-by-one',
  story: [
    'Jonas packs the orders: “The receipt said a croissant and a pain au chocolat, 5.20. The customer had also ordered a sourdough loaf. Which one is right?” The basket is: all three were ordered.',
    'Record, add the three products, Stop, and step through `renderReceipt` in `receipt.js`: watch `i` and `items.length` at every round of the loop. Make the receipt list every item, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'receipt.js',
    debugger: true,
    probes: [
      { id: 'lines', steps: [{ click: '[data-id="croissant"] .add' }, { click: '[data-id="pain-au-chocolat"] .add' }, { click: '[data-id="sourdough"] .add' }, { count: '#receipt li' }] },
      { id: 'last', steps: [{ text: '#receipt li:last-child' }] },
      { id: 'total', steps: [{ text: '#order-total' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'receipt.js': RECEIPT }, { main: RECEIPT_SUMMARY }), observed: null, picked: null }),
  goals: [
    probesGoal('receipt', 'After three Adds the receipt lists all three, the sourdough loaf last, totals “11.70”, and nothing is red', { lines: 3, last: 'Sourdough loaf · 6.50', total: '11.70' }, { clean: true })
  ],
  hints: [
    'The loop on line 10 of `receipt.js` decides how many lines get printed. Put a breakpoint on it, Record, add the three products, Stop, and press Resume (F8) a few times: what are `i` and `items.length` each time it stops?',
    'With three items the loop stops when `i` is 2, because `2 < items.length - 1` is `2 < 2`, false. So only items 0 and 1 are printed. Arrays count from 0 to `length - 1`, and `i < length` already stops after the last one.',
    'In `receipt.js`, line 10, change `i < items.length - 1` to `i < items.length`. Save, then Reload.'
  ],
  debrief: {
    title: 'Watch the counter, not the code',
    paragraphs: [
      'The loop looked right and ran without an error: it just stopped one round too early. `i < items.length - 1` leaves out the last index, because `i < items.length` already stops right after it. The `- 1` is a habit from code that once kept the total as the last entry.',
      'A breakpoint on the loop\'s line stops at every round, before its condition is checked, with `i` and `items` in the Scope. Stepping through, the round you expected never came: that is how an off-by-one looks. Step back went to the round before when you missed it.',
      'Using `<=` with `- 1` works too, and so does `for (const item of items)`, which can\'t get the bounds wrong. `i <= items.length` goes one too far: the extra round reads `items[3]`, which is undefined.'
    ]
  },
  solution: [{ save: 'receipt.js', replace: ['i < items.length - 1', 'i < items.length'] }, 'reload']
}
