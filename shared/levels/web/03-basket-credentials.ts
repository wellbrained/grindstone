// Same-origin & CORS 1.3: the basket is Lena's, so the page sends her session cookie (`credentials: 'include'`), and
// server.js answers with `Access-Control-Allow-Origin: *`. With credentials the browser refuses `*`. Learn: name the
// origin and send Access-Control-Allow-Credentials, and never echo back whatever origin asks (a page on any subdomain
// gets Lena's cookie too).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { API, API_SERVER, PROMO, SERVER_HEAD, SESSIONS, SHOP_PAGE, basketGuards, webSite } from './site'
import type { WebScenario } from './types'

const APP = `// Lena's basket, from the API: her session cookie says who she is, so the request goes with credentials (Jonas).
const API = '${API}'
const list = document.querySelector('#basket')
const note = document.querySelector('#basket-note')

async function loadBasket() {
  const response = await fetch(\`\${API}/basket\`, { credentials: 'include' })
  if (response.status === 401) {
    note.textContent = 'Please sign in to see your basket.'
    return
  }
  const lines = await response.json()
  for (const line of lines) {
    const item = document.createElement('li')
    item.textContent = \`\${line.quantity} × \${line.name}\`
    list.append(item)
  }
  console.log(\`Basket loaded · \${lines.length} lines\`)
}

loadBasket()
`

const SERVER = `${SERVER_HEAD}

${SESSIONS}

// Each customer's basket, by who is signed in
const BASKETS = {
  lena: [
    { name: 'Butter croissant', quantity: 2 },
    { name: 'Rye loaf', quantity: 1 },
    { name: 'Apricot danish', quantity: 1 }
  ]
}

// GET /basket: the signed-in customer's basket (Jonas: “with * every page can read it, so the shop can too”)
app.get('/basket', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json(BASKETS[customer])
})
`

const GUARDS = basketGuards(`GET ${API}/basket`)

const PAGE = [
  '<section class="box" aria-labelledby="basket-heading">',
  '  <h2 id="basket-heading">Your basket</h2>',
  '  <ul id="basket" class="list"></ul>',
  '  <p class="note" id="basket-note" role="status"></p>',
  '</section>'
]

export const basketCredentials: WebScenario = {
  id: 'web-03-basket-credentials',
  track: 'web',
  kind: 'scenario',
  title: 'Lena\'s basket is empty',
  difficulty: 2,
  minutes: 6,
  teaches: 'credentials',
  story: [
    'Lena is signed in: the API set a session cookie when she logged in, and the page now loads her basket from it with `credentials: \'include\'`, so the cookie goes along. Her basket stays empty. Jonas sent `Access-Control-Allow-Origin: *` to be safe: “then every page can read it, so the shop can too.”',
    `Predict what the page gets. Then fix \`server.js\` so Lena sees her three lines. The basket is hers: only the shop's own page may read it, and only with her cookie; no page on another subdomain may (the old Christmas page on \`${PROMO}\` still runs a comments widget). Save, then Reload.`
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'basket',
      form: 'one',
      prompt: 'The page asks for Lena\'s basket with `credentials: \'include\'`, so her session cookie goes along. The server answers `200` with her basket and `Access-Control-Allow-Origin: *`. What does the page get?',
      options: [
        { id: 'basket', text: 'Her basket: `*` allows every origin.', fact: { says: 'Basket loaded' } },
        { id: 'no-cookie', text: 'A `401`: the browser leaves the cookie out of a request to another origin.', fact: { row: 'GET https://api.cornerbakery.shop/basket 401' } },
        { id: 'wildcard', text: 'Nothing: with credentials, the browser refuses `*`. The server has to name the page\'s origin.', fact: { says: 'Access to fetch at \'https://api.cornerbakery.shop/basket\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: The value of the \'Access-Control-Allow-Origin\' header in the response must not be the wildcard' } },
        { id: 'never-sent', text: 'Nothing goes out: a request with credentials always asks first with `OPTIONS`.', fact: { row: 'OPTIONS https://api.cornerbakery.shop/basket 204' } }
      ],
      answer: 'wildcard',
      rule: 'With credentials, `*` is never enough: the server has to name the page\'s origin in `Access-Control-Allow-Origin` and send `Access-Control-Allow-Credentials: true`.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: API_SERVER,
    probes: [
      { id: 'basket', steps: [{ settle: true }, { count: '#basket li' }] },
      { id: 'read', steps: [{ read: `GET ${API}/basket` }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Basket', main: PAGE }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the page gets', 1),
    probesGoal('basket', 'Lena\'s basket shows her three lines, read from the API with nothing red in the Console, and stays hers: no other subdomain\'s page reads it, and nothing of hers goes out without her cookie', { basket: 3, read: { atLeast: 1 }, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'Read the Console\'s first red line to its end: it names the header, and the request\'s credentials mode.',
    '`credentials: \'include\'` sends Lena\'s cookie, and the answer is hers. For such a request the browser refuses `*`: the server has to name the one origin that may read it, and say that credentials are fine with `Access-Control-Allow-Credentials: true`. Only the shop may read it, so don\'t echo back whichever origin asks.',
    'In the `/basket` route, put `SHOP` in place of `\'*\'` on line 29, and add `res.set(\'Access-Control-Allow-Credentials\', \'true\')` below it. Save, then Reload.'
  ],
  debrief: {
    title: 'Name the origin, then allow credentials',
    paragraphs: [
      'With `credentials: \'include\'` the browser sends Lena\'s cookie, and the answer is about her. If `*` were enough for that, any page could read the basket of whoever visits it. So the browser asks for two things: the page\'s exact origin in `Access-Control-Allow-Origin`, and `Access-Control-Allow-Credentials: true` (exactly that word). The server got the cookie and answered `200` either way: as before, the browser decides whether the page may read it.',
      'The tempting shortcut is to echo back the request\'s `Origin` with credentials allowed. Then every origin the cookie goes with may read Lena\'s basket: every page on a `cornerbakery.shop` subdomain today (the same site, so her cookie goes along), like the old Christmas page, and any site at all once a cookie is `SameSite=None` (chapter 2). Echo an origin only after checking it against a list of exact origins, and then add `Vary: Origin`, so a cache never hands one origin\'s answer to another.'
    ]
  },
  solution: [
    { predict: 'wildcard' },
    { save: 'server.js', replace: ['  res.set(\'Access-Control-Allow-Origin\', \'*\')\n', '  res.set(\'Access-Control-Allow-Origin\', SHOP)\n  res.set(\'Access-Control-Allow-Credentials\', \'true\')\n'] },
    'reload'
  ]
}
