// Auth & tokens practice tasks (ADR 0009: prediction only, one question, about 30 s each). Each has a small app whose
// run shows the answer in the Console, the Network, Server and Application panels once it is given; the files are
// read-only. A practice task follows its scenario in the chapter's list (index.ts).
import { CHEAP_FLOUR, cheapFlour } from '../accounts'
import { AUTH_HEAD, COOKIE_API, COOKIE_CUSTOMER, REFRESH_SESSIONS, SECRET, authApp, authPage } from '../auth'
import { predictedGoal } from '../checks'
import { API, PROMO, SERVER_HEAD, SHOP, SHOP_PAGE, webSite } from '../site'
import type { WebPracticeTask } from '../types'

const NOTE = (text: string) => [`<p class="note" id="note">${text}</p>`]

// --- 3.1: what a script on the page can read ------------------------------------------------------------------------

const READS_APP = `// What a script on https://cornerbakery.shop/order can read: here, the page's own code (any script would read the same).
console.log('localStorage:', Object.keys(localStorage).join(', ') || '(empty)')
console.log('sessionStorage:', Object.keys(sessionStorage).join(', ') || '(empty)')
console.log('document.cookie:', document.cookie || '(empty)')
`

export const scriptReads: WebPracticeTask = {
  id: 'web-practice-script-reads',
  track: 'web',
  kind: 'practice',
  practises: 'web-11-token-in-storage',
  title: 'What can a script on the page read?',
  difficulty: 1,
  minutes: 0.5,
  task: 'Lena\'s browser keeps storage for three origins and two cookies. Pick what a script on `https://cornerbakery.shop/order` can read.',
  prediction: {
    questions: [{
      id: 'reads',
      form: 'lines',
      prompt: 'The browser keeps these. Which can a script on `https://cornerbakery.shop/order` read?',
      options: [
        { id: 'basket', text: '`basket` in `localStorage` of `https://cornerbakery.shop`', fact: { storage: 'local basket' } },
        { id: 'step', text: '`checkout-step` in `sessionStorage` of `https://cornerbakery.shop` (this tab)', fact: { storage: 'session checkout-step' } },
        { id: 'promo', text: '`promo-code` in `localStorage` of `https://promo.cornerbakery.shop`', fact: { storage: 'local promo-code' } },
        { id: 'token', text: '`token` in `localStorage` of `https://api.cornerbakery.shop`', fact: { storage: 'local token' } },
        { id: 'theme', text: 'the cookie `theme` (`Secure; SameSite=Lax`, set by the shop\'s page)', fact: { readable: 'theme' } },
        { id: 'session', text: 'the cookie `session` (`Domain=cornerbakery.shop; HttpOnly; Secure`)', fact: { readable: 'session' } }
      ],
      answer: ['basket', 'step', 'theme'],
      rule: 'A script reads its own origin\'s localStorage and sessionStorage and every cookie of its host that isn\'t HttpOnly; another origin\'s storage is out of its reach, even on the same site.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      application: true,
      time: true,
      storage: [
        { origin: SHOP, kind: 'local', key: 'basket', value: '2 × croissant' },
        { origin: SHOP, kind: 'session', key: 'checkout-step', value: 'pickup' },
        { origin: PROMO, kind: 'local', key: 'promo-code', value: 'XMAS23' },
        { origin: API, kind: 'local', key: 'token', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsZW5hIn0.x' }
      ],
      cookies: [
        { url: `${SHOP}/order`, line: 'theme=dark; Secure; SameSite=Lax', minutesAgo: 30 },
        { url: `${API}/login`, line: 'session=lena-7f3a; Domain=cornerbakery.shop; HttpOnly; Secure; SameSite=Lax', minutesAgo: 30 }
      ]
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Your account', main: NOTE('Reading what this page can read…') }, { 'app.js': READS_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick what a script on the page can read', 1)],
  hints: ['Storage belongs to an origin (scheme, host and port), both kinds; a cookie to a host, and HttpOnly keeps it from every script.'],
  why: 'localStorage and sessionStorage are per origin and open to every script of that origin; cookies are per host, minus the HttpOnly ones.',
  solution: [{ predict: ['basket', 'step', 'theme'] }]
}

// --- 3.2: which ways of putting text into the page run its handlers --------------------------------------------------

const RAN = (name: string) => `fetch('${CHEAP_FLOUR}/ran?case=${name}', { mode: 'no-cors' })`
const RUNS_APP = `// Four ways to put a customer's text into the page. A handler that runs reports to cheap-flour.example.
const box = name => document.getElementById(name)

box('script').innerHTML = \`<script>${RAN('script')}</script>\`
box('img').innerHTML = \`<img src="x" onerror="${RAN('img')}">\`
box('text').textContent = \`<img src="x" onerror="${RAN('text')}">\`
box('adjacent').insertAdjacentHTML('beforeend', \`<img src="x" onerror="${RAN('adjacent')}">\`)
`

export const whichRun: WebPracticeTask = {
  id: 'web-practice-which-run',
  track: 'web',
  kind: 'practice',
  practises: 'web-12-review-runs',
  title: 'Which of these run?',
  difficulty: 2,
  minutes: 0.5,
  task: 'The page puts four texts into four boxes, each with code that reports to `cheap-flour.example` if it runs. Pick the ones that run.',
  prediction: {
    questions: [{
      id: 'runs',
      form: 'lines',
      prompt: 'Which of these run their code?',
      options: [
        { id: 'script', text: '`box.innerHTML = "<script>…</script>"`', fact: { row: 'GET https://cheap-flour.example/ran?case=script 200' } },
        { id: 'img', text: '`box.innerHTML = \'<img src="x" onerror="…">\'`', fact: { row: 'GET https://cheap-flour.example/ran?case=img 200' } },
        { id: 'text', text: '`box.textContent = \'<img src="x" onerror="…">\'`', fact: { row: 'GET https://cheap-flour.example/ran?case=text 200' } },
        { id: 'adjacent', text: '`box.insertAdjacentHTML(\'beforeend\', \'<img src="x" onerror="…">\')`', fact: { row: 'GET https://cheap-flour.example/ran?case=adjacent 200' } }
      ],
      answer: ['img', 'adjacent'],
      rule: 'Whatever parses HTML (`innerHTML`, `insertAdjacentHTML`) makes real elements whose event handlers run; only a `<script>` made that way never runs, and `textContent` makes no elements at all.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: { api: API, application: true, storage: [], time: true, sites: [{ ...cheapFlour([]), hidden: true }] },
    probes: []
  },
  setup: () => ({
    files: webSite({ title: 'Reviews', main: ['<div class="box" id="script"></div>', '<div class="box" id="img"></div>', '<div class="box" id="text"></div>', '<div class="box" id="adjacent"></div>'] }, { 'app.js': RUNS_APP }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Pick the ones that run', 1)],
  hints: ['An image that fails to load fires its `error` event wherever it came from; a `<script>` made by `innerHTML` is marked never to run.'],
  why: 'HTML parsing APIs make live elements (their handlers run, only their scripts don\'t); textContent only ever makes text.',
  solution: [{ predict: ['img', 'adjacent'] }]
}

// --- 3.3: which tokens jwt.verify takes ------------------------------------------------------------------------------

const TOKENS_SERVER = `${SERVER_HEAD}
const jwt = require('jsonwebtoken')
const SECRET = '${SECRET}'

// base64url of a JSON value: how a token's header and payload are written
const part = value => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_')
const now = Math.floor(Date.now() / 1000) // 09:41 on the trainer's clock

// Five tokens for Lena; each is checked with jwt.verify(token, SECRET)
const TOKENS = {
  valid: jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '20m' }),
  expired: jwt.sign({ sub: 'lena', iat: now - 1800, exp: now - 600 }, SECRET),
  forever: jwt.sign({ sub: 'lena' }, SECRET)
}
const [header, , signature] = TOKENS.valid.split('.')
// the valid token with its payload changed to Ben, its signature kept
TOKENS.edited = [header, part({ sub: 'ben', iat: now, exp: now + 1200 }), signature].join('.')
// no algorithm and no signature
TOKENS.none = [part({ alg: 'none', typ: 'JWT' }), part({ sub: 'lena', iat: now }), ''].join('.')

app.get('/check/:name', (req, res) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  try {
    jwt.verify(TOKENS[req.params.name], SECRET)
    res.json({ taken: true })
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})
`

const TOKENS_APP = `// Asks server.js to check each token, and logs what it said.
const API = '${API}'

for (const name of ['valid', 'expired', 'forever', 'edited', 'none']) {
  const response = await fetch(\`\${API}/check/\${name}\`)
  const answer = await response.json()
  console.log(\`\${name}: \${response.status} \${answer.error ?? 'taken'}\`)
}
`

const check = (name: string, status: number) => ({ server: `GET /check/${name} ${status}` })

export const whichTokens: WebPracticeTask = {
  id: 'web-practice-which-tokens',
  track: 'web',
  kind: 'practice',
  practises: 'web-13-token-never-expires',
  title: 'Which tokens does the server take?',
  difficulty: 2,
  minutes: 0.5,
  task: 'At 09:41 server.js checks five tokens with `jwt.verify(token, SECRET)`. Pick the ones it takes.',
  prediction: {
    questions: [{
      id: 'taken',
      form: 'lines',
      prompt: 'It is 09:41. Which tokens does `jwt.verify(token, SECRET)` take?',
      options: [
        { id: 'valid', text: 'signed with `SECRET`, `exp` 10:01', fact: check('valid', 200) },
        { id: 'expired', text: 'signed with `SECRET`, `exp` 09:31', fact: check('expired', 200) },
        { id: 'forever', text: 'signed with `SECRET`, no `exp`', fact: check('forever', 200) },
        { id: 'edited', text: 'the first one with `sub` changed to `ben`, its signature kept', fact: check('edited', 200) },
        { id: 'none', text: '`alg: none`, no signature', fact: check('none', 200) }
      ],
      answer: ['valid', 'forever'],
      rule: '`jwt.verify` takes a token only when its signature is the secret\'s over exactly this header and payload, and, when it has an `exp`, before that; without one it never runs out.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'server.js', web: { api: API, server: 'server.js', application: true, storage: [], time: true }, probes: [] },
  setup: () => ({ files: webSite({ title: 'Tokens', main: NOTE('Checking five tokens…') }, { 'app.js': TOKENS_APP, 'server.js': TOKENS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the tokens the server takes', 1)],
  hints: ['The signature covers the header and the payload as written: change a letter and it no longer matches. `exp` ends a token; no `exp`, no end.'],
  why: 'A signature proves the secret made exactly this header and payload, and exp says until when; jwt.verify checks both and nothing else.',
  solution: [{ predict: ['valid', 'forever'] }]
}

// --- 3.4: which requests carry the refresh cookie --------------------------------------------------------------------

const PATHS_SERVER = `${SERVER_HEAD}

// Each route only answers (the Network panel shows which cookies came along)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  res.set('Access-Control-Allow-Credentials', 'true')
  next()
})
app.get('/account', (req, res) => res.json({ name: 'Lena' }))
app.post('/orders', (req, res) => res.status(201).json({ number: 1042 }))
app.post('/auth/refresh', (req, res) => res.sendStatus(204))
app.post('/auth/logout', (req, res) => res.sendStatus(204))
app.get('/authors', (req, res) => res.json(['Maya', 'Jonas']))
`

const PATHS_APP = `// Five requests to the API, with credentials: which carry the refresh cookie?
const API = '${API}'
const send = (path, method = 'GET') => fetch(\`\${API}\${path}\`, { method, credentials: 'include' })

await send('/account')
await send('/orders', 'POST')
await send('/auth/refresh', 'POST')
await send('/auth/logout', 'POST')
await send('/authors')
console.log('Sent five requests')
`

const carries = (method: string, path: string) => ({ sent: `${method} ${API}${path} refresh` })

export const refreshCookie: WebPracticeTask = {
  id: 'web-practice-refresh-cookie',
  track: 'web',
  kind: 'practice',
  practises: 'web-14-signed-out-again',
  title: 'Which requests carry the refresh token?',
  difficulty: 1,
  minutes: 0.5,
  task: 'Lena\'s refresh cookie was set with `Path=/auth`. The page sends five requests to the API with credentials. Pick the ones that carry it.',
  prediction: {
    questions: [{
      id: 'carry',
      form: 'lines',
      prompt: 'The browser keeps `refresh=…; Path=/auth; HttpOnly; Secure; SameSite=Lax` for `api.cornerbakery.shop`. Which requests carry it?',
      options: [
        { id: 'account', text: '`GET /account`', fact: carries('GET', '/account') },
        { id: 'orders', text: '`POST /orders`', fact: carries('POST', '/orders') },
        { id: 'refresh', text: '`POST /auth/refresh`', fact: carries('POST', '/auth/refresh') },
        { id: 'logout', text: '`POST /auth/logout`', fact: carries('POST', '/auth/logout') },
        { id: 'authors', text: '`GET /authors`', fact: carries('GET', '/authors') }
      ],
      answer: ['refresh', 'logout'],
      rule: 'A cookie with `Path=/auth` goes to `/auth` and the paths below it only, never to `/authors`: so the long-lived refresh token travels only where it is needed.'
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
      cookies: [
        { url: `${API}/login`, line: 'session=s-7f3a; Path=/; HttpOnly; Secure; SameSite=Lax', minutesAgo: 5 },
        { url: `${API}/login`, line: 'refresh=r-2207; Path=/auth; HttpOnly; Secure; SameSite=Lax', minutesAgo: 5 }
      ]
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Your account', main: NOTE('Sending five requests…') }, { 'app.js': PATHS_APP, 'server.js': PATHS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the requests that carry the refresh cookie', 1)],
  hints: ['Path matches whole segments: `/auth` covers `/auth/refresh`, not `/authors`.'],
  why: 'Path=/auth keeps the refresh token on /auth and below, away from every other request (and the logs and scripts around them).',
  solution: [{ predict: ['refresh', 'logout'] }]
}

// --- 3.5: what a half sign-out leaves working ------------------------------------------------------------------------

const HALF_LOGOUT = `${AUTH_HEAD}

${COOKIE_CUSTOMER}

${REFRESH_SESSIONS}

// POST /auth/logout: the refresh token is forgotten on the server, and both cookies in the browser (Jonas)
app.post('/auth/logout', (req, res) => {
  REFRESH.delete(req.cookies.refresh)
  res.clearCookie('session')
  res.clearCookie('refresh', { path: '/auth' })
  res.sendStatus(204)
})

// GET /account and GET /orders: who is signed in, and her orders
app.get('/account', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json({ name: customer.name })
})
app.get('/orders', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json(customer.orders)
})
`

const SIGN_OUT = [
  '',
  'document.querySelector(\'#sign-out\').addEventListener(\'click\', async () => {',
  '  await api(\'/auth/logout\', { method: \'POST\' })',
  '  who.textContent = \'Signed out.\'',
  '})'
]

const replayed = (method: string, path: string, status: number) => ({ replayed: `${method} ${API}${path} ${status}` })

export const afterLogout: WebPracticeTask = {
  id: 'web-practice-after-logout',
  track: 'web',
  kind: 'practice',
  practises: 'web-15-logout-stays',
  title: 'What still works after this sign-out?',
  difficulty: 2,
  minutes: 0.5,
  task: 'This logout forgets the refresh token on the server and clears both cookies. A copy of Lena\'s cookies, taken before she signed out, is used right after and 15 minutes later. Pick what still works.',
  prediction: {
    questions: [{
      id: 'works',
      form: 'lines',
      prompt: '`POST /auth/logout` deletes the refresh token from `REFRESH` and clears both cookies; the session token (15 minutes) is not refused. What works for the copy?',
      options: [
        { id: 'now', text: 'The session cookie, right after: `GET /account` answers as Lena.', fact: replayed('GET', '/account', 200) },
        { id: 'refresh', text: 'The refresh cookie: `POST /auth/refresh` hands out a new session.', fact: replayed('POST', '/auth/refresh', 204) },
        { id: 'later', text: 'The session cookie 15 minutes later: `GET /orders` answers as Lena.', fact: replayed('GET', '/orders', 200) }
      ],
      answer: ['now'],
      rule: 'Deleting the refresh token on the server ends the session at the session token\'s exp; until then a copy of the session token still works, unless the server refuses it too.'
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
      scene: [
        { click: '#sign-in' },
        { copy: 'browser', as: 'copy' },
        { click: '#sign-out' },
        { replay: `GET ${API}/account`, using: 'copy', show: true },
        { replay: `POST ${API}/auth/refresh`, using: 'copy', show: true },
        { later: 15 },
        { replay: `GET ${API}/orders`, using: 'copy', show: true }
      ]
    },
    probes: []
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: authPage({ signOut: true }) }, { 'app.js': authApp(COOKIE_API, { comment: 'The shop\'s page: Lena signs in and signs out (Jonas).', extra: SIGN_OUT }), 'server.js': HALF_LOGOUT }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Pick what still works for the copy', 1)],
  hints: ['The refresh token is gone from the server; the session token is a signed token that `jwt.verify` takes until its `exp`.'],
  why: 'A self-contained token stays good until it expires unless the server keeps a list of the revoked ones: that is why its life is short.',
  solution: [{ predict: ['now'] }]
}
