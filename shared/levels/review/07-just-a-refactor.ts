// Claims vs. code 2.2: "two small refactors, no behaviour change". Sous turns `cheapest`'s loop into
// `products.sort(...)[0]`, and `sort` sorts the shop's own list in place: the page now lists the products by price
// instead of Maya's order, bread first. The tip is still right and the template string reads as before: two claims
// that hold (tempting), one that doesn't.
import { reviewGoals } from './checks'
import { DESCRIPTION_PATH, claimAt } from './diff'
import { ORDER_PAGE, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const PRODUCTS = `// Today's products, in the order Maya wants them on the page: the bread first. Prices are in euros.
export const products = [
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 },
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 }
]
`

const TIP = `// The tip in the header: today's cheapest product, for customers who just want something small.
export function cheapest(products) {
  let best = products[0]
  for (const product of products) {
    if (product.price < best.price) best = product
  }
  return best
}
`

const APP = `// The order page: the tip in the header, then today's products with their Add buttons.
import { products } from './products.js'
import { addToCart, cart, renderBadge } from './cart.js'
import { formatPrice } from './money.js'
import { cheapest } from './tip.js'

const list = document.querySelector('#products')
const tip = document.querySelector('#tip')

const small = cheapest(products)
tip.textContent = 'Something small? ' + small.name + ', ' + formatPrice(small.price) + ' €'

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

renderBadge()

// Handy while trying it: type cart or products in the Console.
Object.assign(window, { cart, products })
`

const base = shopFiles({ 'app.js': APP, 'products.js': PRODUCTS, 'tip.js': TIP }, { header: ['<p class="tagline" id="tip"></p>'] })

const head = withEdits(base, [
  {
    path: 'tip.js',
    replace: [`  let best = products[0]
  for (const product of products) {
    if (product.price < best.price) best = product
  }
  return best
`, '  return products.sort((a, b) => a.price - b.price)[0]\n']
  },
  { path: 'app.js', replace: ['tip.textContent = \'Something small? \' + small.name + \', \' + formatPrice(small.price) + \' €\'', 'tip.textContent = `Something small? ${small.name}, ${formatPrice(small.price)} €`'] }
])

const pr: PullRequest = {
  number: 53,
  title: 'Tidy up the header tip',
  branch: 'sous/tidy-tip',
  description: [
    'Two small refactors: `cheapest` is one line instead of a loop, and the tip is a template string instead of `+`.'
  ],
  claims: [
    'No behaviour change',
    'The tip still names the cheapest product',
    'The tip reads exactly as before'
  ],
  base,
  head
}

export const justARefactor: ReviewScenario = {
  id: 'ai-07-just-a-refactor',
  track: 'ai',
  kind: 'scenario',
  title: 'No behaviour change',
  difficulty: 2,
  minutes: 4,
  teaches: 'refactor',
  story: [
    'Maya keeps the bread at the top of the order page: it is what most customers come for. The header has a tip for everyone else, the cheapest product of the day. Sous offered to tidy that code up “while it was in there”.',
    'A refactor is a promise: the code reads differently and does exactly the same. Review the pull request against that promise, and run both sides to compare.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'sorts-in-place',
    path: 'tip.js',
    lines: [3, 3],
    also: [claimAt(pr, 0)],
    categories: ['false-claim'],
    title: '`products.sort(…)` sorts the shop\'s own list: the page now lists the products by price',
    explanation: '`sort` rearranges the array it is called on. `cheapest` is handed `products`, the list app.js draws right after, so the croissant comes first and Maya\'s bread last. The old loop only read the list; `[...products].sort(…)` would keep the promise.'
  }],
  tempting: [
    { ...claimAt(pr, 1), why: 'it does: sorted by price, the first product is the cheapest, the croissant at 2.40 €.' },
    { ...claimAt(pr, 2), why: 'it does: the template string puts the same pieces together, “Something small? Butter croissant, 2.40 €”.' },
    { path: 'app.js', lines: [11, 11], removed: [11, 11], why: 'the template string joins the same four pieces as the `+` did, in the same order.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'tip.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'A refactor promises the same behaviour. For each changed line, ask what else it touches besides what it returns.',
    '`products.sort((a, b) => a.price - b.price)` returns a sorted list, but what does it do to `products` itself? app.js draws `products` right after `cheapest(products)`. Run the PR, then main, and compare the order of the products.',
    '`tip.js:3` sorts the shop\'s own `products` in place, so the page lists them by price, not in Maya\'s order: “No behaviour change” (line 2 of the description) doesn\'t hold. Comment on it as a false claim, then Request changes.'
  ],
  debrief: {
    title: 'A refactor that rearranged the shop',
    paragraphs: [
      '`Array.prototype.sort` sorts the array it is called on and returns that same array. `cheapest` was handed the shop\'s `products`, the list app.js draws right after it, so the page now shows the croissant first and the bread last. The old loop only read the list; the one-liner rearranges it.',
      'The tip is right, and the template string reads exactly as before: two of three claims hold, which is what makes the third easy to believe. “No behaviour change” is a claim about everything the code touches, so it is checked against everything the code touches, not only against what the function returns.',
      'How you would have caught it: for a refactor, run both sides and compare; main and This PR should look the same, and here the first product differs. Reading, watch for calls that change what they are given (`sort`, `reverse`, `splice`): `[...products].sort(…)` or `products.toSorted(…)` keeps the list as it was.'
    ]
  },
  solution: [
    { comment: DESCRIPTION_PATH, lines: claimAt(pr, 0).lines, category: 'false-claim', text: '`sort` sorts `products` in place: the page now lists the products by price.' },
    { submit: 'request-changes', summary: 'The refactor changes the order of the products on the page.' }
  ]
}
