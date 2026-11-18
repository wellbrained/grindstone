// Other edits a player may make to a chapter 3 level (auth & tokens): real fixes the goals must accept and tempting
// non-fixes they must reject, the chapter's list among them: the token moved to sessionStorage, its key renamed,
// base64-"encrypted", kept in memory; the widget taken out; the thief refused by name; a cookie that is not HttpOnly or
// is SameSite=None; a sanitising regex, the review deleted, `<` refused; a cookie's Max-Age without exp, exp ignored or
// checked with jwt.decode, a new secret; refreshing forever, before every request or on a timer, a token for 30 days;
// a logout that ends half the session, or everyone's. Applied like fixes.ts's; run in a browser by e2e/web-levels.spec.ts.
import { BEARER_LINE, KEEP_TOKEN, TOKEN_ANSWER } from '../../../../shared/levels/web/11-token-in-storage'
import { AS_HTML } from '../../../../shared/levels/web/12-review-runs'
import { FOREVER_TOKEN } from '../../../../shared/levels/web/13-token-never-expires'
import { SEND_ONCE } from '../../../../shared/levels/web/14-signed-out-again'
import { TRUSTS_TOKEN } from '../../../../shared/levels/web/15-logout-stays'
import type { OtherFix } from './fixes'

type Edit = OtherFix['edits'][number]

const server = (from: string, to: string): Edit => ({ save: 'server.js', replace: [from, to] })
const app = (from: string, to: string): Edit => ({ save: 'app.js', replace: [from, to] })

// --- 3.1 -------------------------------------------------------------------------------------------------------------

const GET_TOKEN = '  const token = localStorage.getItem(\'token\')'
/** The token as an HttpOnly cookie with these options, the page sending its cookie (the solution's other edits). */
const cookieSession = (options: string, answer = '  res.json({ name: CUSTOMERS[customer].name })', read = '  const token = req.cookies.session'): Edit[] => [
  server(TOKEN_ANSWER, `  res.cookie('session', token, ${options})\n${answer}`),
  server(BEARER_LINE, read),
  app(`${GET_TOKEN}\n  return fetch(\`\${API}\${path}\`, { ...options, headers: token ? { Authorization: \`Bearer \${token}\` } : {} })`, '  return fetch(`${API}${path}`, { ...options, credentials: \'include\' })'),
  app(KEEP_TOKEN, '  await response.json()')
]

// --- 3.2 -------------------------------------------------------------------------------------------------------------

/** The reviews put in with innerHTML after `text` went through this expression. */
const htmlOf = (expression: string): Edit => app(AS_HTML, `  reviews.innerHTML = all.map(review => \`<li>“\${${expression}}” · \${review.name}</li>\`).join('')`)

// --- 3.4 -------------------------------------------------------------------------------------------------------------

const api = (lines: readonly string[]): Edit => app(SEND_ONCE, lines.join('\n'))

// --- 3.5 -------------------------------------------------------------------------------------------------------------

const LOGOUT = 'app.post(\'/auth/logout\', (req, res) => {\n  res.clearCookie(\'session\')'
const inLogout = (lines: readonly string[], before = ''): Edit => server(LOGOUT, `${before}app.post('/auth/logout', (req, res) => {\n${lines.map(line => `  ${line}\n`).join('')}  res.clearCookie('session')`)
const refusesSignedOut = (check: string): Edit => server(TRUSTS_TOKEN, `    if (${check}) return null\n${TRUSTS_TOKEN}`)

export const authFixes: Record<string, OtherFix[]> = {
  'web-11-token-in-storage': [
    // the review of 2026-11-18: ways to tell the thief from the page by how it sends a request, and a server that answers once
    { name: 'the token taken only with the page\'s cross-origin Referer', edits: [server(BEARER_LINE, `  if (req.get('Referer') !== SHOP + '/') return null\n${BEARER_LINE}`)], solves: false },
    { name: 'the token taken only when Authorization is the first header', edits: [server(BEARER_LINE, `  if (Object.keys(req.headers)[0] !== 'authorization') return null\n${BEARER_LINE}`)], solves: false },
    { name: 'GET /account answered once per load', edits: [server('app.get(\'/account\', (req, res) => {\n', 'let accountAsked = 0\napp.get(\'/account\', (req, res) => {\n  if (accountAsked++) return res.status(401).json({ error: \'Please sign in\' })\n')], solves: false },
    { name: 'the HttpOnly cookie with SameSite=Strict', edits: cookieSession('{ httpOnly: true, secure: true, sameSite: \'strict\' }'), solves: true },
    { name: 'the token in sessionStorage', edits: [app(GET_TOKEN, '  const token = sessionStorage.getItem(\'token\')'), app('  localStorage.setItem(\'token\', token)', '  sessionStorage.setItem(\'token\', token)')], solves: false },
    { name: 'the storage key renamed', edits: [app(GET_TOKEN, '  const token = localStorage.getItem(\'k8x\')'), app('  localStorage.setItem(\'token\', token)', '  localStorage.setItem(\'k8x\', token)')], solves: false },
    { name: 'the token base64-"encrypted" in storage', edits: [app(GET_TOKEN, '  const kept = localStorage.getItem(\'token\')\n  const token = kept && atob(kept)'), app('  localStorage.setItem(\'token\', token)', '  localStorage.setItem(\'token\', btoa(token))')], solves: false },
    { name: 'the token kept in memory only (Lena signs in again after a reload)', edits: [app(GET_TOKEN, '  const token = memory'), app('function api(path, options = {}) {', 'let memory = null\nfunction api(path, options = {}) {'), app('  localStorage.setItem(\'token\', token)', '  memory = token')], solves: false },
    { name: 'the widget taken out of the page', edits: [{ save: 'index.html', replace: ['<script type="module" src="./reviews.js"></script>', ''] }], solves: false },
    { name: 'the widget made to send nothing', edits: [{ save: 'reviews.js', replace: ['  fetch(', '  if (false) fetch('] }], solves: false },
    { name: 'the thief refused by its Origin (only the shop\'s page may send the token)', edits: [server(BEARER_LINE, `  if (req.get('Origin') !== SHOP) return null\n${BEARER_LINE}`)], solves: false },
    { name: 'the cookie, but SameSite=None', edits: cookieSession('{ httpOnly: true, secure: true, sameSite: \'none\' }'), solves: false },
    // a host-only cookie of the API is out of the shop's page's reach anyway (2.3's other fix); HttpOnly keeps it from scripts anywhere
    { name: 'the cookie without HttpOnly, kept to the API (no Domain): the shop\'s page never sees it', edits: cookieSession('{ secure: true, sameSite: \'lax\' }'), solves: true },
    { name: 'the cookie for the whole site (Domain=cornerbakery.shop), not HttpOnly', edits: cookieSession('{ domain: \'cornerbakery.shop\', secure: true, sameSite: \'lax\' }'), solves: false },
    { name: 'the HttpOnly cookie, the token still in the sign-in\'s answer and a Bearer token still taken', edits: cookieSession('{ httpOnly: true, secure: true, sameSite: \'lax\' }', '  res.json({ name: CUSTOMERS[customer].name, token })', `${BEARER_LINE.replace('const token =', 'const bearer =')}\n  const token = bearer || req.cookies.session`), solves: false },
    { name: 'the HttpOnly cookie, only the cookie taken, the token still in the sign-in\'s answer', edits: cookieSession('{ httpOnly: true, secure: true, sameSite: \'lax\' }', '  res.json({ name: CUSTOMERS[customer].name, token })'), solves: false }
  ],
  'web-12-review-runs': [
    { name: 'the text escaped before innerHTML (&, <, >, quotes)', edits: [htmlOf('review.text.replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\').replace(/"/g, \'&quot;\').replace(/\'/g, \'&#39;\')')], solves: true },
    { name: 'innerText on a new item', edits: [app(AS_HTML, '  reviews.replaceChildren(...all.map((review) => {\n    const item = document.createElement(\'li\')\n    item.innerText = `“${review.text}” · ${review.name}`\n    return item\n  }))')], solves: true },
    { name: '<script> tags taken out with a regex', edits: [htmlOf('review.text.replace(/<script.*?>.*?<\\/script>/gi, \'\')')], solves: false },
    { name: 'on…= handlers taken out with a regex', edits: [htmlOf('review.text.replace(/on\\w+=/gi, \'\')')], solves: false },
    { name: '<img> tags taken out with a regex', edits: [htmlOf('review.text.replace(/<img[^>]*>/g, \'\')')], solves: false },
    { name: 'every tag taken out with a regex (the review no longer reads as written)', edits: [htmlOf('review.text.replace(/<[^>]*>/g, \'\')')], solves: false },
    { name: 'Mallory\'s review deleted', edits: [server('  { name: \'Mallory\', text: `', '  // { name: \'Mallory\', text: `'), server('onerror="fetch(\'https://api.cornerbakery.shop/account/email\', { method: \'POST\', credentials: \'include\', body: new URLSearchParams(\'email=mallory@cheap-flour.example\') })">` }', 'onerror="…">` }')], solves: false },
    { name: 'reviews with < refused by server.js', edits: [server('  if (!name || !text) return', '  if (text.includes(\'<\')) return res.status(400).json({ error: \'No HTML, please\' })\n  if (!name || !text) return')], solves: false },
    { name: 'the email route turned off', edits: [server('  customer.email = String(req.body?.email ?? \'\')', '  return res.status(403).json({ error: \'Not now\' })')], solves: false }
  ],
  'web-13-token-never-expires': [
    { name: 'expiresIn as a number of seconds', edits: [server(FOREVER_TOKEN, '  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: 15 * 60 })')], solves: true },
    { name: 'exp written into the payload', edits: [server(FOREVER_TOKEN, '  const token = jwt.sign({ sub: customer, exp: Math.floor(Date.now() / 1000) + 15 * 60 }, SECRET)')], solves: true },
    { name: 'jwt.verify with maxAge (no exp in the token)', edits: [server('jwt.verify(req.cookies.session, SECRET)', 'jwt.verify(req.cookies.session, SECRET, { maxAge: \'15m\' })')], solves: true },
    { name: 'the cookie\'s Max-Age cut to 5 minutes', edits: [server('maxAge: 15 * 60 * 1000', 'maxAge: 5 * 60 * 1000')], solves: false },
    { name: 'exp written, then ignored by verify', edits: [server(FOREVER_TOKEN, '  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: \'15m\' })'), server('jwt.verify(req.cookies.session, SECRET)', 'jwt.verify(req.cookies.session, SECRET, { ignoreExpiration: true })')], solves: false },
    { name: 'exp written, and checked with jwt.decode (no signature check)', edits: [server(FOREVER_TOKEN, '  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: \'15m\' })'), server('    return CUSTOMERS[jwt.verify(req.cookies.session, SECRET).sub] ?? null', '    const claims = jwt.decode(req.cookies.session)\n    if (!claims || claims.exp * 1000 < Date.now()) return null\n    return CUSTOMERS[claims.sub] ?? null')], solves: false },
    { name: 'a token for a day', edits: [server(FOREVER_TOKEN, '  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: \'1d\' })')], solves: false },
    { name: 'a new secret (the tokens still without exp)', edits: [server('const SECRET = \'oven-mitt-4417\'', 'const SECRET = \'oven-mitt-9921\'')], solves: false },
    { name: 'the cookie taken only with the page\'s cross-origin Referer (no exp)', edits: [server('    return CUSTOMERS[jwt.verify(req.cookies.session, SECRET).sub] ?? null', '    if (req.get(\'Referer\') !== SHOP + \'/\') return null\n    return CUSTOMERS[jwt.verify(req.cookies.session, SECRET).sub] ?? null')], solves: false },
    {
      name: '15 minutes from the customer\'s last sign-in (no exp: a new sign-in brings the old copy back)',
      edits: [
        server('    return CUSTOMERS[jwt.verify(req.cookies.session, SECRET).sub] ?? null', '    const claims = jwt.verify(req.cookies.session, SECRET)\n    if (Date.now() - (STARTED[claims.sub] ?? 0) > 15 * 60 * 1000) return null\n    return CUSTOMERS[claims.sub] ?? null'),
        server(FOREVER_TOKEN, `  STARTED[customer] = Date.now()\n${FOREVER_TOKEN}`),
        server('// POST /login: the session cookie holds', 'const STARTED = {}\n// POST /login: the session cookie holds')
      ],
      solves: false
    }
  ],
  'web-14-signed-out-again': [
    {
      name: 'the request sent again by api itself, with a flag',
      edits: [app('async function api(path, options = {}) {\n' + SEND_ONCE, ['async function api(path, options = {}, again = true) {', '  const response = await fetch(`${API}${path}`, { ...options, credentials: \'include\' })', '  if (response.status !== 401 || !again) return response', '  const refreshed = await fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })', '  return refreshed.ok ? api(path, options, false) : response'].join('\n'))],
      solves: true
    },
    { name: 'refreshing until it works', edits: [api(['  let response = await fetch(`${API}${path}`, { ...options, credentials: \'include\' })', '  while (response.status === 401) {', '    await fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })', '    response = await fetch(`${API}${path}`, { ...options, credentials: \'include\' })', '  }', '  return response'])], solves: false },
    { name: 'a refresh before every request', edits: [api(['  if (path !== \'/login\') await fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })', SEND_ONCE])], solves: false },
    { name: 'the request sent again without a refresh', edits: [api(['  const response = await fetch(`${API}${path}`, { ...options, credentials: \'include\' })', '  return response.status === 401 ? fetch(`${API}${path}`, { ...options, credentials: \'include\' }) : response'])], solves: false },
    { name: 'a refresh on 401, the request not sent again', edits: [api(['  const response = await fetch(`${API}${path}`, { ...options, credentials: \'include\' })', '  if (response.status === 401) await fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })', '  return response'])], solves: false },
    { name: 'a refresh every 14 minutes on a timer', edits: [app('document.querySelector(\'#sign-in\').addEventListener(\'click\', signIn)', 'setInterval(() => fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' }), 14 * 60 * 1000)\ndocument.querySelector(\'#sign-in\').addEventListener(\'click\', signIn)')], solves: false },
    { name: 'the session token for 30 days', edits: [server('{ expiresIn: \'15m\', jwtid: randomUUID() }', '{ expiresIn: \'30d\', jwtid: randomUUID() }'), server('sameSite: \'lax\', maxAge: 15 * 60 * 1000 })', 'sameSite: \'lax\', maxAge: 30 * 24 * 60 * 60 * 1000 })')], solves: false }
  ],
  'web-15-logout-stays': [
    { name: 'the session token refused by its id (jti)', edits: [inLogout(['SIGNED_OUT.add(jwt.decode(req.cookies.session)?.jti)', 'REFRESH.delete(req.cookies.refresh)'], 'const SIGNED_OUT = new Set()\n'), refusesSignedOut('SIGNED_OUT.has(jwt.decode(req.cookies.session)?.jti)')], solves: true },
    { name: 'only the refresh token deleted', edits: [inLogout(['REFRESH.delete(req.cookies.refresh)'])], solves: false },
    { name: 'only the session token refused', edits: [inLogout(['SIGNED_OUT.add(req.cookies.session)'], 'const SIGNED_OUT = new Set()\n'), refusesSignedOut('SIGNED_OUT.has(req.cookies.session)')], solves: false },
    { name: 'every refresh token forgotten (everyone signed out)', edits: [inLogout(['SIGNED_OUT.add(req.cookies.session)', 'REFRESH.clear()'], 'const SIGNED_OUT = new Set()\n'), refusesSignedOut('SIGNED_OUT.has(req.cookies.session)')], solves: false },
    { name: 'a new secret on every sign-out (everyone signed out)', edits: [server('const SECRET = \'oven-mitt-4417\'', 'let SECRET = \'oven-mitt-4417\''), inLogout(['SECRET = `oven-mitt-${Date.now()}`', 'REFRESH.delete(req.cookies.refresh)'])], solves: false },
    { name: 'Lena\'s tokens taken only with the page\'s cross-origin Referer (nothing revoked)', edits: [server(TRUSTS_TOKEN, '    const claims = jwt.verify(req.cookies.session, SECRET)\n    if (claims.sub === \'lena\' && req.get(\'Referer\') !== SHOP + \'/\') return null\n    return CUSTOMERS[claims.sub] ?? null'), server('  const customer = REFRESH.get(req.cookies.refresh)', '  const customer = REFRESH.get(req.cookies.refresh)\n  if (customer === \'lena\' && req.get(\'Referer\') !== SHOP + \'/\') return res.status(401).json({ error: \'Please sign in\' })')], solves: false },
    { name: 'the page forgets more (nothing on the server)', edits: [app('  who.textContent = \'Signed out.\'', '  who.textContent = \'Signed out.\'\n  document.cookie = \'session=; Max-Age=0\'\n  localStorage.clear()')], solves: false }
  ]
}
