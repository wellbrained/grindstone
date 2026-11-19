// Other edits a player may make to a chapter 4 level (HTTP caching): real fixes the goals must accept and tempting
// non-fixes they must reject, the chapter's list among them: an ETag or must-revalidate beside a long max-age, a minute
// instead of an hour, s-maxage or Expires where max-age decides; no-store kept with the page asking to revalidate, the
// ETag turned off or fixed; Vary for the wrong header, Pragma for the CDN, a unique address per request, no cache at
// all; the header changed only on the server or only the address in the page after a stale deploy. Applied like
// fixes.ts's; run in a browser by e2e/web-levels.spec.ts.
import { HOUR_IN_CACHE } from '../../../../shared/levels/web/16-old-price'
import { NO_STORE } from '../../../../shared/levels/web/17-whole-menu'
import { ACCOUNT_ROUTE, EVERYTHING_PUBLIC } from '../../../../shared/levels/web/18-someone-elses-account'
import { ECHO_ORIGIN } from '../../../../shared/levels/web/19-vary-origin'
import { DAY_IN_CACHE, MENU_REQUEST } from '../../../../shared/levels/web/20-stale-deploy'
import { menuFetch } from '../../../../shared/levels/web/caching'
import type { OtherFix } from './fixes'

type Edit = OtherFix['edits'][number]

const server = (from: string, to: string): Edit => ({ save: 'server.js', replace: [from, to] })
const app = (from: string, to: string): Edit => ({ save: 'app.js', replace: [from, to] })
const control = (value: string) => `  res.set('Cache-Control', '${value}')`
/** The menu's fetch with these options in the page (4.1, 4.2, 4.5). */
const pageAsks = (init: string, path?: string): Edit => app(MENU_REQUEST, menuFetch({ init, path }))
const pageAddress = (path: string): Edit => app(MENU_REQUEST, menuFetch({ path }))
/** The page writes the price itself (from the API's answer, but old or new as it likes). */
const LIST_LINE = '    item.textContent = `${product.name} · ${formatPrice(product.price)} €`'

// --- 4.3 ---------------------------------------------------------------------------------------------------------------

/** A line first in the account route. */
const inAccount = (line: string): Edit => server(`${ACCOUNT_ROUTE}\n`, `${ACCOUNT_ROUTE}\n  ${line}\n`)
const ACCOUNT_FETCH = '  const response = await fetch(`${API}/account`, { credentials: \'include\' })'

export const cachingFixes: Record<string, OtherFix[]> = {
  'web-16-old-price': [
    { name: 'max-age=0', edits: [server(HOUR_IN_CACHE, control('max-age=0'))], solves: true },
    { name: 'no-store (works, and downloads the whole menu every time)', edits: [server(HOUR_IN_CACHE, control('no-store'))], solves: true },
    { name: 'no Cache-Control at all (no Last-Modified: nothing to guess a lifetime from, so the browser asks with the ETag)', edits: [server(HOUR_IN_CACHE, '')], solves: true },
    { name: 'Pragma: no-cache beside max-age (Chrome reads it as no-cache)', edits: [server(HOUR_IN_CACHE, `${HOUR_IN_CACHE}\n  res.set('Pragma', 'no-cache')`)], solves: true },
    { name: 'the page asks with cache: \'no-cache\'', edits: [pageAsks('{ cache: \'no-cache\' }')], solves: true },
    { name: 'a new query on every request (the clock moves)', edits: [pageAddress('/menu?t=${Date.now()}')], solves: true },
    { name: 'an ETag beside max-age=3600 (the browser never asks to use it)', edits: [server(HOUR_IN_CACHE, `${HOUR_IN_CACHE}\n  res.set('ETag', '"menu-' + MENU.map(item => item.price).join('-') + '"')`)], solves: false },
    { name: 'must-revalidate beside max-age=3600 (only once the hour is over)', edits: [server(HOUR_IN_CACHE, control('max-age=3600, must-revalidate'))], solves: false },
    { name: 's-maxage=0 beside max-age=3600 (for shared caches only)', edits: [server(HOUR_IN_CACHE, control('max-age=3600, s-maxage=0'))], solves: false },
    { name: 'Expires: 0 beside max-age=3600 (max-age wins)', edits: [server(HOUR_IN_CACHE, `${HOUR_IN_CACHE}\n  res.set('Expires', '0')`)], solves: false },
    { name: 'a minute instead of an hour (half a minute after a change it is still the old price)', edits: [server(HOUR_IN_CACHE, control('max-age=60'))], solves: false },
    { name: 'the page asks with cache: \'force-cache\'', edits: [pageAsks('{ cache: \'force-cache\' }')], solves: false },
    { name: 'the page writes today\'s croissant price itself', edits: [app(LIST_LINE, '    item.textContent = `${product.name} · ${formatPrice(product.id === \'croissant\' ? 2.6 : product.price)} €`')], solves: false }
  ],
  'web-17-whole-menu': [
    { name: 'max-age=0', edits: [server(NO_STORE, control('max-age=0'))], solves: true },
    { name: 'no-cache, must-revalidate', edits: [server(NO_STORE, control('no-cache, must-revalidate'))], solves: true },
    { name: 'private alone (no lifetime: the browser asks every time)', edits: [server(NO_STORE, control('private'))], solves: true },
    { name: 'no Cache-Control at all', edits: [server(NO_STORE, '')], solves: true },
    { name: 'no-cache with Express\'s ETag turned off (every answer whole again)', edits: [server(NO_STORE, `${control('no-cache')}\n  app.set('etag', false)`)], solves: false },
    { name: 'no-cache with a fixed ETag (a change is answered 304 too)', edits: [server(NO_STORE, `${control('no-cache')}\n  res.set('ETag', '"menu-v1"')`)], solves: false },
    { name: 'no-cache beside no-store (no-store wins)', edits: [server(NO_STORE, control('no-cache, no-store'))], solves: false },
    { name: 'an hour (an unchanged menu costs nothing, a change shows an hour late)', edits: [server(NO_STORE, control('max-age=3600'))], solves: false },
    { name: 'a minute (half a minute after a change it is still the old price)', edits: [server(NO_STORE, control('max-age=60'))], solves: false },
    { name: 'no-store kept, the page asks with cache: \'no-cache\' (nothing was kept to revalidate)', edits: [pageAsks('{ cache: \'no-cache\' }')], solves: false }
  ],
  'web-18-someone-elses-account': [
    { name: 'no-store for the account', edits: [inAccount('res.set(\'Cache-Control\', \'no-store\')')], solves: true },
    { name: 'Vary: Cookie for the account (one copy per cookie)', edits: [inAccount('res.vary(\'Cookie\')')], solves: true },
    { name: 'public with max-age=0 for the account (the CDN asks server.js every time)', edits: [inAccount('res.set(\'Cache-Control\', \'public, max-age=0\')')], solves: true },
    { name: 'Ben\'s middleware for the menu only', edits: [server(EVERYTHING_PUBLIC, '  if (req.method === \'GET\' && req.path === \'/menu\') res.set(\'Cache-Control\', \'public, max-age=60\')')], solves: true },
    { name: 'private only for an answer with a customer (a public 401 signs Sam out)', edits: [server('  res.json(customer)\n})', '  res.set(\'Cache-Control\', \'private\')\n  res.json(customer)\n})')], solves: false },
    { name: 'no-store for everything (the CDN no longer answers the menu)', edits: [server(EVERYTHING_PUBLIC, '  res.set(\'Cache-Control\', \'no-store\')')], solves: false },
    { name: 'Vary: Origin for the account (Lena and Sam come from the same page)', edits: [inAccount('res.vary(\'Origin\')')], solves: false },
    { name: 'must-revalidate added (only once the minute is over)', edits: [server(EVERYTHING_PUBLIC, '  if (req.method === \'GET\') res.set(\'Cache-Control\', \'public, max-age=60, must-revalidate\')')], solves: false },
    { name: 'Pragma: no-cache for the account (a CDN ignores Pragma)', edits: [inAccount('res.set(\'Pragma\', \'no-cache\')')], solves: false },
    { name: 'the page asks with cache: \'no-store\' (a CDN ignores the request\'s Cache-Control)', edits: [app(ACCOUNT_FETCH, '  const response = await fetch(`${API}/account`, { credentials: \'include\', cache: \'no-store\' })')], solves: false },
    { name: 'a new query on every request (Sam asks for the same address)', edits: [app(ACCOUNT_FETCH, '  const response = await fetch(`${API}/account?t=${Date.now()}`, { credentials: \'include\' })')], solves: false },
    { name: 'a decoy request with a header the preflight refuses, sent after the real one (it never leaves the browser)', edits: [app('showAccount()\nloadMenu()', 'showAccount().then(() => fetch(`${API}/account?d`, { credentials: \'include\', headers: { \'Cache-Control\': \'no-store\' } }).catch(() => {}))\nloadMenu()')], solves: false },
    { name: 'a private decoy address beside the public real one', edits: [app('showAccount()\nloadMenu()', 'showAccount().then(() => fetch(`${API}/account?v=2`, { credentials: \'include\' }))\nloadMenu()'), inAccount('if (req.query.v) res.set(\'Cache-Control\', \'private\')')], solves: false }
  ],
  'web-19-vary-origin': [
    { name: '`*` for a public menu (one copy fits every page)', edits: [server(ECHO_ORIGIN, '  res.set(\'Access-Control-Allow-Origin\', \'*\')')], solves: true },
    { name: 'Vary: Origin first in the route', edits: [server('  const origin = req.get(\'Origin\')\n', '  const origin = req.get(\'Origin\')\n  res.vary(\'Origin\')\n')], solves: true },
    { name: 'Vary: Origin only on an answer with an Allow-Origin (the kitchen\'s copy without one is served to the shop)', edits: [server(ECHO_ORIGIN, '  if (SHOPS.includes(origin)) {\n    res.set(\'Access-Control-Allow-Origin\', origin)\n    res.vary(\'Origin\')\n  }')], solves: false },
    { name: 'Vary: Accept-Encoding', edits: [server(ECHO_ORIGIN, `${ECHO_ORIGIN}\n  res.vary('Accept-Encoding')`)], solves: false },
    { name: 'private (the CDN no longer answers)', edits: [server('  res.set(\'Cache-Control\', \'public, max-age=300\')', '  res.set(\'Cache-Control\', \'private, max-age=300\')')], solves: false },
    { name: 'no-cache (server.js answers every request)', edits: [server('  res.set(\'Cache-Control\', \'public, max-age=300\')', '  res.set(\'Cache-Control\', \'public, no-cache\')')], solves: false },
    { name: 's-maxage=0 (server.js answers every request)', edits: [server('  res.set(\'Cache-Control\', \'public, max-age=300\')', '  res.set(\'Cache-Control\', \'public, max-age=300, s-maxage=0\')')], solves: false },
    { name: 'the page asks with cache: \'no-store\' (a CDN ignores the request\'s Cache-Control)', edits: [app(MENU_REQUEST, menuFetch({ init: '{ cache: \'no-store\' }' }))], solves: false },
    { name: 'the page asks for its own address (customers on www ask for the same one)', edits: [app(MENU_REQUEST, menuFetch({ path: '/menu?from=shop' }))], solves: false },
    { name: 'mode: \'no-cors\' in the page', edits: [app(MENU_REQUEST, menuFetch({ init: '{ mode: \'no-cors\' }' }))], solves: false }
  ],
  'web-20-stale-deploy': [
    { name: 'the page asks with cache: \'no-cache\' (yesterday\'s ETag no longer matches)', edits: [pageAsks('{ cache: \'no-cache\' }')], solves: true },
    { name: 'the page asks with cache: \'reload\' (every Refresh downloads the whole menu again)', edits: [pageAsks('{ cache: \'reload\' }')], solves: false },
    { name: 'a new query on every request (her cache fills with day-long copies, every Refresh a whole menu)', edits: [pageAddress('/menu?t=${Date.now()}')], solves: false },
    { name: 'a new query on every request beside a side request her copy answers', edits: [app(MENU_REQUEST, `  fetch(\`\${API}/menu\`)\n${menuFetch({ path: '/menu?t=${Date.now()}' })}`)], solves: false },
    { name: 'a new query on every request beside a side request with force-cache', edits: [app(MENU_REQUEST, `  fetch(\`\${API}/menu\`, { cache: 'force-cache' })\n${menuFetch({ path: '/menu?t=${Date.now()}' })}`)], solves: false },
    { name: 'a new address and five minutes', edits: [pageAddress('/menu?v=2'), server(DAY_IN_CACHE, control('max-age=300'))], solves: true },
    { name: 'a new route and no-cache', edits: [pageAddress('/v2/menu'), server('app.get(\'/menu\', (req, res) => {', 'app.get(\'/v2/menu\', (req, res) => {'), server(DAY_IN_CACHE, control('no-cache'))], solves: true },
    { name: 'no-cache on the server only (her browser doesn\'t ask)', edits: [server(DAY_IN_CACHE, control('no-cache'))], solves: false },
    { name: 'no-store on the server only', edits: [server(DAY_IN_CACHE, control('no-store'))], solves: false },
    { name: 'a new address only (the next change waits a day)', edits: [pageAddress('/menu?v=2')], solves: false },
    { name: 'a new address and an hour', edits: [pageAddress('/menu?v=2'), server(DAY_IN_CACHE, control('max-age=3600'))], solves: false },
    { name: 'the page reads both shapes (yesterday\'s prices, readable)', edits: [app('formatPrice(product.priceCents / 100)', 'formatPrice(product.priceCents !== undefined ? product.priceCents / 100 : product.price)')], solves: false },
    { name: 'the page asks with cache: \'force-cache\'', edits: [pageAsks('{ cache: \'force-cache\' }')], solves: false }
  ]
}
