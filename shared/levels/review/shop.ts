// Corner Bakery's shop as Sous's pull requests change it (ADR 0008, "World"): the Debugging track's order page, its
// stylesheet, products and money helper (shared/levels/debugging/bakery.ts), with a basket that keeps one line per
// product and its quantity. A level writes the files before its pull request and the edits Sous made (`withEdits`), so
// its head files are always the base with exactly those changes, and a level never drifts from what its hints quote.
import { orderSite } from '../debugging/bakery'
import { MENU_JS, networkSite } from '../debugging/shop-server'
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

/** How the shop's order page looks when its menu comes from the server (chapter 5, `serverShop`). */
export interface ServerShopOptions {
  /** app.js asks the server who is signed in (account.js's `whoAmI`, `me`) and says so in the header. */
  whoAmI?: true
  /** More of the shop's own modules app.js imports for what they do (`'./order.js'`). */
  imports?: readonly string[]
  /** More lines at the end of the page (in `<main>`, after the product list). */
  main?: readonly string[]
}

/**
 * The order page's entry module when the menu comes from the server: each product drawn from a fixed template, its
 * name and price put in with `textContent` (text from the server is never HTML), then the counter.
 */
function serverApp(options: ServerShopOptions): string {
  return [
    '// The order page: loads today\'s menu from the server and wires up the Add buttons.',
    'import { loadMenu } from \'./menu.js\'',
    ...(options.whoAmI ? ['import { whoAmI } from \'./account.js\''] : []),
    'import { addToCart, cart, renderBadge } from \'./cart.js\'',
    'import { formatPrice } from \'./money.js\'',
    ...(options.imports ?? []).map(path => `import '${path}'`),
    '',
    'const list = document.querySelector(\'#products\')',
    ...(options.whoAmI ? ['const me = await whoAmI()'] : []),
    '',
    'function renderMenu(products) {',
    '  for (const product of products) {',
    '    const item = document.createElement(\'li\')',
    '    item.className = \'product\'',
    '    item.dataset.id = product.id',
    '    item.innerHTML = `',
    '      <span class="photo" aria-hidden="true"></span>',
    '      <span><span class="name"></span> <span class="price"></span></span>',
    '      <button class="add" type="button">Add</button>`',
    '    item.querySelector(\'.name\').textContent = product.name',
    '    item.querySelector(\'.price\').textContent = formatPrice(product.price)',
    '    item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))',
    '    list.append(item)',
    '  }',
    '}',
    '',
    ...(options.whoAmI ? ['document.querySelector(\'#who\').textContent = `Signed in as ${me.name}`'] : []),
    'renderBadge()',
    'renderMenu(await loadMenu())',
    '',
    '// Handy while trying it: type cart in the Console.',
    'Object.assign(window, { cart })',
    ''
  ].join('\n')
}

/**
 * The shop when its menu comes from the server (chapter 5): Debugging's Network shop (`networkSite`: no products.js,
 * menu.js loads `/api/menu`) with a safe app.js (`serverApp`) and the level's own files, server code among them
 * (`server/…`, shown in the diff, never run in the browser).
 */
export function serverShop(files: Files, options: ServerShopOptions = {}): Record<string, string> {
  return networkSite(
    { 'app.js': serverApp(options), 'menu.js': MENU_JS, ...files },
    { header: options.whoAmI ? ['<p class="hours" id="who"></p>'] : [], main: options.main ?? [] }
  )
}
