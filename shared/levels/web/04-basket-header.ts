// Same-origin & CORS 1.4: a header the page sets itself (X-Basket-Id) makes the basket request preflighted, and Ben's
// CORS middleware answers every preflight with `Access-Control-Allow-Headers: Content-Type` only. The preflight gets
// 204, the GET is never sent. Learn: every non-safelisted header must be allowed by name, and `*` doesn't count with
// credentials.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { API, API_SERVER, MENU_DATA, PROMO, SERVER_HEAD, SESSIONS, SHOP_PAGE, basketGuards, corsMiddleware, webSite } from './site'
import type { WebScenario } from './types'

/** The basket of the device the page runs on (each device keeps its own). */
export const BASKET_ID = 'laptop-1'

const APP = `// The order page: the menu, and Lena's basket on this device (each device keeps its own basket: Jonas).
import { formatPrice } from './money.js'

const API = '${API}'
const BASKET_ID = '${BASKET_ID}'

async function loadMenu() {
  const response = await fetch(\`\${API}/menu\`)
  for (const product of await response.json()) {
    const item = document.createElement('li')
    item.className = 'product'
    item.textContent = \`\${product.name} · \${formatPrice(product.price)} €\`
    document.querySelector('#products').append(item)
  }
}

async function loadBasket() {
  const response = await fetch(\`\${API}/basket\`, {
    credentials: 'include',
    headers: { 'X-Basket-Id': BASKET_ID }
  })
  if (!response.ok) throw new Error(\`The basket did not load: \${response.status}\`)
  for (const line of await response.json()) {
    const item = document.createElement('li')
    item.textContent = \`\${line.quantity} × \${line.name}\`
    document.querySelector('#basket').append(item)
  }
}

loadMenu()
loadBasket()
`

/** Lena's baskets, one per device. */
const BASKETS = [
  '// Each customer\'s baskets, one per device (Jonas)',
  'const BASKETS = {',
  '  lena: {',
  '    \'phone-2\': [{ name: \'Cinnamon bun\', quantity: 4 }],',
  '    \'laptop-1\': [',
  '      { name: \'Butter croissant\', quantity: 2 },',
  '      { name: \'Rye loaf\', quantity: 1 }',
  '    ]',
  '  }',
  '}'
].join('\n')

const SERVER = `${SERVER_HEAD}

${corsMiddleware('GET, POST', 'Content-Type')}

${SESSIONS}

${BASKETS}

${MENU_DATA}

app.get('/menu', (req, res) => {
  res.json(MENU)
})

// GET /basket: the basket of the device in X-Basket-Id, for whoever is signed in
app.get('/basket', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  const basket = BASKETS[customer]?.[req.get('X-Basket-Id')]
  if (!basket) return res.status(400).json({ error: 'Which basket? Send X-Basket-Id.' })
  res.json(basket)
})
`

const GUARDS = basketGuards(`GET ${API}/basket`, { 'X-Basket-Id': BASKET_ID })

const PAGE = [
  '<h2>Today\'s menu</h2>',
  '<ul id="products" class="products" aria-label="Today\'s menu"></ul>',
  '<section class="box" aria-labelledby="basket-heading">',
  '  <h2 id="basket-heading">Your basket</h2>',
  '  <ul id="basket" class="list"></ul>',
  '</section>'
]

export const basketHeader: WebScenario = {
  id: 'web-04-basket-header',
  track: 'web',
  kind: 'scenario',
  title: 'The basket on this device',
  difficulty: 2,
  minutes: 7,
  teaches: 'Allow-Headers',
  story: [
    'Lena shops on her phone and on her laptop, and each device keeps a basket of its own: the page sends the basket\'s id in a header, `X-Basket-Id`. Since Jonas added that header, the basket stays empty again, while the menu above it loads fine. At the top of `server.js`, Ben\'s CORS middleware answers every preflight.',
    `Predict which requests reach the server. Then fix \`server.js\` so the laptop's basket shows its two lines. Only the shop's own page may read a basket, and only with Lena's cookie (not the old page on \`${PROMO}\`, nor any other subdomain). Save, then Reload.`
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'reached',
      form: 'lines',
      prompt: 'The page loads the menu (a plain `GET`), and Lena\'s basket with `credentials: \'include\'` and an `X-Basket-Id` header. Ben\'s middleware answers every `OPTIONS` with `Access-Control-Allow-Headers: Content-Type`. Which requests reach `server.js`? Pick every one that does.',
      options: [
        { id: 'menu', text: '`GET /menu`', fact: { server: 'GET /menu 200' } },
        { id: 'options', text: '`OPTIONS /basket`', fact: { server: 'OPTIONS /basket 204' } },
        { id: 'basket', text: '`GET /basket`', fact: { server: 'GET /basket 200' } }
      ],
      answer: ['menu', 'options'],
      rule: 'A header the page sets itself, like `X-Basket-Id`, makes the request ask first; the real request goes out only if the preflight\'s answer names that header in `Access-Control-Allow-Headers`.'
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
    files: webSite({ main: PAGE }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict which requests reach server.js', 1),
    probesGoal('basket', 'The laptop\'s basket shows its two lines, read from the API with nothing red in the Console, and stays Lena\'s: no other subdomain\'s page reads it, and nothing of hers goes out without her cookie', { basket: 2, read: { atLeast: 1 }, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'The Server panel lists what reached `server.js`. Is `GET /basket` there? Then read the Console\'s first red line: it names the header the preflight\'s answer did not allow.',
    '`X-Basket-Id` is not one of the few headers a page may send without asking, so the browser asks first and names it in `Access-Control-Request-Headers`. The middleware\'s answer allows only `Content-Type`, so the browser never sends the `GET`. With credentials, `*` would not cover it either: name the header.',
    'In the middleware, add `X-Basket-Id` to `Access-Control-Allow-Headers` on line 19: `\'Content-Type, X-Basket-Id\'`. Save, then Reload.'
  ],
  debrief: {
    title: 'Every header of your own needs a yes',
    paragraphs: [
      'Only a few request headers go without asking: `Accept`, `Accept-Language`, `Content-Language` and a form\'s `Content-Type`. Any other header the page sets, like `X-Basket-Id` or `Authorization`, makes the request preflighted, and the preflight lists those names in `Access-Control-Request-Headers`. The answer\'s `Access-Control-Allow-Headers` has to name each of them (in any case), or the browser stops: `204` for the `OPTIONS`, and the `GET` never sent.',
      'Without credentials, `Access-Control-Allow-Headers: *` allows the page\'s own headers (the Fetch spec still wants `Authorization` named; Chrome lets `*` cover it too); with credentials `*` is just a name like any other, so it allows nothing here. Answering with what the preflight asked for (`Access-Control-Request-Headers` echoed back) works too, and is what the `cors` package does by default: headers are no secret, unlike origins.'
    ]
  },
  solution: [
    { predict: ['menu', 'options'] },
    { save: 'server.js', replace: ['res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')', 'res.set(\'Access-Control-Allow-Headers\', \'Content-Type, X-Basket-Id\')'] },
    'reload'
  ]
}
