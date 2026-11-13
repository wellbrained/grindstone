// Network 2.4: the specials box fetches straight from the API server, another origin that sends no CORS headers. curl
// on Jonas's laptop got the answer; the browser refuses to let the page read it ("blocked by CORS policy", then "Failed
// to fetch"). Learn: CORS is the browser enforcing the other server's permission, so it is fixed on the server; the
// shop's own /api path (same origin, forwarded by the shop's server) needs none.
import { ORDER_PAGE } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import { API_MENU, API_SPECIALS, CART_JS, MENU_JS, MENU_ROUTE, apiNotes, networkSite } from './shop-server'
import type { DebugScenario, JsonValue } from './types'

const SPECIALS: JsonValue = [
  { name: 'Apricot danish', price: 3.2 },
  { name: 'Rye with seeds', price: 4.9 }
]

const SPECIALS_JS = `// Today's specials, from the new API (Jonas). Tested from my laptop:
// curl https://api.cornerbakery.shop/specials answers with both of them.
export async function loadSpecials(list) {
  const response = await fetch('https://api.cornerbakery.shop/specials')
  if (!response.ok) return
  for (const special of await response.json()) {
    const item = document.createElement('li')
    item.textContent = \`\${special.name} · \${special.price.toFixed(2)}\`
    list.append(item)
  }
}
`

const APP = `// The order page: today's specials, then the menu, both from the server.
import { loadSpecials } from './specials.js'
import { loadMenu } from './menu.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#products')

function renderMenu(products) {
  for (const product of products) {
    const item = document.createElement('li')
    item.className = 'product'
    item.dataset.id = product.id
    item.innerHTML = \`
      <span class="photo" aria-hidden="true"></span>
      <span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span>
      <button class="add" type="button">Add</button>\`
    item.querySelector('.add').addEventListener('click', () => addToCart(product))
    list.append(item)
  }
}

renderBadge()
loadSpecials(document.querySelector('#specials'))
loadMenu().then(renderMenu)

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

const API = apiNotes([API_MENU, API_SPECIALS], [
  'The shop\'s server passes every /api/... request on to our API server, https://api.cornerbakery.shop,',
  'and brings its answer back. The kitchen app and our other servers talk to the API server directly.'
])

export const worksOnMyMachine: DebugScenario = {
  id: 'debugging-09-works-on-my-machine',
  track: 'debugging',
  kind: 'scenario',
  title: 'Works on my machine',
  difficulty: 2,
  minutes: 6,
  teaches: 'CORS',
  story: [
    'Jonas built a box with today\'s specials for the order page, on the new API. “Works on my machine,” he says: he tried the address with curl on his laptop and got both specials back. On the shop\'s page the box stays empty and the Console is red.',
    'Read the Console\'s first red line closely, then look at the request in the Network panel. Get the specials onto the page (`api.md` says how the shop reaches the API), Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'specials.js',
    probes: [{ id: 'specials', steps: [{ count: '#specials li' }] }],
    backend: {
      routes: [
        MENU_ROUTE,
        { path: 'https://api.cornerbakery.shop/specials', respond: { status: 200, json: SPECIALS, delay: 120 } },
        { path: '/api/specials', respond: { status: 200, json: SPECIALS, delay: 140 } }
      ]
    }
  },
  setup: () => ({
    files: networkSite({ 'app.js': APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'specials.js': SPECIALS_JS, 'api.md': API }, {
      main: ['<h2>Today\'s specials</h2>', '<ul id="specials" class="list"></ul>']
    }),
    observed: null,
    picked: null
  }),
  goals: [
    probeGoal('specials', 'Today\'s specials show on the page (both of them)', 'specials', 2),
    noErrorsGoal()
  ],
  hints: [
    'The first red line says the request was “blocked by CORS policy”. The page is on `https://cornerbakery.shop`; the request goes to another origin, `https://api.cornerbakery.shop`. Which of the two would have to allow that?',
    'Only the API server can allow it, with an `Access-Control-Allow-Origin` header, and it sends none. curl is not a browser, so it never checks. But the shop\'s own server passes `/api/...` on to the API server (`api.md`), and a request to the page\'s own origin needs no permission.',
    'On line 4 of `specials.js`, fetch `\'/api/specials\'` instead of the API server\'s address. Save, then Reload.'
  ],
  debrief: {
    title: 'CORS protects the other server',
    paragraphs: [
      'A page may send a request to another origin, but it may only read the answer when that server allows it, with an `Access-Control-Allow-Origin` header naming the page\'s origin (or `*`). The API server sent none, so the browser kept the answer from the page and `fetch` failed with a bare `TypeError: Failed to fetch`. Why is only in the Console, in the browser\'s own words.',
      'That is why it “worked on my machine”: curl and Postman are not browsers and don\'t enforce CORS. And it is why CORS is fixed on the server, never in the page: nothing the page sends can give itself permission. `mode: \'no-cors\'` only gets an opaque answer the code can\'t read, and an `Access-Control-Allow-Origin` header on the request just adds a preflight that fails too.',
      'Your fix asks the shop\'s own server, which forwards `/api/...` to the API server. Same origin, so there is no CORS check at all, and the call between the two servers is not a browser\'s. The other real fix is on the API server: send `Access-Control-Allow-Origin: https://cornerbakery.shop`.'
    ]
  },
  solution: [{ save: 'specials.js', replace: ['fetch(\'https://api.cornerbakery.shop/specials\')', 'fetch(\'/api/specials\')'] }, 'reload']
}
