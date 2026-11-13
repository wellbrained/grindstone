// Performance 6.3: the café price list asks priceLabel for each of its 48 products, and priceLabel formats all 48 prices
// every time to pick one: 2,304 calls of formatPrice to show 48 prices. Right on the page, slow on the counter's tablet.
// Learn: the Performance panel's Functions (calls, self, total) show the work that sits inside a loop; do it once.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import { RANGE } from './range'
import type { DebugScenario } from './types'

const cents = (price: number) => Math.round(price * 100)

/** catalogue.js: the café range (48 products) and its prices in cents, as the till has them. */
export const CATALOGUE = `// The café price list (Ben): every product, and its price in cents as the till has it.
export const products = [
${RANGE.map(([id, name]) => `  { id: '${id}', name: '${name}' }`).join(',\n')}
]

export const PRICES = [
${RANGE.map(([id, , price]) => `  { id: '${id}', cents: ${cents(price)} }`).join(',\n')}
]
`

/** money.js in cents: 240 becomes "2.40 €". */
export const MONEY_CENTS = `// Turns cents into text for the page: 240 becomes "2.40 €".
export function formatPrice(cents) {
  const euros = Math.floor(cents / 100)
  const rest = String(cents % 100).padStart(2, '0')
  return \`\${euros}.\${rest} €\`
}
`

const PRICES_JS = `// Prices as the page shows them (Ben): one place that knows how every price is written.
import { formatPrice } from './money.js'
import { PRICES } from './catalogue.js'

export function priceLabel(id) {
  const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))
  return labels.find(entry => entry.id === id).label
}
`

const APP = `// The café price list: every product with its price.
import { products } from './catalogue.js'
import { priceLabel } from './prices.js'

const list = document.querySelector('#products')

list.innerHTML = products.map(product => \`
  <li class="product" data-id="\${product.id}">
    <span class="photo" aria-hidden="true"></span>
    <span><span class="name">\${product.name}</span> <span class="price">\${priceLabel(product.id)}</span></span>
  </li>\`).join('')
`

/** The most work loading the list may take (it takes over 10,000 units as written). */
export const PRICE_LIST_WORK = 2000

export const formattedThousands: DebugScenario = {
  id: 'debugging-28-formatted-thousands',
  track: 'debugging',
  kind: 'scenario',
  title: 'Prices are formatted thousands of times',
  difficulty: 2,
  minutes: 6,
  teaches: 'work in a loop',
  story: [
    'Anna at the café counter: “The price list takes ages to show on the tablet. The prices are right, it is just slow, and it gets slower every time Ben adds a product.”',
    'Press Record in the Performance panel (the list loads again), then Stop, and read the Functions: how often did each run, and how much work did it do? Make loading the list do less, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'prices.js',
    performance: true,
    probes: [
      { id: 'work', steps: [{ work: 'load' }] },
      // guards: every product still shows its own price, written the same way
      { id: 'rows', steps: [{ count: '#products .price' }] },
      { id: 'first', steps: [{ text: '[data-id="croissant"] .price' }] },
      { id: 'last', steps: [{ text: '[data-id="wedding-loaf"] .price' }] }
    ]
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'catalogue.js': CATALOGUE, 'prices.js': PRICES_JS, 'money.js': MONEY_CENTS }, {}, ['products.js', 'cart.js']), observed: null, picked: null }),
  goals: [
    probesGoal('less-work', `Loading the list takes at most ${PRICE_LIST_WORK.toLocaleString('en')} units of work, and all 48 products show their prices (“2.40 €” for the butter croissant, “18.50 €” for the wedding loaf)`, { work: { atMost: PRICE_LIST_WORK }, rows: 48, first: '2.40 €', last: '18.50 €' })
  ],
  hints: [
    'Record, then Stop once the list shows. The Functions table counts how often each function ran: 48 products, so how many calls of `formatPrice` would you expect, and how many are there?',
    '`formatPrice` ran 2,304 times, 48 × 48: for each product the page asks `priceLabel` (`prices.js:5`), and line 6 formats every price in the list again, only to pick one of them on line 7.',
    'Write every price once, when the file loads: put `const labels = new Map(PRICES.map(entry => [entry.id, formatPrice(entry.cents)]))` above `export function priceLabel`, and make its body `return labels.get(id)`. Save, then Reload.'
  ],
  debrief: {
    title: 'Work inside a loop runs once per round',
    paragraphs: [
      '`priceLabel` looked harmless: format the prices, pick one. But the page calls it once per product, so the formatting inside it ran 48 times 48 times. That is the shape to look for: work that does not depend on the round, inside the round. With 96 products it would be four times as much, not twice.',
      'The Functions table told the story without reading the code: `formatPrice` with 2,304 calls, `priceLabel` with most of the total but little self work (its time goes into what it calls). Total is a function with everything it called, self only its own statements.',
      'Doing it once, outside, fixes it; a `Map` by id also makes each lookup one step instead of a walk through the list (`find` looks at up to 48 entries each time). Remembering what `formatPrice` gave for each amount (a cache inside it) would not help much: the loop around it would still run 2,304 times.'
    ]
  },
  solution: [{
    save: 'prices.js',
    replace: [
      'export function priceLabel(id) {\n  const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\n  return labels.find(entry => entry.id === id).label\n}\n',
      '// every price written once, when the file loads, by id\nconst labels = new Map(PRICES.map(entry => [entry.id, formatPrice(entry.cents)]))\n\nexport function priceLabel(id) {\n  return labels.get(id)\n}\n'
    ]
  }, 'reload']
}
