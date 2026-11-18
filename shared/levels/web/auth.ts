// Corner Bakery's sign-in grows up (ADR 0009, chapter 3: auth & tokens): server.js signs tokens with jsonwebtoken and a
// secret, keeps them in an HttpOnly cookie or hands them to the page, and later refreshes and revokes them. The page
// signs Lena in, shows who is signed in and her orders, places an order; some levels add the hacked reviews widget,
// the reviews customers write, or a Sign out button. Sam is a second customer (a guard: his session must outlive
// Lena's sign-out). The levels change the login, the API's `customerOf`, the page's `api` helper; the rest is here.
import { ORDER_IN, SIGNED_IN } from './accounts'
import { API, SHOP } from './site'

export { ORDER_IN, SIGNED_IN }

/** The secret server.js signs its tokens with (whoever knows it can make one). */
export const SECRET = 'oven-mitt-4417'

/** Lena's sign-in (the page's form, and the probes that sign in as her). */
export const LENA_LOGIN = { email: 'lena@example.com', password: 'croissant-42' } as const
/** Sam's: another customer, signed in on his own phone. */
export const SAM_LOGIN = { email: 'sam@example.com', password: 'rye-and-honey' } as const

/** What the account line says when the API says no. */
export const SIGN_IN_AGAIN = 'Not signed in: please sign in again.'
/** What the order line says when the order didn't go through. */
export const ORDER_FAILED = 'Sorry, your order did not go through.'

/** server.js's first lines in chapter 3: Express with JSON, form bodies and cookies, jsonwebtoken, the secret, CORS for the shop. */
export const AUTH_HEAD = [
  '// The bakery\'s API server at https://api.cornerbakery.shop (Node with Express).',
  '// Grindstone runs it like `node server.js` every time the shop\'s page loads.',
  'const express = require(\'express\')',
  'const jwt = require(\'jsonwebtoken\')',
  'const cookieParser = require(\'cookie-parser\')',
  'const app = express()',
  'app.use(express.json())',
  'app.use(express.urlencoded())',
  'app.use(cookieParser())',
  '',
  `const SHOP = '${SHOP}'`,
  '// Signs our tokens: whoever knows it can make one (in production it lives outside the code)',
  `const SECRET = '${SECRET}'`,
  '',
  '// The shop\'s page may read our answers, with the customer\'s cookie, and send a token (Ben)',
  'app.use((req, res, next) => {',
  '  if (req.get(\'Origin\') === SHOP) {',
  '    res.set(\'Access-Control-Allow-Origin\', SHOP)',
  '    res.set(\'Access-Control-Allow-Credentials\', \'true\')',
  '    res.vary(\'Origin\')',
  '  }',
  '  if (req.method === \'OPTIONS\') {',
  '    res.set(\'Access-Control-Allow-Methods\', \'GET, POST\')',
  '    res.set(\'Access-Control-Allow-Headers\', \'Authorization\')',
  '    return res.sendStatus(204)',
  '  }',
  '  next()',
  '})',
  '',
  'const CUSTOMERS = { lena: { name: \'Lena\', orders: [] }, sam: { name: \'Sam\', orders: [] } }',
  `const PASSWORDS = { '${LENA_LOGIN.email}': ['lena', '${LENA_LOGIN.password}'], '${SAM_LOGIN.email}': ['sam', '${SAM_LOGIN.password}'] }`,
  '',
  '// The customer this email and password belong to, or null',
  'function signInAs(req) {',
  '  const found = PASSWORDS[req.body?.email]',
  '  return found && found[1] === req.body?.password ? found[0] : null',
  '}'
].join('\n')

/** `customerOf` reading the session cookie's token (a token that doesn't verify is nobody). */
export const COOKIE_CUSTOMER = [
  '// Who is asking: the token in the session cookie (Ben)',
  'function customerOf(req) {',
  '  try {',
  '    return CUSTOMERS[jwt.verify(req.cookies.session, SECRET).sub] ?? null',
  '  } catch {',
  '    return null',
  '  }',
  '}'
].join('\n')

/** The refresh tokens (3.4, 3.5): an id the browser keeps for 30 days under /auth, used once. */
export const REFRESH_SESSIONS = [
  '// Refresh tokens: an id the browser keeps for 30 days (only for /auth), each used once (Ben)',
  'const { randomUUID } = require(\'crypto\')',
  'const REFRESH = new Map()',
  '',
  '// A session: the session cookie (a token for 15 minutes, with an id of its own) and a new refresh token',
  'function startSession(res, customer) {',
  '  const refresh = randomUUID()',
  '  REFRESH.set(refresh, customer)',
  '  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: \'15m\', jwtid: randomUUID() })',
  '  res.cookie(\'session\', token, { httpOnly: true, secure: true, sameSite: \'lax\', maxAge: 15 * 60 * 1000 })',
  '  res.cookie(\'refresh\', refresh, { httpOnly: true, secure: true, sameSite: \'lax\', path: \'/auth\', maxAge: 30 * 24 * 60 * 60 * 1000 })',
  '}',
  '',
  '// POST /login: the sign-in form\'s email and password (Jonas)',
  'app.post(\'/login\', (req, res) => {',
  '  const customer = signInAs(req)',
  '  if (!customer) return res.status(401).json({ error: \'Wrong email or password\' })',
  '  startSession(res, customer)',
  '  res.json({ name: CUSTOMERS[customer].name })',
  '})',
  '',
  '// POST /auth/refresh: a new session for a refresh token, which is then used up (Ben)',
  'app.post(\'/auth/refresh\', (req, res) => {',
  '  const customer = REFRESH.get(req.cookies.refresh)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  REFRESH.delete(req.cookies.refresh)',
  '  startSession(res, customer)',
  '  res.sendStatus(204)',
  '})'
].join('\n')

/** The account page with Sign out (3.5) or without. */
export function authPage(options: { signOut?: boolean, reviews?: 'widget' | 'list' } = {}): string[] {
  return [
    '<section class="box" aria-labelledby="account-heading">',
    '  <h2 id="account-heading">Your account</h2>',
    '  <p id="who" role="status">Not signed in.</p>',
    '  <p>',
    '    <button class="action" id="sign-in" type="button">Sign in as Lena</button>',
    ...(options.signOut ? ['    <button class="action" id="sign-out" type="button">Sign out</button>'] : []),
    '  </p>',
    '</section>',
    '<section class="box" aria-labelledby="orders-heading">',
    '  <h2 id="orders-heading">Your orders</h2>',
    '  <ul id="orders" class="list" aria-label="Your orders"></ul>',
    '  <p>',
    '    <button class="action" id="order" type="button">Order 2 croissants</button>',
    '    <button class="action" id="refresh" type="button">Refresh</button>',
    '  </p>',
    '  <p class="note" id="order-status" role="status"></p>',
    '</section>',
    ...(options.reviews === 'widget'
      ? [
          '<section class="box" aria-labelledby="reviews-heading">',
          '  <h2 id="reviews-heading">Reviews</h2>',
          '  <p class="note" id="reviews">★★★★★ 4.8 from 212 reviews</p>',
          '  <button class="action" id="reviews-open" type="button">Show reviews</button>',
          '</section>',
          '<script type="module" src="./reviews.js"></script>'
        ]
      : options.reviews === 'list'
        ? [
            '<section class="box" aria-labelledby="reviews-heading">',
            '  <h2 id="reviews-heading">Reviews</h2>',
            '  <ul id="reviews" class="list" aria-label="Reviews"></ul>',
            '  <button class="action" id="reviews-open" type="button">Show reviews</button>',
            '</section>'
          ]
        : [])
  ]
}

/** app.js's own part around the `api` helper: sign in, who is signed in and her orders, an order, Refresh. */
export function authApp(api: string, options: { comment: string, keep?: string, extra?: readonly string[] }): string {
  return `// ${options.comment}
const API = '${API}'
const who = document.querySelector('#who')
const list = document.querySelector('#orders')
const status = document.querySelector('#order-status')

${api}

async function signIn() {
  const response = await api('/login', {
    method: 'POST',
    body: new URLSearchParams({ email: '${LENA_LOGIN.email}', password: '${LENA_LOGIN.password}' })
  })
  if (!response.ok) {
    who.textContent = 'Sign-in failed.'
    return
  }
${options.keep ?? '  await response.json()'}
  await showAccount()
}

async function showAccount() {
  const response = await api('/account')
  if (!response.ok) {
    who.textContent = '${SIGN_IN_AGAIN}'
    list.replaceChildren()
    return
  }
  const customer = await response.json()
  who.textContent = \`Signed in as \${customer.name}\`
  await showOrders()
}

async function showOrders() {
  const response = await api('/orders')
  if (!response.ok) return
  const orders = await response.json()
  list.replaceChildren(...orders.map((order) => {
    const item = document.createElement('li')
    item.textContent = \`\${order.quantity} × \${order.name}\`
    return item
  }))
}

async function placeOrder() {
  const response = await api('/orders', {
    method: 'POST',
    body: new URLSearchParams({ item: 'croissant', quantity: '2' })
  })
  status.textContent = response.status === 201 ? '${ORDER_IN}' : '${ORDER_FAILED}'
  await showOrders()
}

document.querySelector('#sign-in').addEventListener('click', signIn)
document.querySelector('#order').addEventListener('click', placeOrder)
document.querySelector('#refresh').addEventListener('click', showAccount)
${(options.extra ?? []).join('\n')}`
}

/** The `api` helper as most of chapter 3 has it: every request with the session cookie. */
export const COOKIE_API = [
  '// Every request to the API goes through here, with the session cookie (Jonas)',
  'async function api(path, options = {}) {',
  '  return fetch(`${API}${path}`, { ...options, credentials: \'include\' })',
  '}'
].join('\n')

/** The `api` helper that refreshes once on a 401 (3.4's fix, 3.5's start). */
export const REFRESHING_API = [
  '// Every request to the API goes through here, with the session cookie (Jonas)',
  'async function api(path, options = {}) {',
  '  const send = () => fetch(`${API}${path}`, { ...options, credentials: \'include\' })',
  '  const response = await send()',
  '  if (response.status !== 401) return response',
  '  // the session ran out: one refresh, then the request once more (Ben)',
  '  const refreshed = await fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })',
  '  return refreshed.ok ? send() : response',
  '}'
].join('\n')
