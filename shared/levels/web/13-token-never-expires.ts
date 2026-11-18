// Auth & tokens 3.3: the token that never expires. Jonas gave the session cookie a Max-Age of 15 minutes and signed the
// token inside without an expiry: "the browser forgets it after 15 minutes, so a session ends by itself". Lena sent
// support a HAR file of her browser at 09:41, with her cookies in it, and it leaked; at 10:01 the thief's copy still
// works. Learn: Max-Age only tells one browser when to forget a cookie; a copy lives on, so the token itself must end
// (exp, checked by the server's verify). Lengthening nothing on the client, or checking exp anywhere but the server,
// leaves the copy working; a token made up without the secret must fail too.
import { probesGoal } from '../debugging/checks'
import { accountGuards } from './accounts'
import { AUTH_HEAD, COOKIE_API, COOKIE_CUSTOMER, LENA_LOGIN, ORDER_IN, SIGNED_IN, SIGN_IN_AGAIN, authApp, authPage } from './auth'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The token as Jonas signs it: no expiry. */
export const FOREVER_TOKEN = '  const token = jwt.sign({ sub: customer }, SECRET)'

const SERVER = `${AUTH_HEAD}

${COOKIE_CUSTOMER}

// POST /login: the session cookie holds a signed token; the browser forgets it after 15 minutes,
// so a session ends by itself (Jonas)
app.post('/login', (req, res) => {
  const customer = signInAs(req)
  if (!customer) return res.status(401).json({ error: 'Wrong email or password' })
${FOREVER_TOKEN}
  res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 })
  res.json({ name: CUSTOMERS[customer].name })
})

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

export const tokenNeverExpires: WebScenario = {
  id: 'web-13-token-never-expires',
  track: 'web',
  kind: 'scenario',
  title: 'The token that never expires',
  difficulty: 2,
  minutes: 6,
  teaches: 'exp',
  story: [
    'The session cookie holds a signed token now, and Jonas gave the cookie `maxAge: 15 minutes`: “the browser forgets it after that, so a session ends by itself.” At 09:41 Lena signed in and sent support a HAR file of her browser to show a bug, her cookies in it. The support system leaked it; it is 10:01.',
    'Predict what the leaked copy is worth. Then fix `server.js` so a session copied 20 minutes ago is no use, and a token made up without the secret neither, while Lena can still sign in and order. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'copy',
      form: 'one',
      prompt: 'At 09:41 Lena\'s browser gets the session cookie (`HttpOnly`, `Max-Age` 15 minutes) with a token signed by `jwt.sign({ sub: customer }, SECRET)`. A copy of the cookie leaks. At 10:01 the thief sends it with `GET /account`. What does server.js answer?',
      options: [
        { id: 'cookie', text: '401: the cookie expired at 09:56.', fact: { replayed: 'GET https://api.cornerbakery.shop/account 401' } },
        { id: 'browser', text: 'Nothing: an expired cookie is never sent, so the request doesn\'t reach server.js.' },
        { id: 'ok', text: '200, as Lena: Max-Age only tells her browser when to forget the cookie, and the token in it has no expiry, so `jwt.verify` takes it.', fact: { replayed: 'GET https://api.cornerbakery.shop/account 200' } },
        { id: 'stale', text: '401: a signature older than 15 minutes no longer matches.' }
      ],
      answer: 'ok',
      rule: 'A cookie\'s Max-Age only tells one browser when to forget it; a copy lives on until the token itself ends, so the token needs an `exp` that the server checks.'
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
      // Lena signs in, the HAR file copies her cookies, her laptop sleeps 20 minutes, the thief uses the copy, she comes back
      scene: [{ click: '#sign-in' }, { copy: 'browser', as: 'har' }, { later: 20 }, { replay: `GET ${API}/account`, using: 'har', show: true }, { click: '#refresh' }]
    },
    probes: [
      { id: 'away', steps: [{ text: '#who' }] },
      { id: 'har', steps: [{ replay: `GET ${API}/account`, using: 'har' }] },
      // a token made up without the secret (its exp taken out, or alg none): never anyone
      { id: 'forged', steps: [{ issued: `POST ${API}/login`, body: LENA_LOGIN, ago: 0, as: 'mine' }, { replay: `GET ${API}/account`, using: 'mine', forge: true }] },
      { id: 'again', steps: [{ click: '#sign-in' }, { text: '#who' }] },
      // the old copy stays refused after Lena signs in again (an expiry counted from her last sign-in is no fix)
      { id: 'harAgain', steps: [{ replay: `GET ${API}/account`, using: 'har' }] },
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: authPage() }, { 'app.js': authApp(COOKIE_API, { comment: 'The shop\'s page: Lena signs in at the API, then sees her orders and orders more (Jonas).' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the leaked copy is worth', 1),
    probesGoal('expiry', 'A copy of Lena\'s session from 20 minutes ago is refused (also after she signs in again), and so is a token made up without the secret; her browser shows she has to sign in again, she can, and her order goes through', { away: SIGN_IN_AGAIN, har: { atLeast: 300 }, forged: { atLeast: 300 }, again: SIGNED_IN, harAgain: { atLeast: 300 }, own: ORDER_IN, ...GUARDS.expected })
  ],
  hints: [
    'Open the Application panel at 10:01: Lena\'s cookie is gone. Then the Server panel: the thief\'s `GET /account` from outside the browser still got 200, and the line under it reads the token it sent: an `iat`, and no `exp`.',
    'Max-Age is advice to one browser; a copy (a HAR file, a log, malware) is sent by something that ignores it. The token has to end by itself: `jwt.sign` writes an `exp` from `expiresIn`, and `jwt.verify` refuses the token once the server\'s clock passes it.',
    'On line 53 of `server.js`, sign with an expiry: `jwt.sign({ sub: customer }, SECRET, { expiresIn: \'15m\' })`. Save, then Reload.'
  ],
  debrief: {
    title: 'A copy doesn\'t forget',
    paragraphs: [
      'Max-Age told Lena\'s browser to forget the cookie at 09:56, and it did. The copy in the HAR file has no browser behind it: the thief sent the cookie at 10:01, and the token inside had no `exp`, so `jwt.verify` took it: a signature proves who made a token, not until when it counts.',
      '`expiresIn: \'15m\'` writes `exp` into the token, and `jwt.verify` refuses it from that second on, wherever it comes from. Checking `exp` in the page instead does nothing for a copy, and `jwt.decode` checks nothing at all (a made-up token passes it). Tokens Jonas already handed out without `exp` stay good until the secret changes: in real life you would also rotate the secret, which signs everyone out once.',
      'Lena is now signed out every 15 minutes, which is the next thing to fix (3.4): a short life for the token she sends with every request, and a way to get a new one.'
    ]
  },
  solution: [
    { predict: 'ok' },
    { save: 'server.js', replace: [FOREVER_TOKEN, '  const token = jwt.sign({ sub: customer }, SECRET, { expiresIn: \'15m\' })'] },
    'reload'
  ]
}
