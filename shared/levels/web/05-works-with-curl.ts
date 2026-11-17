// Same-origin & CORS 1.5: the basket's ✕ sends a DELETE. Jonas tested the route with curl and got 204; on the page
// the browser asks first, Ben's middleware allows only GET and POST, and the DELETE is never sent. Learn: CORS is the
// browser's rule (curl checks nothing), a method that isn't safelisted needs Access-Control-Allow-Methods, and `*`
// doesn't count with credentials.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { API, API_SERVER, PROMO, SERVER_HEAD, SESSIONS, SHOP_PAGE, basketGuards, corsMiddleware, webSite } from './site'
import { BASKET_ID } from './04-basket-header'
import type { WebScenario } from './types'

const APP = `// Lena's basket on this device, with a ✕ to take a line out (Jonas).
const API = '${API}'
const BASKET_ID = '${BASKET_ID}'
const list = document.querySelector('#basket')

async function loadBasket() {
  const response = await fetch(\`\${API}/basket\`, {
    credentials: 'include',
    headers: { 'X-Basket-Id': BASKET_ID }
  })
  if (!response.ok) throw new Error(\`The basket did not load: \${response.status}\`)
  list.replaceChildren()
  for (const line of await response.json()) {
    const item = document.createElement('li')
    item.className = 'product'
    const name = document.createElement('span')
    name.textContent = \`\${line.quantity} × \${line.name}\`
    const remove = document.createElement('button')
    remove.className = 'add remove'
    remove.type = 'button'
    remove.textContent = '✕'
    remove.setAttribute('aria-label', \`Remove \${line.name}\`)
    remove.addEventListener('click', () => removeLine(line.id))
    item.append(name, remove)
    list.append(item)
  }
}

async function removeLine(id) {
  const response = await fetch(\`\${API}/basket/lines/\${id}\`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-Basket-Id': BASKET_ID }
  })
  if (!response.ok) throw new Error(\`The line was not removed: \${response.status}\`)
  await loadBasket()
}

loadBasket()
`

const BASKETS = [
  '// Each customer\'s baskets, one per device (Jonas)',
  'const BASKETS = {',
  '  lena: {',
  '    \'phone-2\': [{ id: \'1\', name: \'Cinnamon bun\', quantity: 4 }],',
  '    \'laptop-1\': [',
  '      { id: \'1\', name: \'Butter croissant\', quantity: 2 },',
  '      { id: \'2\', name: \'Rye loaf\', quantity: 1 }',
  '    ]',
  '  }',
  '}',
  '',
  'function basketOf(req) {',
  '  const customer = customerOf(req)',
  '  return customer ? BASKETS[customer]?.[req.get(\'X-Basket-Id\')] ?? null : null',
  '}'
].join('\n')

const SERVER = `${SERVER_HEAD}

${corsMiddleware('GET, POST', 'Content-Type, X-Basket-Id')}

${SESSIONS}

${BASKETS}

// GET /basket: the basket of the device in X-Basket-Id, for whoever is signed in
app.get('/basket', (req, res) => {
  const basket = basketOf(req)
  if (!basket) return res.status(400).json({ error: 'Sign in, and send X-Basket-Id' })
  res.json(basket)
})

// DELETE /basket/lines/:id: takes a line out (Jonas: “tested with curl -X DELETE, 204”)
app.delete('/basket/lines/:id', (req, res) => {
  const basket = basketOf(req)
  if (!basket) return res.status(400).json({ error: 'Sign in, and send X-Basket-Id' })
  const at = basket.findIndex(line => line.id === req.params.id)
  if (at < 0) return res.status(404).json({ error: 'No such line' })
  basket.splice(at, 1)
  res.sendStatus(204)
})
`

const GUARDS = basketGuards(`GET ${API}/basket`, { 'X-Basket-Id': BASKET_ID })

const PAGE = [
  '<section class="box" aria-labelledby="basket-heading">',
  '  <h2 id="basket-heading">Your basket</h2>',
  '  <ul id="basket" class="list"></ul>',
  '</section>'
]

export const worksWithCurl: WebScenario = {
  id: 'web-05-works-with-curl',
  track: 'web',
  kind: 'scenario',
  title: 'Works with curl',
  difficulty: 2,
  minutes: 6,
  teaches: 'Allow-Methods',
  story: [
    'Each line of the basket has a ✕ now, which sends `DELETE /basket/lines/:id`. Lena wants the rye loaf out, taps its ✕, and nothing happens. Jonas is sure the server is fine: “I tested it with `curl -X DELETE`, with Lena\'s cookie and the basket id, and got `204`.”',
    `Predict what happens on the page. Then make the ✕ work: fix \`server.js\`. The basket stays readable by the shop's own page only, and only with Lena's cookie (not the old page on \`${PROMO}\`, nor any other subdomain). Save, then Reload.`
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'remove',
      form: 'one',
      prompt: '`curl -X DELETE https://api.cornerbakery.shop/basket/lines/2` with Lena\'s cookie and `X-Basket-Id` answers `204 No Content`. What happens when Lena taps the ✕ of that line on the page?',
      options: [
        { id: 'same', text: 'The same as with curl: `204`, and the line is gone.', fact: { server: 'DELETE /basket/lines/2 204' } },
        { id: 'preflight', text: 'The browser asks first with `OPTIONS`. Its answer doesn\'t allow `DELETE`, so the browser never sends it.', fact: { server: 'OPTIONS /basket/lines/2 204' } },
        { id: 'hidden', text: 'The browser sends the `DELETE`, so the server takes the line out, and only hides the answer from the page.', fact: { server: 'DELETE /basket/lines/2 204' } },
        { id: 'refused', text: 'The server refuses it with `405 Method Not Allowed`: a page may not delete.', fact: { row: 'DELETE https://api.cornerbakery.shop/basket/lines/2 405' } }
      ],
      answer: 'preflight',
      rule: 'curl sends what you type and checks nothing; a browser asks first for a `DELETE`, and sends it only when `Access-Control-Allow-Methods` lists it.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: API_SERVER,
    probes: [
      { id: 'remove', steps: [{ settle: true }, { click: '#basket li:nth-child(2) .remove' }, { count: '#basket li' }] },
      { id: 'arrived', steps: [{ arrived: `DELETE ${API}/basket/lines/2` }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Basket', main: PAGE }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what happens when Lena taps ✕', 1),
    probesGoal('remove', 'Lena can take the rye loaf out: the DELETE reaches the server and the page shows what is left, with nothing red in the Console; the basket stays hers (no other subdomain\'s page reads it, nothing goes out without her cookie)', { remove: 1, arrived: { atLeast: 1 }, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'Tap the ✕ yourself and compare the Network panel with the Server panel: which of the two requests reached `server.js`? Then read the Console\'s first red line.',
    'curl is not a browser: it sends the `DELETE` as typed and checks nothing. The browser asks first, because `DELETE` is not a simple method, and the middleware\'s answer allows only `GET, POST`. With credentials, `*` would not cover it either: name the method.',
    'In the middleware, add `DELETE` to `Access-Control-Allow-Methods` on line 18: `\'GET, POST, DELETE\'`. Save, then Reload.'
  ],
  debrief: {
    title: 'CORS is the browser\'s rule',
    paragraphs: [
      'curl, Postman and other servers send exactly what you tell them and read every answer: there is no page whose origin needs protecting, so no CORS. Only a browser asks first. For a `DELETE`, a `PUT` or a `PATCH` (anything but `GET`, `HEAD` and `POST`) it sends a preflight, and the real request goes out only when `Access-Control-Allow-Methods` names it, exactly as written. So the Server panel showed the `OPTIONS` and no `DELETE`: Jonas\'s route never ran, and his curl test proved nothing about the page.',
      'Without credentials, `Access-Control-Allow-Methods: *` would allow any method; with credentials it is a name like any other. And the preflight is no lock: anything that isn\'t a browser can still send the `DELETE`, which is why the route checks who is signed in and whose basket it is. CORS decides which pages may read and ask; the server still decides who may do what.'
    ]
  },
  solution: [
    { predict: 'preflight' },
    { save: 'server.js', replace: ['res.set(\'Access-Control-Allow-Methods\', \'GET, POST\')', 'res.set(\'Access-Control-Allow-Methods\', \'GET, POST, DELETE\')'] },
    'reload'
  ]
}
