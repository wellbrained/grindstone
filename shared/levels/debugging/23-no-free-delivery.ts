// Breakpoints & stepping 5.3: delivery is free from 25 €, and a basket of exactly 25.00 € still pays 3.50. The prices
// add up to 24.999999999999996: the page rounds it to "25.00", the comparison doesn't. Nothing is red. Learn: the Scope
// shows the value itself, not how the page prints it; compare money in cents (or rounded), never as raw floats.
import { LAPTOP } from './14-gone-on-phones'
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { DebugScenario } from './types'

/** Five products, so a basket can make exactly 25.00. */
export const DELIVERY_PRODUCTS = `// Today's products. Maya updates this list every evening; prices are in euros.
export const products = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 },
  { id: 'rye', name: 'Rye loaf', price: 4.9 },
  { id: 'cookie', name: 'Oat cookie', price: 1.9 }
]
`

/** The basket summary with the delivery line. */
export const DELIVERY_SUMMARY = [
  '<section class="summary" aria-label="Your basket">',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '  <p>Delivery <strong id="delivery"></strong> <span class="note">(free from 25 €)</span></p>',
  '</section>'
]

const DELIVERY = `// Delivery to your door: 3.50 €, free from 25 € (it says so on the window).
export const FREE_FROM = 25
const DELIVERY_FEE = 3.5

export function deliveryFee(total) {
  if (total >= FREE_FROM) return 0
  return DELIVERY_FEE
}
`

const CART = `// The basket: what the customer picked, what it costs and the delivery.
import { deliveryFee } from './delivery.js'
import { formatPrice } from './money.js'

export const cart = { items: [] }

export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  renderBasket()
}

export function renderBasket() {
  const total = cart.items.reduce((sum, item) => sum + item.price, 0)
  const fee = deliveryFee(total)
  document.querySelector('#cart-count').textContent = String(cart.items.length)
  document.querySelector('#order-total').textContent = formatPrice(total)
  document.querySelector('#delivery').textContent = fee === 0 ? 'free' : formatPrice(fee)
}
`

const APP = `// The order page: today's products with their Add buttons, the total and the delivery.
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

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

const add = (id: string) => ({ click: `[data-id="${id}"] .add` })

export const noFreeDelivery: DebugScenario = {
  id: 'debugging-23-no-free-delivery',
  track: 'debugging',
  kind: 'scenario',
  title: 'Free delivery never kicks in',
  difficulty: 3,
  minutes: 7,
  teaches: 'floating point',
  story: [
    'Lena wrote in: “Two sourdough loaves, a rye loaf, a croissant, a pain au chocolat and an oat cookie: 25.00 € on your page. The window says free delivery from 25 €, your page charged me 3.50.”',
    'The page says 25.00, so the comparison should hold. Record, add exactly that, Stop, and look at `total` in the Scope when `deliveryFee` runs. Make 25.00 € get free delivery (and less still pay), then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'delivery.js',
    debugger: true,
    probes: [
      { id: 'below', steps: [add('sourdough'), add('sourdough'), add('rye'), { text: '#delivery' }] },
      { id: 'at-25', steps: [add('croissant'), add('pain-au-chocolat'), add('cookie'), { text: '#delivery' }] },
      { id: 'total', steps: [{ text: '#order-total' }] },
      // another customer, in a frame of its own (a laptop): just under 25 still pays, so a lower threshold is no fix
      { id: 'at-24-40', width: LAPTOP, steps: [add('sourdough'), add('sourdough'), add('sourdough'), add('rye'), { text: '#delivery' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'cart.js': CART, 'delivery.js': DELIVERY, 'products.js': DELIVERY_PRODUCTS }, { main: DELIVERY_SUMMARY }), observed: null, picked: null }),
  goals: [
    probesGoal('free', 'A basket of “25.00” gets free delivery, and ones of 17.90 and 24.40 still pay “3.50”', { 'below': '3.50', 'at-25': 'free', 'total': '25.00', 'at-24-40': '3.50' })
  ],
  hints: [
    'Put a breakpoint on line 6 of `delivery.js` (the comparison), Record, add the six things from the story, Stop, and Resume (F8) to the last stop. What is `total` in the Scope?',
    'It is `24.999999999999996`. Prices like 2.4 and 6.5 have no exact binary value, so adding them leaves a tiny error. `formatPrice` rounds it to "25.00" for the page, but `>=` compares the real number, which is less than 25.',
    'Compare whole cents: in `delivery.js`, line 6, make it `if (Math.round(total * 100) >= FREE_FROM * 100) return 0`. Save, then Reload.'
  ],
  debrief: {
    title: 'The page rounds, the comparison doesn\'t',
    paragraphs: [
      'Most decimal prices have no exact value as a JavaScript number (a binary floating point number), the same way 1/3 has none in decimals. Adding six of them left `24.999999999999996`: close to 25, but less. The page rounds for display, so everything you could see said 25.00.',
      'The Scope shows the value itself, with every digit, which is what the comparison sees. When what the page shows and what the code decides disagree, put a breakpoint where the code decides and read the raw value.',
      'Money is safest in whole cents (`240` for 2.40) or rounded to cents before comparing: `Math.round(total * 100)`, or rounding each step of the sum. Rounding down with `Math.floor` or `parseInt` makes it 24, still too little.'
    ]
  },
  solution: [{ save: 'delivery.js', replace: ['  if (total >= FREE_FROM) return 0', '  if (Math.round(total * 100) >= FREE_FROM * 100) return 0'] }, 'reload']
}
