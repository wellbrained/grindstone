// Other edits a player may make to a chapter 2 level (cookies & sessions): real fixes the goals must accept and tempting
// non-fixes they must reject, the review lessons' list among them: Secure added to None (Chrome's message asks for it),
// SameSite left out (Lax by default, and Chrome's Lax+POST for two minutes), the attacker's origin refused by name, a
// Referer check that lets a missing Referer through, the order route or the cookie taken away, a cookie forged or read
// by the page, the widget taken out, the cookie renamed or given a Path. Applied like fixes.ts's; run in a browser by
// e2e/web-levels.spec.ts.
import { NONE_COOKIE } from '../../../../shared/levels/web/06-sign-in-lost'
import { NONE_SECURE_COOKIE } from '../../../../shared/levels/web/07-order-from-elsewhere'
import { READABLE_COOKIE } from '../../../../shared/levels/web/08-script-reads-session'
import { NO_PATH_COOKIE } from '../../../../shared/levels/web/09-cookie-path'
import { STRICT_COOKIE } from '../../../../shared/levels/web/10-email-link'
import type { OtherFix } from './fixes'

type Edit = OtherFix['edits'][number]

const server = (from: string, to: string): Edit => ({ save: 'server.js', replace: [from, to] })
const session = (from: string, options: string): Edit => server(from, `res.cookie('session', 'lena-7f3a', ${options})`)
const ORDER_ROUTE = 'app.post(\'/orders\', (req, res) => {\n'
/** Lines at the top of POST /orders. */
const inOrders = (lines: readonly string[]): Edit => server(ORDER_ROUTE, `${ORDER_ROUTE}${lines.map(line => `  ${line}\n`).join('')}`)
const ANYONE_IS_LENA = server('  return CUSTOMERS[SESSIONS[session]] ?? null', '  return CUSTOMERS[SESSIONS[session]] ?? CUSTOMERS.lena')

/** A CSRF token: the login hands one out with the session, the page sends it with each order, server.js checks it. */
const CSRF_TOKEN: Edit[] = [
  server('const CUSTOMERS = {', 'const CSRF = { \'lena-7f3a\': \'t-91c2e\' }\nconst CUSTOMERS = {'),
  server('  res.json({ name: \'Lena\' })', '  res.json({ name: \'Lena\', csrf: CSRF[\'lena-7f3a\'] })'),
  inOrders(['const sent = (req.get(\'Cookie\') ?? \'\').match(/(?:^|; )session=([^;]*)/)?.[1]', 'if (!sent || req.body?.csrf !== CSRF[sent]) return res.status(403).json({ error: \'No CSRF token\' })']),
  { save: 'app.js', replace: ['const status = document.querySelector(\'#order-status\')\n', 'const status = document.querySelector(\'#order-status\')\nlet csrf = \'\'\n'] },
  { save: 'app.js', replace: ['  await showAccount()\n}', '  csrf = (await response.json()).csrf\n  await showAccount()\n}'] },
  { save: 'app.js', replace: ['new URLSearchParams({ item: \'croissant\', quantity: \'2\' })', 'new URLSearchParams({ item: \'croissant\', quantity: \'2\', csrf })'] }
]

export const cookieFixes: Record<string, OtherFix[]> = {
  'web-06-sign-in-lost': [
    { name: 'SameSite left out (Lax by default), Secure', edits: [session(NONE_COOKIE, '{ httpOnly: true, secure: true }')], solves: true },
    { name: 'SameSite=Strict', edits: [session(NONE_COOKIE, '{ httpOnly: true, secure: true, sameSite: \'strict\' }')], solves: true },
    { name: 'Secure added and None kept (what Chrome\'s message asks for)', edits: [session(NONE_COOKIE, '{ httpOnly: true, secure: true, sameSite: \'none\' }')], solves: false },
    { name: 'the session forged by the page with document.cookie', edits: [{ save: 'app.js', replace: ['  await showAccount()\n}', '  document.cookie = \'session=lena-7f3a; Domain=cornerbakery.shop; Secure\'\n  await showAccount()\n}'] }], solves: false },
    { name: 'anyone taken for Lena', edits: [ANYONE_IS_LENA], solves: false }
  ],
  'web-07-order-from-elsewhere': [
    { name: 'SameSite=Strict', edits: [session(NONE_SECURE_COOKIE, '{ httpOnly: true, secure: true, sameSite: \'strict\' }')], solves: true },
    { name: 'the Origin of every order compared with the shop\'s, exactly (None kept)', edits: [inOrders(['if (req.get(\'Origin\') !== SHOP) return res.status(403).json({ error: \'Orders come from the shop\' })'])], solves: true },
    { name: 'a CSRF token from the sign-in, checked with every order (None kept)', edits: CSRF_TOKEN, solves: true },
    { name: 'SameSite left out (Lax by default: Chrome\'s Lax+POST still sends a fresh cookie)', edits: [session(NONE_SECURE_COOKIE, '{ httpOnly: true, secure: true }')], solves: false },
    { name: 'cheap-flour.example refused by name', edits: [inOrders(['if (req.get(\'Origin\') === \'https://cheap-flour.example\') return res.status(403).json({ error: \'Not you\' })'])], solves: false },
    { name: 'a Referer check that lets a missing Referer through', edits: [inOrders(['const from = req.get(\'Referer\')', 'if (from && !from.startsWith(SHOP)) return res.status(403).json({ error: \'Orders come from the shop\' })'])], solves: false },
    { name: 'the order route turned off', edits: [inOrders(['return res.status(403).json({ error: \'Ordering is paused\' })'])], solves: false },
    { name: 'the Origin checked with startsWith(SHOP)', edits: [inOrders(['if (!(req.get(\'Origin\') ?? \'\').startsWith(SHOP)) return res.status(403).json({ error: \'Orders come from the shop\' })'])], solves: false },
    { name: 'the Origin checked with includes(\'cornerbakery.shop\')', edits: [inOrders(['if (!(req.get(\'Origin\') ?? \'\').includes(\'cornerbakery.shop\')) return res.status(403).json({ error: \'Orders come from the shop\' })'])], solves: false },
    { name: 'cheap-flour.example refused by name, and an Origin of null too', edits: [inOrders(['const origin = req.get(\'Origin\')', 'if (origin === \'https://cheap-flour.example\' || origin === \'null\') return res.status(403).json({ error: \'Not you\' })'])], solves: false },
    { name: 'the Referer checked with startsWith(SHOP)', edits: [inOrders(['if (!(req.get(\'Referer\') ?? \'\').startsWith(SHOP)) return res.status(403).json({ error: \'Orders come from the shop\' })'])], solves: false },
    { name: 'no session cookie at all', edits: [server(NONE_SECURE_COOKIE, '// no cookie: nothing to forge')], solves: false }
  ],
  'web-08-script-reads-session': [
    { name: 'the cookie kept to the API (no Domain), so the shop\'s page never sees it', edits: [session(READABLE_COOKIE, '{ secure: true, sameSite: \'lax\' }')], solves: true },
    { name: 'the widget taken out of the page', edits: [{ save: 'index.html', replace: ['<script type="module" src="./reviews.js"></script>', ''] }], solves: false },
    { name: 'the widget made to send nothing', edits: [{ save: 'reviews.js', replace: ['  fetch(', '  if (false) fetch('] }], solves: false },
    { name: 'the cookie renamed', edits: [server(READABLE_COOKIE, 'res.cookie(\'sid\', \'lena-7f3a\', { domain: \'cornerbakery.shop\', secure: true, sameSite: \'lax\' })'), server('(?:^|; )session=([^;]*)', '(?:^|; )sid=([^;]*)')], solves: false },
    { name: 'the cookie given Path=/account, away from the page', edits: [session(READABLE_COOKIE, '{ domain: \'cornerbakery.shop\', path: \'/account\', secure: true, sameSite: \'lax\' }')], solves: false },
    { name: 'the page throwing the session away after sign-in', edits: [{ save: 'app.js', replace: ['  await showAccount()\n}', '  await showAccount()\n  document.cookie = \'session=; Domain=cornerbakery.shop; Secure; Max-Age=0\'\n}'] }], solves: false },
    {
      name: 'the session stored reversed and taken only with an Origin',
      edits: [
        server('res.cookie(\'session\', \'lena-7f3a\',', 'res.cookie(\'session\', \'a3f7-anel\','),
        server('  const session = cookie.match(/(?:^|; )session=([^;]*)/)?.[1]', '  if (!req.get(\'Origin\')) return null\n  const session = cookie.match(/(?:^|; )session=([^;]*)/)?.[1]?.split(\'\').reverse().join(\'\')')
      ],
      solves: false
    }
  ],
  'web-09-cookie-path': [
    { name: 'res.cookie in place of the hand-written line (it writes Path=/)', edits: [server(NO_PATH_COOKIE, 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })')], solves: true },
    { name: 'the sign-in moved to /login (its default path is /)', edits: [server('app.post(\'/auth/login\'', 'app.post(\'/login\''), { save: 'app.js', replace: ['`${API}/auth/login`', '`${API}/login`'] }], solves: true },
    { name: 'Path=/orders', edits: [server(NO_PATH_COOKIE, 'res.set(\'Set-Cookie\', \'session=lena-7f3a; Path=/orders; HttpOnly; Secure; SameSite=Lax\')')], solves: false },
    { name: 'Domain=cornerbakery.shop without a Path', edits: [server(NO_PATH_COOKIE, 'res.set(\'Set-Cookie\', \'session=lena-7f3a; Domain=cornerbakery.shop; HttpOnly; Secure; SameSite=Lax\')')], solves: false },
    { name: 'anyone taken for Lena', edits: [ANYONE_IS_LENA], solves: false }
  ],
  'web-10-email-link': [
    { name: 'Lax, and the Origin of every order checked too', edits: [session(STRICT_COOKIE, '{ httpOnly: true, secure: true, sameSite: \'lax\' }'), inOrders(['if (req.get(\'Origin\') !== SHOP) return res.status(403).json({ error: \'Orders come from the shop\' })'])], solves: true },
    { name: 'SameSite=None (with Secure)', edits: [session(STRICT_COOKIE, '{ httpOnly: true, secure: true, sameSite: \'none\' }')], solves: false },
    { name: 'SameSite left out (Lax by default: Chrome\'s Lax+POST still sends a fresh cookie)', edits: [session(STRICT_COOKIE, '{ httpOnly: true, secure: true }')], solves: false },
    { name: 'the pickup page shown without asking who is signed in', edits: [server('app.get(\'/pickup/:id\', (req, res) => {\n  const customer = customerOf(req)', 'app.get(\'/pickup/:id\', (req, res) => {\n  const customer = customerOf(req) ?? { name: \'you\' }')], solves: false }
  ]
}
