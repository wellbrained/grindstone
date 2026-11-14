// Read the diff 1.2: Ben wants each basket line with its own total, like the paper receipt. Sous multiplies the line's
// price by the whole basket's item count instead of the line's quantity: right as long as the basket holds one product,
// which is all Sous tested.
import { reviewGoals } from './checks'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { ReviewScenario } from './types'

const SUMMARY = `// The basket summary under the products: one row per product the customer picked.
import { cart } from './cart.js'

const list = document.querySelector('#basket')

export function renderSummary() {
  list.replaceChildren()
  for (const line of cart.lines) {
    const row = document.createElement('li')
    row.textContent = \`\${line.quantity} × \${line.name}\`
    list.append(row)
  }
}
`

const base = shopFiles(
  { 'app.js': SUMMARY_APP, 'summary.js': SUMMARY },
  { main: ['<h2>Your basket</h2>', '<ul id="basket" class="list" aria-label="Your basket"></ul>'] }
)

const head = withEdits(base, [
  { path: 'summary.js', replace: ['import { cart } from \'./cart.js\'', 'import { cart, itemCount } from \'./cart.js\'\nimport { formatPrice } from \'./money.js\''] },
  {
    path: 'summary.js',
    replace: [`  list.replaceChildren()
  for (const line of cart.lines) {
    const row = document.createElement('li')
    row.textContent = \`\${line.quantity} × \${line.name}\``, `  list.replaceChildren()
  // counted once, not again for every row
  const count = itemCount()
  for (const line of cart.lines) {
    const row = document.createElement('li')
    const total = line.price * count
    row.textContent = \`\${line.quantity} × \${line.name}  \${formatPrice(total)}\``]
  }
])

export const lineTotals: ReviewScenario = {
  id: 'ai-02-line-totals',
  track: 'ai',
  kind: 'scenario',
  title: 'A total for every line',
  difficulty: 1,
  minutes: 4,
  teaches: 'wrong variable',
  story: [
    'Ben wants the basket to read like the paper receipt, each line with its own total: “2 × Butter croissant 4.80”. He asked Sous, and Sous says it tested it.',
    'Review the pull request: comment on what is wrong, then Approve or Request changes. Running it costs nothing.'
  ].join('\n\n'),
  pr: {
    number: 43,
    title: 'Show a total on every basket line',
    branch: 'sous/line-totals',
    description: [
      'Each basket row now ends with its total, formatted like the prices above it. The item count is worked out once per render instead of once per row.',
      'Tested: two butter croissants show “2 × Butter croissant 4.80”.'
    ],
    claims: [
      'Every basket row shows quantity × price',
      'Prices use `formatPrice`, like the product list'
    ],
    base,
    head
  },
  issues: [{
    id: 'basket-count',
    path: 'summary.js',
    lines: [10, 13],
    categories: ['bug'],
    title: 'a row\'s total multiplies by every item in the basket, not by its own quantity',
    explanation: '`count` is `itemCount()`, all items in the basket. A row\'s total is `line.price * line.quantity`: with two croissants and a sourdough loaf, the croissant row says 7.20 instead of 4.80.'
  }],
  tempting: [
    { path: 'summary.js', lines: [8, 8], why: 'the rows are drawn again after every Add, so the list is emptied first; without it every row would show up twice.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'summary.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Sous tested one product. What changes when the basket holds two different products? Follow what the total of one row is made of.',
    'A row\'s total is `line.price * count`. Where does `count` come from, and what does it count? Run the PR and add two croissants and a sourdough loaf.',
    '`summary.js:13` multiplies by `count`, which is `itemCount()` (`summary.js:10`), every item in the basket. It should be `line.quantity`. Comment on those lines as a bug, then Request changes.'
  ],
  debrief: {
    title: 'The right number, from the wrong variable',
    paragraphs: [
      '`count` is how many items the whole basket holds; a row needs its own `line.quantity`. With one product in the basket the two are the same number, which is exactly the case Sous tested: “2 × Butter croissant 4.80” is right, and two croissants plus a sourdough loaf make the croissant row 7.20.',
      'This is a typical assistant slip: a variable with a fitting name in reach, a test that only covers the easy case, and a description that reports the test as proof. A passing example says the code works for that example, nothing more.',
      'How you would have caught it: for every value in a new line, ask where it comes from. Then try a case the description did not: two different products. Running the PR shows it in three clicks.'
    ]
  },
  solution: [
    { comment: 'summary.js', lines: [13, 13], category: 'bug', text: '`count` is every item in the basket; a row needs `line.quantity`.' },
    { submit: 'request-changes', summary: 'Rows multiply by the whole basket\'s count.' }
  ]
}
