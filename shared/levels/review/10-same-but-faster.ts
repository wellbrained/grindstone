// Claims vs. code 2.5: "same as before, but faster". Sous caches the basket total and works it out again only when
// the number of basket lines changes. A second croissant changes a line's quantity, not the number of lines, so the
// total goes stale on the most common Add there is. Two claims say the totals are right; both fall with the cache's
// key. "Faster" is true, if only by a little (tempting), and the cache starts right (tempting).
import { reviewGoals } from './checks'
import { DESCRIPTION_PATH, claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const SUMMARY_JS = `// The basket summary: the total under the products, drawn again after every Add.
import { basketTotal } from './cart.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

export function renderSummary() {
  totalText.textContent = formatPrice(basketTotal())
}
`

const PAGE = [
  '<section class="summary" aria-label="Your basket">',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS }, { main: PAGE })

const head = withEdits(base, [
  {
    path: 'cart.js',
    replace: [`export function basketTotal() {
  return cart.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}
`, `// worked out again only when the basket changes (the till tablet is slow, Ben)
let cachedTotal = 0
let cachedLines = 0

export function basketTotal() {
  if (cart.lines.length === cachedLines) return cachedTotal
  cachedTotal = cart.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  cachedLines = cart.lines.length
  return cachedTotal
}
`]
  }
])

const pr: PullRequest = {
  number: 57,
  title: 'Remember the basket total',
  branch: 'sous/cache-total',
  description: [
    'Ben says the order page is slow on the till tablet. The summary works the basket total out on every render; `basketTotal` now keeps the last one in `cart.js`.'
  ],
  claims: [
    'Same totals as before',
    'The total is worked out again whenever the basket changes',
    'Faster on the till tablet'
  ],
  base,
  head
}

export const sameButFaster: ReviewScenario = {
  id: 'ai-10-same-but-faster',
  track: 'ai',
  kind: 'scenario',
  title: 'Same as before, but faster',
  difficulty: 2,
  minutes: 5,
  teaches: 'stale cache',
  story: [
    'The till tablet in the shop is old, and Ben finds the order page slow on it. He asked Sous to speed it up without changing what customers see.',
    'Sous remembered something instead of working it out again. A cache is only as good as the moment it forgets: review the pull request, and run it with more than one of the same thing.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'stale-total',
    path: 'cart.js',
    lines: [19, 21],
    also: [claimAt(pr, 0), claimAt(pr, 1)],
    categories: ['false-claim'],
    title: 'the total is kept while the number of basket lines stays the same: a second croissant leaves it at 2.40 €',
    explanation: 'The cache\'s key is `cart.lines.length`, the number of different products. A second croissant raises a line\'s quantity and leaves the number of lines alone, so `basketTotal` answers with the old total. The key has to change with every quantity and price, or the cache has to be dropped when the basket changes (`addToCart`).'
  }],
  tempting: [
    { ...claimAt(pr, 2), why: 'skipping the sum is faster, if only by a little. Whether a cache is worth it is a fair question for Sous; whether it is right is the claim that fails.' },
    { path: 'cart.js', lines: [15, 16], why: 'an empty basket has 0 lines and a total of 0: the cache starts out right.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'cart.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'A cache is right only if it is thrown away whenever what it remembers could change. What does this one check before it answers from memory?',
    'The cache answers while `cart.lines.length` stays the same. Does a second croissant change `cart.lines.length`? Run the PR and add the same croissant twice.',
    '`cart.js:19` answers from the cache whenever the number of lines is the same, so a second croissant keeps the old total: “Same totals as before” (line 2 of the description) doesn\'t hold. Comment on it as a false claim, then Request changes.'
  ],
  debrief: {
    title: 'A cache is only as good as its key',
    paragraphs: [
      'The cache\'s key is `cart.lines.length`, the number of different products. A second croissant changes a line\'s quantity, not the number of lines, so `basketTotal` answers with the total from before: two croissants cost 2.40 €. The total goes stale on the most common Add there is.',
      'Two claims say the totals are right, the same as before and worked out again whenever the basket changes, and both are about the cache\'s key, not its speed. “Faster” is easy to believe and rarely the question; whether the cache is right always is.',
      'How you would have caught it: for every cache, name what the answer depends on (here every line\'s quantity and price) and check that the key changes with each of them. Then run the PR and change one of them without changing the key: the same product twice.'
    ]
  },
  solution: [
    { comment: DESCRIPTION_PATH, lines: claimAt(pr, 0).lines, category: 'false-claim', text: 'A second croissant keeps the old total: the cache only notices new lines.' },
    { submit: 'request-changes', summary: 'The cached total goes stale when a quantity changes.' }
  ]
}
