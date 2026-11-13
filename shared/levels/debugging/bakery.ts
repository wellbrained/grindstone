// Corner Bakery's ordering site, as the Debugging levels start from it (ADR 0007, "World"): plain HTML, one stylesheet
// and small JavaScript modules, written like a real little shop codebase. Each level brings its own app.js and the
// files with its bug; the page, the stylesheet, the products and the money helper are shared.

/** The shop's address bar path for the order page. */
export const ORDER_PAGE = '/order'

export interface OrderPageOptions {
  /** Extra lines under the tagline in the header (e.g. the opening hours). */
  header?: readonly string[]
  /** Extra lines in <main> after the product list (e.g. the basket summary). */
  main?: readonly string[]
}

/** index.html of the order page; its <head> is always line 3 (the bridge goes there, so no line ever moves). */
export function orderPage(options: OrderPageOptions = {}): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Corner Bakery · Order</title>',
    '  <link rel="stylesheet" href="./style.css">',
    '</head>',
    '<body>',
    '  <header class="top">',
    '    <div>',
    '      <h1>Corner Bakery</h1>',
    '      <p class="tagline">Order today, pick up tomorrow from 7:00</p>',
    ...(options.header ?? []).map(line => `      ${line}`),
    '    </div>',
    '    <p class="cart"><span aria-hidden="true">🛒</span> <span id="cart-count" aria-label="Items in your basket"></span></p>',
    '  </header>',
    '  <main>',
    '    <ul id="products" class="products" aria-label="Today\'s products"></ul>',
    ...(options.main ?? []).map(line => `    ${line}`),
    '  </main>',
    '  <script type="module" src="./app.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

/** The basket summary under the products (levels with a total). */
export const SUMMARY = [
  '<section class="summary" aria-label="Your basket">',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '  <p class="note" id="coffee" hidden>A free coffee comes with this order.</p>',
  '</section>'
]

export const STYLE = `/* Corner Bakery order page. Colours from the paper menu in the shop (Maya). */
body {
  margin: 0;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #2a2118;
  background: #fffaf3;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 10px;
}

h1 {
  margin: 0;
  font: 600 22px/1.2 Georgia, "Times New Roman", serif;
}

.tagline,
.hours {
  margin: 2px 0 0;
  font-size: 12px;
  color: #7a6a58;
}

.cart {
  margin: 0;
  border: 1px solid #eadfd0;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 13px;
  white-space: nowrap;
}

main {
  padding: 0 18px 18px;
}

.products,
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.product {
  display: grid;
  grid-template-columns: 54px 1fr auto;
  gap: 12px;
  align-items: center;
  border-top: 1px solid #eadfd0;
  padding: 10px 0;
}

.photo {
  width: 54px;
  height: 40px;
  border-radius: 6px;
  background: linear-gradient(135deg, #e9c48f, #c98a4b);
}

.name {
  display: block;
  font-weight: 600;
}

.price {
  color: #5c4a38;
  font-variant-numeric: tabular-nums;
}

.add,
.action {
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  background: #7a3e12;
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.add:hover,
.action:hover {
  background: #5e2f0d;
}

.add:focus-visible,
.action:focus-visible {
  outline: 2px solid #c98a4b;
  outline-offset: 2px;
}

.summary,
.box {
  border-top: 2px solid #2a2118;
  margin-top: 4px;
  padding-top: 10px;
}

.summary p,
.box p {
  margin: 0 0 4px;
}

.note {
  font-size: 12px;
  color: #7a6a58;
}

h2 {
  margin: 16px 0 6px;
  font: 600 16px/1.3 Georgia, "Times New Roman", serif;
}
`

export const PRODUCTS = `// Today's products. Maya updates this list every evening; prices are in euros.
export const products = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
]
`

export const MONEY = `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
export function formatPrice(amount) {
  return amount.toFixed(2)
}
`

/** The basket with its counter: one line per Add (the simple version most levels use). */
export const CART = `// The basket: what the customer picked, and the counter in the header.
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
`

/** The order page's entry module: the products with their Add buttons, and the counter. */
export const APP = `// The order page: draws today's products and wires up the Add buttons.
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

// Handy while debugging: type cart or products in the Console.
Object.assign(window, { cart, products })
`

/** The files every order page level shares; a level adds its app.js and overrides the files with its bug. */
export function orderSite(files: Readonly<Record<string, string>>, page: OrderPageOptions = {}): Record<string, string> {
  return {
    'index.html': orderPage(page),
    'app.js': APP,
    'style.css': STYLE,
    'products.js': PRODUCTS,
    'money.js': MONEY,
    'cart.js': CART,
    ...files
  }
}
