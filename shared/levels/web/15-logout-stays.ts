// Auth & tokens 3.5: signed out, still signed in. Lena used the library's computer: she signed in, ordered, signed out.
// POST /auth/logout clears both cookies in her browser, and that is all it does; a browser extension on that computer
// had copied her cookies a minute before. The copy still works: the session token until it runs out, the refresh token
// for 30 days (and it gets new ones). Learn: signing out must end the session on the server (the refresh token deleted,
// the session token refused until it runs out); deleting the client's copy alone ends nothing. Rotating the secret or
// forgetting every refresh token signs everyone else out too (Sam stays signed in, a guard).
import { probesGoal } from '../debugging/checks'
import { accountGuards } from './accounts'
import { AUTH_HEAD, COOKIE_CUSTOMER, ORDER_IN, REFRESHING_API, REFRESH_SESSIONS, SAM_LOGIN, SIGNED_IN, SIGN_IN_AGAIN, authApp, authPage } from './auth'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The logout route as Jonas wrote it: the browser forgets both cookies. */
export const LOGOUT_ROUTE = [
  '// POST /auth/logout: the browser forgets both cookies, so the customer is signed out (Jonas)',
  'app.post(\'/auth/logout\', (req, res) => {',
  '  res.clearCookie(\'session\')',
  '  res.clearCookie(\'refresh\', { path: \'/auth\' })',
  '  res.sendStatus(204)',
  '})'
].join('\n')

/** customerOf's line that takes any token that verifies. */
export const TRUSTS_TOKEN = '    return CUSTOMERS[jwt.verify(req.cookies.session, SECRET).sub] ?? null'

const SERVER = `${AUTH_HEAD}

${COOKIE_CUSTOMER}

${REFRESH_SESSIONS}

${LOGOUT_ROUTE}

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

const SIGN_OUT = [
  '',
  '// Sign out: the API forgets the session (Jonas)',
  'async function signOut() {',
  '  await api(\'/auth/logout\', { method: \'POST\' })',
  '  who.textContent = \'Signed out.\'',
  '  list.replaceChildren()',
  '}',
  'document.querySelector(\'#sign-out\').addEventListener(\'click\', signOut)'
]

const GUARDS = accountGuards()

export const logoutStays: WebScenario = {
  id: 'web-15-logout-stays',
  track: 'web',
  kind: 'scenario',
  title: 'Signed out, still signed in',
  difficulty: 3,
  minutes: 8,
  teaches: 'logout',
  story: [
    'Lena ordered from the library\'s computer and signed out, as she should. `POST /auth/logout` clears both cookies in her browser. But a browser extension on that computer had copied her cookies a minute before, and someone is using them. Sam, another customer, is signed in on his phone all the while.',
    'Predict what the copy still opens. Then fix `server.js` so signing out ends Lena\'s session for good, for every copy, while Sam stays signed in and Lena can sign in again. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'copy',
      form: 'lines',
      prompt: 'A minute before Lena signs out, an extension copies her cookies: `session` (a token for 15 minutes) and `refresh` (30 days, `Path=/auth`). `POST /auth/logout` clears both in her browser. What still works for whoever has the copy?',
      options: [
        { id: 'account', text: 'The session cookie: `GET /account` answers as Lena (until the token runs out).', fact: { replayed: 'GET https://api.cornerbakery.shop/account 200' } },
        { id: 'refresh', text: 'The refresh cookie: `POST /auth/refresh` hands out a new session (and a new refresh token).', fact: { replayed: 'POST https://api.cornerbakery.shop/auth/refresh 204' } },
        { id: 'nothing', text: 'Nothing: the logout told server.js to forget them.', fact: { replayed: 'GET https://api.cornerbakery.shop/account 401' } }
      ],
      answer: ['account', 'refresh'],
      rule: 'Clearing cookies only empties one browser; a token the server still accepts works for every copy, so signing out has to end the session on the server.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      storage: [],
      time: true,
      // Sam signed in on his phone five minutes ago; Lena signs in, the extension copies her cookies, she signs out, the
      // copy is used
      scene: [
        { issued: `POST ${API}/login`, body: SAM_LOGIN, ago: 5, as: 'sam' },
        { click: '#sign-in' },
        { copy: 'browser', as: 'library' },
        { click: '#sign-out' },
        { replay: `GET ${API}/account`, using: 'library', show: true },
        { replay: `POST ${API}/auth/refresh`, using: 'library', show: true }
      ]
    },
    probes: [
      { id: 'out', steps: [{ text: '#who' }] },
      { id: 'browser', steps: [{ click: '#refresh' }, { text: '#who' }] },
      { id: 'account', steps: [{ replay: `GET ${API}/account`, using: 'library' }] },
      { id: 'refresh', steps: [{ replay: `POST ${API}/auth/refresh`, using: 'library' }] },
      // Sam, signed in on his phone before Lena signed out: his session and his refresh token still work
      { id: 'sam', steps: [{ replay: `GET ${API}/account`, using: 'sam' }] },
      { id: 'samRefresh', steps: [{ replay: `POST ${API}/auth/refresh`, using: 'sam' }] },
      { id: 'again', steps: [{ click: '#sign-in' }, { text: '#who' }] },
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: authPage({ signOut: true }) }, { 'app.js': authApp(REFRESHING_API, { comment: 'The shop\'s page: Lena signs in at the API, sees her orders, orders more and signs out (Jonas).', extra: SIGN_OUT }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the copy still opens', 1),
    probesGoal('logout', 'After Lena signs out, a copy of her cookies taken before gets nothing (neither her session nor a new one) and her browser is signed out; Sam stays signed in, and Lena can sign in again and order', { out: 'Signed out.', browser: SIGN_IN_AGAIN, account: { atLeast: 300 }, refresh: { atLeast: 300 }, sam: 200, samRefresh: { atMost: 299 }, again: SIGNED_IN, own: ORDER_IN, ...GUARDS.expected })
  ],
  hints: [
    'The Server panel shows the copy at work after `POST /auth/logout 204`: `GET /account` and `POST /auth/refresh` from outside the browser, both answered. In the Application panel her browser has no cookie left: the logout only cleared those.',
    'Clearing cookies empties one browser. server.js still takes the refresh token (it is in `REFRESH`) and the session token (it verifies for 15 minutes). Signing out has to end both on the server: delete the refresh token, and keep a list of signed-out session tokens that `customerOf` refuses (until they run out anyway). Only Lena\'s: a new secret or an empty `REFRESH` signs Sam out too.',
    'In `server.js`, above the logout route add `const SIGNED_OUT = new Set()`, and in the route `SIGNED_OUT.add(req.cookies.session)` and `REFRESH.delete(req.cookies.refresh)`; in `customerOf`, before its `return`, `if (SIGNED_OUT.has(req.cookies.session)) return null`. Save, then Reload.'
  ],
  debrief: {
    title: 'Signing out happens on the server',
    paragraphs: [
      '`res.clearCookie` asks one browser to forget a cookie. A copy (an extension, malware, a HAR file) has no browser to ask: as long as server.js accepts what is in it, it opens Lena\'s account, and the refresh token even renews itself for a month.',
      'A sign-out has to end the session where it is checked: the refresh token deleted from `REFRESH`, and the session token refused from now on (a list of signed-out tokens, kept until they would run out anyway; or a session id the server can delete, if the cookie holds one instead of a self-contained token). That is why the session token\'s life is short: what the server can\'t revoke at once, it only has to remember for 15 minutes.',
      'Only Lena\'s session ends: a new secret or an empty `REFRESH` would sign out every customer, Sam on his phone too. A "sign out everywhere" button would end all of Lena\'s sessions, and only hers.'
    ]
  },
  solution: [
    { predict: ['account', 'refresh'] },
    { save: 'server.js', replace: ['app.post(\'/auth/logout\', (req, res) => {\n  res.clearCookie(\'session\')', 'const SIGNED_OUT = new Set()\napp.post(\'/auth/logout\', (req, res) => {\n  SIGNED_OUT.add(req.cookies.session)\n  REFRESH.delete(req.cookies.refresh)\n  res.clearCookie(\'session\')'] },
    { save: 'server.js', replace: [TRUSTS_TOKEN, '    if (SIGNED_OUT.has(req.cookies.session)) return null\n' + TRUSTS_TOKEN] },
    'reload'
  ]
}
