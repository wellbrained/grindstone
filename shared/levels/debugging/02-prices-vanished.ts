// Reading errors 1.2: app.js imports money.js's default export (an object with every helper on it) where it wanted the
// named `formatPrice`, so "formatPrice is not a function". Learn: "is not a function" means "look at what you got";
// the Console input shows it.
import { ORDER_PAGE, orderSite } from './bakery'
import { noErrorsGoal, probeGoal } from './checks'
import type { DebugScenario } from './types'

const MONEY = `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
// Jonas: checkout.js still calls money.formatPrice(...), so this file also has a
// default export with every helper on it. New code imports the names it needs.

export function formatPrice(amount) {
  return amount.toFixed(2)
}

export function toCents(amount) {
  return Math.round(amount * 100)
}

export default { formatPrice, toCents }
`

const APP = `// The order page: draws today's products and wires up the Add buttons.
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
import formatPrice from './money.js'

// Handy while debugging: type cart, products or formatPrice in the Console.
Object.assign(window, { cart, products, formatPrice })

const list = document.querySelector('#products')

for (const product of products) {
  const item = document.createElement('li')
  item.className = 'product'
  item.dataset.id = product.id
  item.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span><span class="name">\${product.name}</span> <span class="price" data-amount="\${product.price}"></span></span>
    <button class="add" type="button">Add</button>\`
  item.querySelector('.add').addEventListener('click', () => addToCart(product))
  list.append(item)
}

// Prices change at noon (the lunch menu), so they are drawn on their own.
function renderPrices() {
  for (const price of list.querySelectorAll('.price')) {
    price.textContent = formatPrice(Number(price.dataset.amount))
  }
}

renderPrices()
renderBadge()
console.log(\`Corner Bakery shop ready · \${products.length} products\`)
`

export const pricesVanished: DebugScenario = {
  id: 'debugging-02-prices-vanished',
  track: 'debugging',
  kind: 'scenario',
  title: 'The prices vanished',
  difficulty: 1,
  minutes: 5,
  teaches: 'TypeError',
  story: [
    'Ben from the shop: “Since Jonas tidied up `money.js` this morning, the price next to every product is gone. The names are there and Add still works, just no prices.”',
    'The Console has the error from the moment the page loads. Find out what `formatPrice` really is in `app.js` and fix it so the prices show again. Save, then Reload to check.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'app.js',
    probes: [{ id: 'croissant-price', steps: [{ text: '[data-id="croissant"] .price' }] }]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'money.js': MONEY }), observed: null, picked: null }),
  goals: [
    probeGoal('prices', 'Every product shows its price again (Butter croissant: 2.40)', 'croissant-price', '2.40'),
    noErrorsGoal()
  ],
  hints: [
    '“is not a function” means: what you called is something else. Type `formatPrice` in the Console input and press Enter. What do you get?',
    'You get an object with `formatPrice` and `toCents` on it: the default export of `money.js` (its last line). Look at how `app.js` imports it on line 4.',
    '`import formatPrice from \'./money.js\'` takes the default export. Take the named one instead: `import { formatPrice } from \'./money.js\'` on line 4 of `app.js`, then Save and Reload.'
  ],
  debrief: {
    title: 'Check what you actually got',
    paragraphs: [
      '`TypeError: formatPrice is not a function` does not say the function is missing. It says the thing you called is not a function. So the question is: what is it? The Console input answers that in a second: `formatPrice` was an object, `{formatPrice: ƒ, toCents: ƒ}`.',
      'An import without braces takes the module\'s default export; braces take a named export. `money.js` has both, so the wrong one loaded without any complaint and only failed when it was called.',
      'When something "is not a function" (or "not iterable", or has no property), look at the value first, then go and find out where it came from.'
    ]
  },
  solution: [{ save: 'app.js', replace: ['import formatPrice from \'./money.js\'', 'import { formatPrice } from \'./money.js\''] }, 'reload']
}
