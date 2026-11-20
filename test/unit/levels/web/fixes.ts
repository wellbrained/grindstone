// Other edits a player may make to a Web fundamentals level: real fixes the goals must accept (the ones the debriefs
// name among them), and tempting non-fixes they must reject: fixing it in the page (`mode: 'no-cors'`, a header on the
// request, leaving the request out, writing the data into the page), allowing everything where the level needs only the
// shop to read with credentials, echoing any origin back. The unit tests check that every edit applies to the level's
// files; e2e/web-levels.spec.ts runs them in a real browser.

import { authFixes } from './fixes-auth'
import { cachingFixes } from './fixes-caching'
import { cookieFixes } from './fixes-cookies'
import { loopFixes } from './fixes-loop'

export interface OtherFix {
  /** What the edit does, for the test's message. */
  name: string
  /** Applied in order to the starting files, like a solution's save steps. */
  edits: { save: string, replace: readonly [string, string] }[]
  /** True: every goal passes after a reload (the prediction answered); false: not every goal does. */
  solves: boolean
}

type Edit = OtherFix['edits'][number]

const MENU_ROUTE = 'app.get(\'/menu\', (req, res) => {\n'
const inMenu = (line: string): Edit => ({ save: 'server.js', replace: [MENU_ROUTE, `${MENU_ROUTE}  ${line}\n`] })

/** 1.2: an OPTIONS route for /orders before the POST route, with this Allow-Origin and these lines. */
const optionsFor = (origin: string, lines: readonly string[]): Edit => ({
  save: 'server.js',
  replace: ['// POST /orders:', ['app.options(\'/orders\', (req, res) => {', `  res.set('Access-Control-Allow-Origin', ${origin})`, ...lines, '  res.sendStatus(204)', '})', '', '// POST /orders:'].join('\n')]
})

/** 1.3: the /basket route's `*` line replaced by these lines. */
const basket = (lines: readonly string[]): Edit => ({ save: 'server.js', replace: ['  res.set(\'Access-Control-Allow-Origin\', \'*\')\n', lines.map(line => `  ${line}\n`).join('')] })

/** 1.4 and 1.5: the middleware's preflight answers. */
const ALLOW_HEADERS = (value: string) => `res.set('Access-Control-Allow-Headers', '${value}')`
const ALLOW_METHODS = (value: string) => `res.set('Access-Control-Allow-Methods', '${value}')`

/** 1.3 to 1.5, the review's cheat (a): no cookie needed, the server takes anyone for Lena. */
const LENA_FOR_ANYONE: Edit = { save: 'server.js', replace: ['  return SESSIONS[session] ?? null', '  return SESSIONS[session] ?? \'lena\''] }
/** The page's basket requests without credentials (1.4 has one, 1.5 two: apply it twice there). */
const NO_CREDENTIALS: Edit = { save: 'app.js', replace: ['    credentials: \'include\',\n', ''] }
/** 1.4 and 1.5, the review's cheat (b): the middleware echoes every origin but the promo page's. */
const ALL_BUT_PROMO: Edit = {
  save: 'server.js',
  replace: ['  if (req.get(\'Origin\') === SHOP) {\n    res.set(\'Access-Control-Allow-Origin\', SHOP)', '  if (req.get(\'Origin\') && !req.get(\'Origin\').startsWith(\'https://promo.\')) {\n    res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))']
}

export const otherFixes: Record<string, OtherFix[]> = {
  'web-01-menu-blocked': [
    { name: '`*` for the public menu', edits: [inMenu('res.set(\'Access-Control-Allow-Origin\', \'*\')')], solves: true },
    { name: 'the request\'s own Origin echoed back (a public menu, no credentials)', edits: [inMenu('res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))')], solves: true },
    { name: 'a middleware that allows the shop on every route', edits: [{ save: 'server.js', replace: ['const SHOP = \'https://cornerbakery.shop\'\n', 'const SHOP = \'https://cornerbakery.shop\'\napp.use((req, res, next) => {\n  res.set(\'Access-Control-Allow-Origin\', SHOP)\n  next()\n})\n'] }], solves: true },
    { name: 'the shop\'s origin with a slash at the end', edits: [inMenu('res.set(\'Access-Control-Allow-Origin\', \'https://cornerbakery.shop/\')')], solves: false },
    { name: 'the host without its scheme', edits: [inMenu('res.set(\'Access-Control-Allow-Origin\', \'cornerbakery.shop\')')], solves: false },
    { name: 'mode: \'no-cors\' in the page', edits: [{ save: 'app.js', replace: ['fetch(`${API}/menu`)', 'fetch(`${API}/menu`, { mode: \'no-cors\' })'] }], solves: false },
    { name: 'an Access-Control-Allow-Origin header on the request', edits: [{ save: 'app.js', replace: ['fetch(`${API}/menu`)', 'fetch(`${API}/menu`, { headers: { \'Access-Control-Allow-Origin\': \'*\' } })'] }], solves: false },
    { name: 'the menu fetched from the shop\'s own origin', edits: [{ save: 'app.js', replace: ['fetch(`${API}/menu`)', 'fetch(\'/api/menu\')'] }], solves: false },
    {
      name: 'the menu written into the page (the request left out)',
      edits: [{ save: 'app.js', replace: ['  const response = await fetch(`${API}/menu`)\n  const products = await response.json()', '  const products = [\'Butter croissant\', \'Pain au chocolat\', \'Apricot danish\', \'Sourdough loaf\', \'Rye loaf\', \'Cinnamon bun\'].map(name => ({ name, price: 1 }))'] }],
      solves: false
    },
    {
      name: 'the menu written into the page after a no-cors request',
      edits: [{ save: 'app.js', replace: ['  const response = await fetch(`${API}/menu`)\n  const products = await response.json()', '  await fetch(`${API}/menu`, { mode: \'no-cors\' })\n  const products = [\'Butter croissant\', \'Pain au chocolat\', \'Apricot danish\', \'Sourdough loaf\', \'Rye loaf\', \'Cinnamon bun\'].map(name => ({ name, price: 1 }))'] }],
      solves: false
    }
  ],
  'web-02-order-preflight': [
    { name: 'an OPTIONS route that allows any origin (the order needs no cookie)', edits: [optionsFor('\'*\'', ['  res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')'])], solves: true },
    { name: 'an OPTIONS route that echoes the headers the preflight asked for', edits: [optionsFor('SHOP', ['  res.set(\'Access-Control-Allow-Headers\', req.get(\'Access-Control-Request-Headers\'))'])], solves: true },
    { name: 'a middleware that answers every preflight', edits: [{ save: 'server.js', replace: ['const SHOP = \'https://cornerbakery.shop\'\n', 'const SHOP = \'https://cornerbakery.shop\'\napp.use((req, res, next) => {\n  res.set(\'Access-Control-Allow-Origin\', SHOP)\n  if (req.method === \'OPTIONS\') {\n    res.set(\'Access-Control-Allow-Methods\', \'GET, POST\')\n    res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')\n    return res.sendStatus(204)\n  }\n  next()\n})\n'] }], solves: true },
    { name: 'an OPTIONS route without Allow-Headers', edits: [optionsFor('SHOP', [])], solves: false },
    { name: 'an OPTIONS route that allows POST but not the header', edits: [optionsFor('SHOP', ['  res.set(\'Access-Control-Allow-Methods\', \'POST\')'])], solves: false },
    { name: 'an OPTIONS route that answers 404', edits: [{ save: 'server.js', replace: ['// POST /orders:', 'app.options(\'/orders\', (req, res) => {\n  res.set(\'Access-Control-Allow-Origin\', SHOP)\n  res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')\n  res.status(404).end()\n})\n\n// POST /orders:'] }], solves: false },
    { name: 'the order sent as text/plain, so no preflight (the server can\'t read it)', edits: [{ save: 'app.js', replace: ['headers: { \'Content-Type\': \'application/json\' },', 'headers: { \'Content-Type\': \'text/plain\' },'] }], solves: false },
    { name: 'mode: \'no-cors\' in the page', edits: [{ save: 'app.js', replace: ['method: \'POST\',', 'method: \'POST\',\n      mode: \'no-cors\','] }], solves: false },
    { name: 'the thank-you written without asking the server', edits: [{ save: 'app.js', replace: ['    const response = await fetch(', '    status.textContent = \'Thanks! Order 1042 is in.\'\n    return\n    const response = await fetch('] }], solves: false }
  ],
  'web-03-basket-credentials': [
    { name: 'the shop\'s origin as a string, with Allow-Credentials and Vary: Origin', edits: [basket(['res.set(\'Access-Control-Allow-Origin\', \'https://cornerbakery.shop\')', 'res.set(\'Access-Control-Allow-Credentials\', \'true\')', 'res.vary(\'Origin\')'])], solves: true },
    { name: 'the Origin echoed back after checking a list of exact origins', edits: [basket(['if ([SHOP].includes(req.get(\'Origin\'))) res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))', 'res.set(\'Access-Control-Allow-Credentials\', \'true\')', 'res.vary(\'Origin\')'])], solves: true },
    { name: '`*` with Allow-Credentials', edits: [basket(['res.set(\'Access-Control-Allow-Origin\', \'*\')', 'res.set(\'Access-Control-Allow-Credentials\', \'true\')'])], solves: false },
    { name: 'the shop\'s origin without Allow-Credentials', edits: [basket(['res.set(\'Access-Control-Allow-Origin\', SHOP)'])], solves: false },
    { name: 'Allow-Credentials as True', edits: [basket(['res.set(\'Access-Control-Allow-Origin\', SHOP)', 'res.set(\'Access-Control-Allow-Credentials\', \'True\')'])], solves: false },
    { name: 'any Origin echoed back, with Allow-Credentials', edits: [basket(['res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))', 'res.set(\'Access-Control-Allow-Credentials\', \'true\')'])], solves: false },
    { name: 'every bakery subdomain echoed back, with Allow-Credentials', edits: [basket(['if (req.get(\'Origin\')?.endsWith(\'cornerbakery.shop\')) res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))', 'res.set(\'Access-Control-Allow-Credentials\', \'true\')'])], solves: false },
    { name: 'the request sent without credentials', edits: [{ save: 'app.js', replace: ['fetch(`${API}/basket`, { credentials: \'include\' })', 'fetch(`${API}/basket`)'] }], solves: false },
    {
      name: '`*` kept, the server taking anyone for Lena, the request without credentials',
      edits: [LENA_FOR_ANYONE, { save: 'app.js', replace: ['fetch(`${API}/basket`, { credentials: \'include\' })', 'fetch(`${API}/basket`)'] }],
      solves: false
    },
    { name: 'every Origin echoed but the promo page\'s, with Allow-Credentials', edits: [basket(['if (req.get(\'Origin\') !== \'https://promo.cornerbakery.shop\') res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))', 'res.set(\'Access-Control-Allow-Credentials\', \'true\')'])], solves: false }
  ],
  'web-04-basket-header': [
    { name: 'the headers the preflight asked for echoed back', edits: [{ save: 'server.js', replace: [ALLOW_HEADERS('Content-Type'), 'res.set(\'Access-Control-Allow-Headers\', req.get(\'Access-Control-Request-Headers\') ?? \'\')'] }], solves: true },
    { name: '`X-Basket-Id` in lower case', edits: [{ save: 'server.js', replace: [ALLOW_HEADERS('Content-Type'), ALLOW_HEADERS('content-type, x-basket-id')] }], solves: true },
    { name: '`*` for the headers (with credentials it is only a name)', edits: [{ save: 'server.js', replace: [ALLOW_HEADERS('Content-Type'), ALLOW_HEADERS('*')] }], solves: false },
    { name: 'the header left out of the request', edits: [{ save: 'app.js', replace: ['    headers: { \'X-Basket-Id\': BASKET_ID }\n', ''] }], solves: false },
    { name: 'any Origin allowed in the middleware, with the header', edits: [{ save: 'server.js', replace: ['  if (req.get(\'Origin\') === SHOP) {\n    res.set(\'Access-Control-Allow-Origin\', SHOP)', '  if (req.get(\'Origin\')) {\n    res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))'] }, { save: 'server.js', replace: [ALLOW_HEADERS('Content-Type'), ALLOW_HEADERS('Content-Type, X-Basket-Id')] }], solves: false },
    { name: 'anyone taken for Lena, the request without credentials, `*` for the headers', edits: [LENA_FOR_ANYONE, NO_CREDENTIALS, { save: 'server.js', replace: [ALLOW_HEADERS('Content-Type'), ALLOW_HEADERS('*')] }], solves: false },
    { name: 'every Origin echoed but the promo page\'s, with the header', edits: [ALL_BUT_PROMO, { save: 'server.js', replace: [ALLOW_HEADERS('Content-Type'), ALLOW_HEADERS('Content-Type, X-Basket-Id')] }], solves: false }
  ],
  'web-05-works-with-curl': [
    { name: 'the methods the preflight asked for echoed back', edits: [{ save: 'server.js', replace: [ALLOW_METHODS('GET, POST'), 'res.set(\'Access-Control-Allow-Methods\', req.get(\'Access-Control-Request-Method\') ?? \'\')'] }], solves: true },
    { name: '`*` for the methods (with credentials it is only a name)', edits: [{ save: 'server.js', replace: [ALLOW_METHODS('GET, POST'), ALLOW_METHODS('*')] }], solves: false },
    { name: 'the line taken out in the page only', edits: [{ save: 'app.js', replace: ['    remove.addEventListener(\'click\', () => removeLine(line.id))', '    remove.addEventListener(\'click\', () => item.remove())'] }], solves: false },
    { name: 'mode: \'no-cors\' in the page', edits: [{ save: 'app.js', replace: ['    method: \'DELETE\',', '    method: \'DELETE\',\n    mode: \'no-cors\','] }], solves: false },
    { name: 'any Origin allowed in the middleware, with DELETE', edits: [{ save: 'server.js', replace: ['  if (req.get(\'Origin\') === SHOP) {\n    res.set(\'Access-Control-Allow-Origin\', SHOP)', '  if (req.get(\'Origin\')) {\n    res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))'] }, { save: 'server.js', replace: [ALLOW_METHODS('GET, POST'), ALLOW_METHODS('GET, POST, DELETE')] }], solves: false },
    { name: 'anyone taken for Lena, the requests without credentials, `*` for the methods', edits: [LENA_FOR_ANYONE, NO_CREDENTIALS, NO_CREDENTIALS, { save: 'server.js', replace: [ALLOW_METHODS('GET, POST'), ALLOW_METHODS('*')] }], solves: false },
    { name: 'every Origin echoed but the promo page\'s, with DELETE', edits: [ALL_BUT_PROMO, { save: 'server.js', replace: [ALLOW_METHODS('GET, POST'), ALLOW_METHODS('GET, POST, DELETE')] }], solves: false }
  ],
  ...cookieFixes,
  ...authFixes,
  ...cachingFixes,
  ...loopFixes
}
