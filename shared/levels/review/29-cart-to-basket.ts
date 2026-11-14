// Scope and size 6.4: "Small change: rename cart to basket". Ben wants one word for it: the page says basket, so the
// code should too. Sous renames `cart` to `basket` and `addToCart` to `addToBasket` in three files, every one of them
// right, and slips a new rule into the rename: at most ten of a product (`MAX_PER_PRODUCT`), against “Small change:
// only names change” and “No behaviour change”. Offices order croissants by the dozen. Not a bug of the rename: a
// second change that needs its own pull request (and Maya's yes). Click Add twelve times: This PR stops at 10.
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const SUMMARY = `// The basket under the products: one row per product, then the total (Ben).
import { basketTotal, cart } from './cart.js'
import { formatPrice } from './money.js'

const list = document.querySelector('#basket')
const total = document.querySelector('#order-total')

export function renderSummary() {
  list.replaceChildren(...cart.lines.map((line) => {
    const row = document.createElement('li')
    row.textContent = \`\${line.quantity} × \${line.name}\`
    return row
  }))
  total.textContent = formatPrice(basketTotal())
}
`

const base = shopFiles(
  { 'app.js': SUMMARY_APP, 'summary.js': SUMMARY },
  {
    main: [
      '<section class="summary" aria-label="Your basket">',
      '  <ul id="basket" class="list"></ul>',
      '  <p>Total <strong id="order-total"></strong> €</p>',
      '</section>'
    ]
  }
)

const head = withEdits(base, [
  { path: 'cart.js', replace: ['const badge = document.querySelector(\'#cart-count\')\n', 'const badge = document.querySelector(\'#cart-count\')\n// at most ten of a product, so a stuck finger can\'t order fifty\nconst MAX_PER_PRODUCT = 10\n'] },
  { path: 'cart.js', replace: ['export const cart = { lines: [] }', 'export const basket = { lines: [] }'] },
  { path: 'cart.js', replace: ['  return cart.lines.find(line => line.id === id)', '  return basket.lines.find(line => line.id === id)'] },
  { path: 'cart.js', replace: ['  return cart.lines.reduce((sum, line) => sum + line.quantity, 0)', '  return basket.lines.reduce((sum, line) => sum + line.quantity, 0)'] },
  { path: 'cart.js', replace: ['  return cart.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)', '  return basket.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)'] },
  { path: 'cart.js', replace: ['export function addToCart(product) {', 'export function addToBasket(product) {'] },
  { path: 'cart.js', replace: ['  if (line) line.quantity += 1\n  else cart.lines.push(', '  if (line) line.quantity = Math.min(line.quantity + 1, MAX_PER_PRODUCT)\n  else basket.lines.push('] },
  { path: 'app.js', replace: ['import { addToCart, cart, renderBadge } from \'./cart.js\'', 'import { addToBasket, basket, renderBadge } from \'./cart.js\''] },
  { path: 'app.js', replace: ['    addToCart(product)', '    addToBasket(product)'] },
  { path: 'app.js', replace: ['// Handy while trying it: type cart in the Console.\nObject.assign(window, { cart })', '// Handy while trying it: type basket in the Console.\nObject.assign(window, { basket })'] },
  { path: 'summary.js', replace: ['import { basketTotal, cart } from \'./cart.js\'', 'import { basket, basketTotal } from \'./cart.js\''] },
  { path: 'summary.js', replace: ['...cart.lines.map(', '...basket.lines.map('] }
])

const pr: PullRequest = {
  number: 99,
  title: 'Small change: rename cart to basket',
  branch: 'sous/cart-to-basket',
  description: [
    'Ben asked for one word for it: the page says basket, so the code says `basket` now instead of `cart`, and `addToBasket` instead of `addToCart`. The file keeps its name, cart.js, for now.'
  ],
  claims: [
    'Small change: only names change',
    'No behaviour change',
    'Every file that used `cart` uses `basket` now'
  ],
  base,
  head
}

export const cartToBasket: ReviewScenario = {
  id: 'ai-29-cart-to-basket',
  track: 'ai',
  kind: 'scenario',
  title: 'Small change: rename cart to basket',
  difficulty: 2,
  minutes: 5,
  teaches: 'two in one',
  story: [
    'The order page says basket, the code says cart, and Ben keeps mixing them up. He asked Sous to rename it in the code.',
    'A rename touches many lines and changes nothing a customer can see, so it is quick to review if that is all it does. Make sure it is.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'cap',
    path: 'cart.js',
    lines: [27, 27],
    removed: [25, 25],
    also: [{ path: 'cart.js', lines: [3, 4] }, claimAt(pr, 0), claimAt(pr, 1)],
    categories: ['scope', 'false-claim'],
    title: 'a new rule hidden in the rename: no more than ten of a product',
    explanation: 'Among the renamed lines, `addToBasket` now stops at `MAX_PER_PRODUCT`, ten. Offices order croissants by the dozen; whether the shop wants a limit at all is Maya\'s call, in a pull request that says so, not in a rename.'
  }],
  tempting: [
    { path: 'cart.js', lines: [6, 6], removed: [4, 4], why: 'the rename Ben asked for: `cart` is `basket` now.' },
    { path: 'app.js', lines: [3, 3], removed: [3, 3], why: 'app.js imports the new names: without it the page would stop at the import.' },
    { path: 'summary.js', lines: [2, 2], removed: [2, 2], why: 'the summary imports `basket` now: part of the rename.' },
    { ...paragraphAt(pr, 0), why: 'that is what Ben asked for, and the renames do it.' },
    { ...claimAt(pr, 2), why: 'it does: app.js, cart.js and summary.js all say `basket`.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'cart.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'A rename changes names and nothing else. Go through the changed lines and check that each one only swaps `cart` for `basket`.',
    'One changed line in cart.js does more than rename. Run the PR and main, and add the same croissant twelve times on each.',
    '`cart.js:27` caps every product at `MAX_PER_PRODUCT` (`cart.js:4`), ten: a new rule, so “Small change: only names change” doesn\'t hold. Comment on it as scope, then Request changes.'
  ],
  debrief: {
    title: 'A rename with a rule inside',
    paragraphs: [
      'Every rename in it is right: `cart` is `basket` in all three files, and the page works. But one changed line does more: `addToBasket` now stops at `MAX_PER_PRODUCT`, ten of a product. Click Add twelve times on This PR and the basket says 10; main says 12.',
      'Maybe a limit is a good idea. It is still a second change, a rule about what customers may order, and it rode in under “Small change: only names change”. Offices order by the dozen: that is Maya\'s call, in a pull request that says what it does, so it can be discussed, tested and, if need be, reverted on its own.',
      'How you would have caught it: a rename\'s diff is long and boring, which is where a second change hides. Check that every changed line only swaps names; one line that does more means two pull requests.'
    ]
  },
  solution: [
    { comment: 'cart.js', lines: [27, 27], category: 'scope', text: 'This isn\'t a rename: a new limit of ten per product. Please take it out, and send it on its own if we want it.' },
    { submit: 'request-changes', summary: 'The rename is fine; the new limit belongs in its own pull request.' }
  ]
}
