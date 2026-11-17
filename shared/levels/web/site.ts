// Corner Bakery grown up (ADR 0009, "World"): the shop's page on https://cornerbakery.shop and its own API on another
// origin, https://api.cornerbakery.shop, a small Node server with Express that the levels show as `server.js`. The page,
// the stylesheet and the money helper come from the Debugging track's shop; each level brings its app.js and server.js.
import { MONEY, STYLE } from '../debugging/bakery'
import type { BackendRoute } from '../debugging/types'
import type { WebSpec } from './backend'

/** The page's address bar path. */
export const SHOP_PAGE = '/order'

/** The shop's own origin (the page) and the API's. */
export const SHOP = 'https://cornerbakery.shop'
export const API = 'https://api.cornerbakery.shop'

/** Lena's session at the API: the cookie the browser holds since she signed in (sent with credentials, same site only). */
export const LENA_SESSION = { name: 'session', value: 'lena-7f3a' } as const

/** The old promo page from Christmas 2023, still on a subdomain: same site as the shop, another origin. */
export const PROMO = 'https://promo.cornerbakery.shop'

/**
 * Another page on a bakery subdomain that no text names (so no server.js can single it out): same site as the shop,
 * another origin. The credentials guards ask from here as well as from the promo page.
 */
export const OTHER_SUBDOMAIN = 'https://old.cornerbakery.shop'

/**
 * The guards of a basket level (1.3 to 1.5): the basket stays Lena's. A page on the promo subdomain may not read it,
 * with her cookie or without; neither may a page on a subdomain no text names; and the shop's own page gets nothing
 * of hers without her cookie (credentials: 'omit'). Each a probe whose value must not be 'read'.
 */
export function basketGuards(request: string, headers?: Readonly<Record<string, string>>) {
  const ask = (id: string, fetchFrom: string, credentials: 'include' | 'omit') => ({ id, steps: [{ fetchFrom, request, credentials, ...(headers ? { headers } : {}) }] })
  return {
    probes: [ask('promo', PROMO, 'include'), ask('promoAnon', PROMO, 'omit'), ask('other', OTHER_SUBDOMAIN, 'include'), ask('anon', SHOP, 'omit')],
    expected: { promo: { not: 'read' }, promoAnon: { not: 'read' }, other: { not: 'read' }, anon: { not: 'read' } } as const
  }
}

/** The API with the level's server.js and Lena's session, as most levels have it. */
export const API_SERVER: WebSpec = { api: API, server: 'server.js', session: LENA_SESSION }

export interface WebPageOptions {
  /** The page's title after "Corner Bakery · ". */
  title?: string
  /** Lines in <main>, indented by the page. */
  main: readonly string[]
}

/** index.html of a Web fundamentals page: the shop's header, the level's sections, app.js as a module. */
export function webPage(options: WebPageOptions): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>Corner Bakery · ${options.title ?? 'Order'}</title>`,
    '  <link rel="stylesheet" href="./style.css">',
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
    '  <script type="module" src="./app.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

/** The style of the shop, plus the basket's remove button. */
export const WEB_STYLE = `${STYLE}
.remove {
  min-width: 2.25rem;
}
`

/** A level's files: the page, the style, the money helper, its app.js and server.js (and whatever else it brings). */
export function webSite(page: WebPageOptions, files: Readonly<Record<string, string>>): Record<string, string> {
  return { 'index.html': webPage(page), 'style.css': WEB_STYLE, 'money.js': MONEY, ...files }
}

/** server.js's first lines: what it is, Express, JSON bodies, the shop's origin. */
export const SERVER_HEAD = [
  '// The bakery\'s API server at https://api.cornerbakery.shop (Node with Express).',
  '// Grindstone runs it like `node server.js` every time the shop\'s page loads.',
  'const express = require(\'express\')',
  'const app = express()',
  'app.use(express.json())',
  '',
  'const SHOP = \'https://cornerbakery.shop\''
].join('\n')

/** Who is signed in: the session cookie the API set when the customer logged in, and each customer's baskets. */
export const SESSIONS = [
  '// Who is signed in: the session cookie this server set at login (Ben).',
  'const SESSIONS = { \'lena-7f3a\': \'lena\' }',
  '',
  'function customerOf(req) {',
  '  const cookie = req.get(\'Cookie\') ?? \'\'',
  '  const session = cookie.match(/(?:^|; )session=([^;]*)/)?.[1]',
  '  return SESSIONS[session] ?? null',
  '}'
].join('\n')

/**
 * Ben's CORS middleware (levels 1.4 and 1.5): the shop's origin, with credentials, on every route; every preflight
 * answered with these methods and headers.
 */
export function corsMiddleware(methods: string, headers: string): string {
  return [
    '// CORS for the shop\'s page on every route (Ben, after the basket mix-up in May):',
    '// only the shop may read our answers, with the customer\'s cookie.',
    'app.use((req, res, next) => {',
    '  if (req.get(\'Origin\') === SHOP) {',
    '    res.set(\'Access-Control-Allow-Origin\', SHOP)',
    '    res.set(\'Access-Control-Allow-Credentials\', \'true\')',
    '    res.vary(\'Origin\')',
    '  }',
    '  if (req.method === \'OPTIONS\') {',
    `    res.set('Access-Control-Allow-Methods', '${methods}')`,
    `    res.set('Access-Control-Allow-Headers', '${headers}')`,
    '    return res.sendStatus(204)',
    '  }',
    '  next()',
    '})'
  ].join('\n')
}

/** Today's menu, as the API answers it. */
export const MENU_DATA = [
  '// Today\'s menu: the kitchen app changes it, the shop\'s page shows it (Maya).',
  'const MENU = [',
  '  { id: \'croissant\', name: \'Butter croissant\', price: 2.4 },',
  '  { id: \'pain-au-chocolat\', name: \'Pain au chocolat\', price: 2.8 },',
  '  { id: \'apricot-danish\', name: \'Apricot danish\', price: 3.2 },',
  '  { id: \'sourdough\', name: \'Sourdough loaf\', price: 6.5 },',
  '  { id: \'rye\', name: \'Rye loaf\', price: 5 },',
  '  { id: \'cinnamon-bun\', name: \'Cinnamon bun\', price: 3.4 }',
  ']'
].join('\n')

/** The shop's own opening hours route (the shop's server, not the API): same origin, no CORS. */
export const HOURS_ROUTE: BackendRoute = { path: '/api/hours', respond: { status: 200, json: { weekdays: '7:00–18:00', saturday: '7:00–13:00' } } }
