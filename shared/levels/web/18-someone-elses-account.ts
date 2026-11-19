// HTTP caching 4.3: Sam sees Lena's account. For Black Friday Ben put a CDN in front of the API and had every GET say
// `public, max-age=60`, so the CDN answers most requests. Lena's `GET /account` went through first; twenty seconds later
// Sam's phone asks for the same address and the CDN hands him her copy: her name, her orders. Learn: a shared cache keys
// a copy by its address (and what Vary names), never by who asked; an answer that depends on the cookie must be
// `private` (or `no-store`), while the menu, the same for everyone, may stay public. Turning the CDN off for everything
// loses Black Friday; a unique address per request hides nothing (anyone with that address gets the copy).
import { probesGoal } from '../debugging/checks'
import { CACHE_HEAD, MENU_PAGE } from './caching'
import { predictedGoal } from './checks'
import { API, LENA_SESSION, MENU_DATA, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** Sam's session at the API (his phone's cookie). */
export const SAM_COOKIE = 'session=sam-91c2'

/** Ben's middleware: every GET public for a minute. */
export const EVERYTHING_PUBLIC = '  if (req.method === \'GET\') res.set(\'Cache-Control\', \'public, max-age=60\')'
/** The account route's first line. */
export const ACCOUNT_ROUTE = 'app.get(\'/account\', (req, res) => {'

const SERVER = `${CACHE_HEAD}

// The shop's page may read our answers, with the customer's cookie (Ben)
app.use((req, res, next) => {
  if (req.get('Origin') === SHOP) {
    res.set('Access-Control-Allow-Origin', SHOP)
    res.set('Access-Control-Allow-Credentials', 'true')
  }
  next()
})

// Who is signed in: the session cookie this server set at login (Ben)
const SESSIONS = { 'lena-7f3a': 'lena', 'sam-91c2': 'sam' }
const CUSTOMERS = {
  lena: { name: 'Lena', orders: [{ name: 'Sourdough loaf', quantity: 1 }] },
  sam: { name: 'Sam', orders: [{ name: 'Cinnamon bun', quantity: 4 }] }
}
function customerOf(req) {
  const session = (req.get('Cookie') ?? '').match(/(?:^|; )session=([^;]*)/)?.[1]
  return CUSTOMERS[SESSIONS[session]] ?? null
}

// Black Friday: the CDN answers every GET for a minute, so the API holds (Ben)
app.use((req, res, next) => {
${EVERYTHING_PUBLIC}
  next()
})

${MENU_DATA}

// GET /menu: today's menu, the same for everyone
app.get('/menu', (req, res) => {
  res.json(MENU)
})

// GET /account: who is signed in, and their orders
${ACCOUNT_ROUTE}
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json(customer)
})
`

const APP = `// The shop's page: who is signed in, their orders, and today's menu (Jonas).
import { formatPrice } from './money.js'

const API = '${API}'
const who = document.querySelector('#who')
const orders = document.querySelector('#orders')
const list = document.querySelector('#products')

async function showAccount() {
  const response = await fetch(\`\${API}/account\`, { credentials: 'include' })
  if (!response.ok) {
    who.textContent = 'Not signed in.'
    return
  }
  const customer = await response.json()
  who.textContent = \`Signed in as \${customer.name}\`
  orders.replaceChildren(...customer.orders.map((order) => {
    const item = document.createElement('li')
    item.textContent = \`\${order.quantity} × \${order.name}\`
    return item
  }))
}

async function loadMenu() {
  const response = await fetch(\`\${API}/menu\`)
  const products = await response.json()
  list.replaceChildren(...products.map((product) => {
    const item = document.createElement('li')
    item.textContent = \`\${product.name} · \${formatPrice(product.price)} €\`
    return item
  }))
}

document.querySelector('#refresh').addEventListener('click', loadMenu)
showAccount()
loadMenu()
`

const PAGE = [
  '<section class="box" aria-labelledby="account-heading">',
  '  <h2 id="account-heading">Your account</h2>',
  '  <p id="who" role="status">Not signed in.</p>',
  '  <ul id="orders" class="list" aria-label="Your orders"></ul>',
  '</section>',
  ...MENU_PAGE
]

/** Another customer's phone asks for exactly what Lena's page asked for (its query and its headers), with its own cookie. */
const asks = (name: string, cookie?: string) => ({ other: name, request: `GET ${API}/account`, like: true, ...(cookie ? { cookie } : {}) })

export const someoneElsesAccount: WebScenario = {
  id: 'web-18-someone-elses-account',
  track: 'web',
  kind: 'scenario',
  title: 'Sam sees Lena\'s account',
  difficulty: 2,
  minutes: 6,
  teaches: 'private',
  story: [
    'For Black Friday Ben put a CDN in front of the API and had every `GET` say `Cache-Control: public, max-age=60`: “the CDN answers, the API holds.” It holds. Then Sam writes in: his phone says *Signed in as Lena* and lists a sourdough loaf he never ordered.',
    'Predict what Sam\'s phone got. Then fix `server.js` so nobody gets anyone else\'s account, while the CDN still answers the menu for everyone. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'sam',
      form: 'one',
      prompt: 'Ben\'s CDN keeps whatever an answer\'s Cache-Control lets a shared cache keep (RFC 9111). At 09:41 Lena\'s page asks for `GET /account` (with her session cookie) through the CDN, answered with `Cache-Control: public, max-age=60`. Fifteen seconds later Sam\'s phone asks for `GET /account` with his own session cookie. What does the CDN do?',
      options: [
        { id: 'asks', text: 'It asks server.js: Sam\'s cookie is different, so it is a different request.', fact: { cdn: 'Sam GET https://api.cornerbakery.shop/account MISS' } },
        { id: 'hands-over', text: 'It hands Sam its copy of Lena\'s answer: the same address, and the copy is still fresh. His phone shows her name and orders.', fact: { cdn: 'Sam GET https://api.cornerbakery.shop/account HIT' } },
        { id: 'never', text: 'It never kept Lena\'s answer: `public` doesn\'t cover an answer to a request with a cookie.', fact: { cdn: 'Sam GET https://api.cornerbakery.shop/account PASS' } },
        { id: 'blocked', text: 'Sam\'s browser refuses the answer: its Allow-Origin was meant for Lena.' }
      ],
      answer: 'hands-over',
      rule: 'A shared cache keys a copy by its address (and the headers Vary names), never by who asked, so an answer that depends on the cookie must say `private` or `no-store`.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: {
      api: API,
      server: 'server.js',
      session: LENA_SESSION,
      application: true,
      time: true,
      cache: { cdn: true },
      // Lena's page loads at 09:41 through the CDN; fifteen seconds later Sam opens the shop on his phone
      scene: [{ later: 0.25 }, { ...asks('Sam', SAM_COOKIE), json: 'name' }]
    },
    probes: [
      { id: 'lena', steps: [{ text: '#who' }] },
      // someone without a session gets told to sign in, not a copy of anyone's account (a 401 the CDN keeps for a minute
      // would sign Sam out too: the next probe)
      { id: 'anon', steps: [asks('Guest')] },
      { id: 'sam', steps: [{ ...asks('Sam', SAM_COOKIE), json: 'name' }] },
      // the menu, the same for everyone, still comes from the CDN: server.js answered it once, for Lena
      { id: 'mia', steps: [{ other: 'Mia', request: `GET ${API}/menu`, like: true }] },
      { id: 'menuLoad', steps: [{ reached: `GET ${API}/menu` }] }
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: PAGE }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Sam\'s phone got', 1),
    probesGoal('own', 'Lena sees her account, Sam his own, someone without a session is asked to sign in, and the CDN still answers the menu (server.js sent it once)', { lena: 'Signed in as Lena', anon: 401, sam: 'Sam', mia: 200, menuLoad: { atMost: 1 } })
  ],
  hints: [
    'Open the Application panel\'s Cache: the CDN\'s log says what it did with Sam\'s `GET /account`, and its copy says who it was fetched for.',
    'The CDN keeps a copy per address, not per customer: `public` told it every customer may get the same answer. The account depends on the cookie, so it must not be kept by a shared cache at all: `Cache-Control: private` (only the customer\'s own browser may keep it) or `no-store`. The menu is the same for everyone and may stay public.',
    'In `server.js`, make the first line of the `/account` route (line 52) `res.set(\'Cache-Control\', \'private\')`, so it replaces Ben\'s header for the account only. Save, then Reload.'
  ],
  debrief: {
    title: 'Shared means shared',
    paragraphs: [
      'A CDN is a shared cache: it keeps one copy per address and hands it to whoever asks next, as long as it is fresh. `public, max-age=60` on `/account` told it Lena\'s answer was fine for anyone for a minute, so Sam got her name and orders without server.js ever seeing his cookie.',
      '`private` says only the customer\'s own browser may keep it, so the CDN passes every `/account` to server.js; `no-store` keeps it out of every cache. `Vary: Cookie` would also keep one copy per cookie (RFC 9111 allows it; many CDNs then don\'t cache at all), and `public` with `max-age=0` makes the CDN check every request with server.js, which sends each customer their own. The menu stays `public`: the same for everyone, which is what the CDN is for.',
      'Put it on the error too: a `401` the CDN keeps for a minute signs everyone out for a minute. And a unique address per request (`/account?t=…`) only hides Lena\'s answer behind an address; the copy is still public to anyone who has it.'
    ]
  },
  solution: [
    { predict: 'hands-over' },
    { save: 'server.js', replace: [`${ACCOUNT_ROUTE}\n`, `${ACCOUNT_ROUTE}\n  res.set('Cache-Control', 'private')\n`] },
    'reload'
  ]
}
