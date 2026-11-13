// Performance 6.2: one render() draws the whole page, so every Add draws all 24 products again (24 out, 24 in) to show
// one new line in the basket. It works, it is just slow on Maya's old phone, and the menu flickers. Learn: the Performance
// panel's Renders say which function changed how much of the page for one action; draw only what changed.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import { productsFile } from './range'
import type { DebugScenario } from './types'

/** The basket under the menu: its lines and the total. */
export const BASKET_BOX = [
  '<section class="summary" aria-label="Your basket">',
  '  <ul id="basket" class="list"></ul>',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const APP = `// The order page (Ben's first version): today's menu and the basket, both drawn by
// one render() whenever something changes.
import { products } from './products.js'
import { formatPrice } from './money.js'

const menu = document.querySelector('#products')
const basket = document.querySelector('#basket')
const total = document.querySelector('#order-total')
const lines = []

function renderMenu() {
  menu.innerHTML = products.map(product => \`
    <li class="product" data-id="\${product.id}">
      <span class="photo" aria-hidden="true"></span>
      <span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span>
      <button class="add" type="button">Add</button>
    </li>\`).join('')
}

function renderBasket() {
  basket.innerHTML = lines.map(line => \`<li>\${line.name} · \${formatPrice(line.price)}</li>\`).join('')
  total.textContent = formatPrice(lines.reduce((sum, line) => sum + line.price, 0))
}

function render() {
  renderMenu()
  renderBasket()
}

// one listener on the list answers every Add button in it
menu.addEventListener('click', (event) => {
  const button = event.target.closest('.add')
  if (!button) return
  lines.push(products.find(product => product.id === button.closest('.product').dataset.id))
  render()
})

render()
`

export const redrawsMenu: DebugScenario = {
  id: 'debugging-27-redraws-menu',
  track: 'debugging',
  kind: 'scenario',
  title: 'Every Add draws the whole menu again',
  difficulty: 1,
  minutes: 5,
  teaches: 'renders',
  story: [
    'Maya, on her old phone: “When I add something, the whole menu blinks and the page jumps a bit. With 24 products it gets slower with every Add.”',
    'Press Record in the Performance panel, add a croissant, then Stop, and choose that click under Show: what did it change on the page? Make an Add change only what changed, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    performance: true,
    probes: [
      // read a second later: a menu drawn again a moment after the Add is drawn again all the same
      { id: 'menu-changes', steps: [{ click: '[data-id="croissant"] .add' }, { wait: 1000 }, { changes: '#products' }] },
      { id: 'basket', steps: [{ click: '[data-id="rye"] .add' }, { count: '#basket li' }] },
      { id: 'total', steps: [{ text: '#order-total' }] },
      // a guard: the menu is still there (not drawing it at all changes nothing either)
      { id: 'products', steps: [{ count: '#products .add' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'products.js': productsFile(24) }, { main: BASKET_BOX }, ['cart.js']), observed: null, picked: null }),
  goals: [
    probesGoal('only-the-basket', 'Adding a croissant changes nothing in the menu (`#products`), not even a second later; with a rye loaf the basket shows both, the total “7.30”, and all 24 Add buttons are still there', { 'menu-changes': 0, 'basket': 2, 'total': '7.30', 'products': 24 })
  ],
  hints: [
    'Record, add a croissant, Stop, and choose the click under Show. Renders lists what changed the page for that one Add: which function changed 48 nodes, and which one the basket\'s 2?',
    '`renderMenu` (`app.js:11`) runs on every Add: line 35 calls `render()`, which draws the whole menu again (24 products out, 24 in) to show one new line in the basket. Nothing in the menu changed.',
    'On line 35, call `renderBasket()` instead of `render()`: the menu stays as it is, and the basket and its total are drawn again. Save, then Reload.'
  ],
  debrief: {
    title: 'Draw what changed, not everything',
    paragraphs: [
      'One `render()` for everything is easy to write and easy to trust, but every Add replaced all 24 products of the menu with 24 new ones that looked the same. The browser has to build, style and lay out every one of them again, and anything the customer had on screen (a scroll position, a focused button) can jump.',
      'The Renders table shows it per action: a render is a call of a function that changed the page, and its nodes are the elements and texts it added, removed or changed. One Add should cost the basket a few nodes, not the menu 48.',
      'Frameworks like Vue and React do this bookkeeping for you: they compare what should be on the page with what is, and touch only the difference. Without one, call the drawing function for the part whose data changed.'
    ]
  },
  solution: [{ save: 'app.js', replace: ['  lines.push(products.find(product => product.id === button.closest(\'.product\').dataset.id))\n  render()\n', '  lines.push(products.find(product => product.id === button.closest(\'.product\').dataset.id))\n  renderBasket()\n'] }, 'reload']
}
