// Corner Bakery's server, as the Network levels (chapter 2) script it with the fake backend (backend.ts): the menu the
// order page loads, the basket with a clearCart, the order box, and the API notes Ben keeps (api.md, a file of the app
// like any other). Each level adds the routes and files of its own bug.
import { orderSite } from './bakery'
import type { OrderPageOptions } from './bakery'
import type { BackendRoute, JsonValue } from './types'

/**
 * A Network level's files: the order site, whose menu comes from the server (so without products.js), plus its own;
 * `omit` leaves out shared files the level's app does not use.
 */
export function networkSite(files: Readonly<Record<string, string>>, page: OrderPageOptions = {}, omit: readonly string[] = []): Record<string, string> {
  const site = orderSite(files, page)
  return Object.fromEntries(Object.entries(site).filter(([path]) => path !== 'products.js' && !omit.includes(path)))
}

/** Today's products, as GET /api/menu answers them (the same three as products.js in chapter 1). */
export const MENU: JsonValue = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
]

/** The menu as the server answers it, a little slower than a local file. */
export const MENU_ROUTE: BackendRoute = { path: '/api/menu', respond: { status: 200, json: MENU, delay: 80 } }

/** Opening hours, as GET /api/hours answers them. */
export const HOURS: JsonValue = { weekdays: '7:00–18:00', saturday: '7:00–13:00' }

/** menu.js: today's products from the server, with the status checked. */
export const MENU_JS = `// Today's products come from the shop's server: Maya changes them in the kitchen
// app, and the order page loads them when it opens (Ben).
export async function loadMenu() {
  const response = await fetch('/api/menu')
  if (!response.ok) throw new Error(\`The menu did not load: \${response.status}\`)
  return response.json()
}
`

/** The basket with its counter, and clearCart for after an order went through. */
export const CART_JS = `// The basket: what the customer picked, and the counter in the header.
const badge = document.querySelector('#cart-count')

export const cart = { items: [] }

export function renderBadge() {
  badge.textContent = String(cart.items.length)
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  cart.items.push({ id: product.id, name: product.name, price: product.price })
  renderBadge()
}

// after an order went through: a fresh basket for the next one
export function clearCart() {
  cart.items = []
  renderBadge()
}
`

/** The order box under the products: the Order button and the line that tells the customer what happened. */
export const ORDER_BOX = [
  '<section class="summary" aria-label="Your order">',
  '  <button class="action" id="order" type="button">Order for pickup</button>',
  '  <p class="note" id="order-status" role="status"></p>',
  '</section>'
]

/** The order page's entry module for the Network levels: the menu from the server, Add, and the Order button. */
export const ORDER_APP = `// The order page: loads today's menu from the server and wires up Add and Order.
import { loadMenu } from './menu.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { placeOrder } from './order.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')

function renderMenu(products) {
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
  console.log(\`Corner Bakery shop ready · \${products.length} products\`)
}

document.querySelector('#order').addEventListener('click', placeOrder)
renderBadge()
loadMenu().then(renderMenu)

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

/** One row of the API notes: method, path, what it answers. */
export type ApiRow = readonly [method: string, path: string, answers: string]

/** api.md: the paths the shop's server answers on the shop's own address, as Ben keeps them. */
export function apiNotes(rows: readonly ApiRow[], after: readonly string[] = []): string {
  return [
    '# Corner Bakery API',
    '',
    'What the shop\'s server answers on our own address, https://cornerbakery.shop.',
    'Ben keeps this list up to date: ask him before you add a path.',
    '',
    '| Method | Path | Answers |',
    '| --- | --- | --- |',
    ...rows.map(([method, path, answers]) => `| ${method} | ${path} | ${answers} |`),
    ...(after.length ? ['', ...after] : []),
    ''
  ].join('\n')
}

export const API_MENU: ApiRow = ['GET', '/api/menu', 'Today\'s products: `[{ id, name, price }]`']
export const API_HOURS: ApiRow = ['GET', '/api/hours', 'Opening hours: `{ weekdays, saturday }`']
export const API_SPECIALS: ApiRow = ['GET', '/api/specials', 'Today\'s specials: `[{ name, price }]`']
export const API_ORDERS: ApiRow = ['POST', '/api/orders', 'Takes an order `{ items: [{ id, quantity }] }`; answers `{ number, items }` or `{ error }`']
