// Corner Bakery's order page as the Elements & CSS levels (chapter 3) start from it: the order page of chapter 1 with
// a basket and an Order button, styled from colour variables, products in flex rows. Each level brings the CSS (and
// sometimes the markup) with its bug; `swap` changes one exact piece of the shared text and throws when it is not there,
// so a level never silently drifts from what its hints say.
import { MONEY, orderPage } from './bakery'
import type { OrderPageOptions } from './bakery'

/** The basket under the products: the total, the Order button and the line that answers it. */
export const BASKET = [
  '<section class="basket" aria-label="Your basket">',
  '  <p>Total <strong class="total"></strong> €</p>',
  '  <button class="order" id="order" type="button">Order</button>',
  '  <p class="status" id="order-status" role="status"></p>',
  '</section>'
]

/** What the Order button says once there is something in the basket. */
export const ORDERED = 'Thanks! Your order is in: pick it up tomorrow from 7:00.'

/** style.css of the order page; levels change it with `swap` or add their own rules after it. */
export const STOREFRONT_STYLE = `/* Corner Bakery order page. Colours from the paper menu in the shop (Maya). */
:root {
  --brand: #7a3e12;
  --brand-dark: #5e2f0d;
  --ink: #2a2118;
  --muted: #7a6a58;
  --paper: #fffaf3;
  --line: #eadfd0;
}

body {
  margin: 0;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--paper);
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
  color: var(--muted);
}

.cart {
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 13px;
  white-space: nowrap;
}

main {
  padding: 0 18px 18px;
}

.products {
  list-style: none;
  margin: 0;
  padding: 0;
}

.product {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--line);
  padding: 10px 0;
}

.photo {
  flex: none;
  width: 54px;
  height: 40px;
  border-radius: 6px;
  background: linear-gradient(135deg, #e9c48f, #c98a4b);
}

.info {
  flex: 1;
}

.name {
  display: block;
  font-weight: 600;
}

.price {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.add {
  flex: none;
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  background: var(--brand);
  color: var(--paper);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.order {
  border: 0;
  border-radius: 6px;
  padding: 8px 20px;
  background: var(--brand);
  color: var(--paper);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.basket {
  border-top: 2px solid var(--ink);
  margin-top: 4px;
  padding-top: 10px;
}

.basket p {
  margin: 0 0 8px;
}

.status {
  margin: 8px 0 0;
  font-size: 13px;
}
`

/** Today's products (prices in euros); `tag` becomes a class of its row ('special', 'sold-out'). */
export interface StorefrontProduct {
  id: string
  name: string
  price: number
  tag?: string
}

export const STOREFRONT_PRODUCTS: readonly StorefrontProduct[] = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
]

/** products.js with these products, one per line, like Maya keeps it. */
export function productsFile(list: readonly StorefrontProduct[] = STOREFRONT_PRODUCTS): string {
  const line = (product: StorefrontProduct) => `  { id: '${product.id}', name: '${product.name}', price: ${product.price}${product.tag ? `, tag: '${product.tag}'` : ''} }`
  return `// Today's products. Maya updates this list every evening; prices are in euros.\nexport const products = [\n${list.map(line).join(',\n')}\n]\n`
}

/** app.js: the products with their Add buttons, the basket's totals and counter, and every Order button. `extra` goes at the end. */
export function storefrontApp(extra = ''): string {
  return `// The order page: today's products with their Add buttons, the basket and the Order button.
import { products } from './products.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')
const status = document.querySelector('#order-status')
const basket = []

function renderBasket() {
  document.querySelector('#cart-count').textContent = String(basket.length)
  for (const total of document.querySelectorAll('.total')) {
    total.textContent = formatPrice(basket.reduce((sum, product) => sum + product.price, 0))
  }
}

for (const product of products) {
  const item = document.createElement('li')
  item.className = product.tag ? \`product \${product.tag}\` : 'product'
  item.dataset.id = product.id
  item.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span class="info"><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span>
    <button class="add" type="button">Add</button>\`
  item.querySelector('.add').addEventListener('click', () => {
    basket.push(product)
    renderBasket()
  })
  list.append(item)
}

for (const button of document.querySelectorAll('.order')) {
  button.addEventListener('click', () => {
    status.textContent = basket.length ? '${ORDERED}' : 'Your basket is empty: add something first.'
  })
}

renderBasket()
${extra}`
}

/** The line (1-based) of the first line that contains `needle`, after line `after`; throws when there is none. */
export function lineOf(text: string, needle: string, after = 0): number {
  const index = text.split('\n').findIndex((line, at) => at >= after && line.includes(needle))
  if (index < 0) throw new Error(`lineOf: ${JSON.stringify(needle)} is not in the text`)
  return index + 1
}

/** One exact piece of a shared text replaced (the first occurrence); throws when it is not there, so levels never drift. */
export function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`swap: ${JSON.stringify(from)} is not in the text`)
  return text.replace(from, () => to)
}

export interface StorefrontOptions extends OrderPageOptions {
  /** style.css (default: STOREFRONT_STYLE). */
  style?: string
  /** app.js (default: storefrontApp()). */
  app?: string
  products?: readonly StorefrontProduct[]
}

/** A chapter 3 level's files: the order page with the basket (or the level's own lines in `main`) and its stylesheet. */
export function storefront(options: StorefrontOptions = {}, files: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    'index.html': orderPage({ header: options.header, main: options.main ?? BASKET }),
    'app.js': options.app ?? storefrontApp(),
    'style.css': options.style ?? STOREFRONT_STYLE,
    'products.js': productsFile(options.products),
    'money.js': MONEY,
    ...files
  }
}
