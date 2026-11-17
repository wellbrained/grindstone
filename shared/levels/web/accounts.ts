// Corner Bakery's customer accounts (ADR 0009, chapter 2: cookies & sessions): Lena signs in on the shop's page, the
// API's server.js sets her session cookie, and her orders come from the API. Other sites she opens while signed in:
// cheap-flour.example (a rival's "half price" page that places orders in her name), her webmail on mail.example, and a
// guard page on a site no text names (so no server.js can single it out by name). The levels change the login's cookie
// and the routes; the rest is shared here.
import { API, SHOP } from './site'
import type { OtherSite, SiteAction } from './sites'

/** The rival's site: readable in the Other site panel, never editable. */
export const CHEAP_FLOUR = 'https://cheap-flour.example'
/** Lena's webmail. */
export const MAIL = 'https://mail.example'
/** A guard page: the attacker's page again, on a site no text names, with no Referer (and Origin: null on a POST). */
export const UNNAMED_SITE = 'https://bread-offers.example'
/**
 * A second guard page on a host that starts like the shop's (another site all the same), sending a normal Referer and a
 * real Origin: it catches an Origin or Referer compared loosely (`startsWith(SHOP)`, `includes('cornerbakery.shop')`).
 */
export const LOOKALIKE_SITE = 'https://cornerbakery.shop.bread-offers.example'

/** Lena's session id: what server.js's login puts in the cookie (and what a thief would replay). */
export const LENA_SESSION_ID = 'lena-7f3a'

/** The attacker's page: a hidden form that submits itself, 40 sourdough loaves on the account of whoever is signed in. */
export const ATTACK_FORM: SiteAction = { form: `${API}/orders`, method: 'POST', fields: { item: 'sourdough', quantity: '40' } }

/** cheap-flour.example with these actions (the panel shows its page; the scene or a probe visits it). */
export function cheapFlour(actions: readonly SiteAction[] = [ATTACK_FORM]): OtherSite {
  return {
    origin: CHEAP_FLOUR,
    title: 'Cheap Flour · flour at half price',
    role: 'attacker',
    intro: ['<h1>Flour at half price!</h1>', '<p>Today only: 25 kg of organic wheat flour for 9.99.</p>'],
    actions
  }
}

/** The same attack from a site no text names, sending no Referer (a guard: it catches a server that only knows one name). */
export function unnamedAttack(actions: readonly SiteAction[] = [ATTACK_FORM]): OtherSite {
  return { origin: UNNAMED_SITE, title: 'Bread offers', role: 'attacker', intro: ['<h1>Fresh offers</h1>'], actions, noReferrer: true, hidden: true }
}

/** The attack from a host that only looks like the shop's (a guard: no text names it; a Referer and an Origin as usual). */
export function lookalikeAttack(actions: readonly SiteAction[] = [ATTACK_FORM]): OtherSite {
  return { origin: LOOKALIKE_SITE, title: 'Corner Bakery deals', role: 'attacker', intro: ['<h1>Corner Bakery deals</h1>'], actions, hidden: true }
}

/** Lena's webmail: the shop's email about her order, with a link to its pickup page. */
export function webmail(link: string, text: string): OtherSite {
  return {
    origin: MAIL,
    path: '/inbox/2381',
    title: 'Mail · Your order 1042 is ready',
    role: 'mail',
    intro: ['<h1>Your order 1042 is ready</h1>', '<p>From: Corner Bakery &lt;orders@cornerbakery.shop&gt;</p>', '<p>Hi Lena, your order is ready to pick up tomorrow from 7:00.</p>'],
    actions: [{ link, text }]
  }
}

/** The page: Lena's account (signed in or not, the sign-in button), her orders, and an order button. */
export const ACCOUNT_PAGE = [
  '<section class="box" aria-labelledby="account-heading">',
  '  <h2 id="account-heading">Your account</h2>',
  '  <p id="who" role="status">Not signed in.</p>',
  '  <button class="action" id="sign-in" type="button">Sign in as Lena</button>',
  '</section>',
  '<section class="box" aria-labelledby="orders-heading">',
  '  <h2 id="orders-heading">Your orders</h2>',
  '  <ul id="orders" class="list" aria-label="Your orders"></ul>',
  '  <p>',
  '    <button class="action" id="order" type="button">Order 2 croissants</button>',
  '    <button class="action" id="refresh" type="button">Refresh</button>',
  '  </p>',
  '  <p class="note" id="order-status" role="status"></p>',
  '</section>'
]

/** What the page says once Lena's own order is in. */
export const ORDER_IN = 'Thanks! Your order is in.'
/** What the account line says when the API knows her. */
export const SIGNED_IN = 'Signed in as Lena'

export interface AccountAppOptions {
  /** Where the sign-in goes (default /login). */
  login?: string
  /** What the page asks after signing in to know who is signed in (default /account). */
  account?: string
  /** Lines added to the end of app.js (a level's own). */
  extra?: readonly string[]
}

/** app.js: sign in at the API, then show who is signed in and her orders; order 2 croissants; refresh the orders. */
export function accountApp(options: AccountAppOptions = {}): string {
  const login = options.login ?? '/login'
  const account = options.account ?? '/account'
  return `// The shop's page: Lena signs in at the API, then sees her orders and orders more (Jonas).
const API = '${API}'
const who = document.querySelector('#who')
const list = document.querySelector('#orders')
const status = document.querySelector('#order-status')

async function signIn() {
  const response = await fetch(\`\${API}${login}\`, {
    method: 'POST',
    credentials: 'include',
    body: new URLSearchParams({ email: 'lena@example.com', password: 'croissant-42' })
  })
  if (!response.ok) {
    who.textContent = 'Sign-in failed.'
    return
  }
  await showAccount()
}

async function showAccount() {
  const response = await fetch(\`\${API}${account}\`, { credentials: 'include' })
  if (!response.ok) {
    who.textContent = 'Not signed in: please sign in again.'
    return
  }
  const customer = await response.json()
  who.textContent = \`Signed in as \${customer.name}\`
  await showOrders()
}

async function showOrders() {
  const response = await fetch(\`\${API}/orders\`, { credentials: 'include' })
  if (!response.ok) return
  const orders = await response.json()
  list.replaceChildren(...orders.map((order) => {
    const item = document.createElement('li')
    item.textContent = \`\${order.quantity} × \${order.name}\`
    return item
  }))
}

async function placeOrder() {
  const response = await fetch(\`\${API}/orders\`, {
    method: 'POST',
    credentials: 'include',
    body: new URLSearchParams({ item: 'croissant', quantity: '2' })
  })
  status.textContent = response.status === 201 ? '${ORDER_IN}' : 'Sorry, your order did not go through.'
  await showOrders()
}

document.querySelector('#sign-in').addEventListener('click', signIn)
document.querySelector('#order').addEventListener('click', placeOrder)
document.querySelector('#refresh').addEventListener('click', showOrders)
${(options.extra ?? []).join('\n')}`
}

/** server.js's first lines for the account levels: Express with JSON and form bodies, the shop's CORS with credentials. */
export const ACCOUNT_HEAD = [
  '// The bakery\'s API server at https://api.cornerbakery.shop (Node with Express).',
  '// Grindstone runs it like `node server.js` every time the shop\'s page loads.',
  'const express = require(\'express\')',
  'const app = express()',
  'app.use(express.json())',
  'app.use(express.urlencoded())',
  '',
  `const SHOP = '${SHOP}'`,
  '',
  '// The shop\'s page may read our answers, with the customer\'s cookie (Ben)',
  'app.use((req, res, next) => {',
  '  if (req.get(\'Origin\') === SHOP) {',
  '    res.set(\'Access-Control-Allow-Origin\', SHOP)',
  '    res.set(\'Access-Control-Allow-Credentials\', \'true\')',
  '    res.vary(\'Origin\')',
  '  }',
  '  next()',
  '})',
  '',
  '// Who is signed in: the session id in the cookie the login sets (Ben)',
  `const SESSIONS = { '${LENA_SESSION_ID}': 'lena' }`,
  'const CUSTOMERS = { lena: { name: \'Lena\', orders: [] } }',
  '',
  'function customerOf(req) {',
  '  const cookie = req.get(\'Cookie\') ?? \'\'',
  '  const session = cookie.match(/(?:^|; )session=([^;]*)/)?.[1]',
  '  return CUSTOMERS[SESSIONS[session]] ?? null',
  '}'
].join('\n')

/** The login route at this path, its cookie written by these lines (a level's own), then the answer. */
export function loginRoute(path: string, cookieLines: readonly string[], comment = '// POST /login: the sign-in form\'s email and password (Jonas)'): string {
  return [
    comment,
    `app.post('${path}', (req, res) => {`,
    '  if (req.body?.email !== \'lena@example.com\' || req.body?.password !== \'croissant-42\') {',
    '    return res.status(401).json({ error: \'Wrong email or password\' })',
    '  }',
    ...cookieLines.map(line => `  ${line}`),
    '  res.json({ name: \'Lena\' })',
    '})'
  ].join('\n')
}

/** GET /account (who is signed in), GET /orders and POST /orders (the customer's own, a form's item and quantity). */
export const ACCOUNT_ROUTES = [
  '// GET /account: who is signed in',
  'app.get(\'/account\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  res.json({ name: customer.name })',
  '})',
  '',
  '// GET /orders: the signed-in customer\'s orders',
  'app.get(\'/orders\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  res.json(customer.orders)',
  '})',
  '',
  '// POST /orders: a new order for the signed-in customer (a form\'s item and quantity)',
  'const MENU = { croissant: \'Butter croissant\', sourdough: \'Sourdough loaf\', rye: \'Rye loaf\' }',
  'app.post(\'/orders\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  const name = MENU[req.body?.item]',
  '  const quantity = Number(req.body?.quantity)',
  '  if (!name || !(quantity >= 1)) return res.status(400).json({ error: \'Which item, and how many?\' })',
  '  customer.orders.push({ name, quantity })',
  '  res.status(201).json({ number: 1041 + customer.orders.length })',
  '})'
].join('\n')

/** The guards every account level keeps: nothing of Lena's goes out without her cookie, and a stolen document.cookie is no session. */
export function accountGuards() {
  return {
    probes: [
      { id: 'anon', steps: [{ fetchFrom: SHOP, request: `GET ${API}/orders`, credentials: 'omit' as const }] },
      { id: 'stolen', steps: [{ stolen: `GET ${API}/account` }] }
    ],
    expected: { anon: { not: 'read' }, stolen: { not: 200 } } as const
  }
}
