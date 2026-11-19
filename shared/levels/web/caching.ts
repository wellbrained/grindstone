// Corner Bakery's caches (ADR 0009, chapter 4: HTTP caching): the menu changes during the day (the kitchen's tablet
// sets a price at the API), the page shows it with a Refresh button, Lena's browser keeps what the API lets it keep,
// and from 4.3 a CDN sits in front of the API for every customer. Sam is a second customer on his phone; Mia opens the
// shop on www. The levels change the Cache-Control server.js sends (and in 4.5 the address the page asks); the rest is
// here.
import { API, SHOP } from './site'

/** The other address of the shop (the same page on www: another origin, the same site). */
export const WWW = 'https://www.cornerbakery.shop'

/** The kitchen's tablet sets a price: a request from an app on the bakery's network (no browser, no CORS). */
export function kitchenSets(id: string, price: string) {
  return { other: 'Kitchen', request: `POST ${API}/kitchen/prices`, from: null, body: { id, price } } as const
}

/** The croissant's line on the menu (what the probes read). */
export const CROISSANT = '[data-id="croissant"]'

/** What the croissant's line says at a price. */
export const croissantAt = (price: string) => `Butter croissant · ${price} €`

/** server.js's first lines in chapter 4: Express, JSON and form bodies, the shop's origin. */
export const CACHE_HEAD = [
  '// The bakery\'s API server at https://api.cornerbakery.shop (Node with Express).',
  '// Grindstone runs it like `node server.js` every time the shop\'s page loads.',
  'const express = require(\'express\')',
  'const app = express()',
  'app.use(express.json())',
  'app.use(express.urlencoded())',
  '',
  `const SHOP = '${SHOP}'`
].join('\n')

/** The shop's page may read the menu (no credentials: the menu is the same for everyone). */
export const MENU_CORS = [
  '// The shop\'s page may read our answers (Maya)',
  'app.use((req, res, next) => {',
  '  if (req.get(\'Origin\') === SHOP) res.set(\'Access-Control-Allow-Origin\', SHOP)',
  '  next()',
  '})'
].join('\n')

/** Today's menu (prices in euros) and the kitchen's route that changes a price. */
export function menuData(field: 'price' | 'priceCents' = 'price'): string {
  const price = (euros: number) => field === 'price' ? String(euros) : String(Math.round(euros * 100))
  return [
    `// Today's menu${field === 'priceCents' ? ', prices in cents since this morning\'s deploy' : ''}: the kitchen's tablet changes prices during the day (Maya)`,
    'const MENU = [',
    `  { id: 'croissant', name: 'Butter croissant', ${field}: ${price(field === 'price' ? 2.4 : 2.6)} },`,
    `  { id: 'pain-au-chocolat', name: 'Pain au chocolat', ${field}: ${price(2.8)} },`,
    `  { id: 'apricot-danish', name: 'Apricot danish', ${field}: ${price(3.2)} },`,
    `  { id: 'sourdough', name: 'Sourdough loaf', ${field}: ${price(6.5)} },`,
    `  { id: 'rye', name: 'Rye loaf', ${field}: ${price(5)} },`,
    `  { id: 'cinnamon-bun', name: 'Cinnamon bun', ${field}: ${price(3.4)} }`,
    ']',
    '',
    '// POST /kitchen/prices: the kitchen\'s tablet sets a price (an app on the bakery\'s own network, no browser)',
    'app.post(\'/kitchen/prices\', (req, res) => {',
    '  const item = MENU.find(each => each.id === req.body?.id)',
    '  if (!item) return res.status(404).json({ error: \'No such item\' })',
    field === 'price' ? '  item.price = Number(req.body.price)' : '  item.priceCents = Math.round(Number(req.body.price) * 100)',
    '  res.json(item)',
    '})'
  ].join('\n')
}

/** The menu page: today's menu and a Refresh button. */
export const MENU_PAGE = [
  '<section class="box" aria-labelledby="menu-heading">',
  '  <h2 id="menu-heading">Today\'s menu</h2>',
  '  <ul id="products" class="list" aria-label="Today\'s menu"></ul>',
  '  <button class="action" id="refresh" type="button">Refresh menu</button>',
  '</section>'
]

export interface MenuAppOptions {
  /** The first comment line. */
  comment: string
  /** The address after the API's origin (default /menu). */
  path?: string
  /** fetch's options, as written ('' none). */
  init?: string
  /** How a product's price reads in euros, from `product` (default product.price). */
  price?: string
  /** Load the menu only on a click of this button (default: on load too). */
  onClick?: string
}

/** The address line of the menu app: the line a level changes to ask for another address or with other options. */
export function menuFetch(options: Pick<MenuAppOptions, 'path' | 'init'>): string {
  const init = options.init ? `, ${options.init}` : ''
  return `  const response = await fetch(\`\${API}${options.path ?? '/menu'}\`${init})`
}

/** app.js: the menu from the API on load and on Refresh, each product with its price; a line for the croissant. */
export function menuApp(options: MenuAppOptions): string {
  const price = options.price ?? 'product.price'
  return `// ${options.comment}
import { formatPrice } from './money.js'

const API = '${API}'
const list = document.querySelector('#products')

async function loadMenu() {
${menuFetch(options)}
  const products = await response.json()
  list.replaceChildren(...products.map((product) => {
    const item = document.createElement('li')
    item.dataset.id = product.id
    item.textContent = \`\${product.name} · \${formatPrice(${price})} €\`
    return item
  }))
  const croissant = products.find(product => product.id === 'croissant')
  console.log(\`Menu loaded · croissant \${formatPrice(${price.replace(/product/g, 'croissant')})} €\`)
}

document.querySelector('${options.onClick ?? '#refresh'}').addEventListener('click', loadMenu)
${options.onClick ? '' : 'loadMenu()\n'}`
}
