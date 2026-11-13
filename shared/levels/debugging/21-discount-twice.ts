// Breakpoints & stepping 5.1: regulars get 10% off with their loyalty card. Ben added the discount to the basket's total
// last week, Maya added it to the total the page shows yesterday: two croissants cost 3.89 instead of 4.32, and nothing is
// red. Learn: a breakpoint inside the function that runs too often, then the Call stack says who called it, each time.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { DebugScenario } from './types'

/** The basket summary with the loyalty card's box. */
export const LOYALTY_SUMMARY = [
  '<section class="summary" aria-label="Your basket">',
  '  <p class="note"><label><input type="checkbox" id="loyalty"> I have a loyalty card (10% off)</label></p>',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

export const LOYALTY = `// The loyalty card: regulars get 10% off their basket (Maya's idea, since March).
export const LOYALTY_DISCOUNT = 0.1

export function applyDiscount(total) {
  return total * (1 - LOYALTY_DISCOUNT)
}
`

const CART = `// The basket: what the customer picked, its total and the counter in the header.
import { applyDiscount } from './loyalty.js'

const badge = document.querySelector('#cart-count')
const card = document.querySelector('#loyalty')

export const cart = { items: [] }

export function renderBadge() {
  badge.textContent = String(cart.items.length)
}

// what the basket costs, with the loyalty card's discount (Ben, last week)
export function basketTotal() {
  let total = 0
  for (const item of cart.items) total += item.price
  if (card.checked) total = applyDiscount(total)
  return total
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  renderBadge()
}
`

const CHECKOUT = `// The total under the basket, as the customer sees it. Maya, yesterday: "regulars
// should see their discount".
import { basketTotal } from './cart.js'
import { applyDiscount } from './loyalty.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')
const card = document.querySelector('#loyalty')

export function renderTotal() {
  let total = basketTotal()
  if (card.checked) total = applyDiscount(total)
  totalText.textContent = formatPrice(total)
}
`

const APP = `// The order page: today's products with their Add buttons, and the total.
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

document.querySelector('#loyalty').addEventListener('change', renderTotal)

renderBadge()
renderTotal()

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

const CROISSANT = '[data-id="croissant"] .add'

export const discountTwice: DebugScenario = {
  id: 'debugging-21-discount-twice',
  track: 'debugging',
  kind: 'scenario',
  title: 'The discount is applied twice',
  difficulty: 1,
  minutes: 6,
  teaches: 'call stack',
  story: [
    'Anna at the till: “A regular bought two croissants with her loyalty card. The page said 3.89, the till said 4.32. She showed me her phone and I gave her the difference.”',
    'Nothing is red, so watch it run: set a breakpoint inside `applyDiscount` (click its line number in `loyalty.js`), press Record in the Debugger, add two croissants, tick the loyalty card, then Stop. Find out who applies the discount, fix it, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'loyalty.js',
    debugger: true,
    probes: [
      { id: 'with-card', steps: [{ click: CROISSANT }, { click: CROISSANT }, { click: '#loyalty' }, { text: '#order-total' }] },
      { id: 'without-card', steps: [{ click: '#loyalty' }, { text: '#order-total' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'cart.js': CART, 'checkout.js': CHECKOUT, 'loyalty.js': LOYALTY }, { main: LOYALTY_SUMMARY }), observed: null, picked: null }),
  goals: [
    probesGoal('discount', 'With the loyalty card two croissants cost “4.32”, without it “4.80”', { 'with-card': '4.32', 'without-card': '4.80' })
  ],
  hints: [
    'The total is 10% off twice: 4.80 × 0.9 × 0.9 = 3.89. Put a breakpoint on line 5 of `loyalty.js`, Record, tick the card, Stop, and press Resume (F8): how often does it stop for one tick?',
    'It stops twice. At each stop, read the Call stack: the frame under `applyDiscount` is who called it. Once it is `basketTotal` (`cart.js:17`), once `renderTotal` (`checkout.js:12`), which got its total from `basketTotal` already.',
    'The basket\'s total already has the discount. In `checkout.js`, delete line 12 (`if (card.checked) total = applyDiscount(total)`), so the page shows what `basketTotal` worked out. Save, then Reload.'
  ],
  debrief: {
    title: 'A breakpoint says how often, the Call stack says who',
    paragraphs: [
      'Both Ben and Maya were right on their own: the basket\'s total should have the discount, and the page should show it. Together the discount ran twice, and since nothing failed, only the number said so.',
      'A breakpoint inside the function that does too much answers two questions at once: how often it runs (it stopped twice for one tick of the box), and who called it each time (the frame under it in the Call stack, with its line). Clicking a frame shows that caller\'s line and its variables at that moment.',
      'Deleting it from `basketTotal` in `cart.js` instead works as well; what matters is that one place owns the rule. This was a recording: the app never paused. You stepped through what it had done, which is why you could go back as well as forward.'
    ]
  },
  solution: [{ save: 'checkout.js', replace: ['  let total = basketTotal()\n  if (card.checked) total = applyDiscount(total)\n', '  let total = basketTotal()\n'] }, 'reload']
}
