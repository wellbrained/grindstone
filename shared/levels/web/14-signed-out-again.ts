// Auth & tokens 3.4: signed out every 15 minutes. Since 3.3 the session token runs out after 15 minutes, so Lena's
// order after a coffee break fails. Ben added refresh tokens on the server (an id the browser keeps for 30 days under
// /auth, used once: POST /auth/refresh answers a new session and a new refresh token), but the page never asks. Learn:
// the browser renews nothing by itself; the page refreshes once on a 401 and sends the request again, and gives up when
// the refresh fails, never in a loop. Making the token last 30 days instead keeps a stolen copy good for 30 days; a
// timer that refreshes every 14 minutes misses a laptop that slept.
import { probesGoal } from '../debugging/checks'
import { accountGuards } from './accounts'
import { AUTH_HEAD, COOKIE_API, COOKIE_CUSTOMER, LENA_LOGIN, ORDER_FAILED, ORDER_IN, REFRESH_SESSIONS, SIGNED_IN, authApp, authPage } from './auth'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The api helper's one line that sends the request. */
export const SEND_ONCE = '  return fetch(`${API}${path}`, { ...options, credentials: \'include\' })'

/** The fix: one refresh on a 401, then the request once more. */
export const REFRESH_ONCE = [
  '  const send = () => fetch(`${API}${path}`, { ...options, credentials: \'include\' })',
  '  const response = await send()',
  '  if (response.status !== 401) return response',
  '  // the session ran out: one refresh, then the request once more (Ben)',
  '  const refreshed = await fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })',
  '  return refreshed.ok ? send() : response'
].join('\n')

const SERVER = `${AUTH_HEAD}

${COOKIE_CUSTOMER}

${REFRESH_SESSIONS}

// GET /account: who is signed in
app.get('/account', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json({ name: customer.name })
})

// GET /orders and POST /orders: the signed-in customer's orders, and a new one
app.get('/orders', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json(customer.orders)
})
const MENU = { croissant: 'Butter croissant', sourdough: 'Sourdough loaf', rye: 'Rye loaf' }
app.post('/orders', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  const name = MENU[req.body?.item]
  const quantity = Number(req.body?.quantity)
  if (!name || !(quantity >= 1)) return res.status(400).json({ error: 'Which item, and how many?' })
  customer.orders.push({ name, quantity })
  res.status(201).json({ number: 1041 + customer.orders.length })
})
`

const GUARDS = accountGuards()
const REFRESHES = `POST ${API}/auth/refresh`

export const signedOutAgain: WebScenario = {
  id: 'web-14-signed-out-again',
  track: 'web',
  kind: 'scenario',
  title: 'Signed out every 15 minutes',
  difficulty: 3,
  minutes: 8,
  teaches: 'refresh',
  story: [
    'Since the tokens expire, Lena is signed out every 15 minutes: she signed in at 09:41, her laptop slept through a coffee, and at 10:01 her order didn\'t go through. Ben already gave server.js refresh tokens: the login also sets `refresh`, an id the browser keeps for 30 days (only for `/auth`), and `POST /auth/refresh` trades it for a new session and a new refresh token. The page never asks.',
    'Predict what the page sends at 10:01. Then fix `app.js` so Lena\'s order goes through after a break, without a request too many and without asking forever when the refresh is gone too. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'sends',
      form: 'lines',
      prompt: 'Lena signed in at 09:41: a session cookie with a token for 15 minutes, and a refresh cookie for 30 days with `Path=/auth`. At 10:01 she taps Order. Which of these happen?',
      options: [
        { id: 'order', text: '`POST /orders`, and server.js answers 401.', fact: { row: 'POST https://api.cornerbakery.shop/orders 401' } },
        { id: 'refresh', text: 'The page asks `POST /auth/refresh` for a new session.', fact: { row: 'POST https://api.cornerbakery.shop/auth/refresh 204' } },
        { id: 'cookie', text: '`POST /orders` carries the refresh cookie, so server.js renews the session by itself.', fact: { sent: 'POST https://api.cornerbakery.shop/orders refresh' } },
        { id: 'again', text: 'The order goes through on a second try the browser makes.', fact: { row: 'POST https://api.cornerbakery.shop/orders 201' } }
      ],
      answer: ['order'],
      rule: 'The browser renews no session by itself: the page has to call the refresh route when a request comes back 401, and send the request again.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      storage: [],
      time: true,
      // Lena signs in, her laptop sleeps 20 minutes, she orders
      scene: [{ click: '#sign-in' }, { later: 20 }, { click: '#order' }]
    },
    probes: [
      { id: 'order', steps: [{ text: '#order-status' }] },
      { id: 'refreshes', steps: [{ requests: REFRESHES }] },
      // right after, nothing needs refreshing
      { id: 'who', steps: [{ click: '#refresh' }, { text: '#who' }] },
      { id: 'idle', steps: [{ requests: REFRESHES }] },
      // a copy of her session from 20 minutes ago still runs out: the token's life stays short
      { id: 'old', steps: [{ issued: `POST ${API}/login`, body: LENA_LOGIN, ago: 20, as: 'old' }, { replay: `GET ${API}/account`, using: 'old' }] },
      ...GUARDS.probes,
      // a month later the refresh cookie is gone too: one refresh that fails, then the page gives up
      { id: 'month', steps: [{ later: 44640 }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'gaveUp', steps: [{ requests: REFRESHES }] }
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: authPage() }, { 'app.js': authApp(COOKIE_API, { comment: 'The shop\'s page: Lena signs in at the API, then sees her orders and orders more (Jonas).' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the page sends at 10:01', 1),
    probesGoal('refresh', 'After 20 minutes away Lena\'s order goes through: the page refreshes her session once and sends the order again, refreshes nothing when it needn\'t, and after a month (no refresh cookie left) tries once per request and gives up; a copy of her session from 20 minutes ago is still refused', { order: ORDER_IN, refreshes: 1, who: SIGNED_IN, idle: 1, old: { atLeast: 300 }, ...GUARDS.expected, month: ORDER_FAILED, gaveUp: { atMost: 3 } })
  ],
  hints: [
    'In the Network panel, the `POST orders` at 10:01 got 401: the session cookie was gone (the Application panel shows only `refresh` left). Nothing asked `/auth/refresh`.',
    'The browser never renews a session by itself. The page\'s `api` helper sees every answer: when one is 401, call `POST /auth/refresh` once (with credentials, so the refresh cookie goes along); if that works, send the same request again, else give the 401 back. Never in a loop: a refresh that fails means signing in.',
    'In `app.js`, in `api`, replace the `return fetch(…)` line: keep that same fetch as a function (`const send = () => fetch(…)`) and `await send()`; when its status is 401, send `POST` to the API\'s `/auth/refresh` once with `credentials: \'include\'`, then return `send()` if that refresh is ok, else the 401. Save, then Reload.'
  ],
  debrief: {
    title: 'A short token, and a way to get a new one',
    paragraphs: [
      'The session token lives 15 minutes so that a copy of it is soon worthless (3.3). The refresh token lives 30 days, but it only ever goes to `/auth` (its Path), only to the API, never to a script (`HttpOnly`), and each one works once: `POST /auth/refresh` trades it for a new session and a new refresh token.',
      'The browser does none of this by itself. The page\'s `api` helper does it in one place: a 401 means the session ran out, so it refreshes once and sends the same request again; when the refresh fails too, it hands back the 401 and Lena signs in. A loop would ask forever; refreshing before every request doubles every request; a timer that refreshes every 14 minutes misses the 20 minutes her laptop slept.',
      'Making the session last 30 days would have saved the refresh, and kept every stolen copy good for a month. Real apps also make one refresh at a time when several requests fail together; this page asks one thing after another.'
    ]
  },
  solution: [
    { predict: ['order'] },
    { save: 'app.js', replace: [SEND_ONCE, REFRESH_ONCE] },
    'reload'
  ]
}
