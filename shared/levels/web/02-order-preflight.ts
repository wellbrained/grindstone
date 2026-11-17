// Same-origin & CORS 1.2: a JSON POST is not a simple request, so the browser sends a preflight first. server.js has no
// OPTIONS route, Express answers the preflight itself (Allow: POST, no CORS headers), and the POST is never sent.
// Learn: simple against preflighted requests, and what a preflight's answer must say (Allow-Origin, Allow-Headers).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { API, API_SERVER, MENU_DATA, SERVER_HEAD, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** What the page says once the order is in. */
export const ORDER_IN = 'Thanks! Order 1042 is in.'
export const ORDER_FAILED = 'Sorry, your order did not go through. Please try again.'

const APP = `// Checkout: sends Lena's basket to the API as an order (Jonas).
const API = '${API}'
const basket = [
  { id: 'croissant', quantity: 2 },
  { id: 'rye', quantity: 1 }
]
const status = document.querySelector('#order-status')

async function placeOrder() {
  status.textContent = 'Sending your order…'
  try {
    const response = await fetch(\`\${API}/orders\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: basket })
    })
    if (!response.ok) throw new Error(\`The server answered \${response.status}\`)
    const order = await response.json()
    status.textContent = \`Thanks! Order \${order.number} is in.\`
  } catch (error) {
    console.error(error)
    status.textContent = '${ORDER_FAILED}'
  }
}

document.querySelector('#order').addEventListener('click', placeOrder)
`

const SERVER = `${SERVER_HEAD}

${MENU_DATA}

app.get('/menu', (req, res) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  res.json(MENU)
})

// POST /orders: takes an order { items: [{ id, quantity }] } and answers its number (Jonas)
let lastOrder = 1041
app.post('/orders', (req, res) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  const items = req.body?.items
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'An order needs at least one item' })
  }
  lastOrder += 1
  res.status(201).json({ number: lastOrder, items: items.length })
})
`

const PAGE = [
  '<h2>Your basket</h2>',
  '<ul class="list" aria-label="Your basket">',
  '  <li>2 × Butter croissant</li>',
  '  <li>1 × Rye loaf</li>',
  '</ul>',
  '<section class="summary" aria-label="Your order">',
  '  <button class="action" id="order" type="button">Place order</button>',
  '  <p class="note" id="order-status" role="status"></p>',
  '</section>'
]

export const orderPreflight: WebScenario = {
  id: 'web-02-order-preflight',
  track: 'web',
  kind: 'scenario',
  title: 'The order won\'t go through',
  difficulty: 2,
  minutes: 6,
  teaches: 'preflight',
  story: [
    'The menu works since Jonas fixed its route. Now Lena wants to order: two croissants and a rye loaf. She taps Place order and gets “Sorry, your order did not go through”. The `POST /orders` route in `server.js` sends `Access-Control-Allow-Origin` like the menu does, and yet nothing arrives.',
    'Predict what happens when Lena taps the button. Then, in the App, tap Place order yourself, read the Network panel (one tap, two rows) and the Server panel, and fix `server.js` so the order goes through. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'order',
      form: 'one',
      prompt: 'Lena taps Place order. The page sends a `POST` with `Content-Type: application/json`. `server.js` has a `POST /orders` route that sends `Access-Control-Allow-Origin`, and no `OPTIONS` route. What happens?',
      options: [
        { id: 'through', text: 'The order goes through: the `POST` route allows the shop.', fact: { row: 'POST https://api.cornerbakery.shop/orders 201' } },
        { id: 'preflight', text: 'The browser first asks with an `OPTIONS` request. Express answers it without CORS headers, so the browser never sends the `POST`.', fact: { server: 'OPTIONS /orders 200' } },
        { id: 'hidden', text: 'The `POST` goes out and the order is placed, but the browser hides the answer from the page.', fact: { server: 'POST /orders 201' } },
        { id: 'refused', text: 'Express refuses the `OPTIONS` request with `405 Method Not Allowed`.', fact: { row: 'OPTIONS https://api.cornerbakery.shop/orders 405' } }
      ],
      answer: 'preflight',
      rule: 'A request with `Content-Type: application/json` is not a simple request: the browser sends a preflight first, and sends the real request only if the preflight\'s answer allows it.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: API_SERVER,
    probes: [
      { id: 'order', steps: [{ settle: true }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'read', steps: [{ read: `POST ${API}/orders` }] }
    ]
  },
  setup: () => ({
    files: webSite({ main: PAGE }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what happens when Lena taps Place order', 1),
    probesGoal('order', 'Lena\'s order goes through: the page shows its number, read from the API, with nothing red in the Console', { order: ORDER_IN, read: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'One tap made two rows in the Network panel. What is the `OPTIONS` row, which headers did the server answer it with, and did the `POST` ever reach `server.js` (the Server panel)?',
    'A `POST` with `Content-Type: application/json` is not a simple request, so the browser asks first (a preflight, `OPTIONS`). `server.js` has no `OPTIONS` route, so Express answers it itself, with `Allow: POST` and no CORS headers. The preflight\'s answer has to allow the shop and the header the page sets.',
    'Before the `POST` route (line 24), add `app.options(\'/orders\', (req, res) => { … })` that sets `Access-Control-Allow-Origin` to `SHOP` and `Access-Control-Allow-Headers` to `Content-Type`, then answers `res.sendStatus(204)`. Save, then Reload.'
  ],
  debrief: {
    title: 'Asked first, and refused',
    paragraphs: [
      'A **simple request** goes straight out: `GET`, `HEAD` or `POST`, with only a few headers and a `Content-Type` a form could send (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`). Anything else is **preflighted**: the browser first sends `OPTIONS` with `Access-Control-Request-Method` and `Access-Control-Request-Headers`, and sends the real request only if the answer allows it. `application/json` is not on the list, so the order asked first.',
      'Express answered that `OPTIONS` itself, as it does for a path with no `OPTIONS` route: `200`, `Allow: POST`, no CORS headers. So the browser stopped there, and the `POST` never reached `server.js` (its log has only the `OPTIONS`). Your route answers the preflight with the shop\'s origin and `Access-Control-Allow-Headers: Content-Type`; `POST` itself is a simple method, so it needs no `Access-Control-Allow-Methods`.',
      'Sending the order as `text/plain` would skip the preflight, but then `express.json()` leaves the body unread and the server can\'t take the order (this trainer\'s `express.json()` reads `application/json` only; the real one can be told to read other types, and a server that takes JSON sent as `text/plain` takes it from any site\'s plain form too). Real apps answer preflights in one place for every route (a middleware, or the `cors` package); a browser may also remember an answer for a while (`Access-Control-Max-Age`), which this trainer doesn\'t.'
    ]
  },
  solution: [
    { predict: 'preflight' },
    {
      save: 'server.js',
      replace: [
        '// POST /orders:',
        'app.options(\'/orders\', (req, res) => {\n  res.set(\'Access-Control-Allow-Origin\', SHOP)\n  res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')\n  res.sendStatus(204)\n})\n\n// POST /orders:'
      ]
    },
    'reload'
  ]
}
