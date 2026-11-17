// Cookies & sessions 2.4: Ben moved the sign-in under /auth and writes the Set-Cookie line by hand, without a Path. A
// cookie without Path gets its default path, the folder of the address that set it: /auth. So /auth/me knows Lena and
// /orders doesn't. Learn: default-path, and Path=/ for a session the whole API reads; Path decides where a cookie goes,
// never who may read it.
import { probesGoal } from '../debugging/checks'
import { ACCOUNT_HEAD, ACCOUNT_PAGE, ACCOUNT_ROUTES, ORDER_IN, SIGNED_IN, accountApp, accountGuards, loginRoute } from './accounts'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The cookie as Ben writes it by hand. */
export const NO_PATH_COOKIE = 'res.set(\'Set-Cookie\', \'session=lena-7f3a; HttpOnly; Secure; SameSite=Lax\')'

const SERVER = `${ACCOUNT_HEAD}

${loginRoute('/auth/login', ['// by hand: the cookie helper added things we don\'t need (Ben)', NO_PATH_COOKIE], '// POST /auth/login: the sign-in form\'s email and password (Ben\'s new auth routes)')}

// GET /auth/me: who is signed in (the page's account line)
app.get('/auth/me', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json({ name: customer.name })
})

${ACCOUNT_ROUTES}
`

const GUARDS = accountGuards()

export const cookiePath: WebScenario = {
  id: 'web-09-cookie-path',
  track: 'web',
  kind: 'scenario',
  title: 'Signed in, and still no orders',
  difficulty: 2,
  minutes: 6,
  teaches: 'Path',
  story: [
    'Ben moved the sign-in to his new auth routes: the page posts to `/auth/login` and asks `/auth/me` who is signed in. He writes the session\'s `Set-Cookie` line by hand now. Lena signs in, the page greets her, and her orders stay empty; ordering says it did not go through.',
    'Predict which requests carry her cookie. Then fix `server.js` so the whole API knows her: her orders load and her order goes through. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'carried',
      form: 'lines',
      prompt: 'Lena signs in: `POST /auth/login` answers with `Set-Cookie: session=lena-7f3a; HttpOnly; Secure; SameSite=Lax` (no Path). The page then asks `GET /auth/me` and `GET /orders`, both with credentials. Which requests carry the cookie?',
      options: [
        { id: 'login', text: '`POST /auth/login`', fact: { sent: 'POST https://api.cornerbakery.shop/auth/login session' } },
        { id: 'me', text: '`GET /auth/me`', fact: { sent: 'GET https://api.cornerbakery.shop/auth/me session' } },
        { id: 'orders', text: '`GET /orders`', fact: { sent: 'GET https://api.cornerbakery.shop/orders session' } }
      ],
      answer: ['me'],
      rule: 'A cookie without `Path` gets the folder of the address that set it (`/auth` for `/auth/login`) and goes only to addresses under it; a session for the whole API needs `Path=/`.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: { api: API, server: 'server.js', application: true, scene: [{ click: '#sign-in' }] },
    probes: [
      { id: 'who', steps: [{ text: '#who' }] },
      { id: 'orders', steps: [{ carried: `GET ${API}/orders`, cookie: 'session' }] },
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: ACCOUNT_PAGE }, { 'app.js': accountApp({ login: '/auth/login', account: '/auth/me' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict which requests carry the cookie', 1),
    probesGoal('orders', 'The whole API knows Lena: the page greets her, her orders load with her cookie and her order goes through, with nothing red in the Console; nothing of hers goes out without her cookie, and no script can read it', { who: SIGNED_IN, orders: { atLeast: 1 }, own: ORDER_IN, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'Select `GET orders` in the Network panel and read its cookies: the browser says why `session` stayed home. The Application panel shows the cookie\'s Path.',
    'A cookie without `Path` gets a default one: the address that set it, up to its last slash. `/auth/login` gives `/auth`, and `/orders` is not under it. A session the whole API reads needs `Path=/`.',
    'On line 36 of `server.js`, add `Path=/` to the line: `res.set(\'Set-Cookie\', \'session=lena-7f3a; Path=/; HttpOnly; Secure; SameSite=Lax\')`. Save, then Reload.'
  ],
  debrief: {
    title: 'Path: where a cookie goes',
    paragraphs: [
      'Without a `Path` attribute a cookie gets its default path: the path of the address that set it, up to (not including) its last slash. Set by `/auth/login`, the session belonged to `/auth`, so it went with `/auth/me` and stayed home for `/orders`. `res.cookie` writes `Path=/` for you; a line written by hand has to say it.',
      'Path only says which addresses of a host get the cookie. It is no wall: a script on the shop\'s origin can read a cookie of any path (it can open a page at that path), which is why the session stays `HttpOnly`. And `Domain` works the same way for hosts: without it a cookie goes to the host that set it only (`api.cornerbakery.shop`), with `Domain=cornerbakery.shop` to every host under it.'
    ]
  },
  solution: [
    { predict: ['me'] },
    { save: 'server.js', replace: [NO_PATH_COOKIE, 'res.set(\'Set-Cookie\', \'session=lena-7f3a; Path=/; HttpOnly; Secure; SameSite=Lax\')'] },
    'reload'
  ]
}
