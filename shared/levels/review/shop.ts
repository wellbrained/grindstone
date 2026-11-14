// Corner Bakery's shop as Sous's pull requests change it (ADR 0008, "World"): the Debugging track's order page, its
// stylesheet, products and money helper (shared/levels/debugging/bakery.ts), with a basket that keeps one line per
// product and its quantity. A level writes the files before its pull request and the edits Sous made (`withEdits`), so
// its head files are always the base with exactly those changes, and a level never drifts from what its hints quote.
import { orderSite } from '../debugging/bakery'
import type { OrderPageOptions } from '../debugging/bakery'
import type { Files, ReviewState } from './types'

/** The shop's address bar path for the order page. */
export const ORDER_PAGE = '/order'

/** A review before anything happened: no comments, nothing sent. */
export const emptyReview = (): ReviewState => ({ comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0 })

/** The basket with quantities: one line per product, the counter shows how many items. */
export const BASKET_CART = `// The basket: one line per product, with how many the customer wants.
const badge = document.querySelector('#cart-count')

export const cart = { lines: [] }

export function lineOf(id) {
  return cart.lines.find(line => line.id === id)
}

export function itemCount() {
  return cart.lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function basketTotal() {
  return cart.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}

export function renderBadge() {
  badge.textContent = String(itemCount())
}

// called by the Add buttons (app.js)
export function addToCart(product) {
  const line = lineOf(product.id)
  if (line) line.quantity += 1
  else cart.lines.push({ id: product.id, name: product.name, price: product.price, quantity: 1 })
  renderBadge()
}
`

/** The order page's entry module for a basket with a summary: Add puts a product in, then the summary is drawn again. */
export const SUMMARY_APP = `// The order page: draws today's products and wires up the Add buttons.
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { formatPrice } from './money.js'
import { renderSummary } from './summary.js'

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
    renderSummary()
  })
  list.append(item)
}

renderBadge()
renderSummary()

// Handy while trying it: type cart in the Console.
Object.assign(window, { cart })
`

/** The shop's files with the order page's own files replaced or added (`files`), as a pull request's base. */
export function shopFiles(files: Files, page: OrderPageOptions = {}, omit: readonly string[] = []): Record<string, string> {
  return orderSite({ 'cart.js': BASKET_CART, ...files }, page, omit)
}

/** One change Sous made: in `path`, the first occurrence of a text replaced. */
export interface Edit {
  path: string
  replace: readonly [string, string]
}

/**
 * The files after these edits (a pull request's head), each the first occurrence of its text replaced; a file the base
 * lacks is added with the edit's text when its `from` is empty. Throws for an edit that does not apply, so a level's
 * texts can't silently drift from the code.
 */
export function withEdits(base: Files, edits: readonly Edit[]): Record<string, string> {
  const files: Record<string, string> = { ...base }
  for (const { path, replace: [from, to] } of edits) {
    if (!Object.hasOwn(files, path)) {
      if (from !== '') throw new Error(`no file ${path}`)
      files[path] = to
      continue
    }
    if (!files[path]!.includes(from)) throw new Error(`${path} does not contain ${JSON.stringify(from)}`)
    files[path] = files[path]!.replace(from, () => to)
  }
  return files
}
