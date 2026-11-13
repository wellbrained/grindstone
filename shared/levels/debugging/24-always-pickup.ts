// Breakpoints & stepping 5.4: whatever the customer picks, the order says "for pickup": `if (order.method = 'pickup')`
// assigns instead of comparing, so the condition is always true and the order itself changes. Nothing is red. Learn:
// step over a line and watch a value change that the line should only have read.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { DebugScenario } from './types'

/** The order box: pickup or delivery, the address, Order and the answer. */
export const ORDER_FORM = [
  '<section class="summary" aria-label="Your order">',
  '  <p class="note">',
  '    <label><input type="radio" name="method" value="pickup" checked> Pick it up</label>',
  '    <label><input type="radio" name="method" value="delivery"> Deliver it</label>',
  '  </p>',
  '  <button class="action" id="order" type="button">Order</button>',
  '  <p class="note" id="order-status" role="status"></p>',
  '</section>'
]

export const PICKUP_TEXT = 'Order 1: 2 items, for pickup tomorrow from 7:00.'
export const DELIVERY_TEXT = 'Order 1: 2 items, delivered tomorrow morning to 12 Mill Lane.'

const ORDER = `// The order: what the kitchen gets, and the line the customer reads (Ben).
import { cart } from './cart.js'

let number = 0

export function placeOrder(method) {
  const order = { number: ++number, items: cart.items.length, method, address: '12 Mill Lane' }
  return describeOrder(order)
}

function describeOrder(order) {
  let text = \`Order \${order.number}: \${order.items} items\`
  if (order.method = 'pickup') {
    text += ', for pickup tomorrow from 7:00.'
  } else {
    text += \`, delivered tomorrow morning to \${order.address}.\`
  }
  return text
}
`

const APP = `// The order page: today's products with their Add buttons, and the order box.
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { placeOrder } from './order.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')
const status = document.querySelector('#order-status')

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

document.querySelector('#order').addEventListener('click', () => {
  const method = document.querySelector('input[name="method"]:checked').value
  status.textContent = placeOrder(method)
})

renderBadge()

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

export const alwaysPickup: DebugScenario = {
  id: 'debugging-24-always-pickup',
  track: 'debugging',
  kind: 'scenario',
  title: 'Every order is marked pickup',
  difficulty: 2,
  minutes: 6,
  teaches: 'assignment',
  story: [
    'Jonas, with a box under his arm: “Order 1 says pickup. The customer picked delivery, she sent a screenshot. Since the new order page, every order says pickup.”',
    'Record, add two things, choose Deliver it, press Order, then Stop. Step through `describeOrder` in `order.js` and watch `order.method` line by line. Make a delivery read as a delivery, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'order.js',
    debugger: true,
    probes: [
      { id: 'delivery', steps: [{ click: '[data-id="croissant"] .add' }, { click: '[data-id="sourdough"] .add' }, { click: 'input[value="delivery"]' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'pickup', steps: [{ click: 'input[value="pickup"]' }, { click: '#order' }, { text: '#order-status' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'order.js': ORDER }, { main: ORDER_FORM }), observed: null, picked: null }),
  goals: [
    probesGoal('method', 'A delivery says “delivered tomorrow morning to 12 Mill Lane”, and a pickup still says “for pickup”', { delivery: DELIVERY_TEXT, pickup: PICKUP_TEXT.replace('Order 1', 'Order 2') })
  ],
  hints: [
    'Put a breakpoint on line 13 of `order.js`, Record, add two things, choose Deliver it, press Order, Stop. In the Scope, open `order`: what is its `method`? Then Step over (F10) once and look again.',
    'Before line 13 `order.method` is "delivery", after it "pickup". The line was meant to compare, but `=` assigns: `order.method = \'pickup\'` stores "pickup" and its value, "pickup", is truthy, so the `if` always takes the pickup branch.',
    'In `order.js`, line 13, compare with `===`: `if (order.method === \'pickup\') {`. Save, then Reload.'
  ],
  debrief: {
    title: 'One = assigns, three compare',
    paragraphs: [
      '`if (order.method = \'pickup\')` is valid JavaScript: it assigns, and an assignment\'s value is what it assigned. A non-empty string is truthy, so every order took the pickup branch, and the order itself now said pickup too.',
      'Stepping over the line showed it: `order.method` was "delivery" in the Scope before the line ran and "pickup" after. A line that should only read a value but changes it is easy to spot in a recording and easy to miss when reading.',
      'Use `===` (or `==`) to compare. A linter catches this one (`no-cond-assign`), and some teams write `\'pickup\' === order.method` so a missing `=` becomes an error instead of a quiet bug.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['if (order.method = \'pickup\')', 'if (order.method === \'pickup\')'] }, 'reload']
}
