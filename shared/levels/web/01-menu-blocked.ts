// Same-origin & CORS 1.1: the menu moved to the API on its own origin, and the server sends no CORS headers. The
// request goes out and server.js answers 200 (its log says so), but the browser keeps the answer from the page. Learn:
// the browser enforces the other server's permission (Access-Control-Allow-Origin), so the fix is in server.js.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { API, API_SERVER, MENU_DATA, SERVER_HEAD, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

const APP = `// The order page: today's menu comes from the bakery's API, on its own origin since this morning (Jonas).
import { formatPrice } from './money.js'

const API = '${API}'
const list = document.querySelector('#products')

async function loadMenu() {
  const response = await fetch(\`\${API}/menu\`)
  const products = await response.json()
  for (const product of products) {
    const item = document.createElement('li')
    item.className = 'product'
    item.textContent = \`\${product.name} · \${formatPrice(product.price)} €\`
    list.append(item)
  }
  console.log(\`Menu loaded · \${products.length} products\`)
}

loadMenu()
`

const SERVER = `${SERVER_HEAD}

${MENU_DATA}

// GET /menu: today's products, for the shop's page and the kitchen app (Jonas)
app.get('/menu', (req, res) => {
  res.json(MENU)
})
`

export const menuBlocked: WebScenario = {
  id: 'web-01-menu-blocked',
  track: 'web',
  kind: 'scenario',
  title: 'The menu stays empty',
  difficulty: 1,
  minutes: 5,
  teaches: 'Allow-Origin',
  story: [
    'Since this morning Corner Bakery\'s menu lives on its own API server, `https://api.cornerbakery.shop`, so the kitchen app and the shop share it. Jonas moved the order page over: it fetches the menu from the API. On the page the menu stays empty. “The server is fine,” Jonas says, “its log says `GET /menu 200`.”',
    'Before the app runs, predict what the browser does with that request. Then get the menu onto the page by changing the server: `server.js` is in Code, next to the page\'s files. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'menu',
      form: 'one',
      prompt: 'The page on `https://cornerbakery.shop` fetches `https://api.cornerbakery.shop/menu`. The server answers `200` with the six products and sends no CORS headers. What happens?',
      options: [
        { id: 'shows', text: 'The menu shows: the server answered `200`.', fact: { says: 'Menu loaded' } },
        { id: 'never-sent', text: 'Nothing goes out: the browser does not send a request to another origin.' },
        { id: 'blocked', text: 'The request goes out and the server answers, but the browser keeps the answer from the page, so `fetch` fails.', fact: { row: 'GET https://api.cornerbakery.shop/menu CORS error' } },
        { id: 'forbidden', text: 'The server refuses it with `403 Forbidden`, because the request came from another origin.', fact: { row: 'GET https://api.cornerbakery.shop/menu 403' } }
      ],
      answer: 'blocked',
      rule: 'A page may send a request to another origin, but it reads the answer only when that server allows it with `Access-Control-Allow-Origin`: the browser checks, the server just answers.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: API_SERVER,
    probes: [
      { id: 'menu', steps: [{ settle: true }, { count: '#products li' }] },
      { id: 'read', steps: [{ read: `GET ${API}/menu` }] }
    ]
  },
  setup: () => ({
    files: webSite({ main: ['<h2>Today\'s menu</h2>', '<ul id="products" class="products" aria-label="Today\'s menu"></ul>'] }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the browser does with the menu request', 1),
    probesGoal('menu', 'The menu shows all six products, read from the API, with nothing red in the Console', { menu: 6, read: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'The Console\'s first red line says who stopped the request, and why. Then open the request in the Network panel: what status did the server answer, and which headers did it send?',
    'The server answered `200`, but the page is on `https://cornerbakery.shop` and the API on another origin. The browser hands the answer to the page only when the server says that origin may read it, with an `Access-Control-Allow-Origin` header.',
    'In `server.js`, in the `/menu` route (line 20), add `res.set(\'Access-Control-Allow-Origin\', SHOP)` before `res.json(MENU)` on line 21. Save, then Reload.'
  ],
  debrief: {
    title: 'The server answered; the browser kept it',
    paragraphs: [
      'An origin is a page\'s scheme, host and port: `https://cornerbakery.shop` and `https://api.cornerbakery.shop` are two. A page may send a request to another origin, but it may read the answer only when that server allows it: the **same-origin policy**, with CORS as the way to allow it. So the request went out, `server.js` answered `200` (Jonas was right about his log), and the browser kept the answer from the page: `TypeError: Failed to fetch`, with the reason only in the Console.',
      'That is why CORS is fixed on the server, never in the page: `Access-Control-Allow-Origin: https://cornerbakery.shop` is the server saying "the shop may read this". For a public menu `*` would do too (no cookie goes with it). `mode: \'no-cors\'` only gets an opaque answer the code can\'t read, and an `Access-Control-Allow-Origin` header on the request is not the server\'s word: it only makes the request ask first (the next scenario).'
    ]
  },
  solution: [
    { predict: 'blocked' },
    { save: 'server.js', replace: ['app.get(\'/menu\', (req, res) => {\n', 'app.get(\'/menu\', (req, res) => {\n  res.set(\'Access-Control-Allow-Origin\', SHOP)\n'] },
    'reload'
  ]
}
