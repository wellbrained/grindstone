// Network 2.1: the order page asks the server for /api/products, a path that was renamed to /api/menu. The server
// answers 404 with its HTML error page, and `response.json()` then fails on it ("Unexpected token '<'"). Learn: read the
// request's status in the Network panel before the louder error after it; compare the path with what the server has.
import { ORDER_PAGE } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import { API_HOURS, API_MENU, API_ORDERS, CART_JS, MENU_ROUTE, apiNotes, networkSite } from './shop-server'
import type { DebugScenario } from './types'

const MENU_JS = `// Today's products come from the shop's server: Maya changes them in the kitchen
// app, and the order page loads them when it opens (Ben).
export async function loadMenu() {
  const response = await fetch('/api/products')
  return response.json()
}
`

const APP = `// The order page: loads today's menu from the server and wires up the Add buttons.
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
  console.log(\`Corner Bakery shop ready · \${products.length} products\`)
}

renderBadge()
loadMenu().then(renderMenu)

// Handy while debugging: type cart in the Console.
Object.assign(window, { cart })
`

const API = apiNotes([API_MENU, API_HOURS, API_ORDERS], [
  'Changes',
  '- Monday: `/api/products` is now `/api/menu`, the name the kitchen app uses.'
])

export const menuWontLoad: DebugScenario = {
  id: 'debugging-06-menu-wont-load',
  track: 'debugging',
  kind: 'scenario',
  title: 'The menu won\'t load',
  difficulty: 1,
  minutes: 5,
  teaches: '404',
  story: [
    'Maya from the kitchen: “Since this morning the order page shows no products at all, just the header. The server is up: the kitchen app shows the menu fine.”',
    'The page loads its menu from the shop\'s server now. Open the Network panel next to the Console and see what the page asked for and what came back. Fix the request so the three products show again, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'menu.js',
    probes: [{ id: 'products', steps: [{ count: '.product' }] }],
    backend: { routes: [MENU_ROUTE] }
  },
  setup: () => ({ files: networkSite({ 'app.js': APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'api.md': API }), observed: null, picked: null }),
  goals: [
    probeGoal('menu', 'The menu loads: all three products show', 'products', 3),
    noErrorsGoal()
  ],
  hints: [
    'The page asked the server for something and got an error back. Open the Network panel: which request is red, and what status did it get?',
    '`404 Not Found` means the server has nothing at that path. The SyntaxError after it is only a consequence: `response.json()` tried to read the server\'s HTML error page (that\'s the `<`). Which paths does the server have? `api.md` lists them.',
    'Line 4 of `menu.js` asks for `/api/products`, but the menu is at `/api/menu` now (`api.md`). Make it `fetch(\'/api/menu\')`, then Save and Reload.'
  ],
  debrief: {
    title: 'Read the status before the error',
    paragraphs: [
      'The Console had two red lines: the browser\'s own `GET … 404 (Not Found)`, and a `SyntaxError` from `json` saying `Unexpected token \'<\'`. The second one is louder, but it is only what came next: the code asked for JSON and got the server\'s HTML error page, which starts with `<`.',
      '`fetch` does not fail on a 404: the server did answer, just not with what the page wanted. So the code carried on until `response.json()` broke. The Network panel shows the cause directly: the request, its status and the body that came back.',
      'Whenever you see `Unexpected token \'<\' … is not valid JSON`, open the request in the Network panel first. It is almost always an error page or a wrong address.'
    ]
  },
  solution: [{ save: 'menu.js', replace: ['fetch(\'/api/products\')', 'fetch(\'/api/menu\')'] }, 'reload']
}
