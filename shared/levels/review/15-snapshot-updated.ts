// Tests that lie 3.5: "snapshot updated". Maya wants the quantity on each receipt line; Sous's new line prints one
// item's price (`formatPrice(line.price)`), so two croissants read “2 × Butter croissant  2.40” over a total of 7.60.
// The snapshot test failed and Sous updated the snapshot: it now holds the wrong line, and passes. On main the pull
// request's snapshot fails against main's right amounts. The quantity, the total and "snapshot updated" hold (tempting).
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const SUMMARY_JS = `// The receipt under the products, as the till will print it.
import { cart } from './cart.js'
import { receiptText } from './receipt.js'

const receipt = document.querySelector('#receipt')

export function renderSummary() {
  receipt.textContent = receiptText(cart.lines)
}
`

const RECEIPT_JS = `// The receipt the till prints for an order, as text.
import { formatPrice } from './money.js'

export function receiptText(lines) {
  const rows = lines.map(line => \`\${line.name}  \${formatPrice(line.price * line.quantity)}\`)
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  return [...rows, \`Total  \${formatPrice(total)}\`].join('\\n')
}
`

const RECEIPT_TEST = `// Tests for receipt.js.
import { receiptText } from './receipt.js'

const ORDER = [
  { name: 'Butter croissant', price: 2.4, quantity: 2 },
  { name: 'Pain au chocolat', price: 2.8, quantity: 1 }
]

test('prints a line per product and the total', () => {
  expect(receiptText(ORDER)).toMatchInlineSnapshot(\`
    Butter croissant  4.80
    Pain au chocolat  2.80
    Total  7.60
  \`)
})
`

const PAGE = [
  '<section class="summary" aria-label="Your receipt">',
  '  <pre id="receipt"></pre>',
  '</section>'
]

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'receipt.js': RECEIPT_JS, 'receipt.test.js': RECEIPT_TEST }, { main: PAGE })

const head = withEdits(base, [
  {
    path: 'receipt.js',
    replace: ['  const rows = lines.map(line => `${line.name}  ${formatPrice(line.price * line.quantity)}`)', '  const rows = lines.map(line => `${line.quantity} × ${line.name}  ${formatPrice(line.price)}`)']
  },
  {
    path: 'receipt.test.js',
    replace: ['    Butter croissant  4.80\n    Pain au chocolat  2.80\n', '    2 × Butter croissant  2.40\n    1 × Pain au chocolat  2.80\n']
  }
])

const pr: PullRequest = {
  number: 69,
  title: 'Quantities on the receipt',
  branch: 'sous/receipt-quantities',
  description: [
    'Maya wants the receipt to say how many of each product. Each line now starts with the quantity, and the snapshot is updated to match.'
  ],
  claims: [
    'Each receipt line starts with how many: “2 × Butter croissant”',
    'Line amounts and the total are as before',
    'Snapshot updated to the new format',
    'All tests pass'
  ],
  base,
  head
}

export const snapshotUpdated: ReviewScenario = {
  id: 'ai-15-snapshot-updated',
  track: 'ai',
  kind: 'scenario',
  title: 'Snapshot updated',
  difficulty: 2,
  minutes: 5,
  teaches: 'snapshot',
  story: [
    'Customers keep asking how many croissants their receipt is for. Maya asked Sous to put the quantity on each line.',
    'The receipt has a snapshot test: the whole text, written into the test. When the output changes, the snapshot fails, and updating it takes one command. Sous ran it. Read the new snapshot as carefully as the code: it is what the pull request says is right.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'unit-price',
      path: 'receipt.js',
      lines: [5, 5],
      also: [claimAt(pr, 1)],
      categories: ['bug', 'false-claim'],
      title: 'a line shows one item\'s price: “2 × Butter croissant 2.40” for 4.80 € of croissants',
      explanation: 'The new line formats `line.price`, the price of one, where the old one formatted `line.price * line.quantity`. Two croissants now read 2.40 while the total below still counts 4.80, so the lines no longer add up to the total.'
    },
    {
      id: 'snapshot-of-bug',
      path: 'receipt.test.js',
      lines: [11, 12],
      removed: [11, 12],
      categories: ['missing-test'],
      title: 'the snapshot was updated to the wrong output: it now expects “2 × Butter croissant 2.40”',
      explanation: 'The snapshot failed because the line amounts changed, which is the bug. Updating it wrote the wrong amounts into the test, so the test now guards the bug: 2.40 for two croissants, under a total of 7.60.'
    }
  ],
  tempting: [
    { ...claimAt(pr, 2), why: 'it was updated, and an update is fine when the new output is right. Reading it is the review: “2 × Butter croissant 2.40” is one croissant\'s price.' },
    { ...claimAt(pr, 3), why: 'they do: a snapshot updated to the new output always passes. That says nothing about whether the output is right.' },
    { path: 'receipt.js', lines: [6, 7], why: 'the total still multiplies price by quantity: 7.60 € is right.' },
    { path: 'receipt.test.js', lines: [13, 13], why: 'the total line did not change, and 2 × 2.40 + 2.80 is 7.60.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'receipt.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Sous updated a snapshot. A snapshot is whatever the code printed when it was taken: read the new one like a receipt. Do the lines add up to the total?',
    'Two croissants at 2.40 € each: what should their line say? Run the PR\'s tests on main to see what main prints for the same order.',
    '`receipt.js:5` prints `formatPrice(line.price)`, one item\'s price, so two croissants read 2.40: a bug. The snapshot was updated to that wrong line (`receipt.test.js:11`): a missing test. Comment on both, then Request changes.'
  ],
  debrief: {
    title: 'An updated snapshot is a new claim',
    paragraphs: [
      'The new line formats `line.price`, one croissant\'s price, where the old line formatted the line\'s total. Two croissants now read 2.40 on a receipt whose total is 7.60. The total is still right, which is why the receipt doesn\'t look broken at a glance.',
      'The snapshot test caught it: it failed. Updating a snapshot takes one command and writes whatever the code prints into the test, mistakes too, so the test now expects the bug. The Tests panel shows it from the other side: on main\'s code the pull request\'s snapshot fails, and main prints 4.80.',
      'How you would have caught it: read every changed line of a snapshot as output you are approving. Here, multiply: 2 × 2.40 is not on the line, 4.80 should be.'
    ]
  },
  solution: [
    { comment: 'receipt.js', lines: [5, 5], category: 'bug', text: 'line.price is one item: two croissants should say 4.80.' },
    { comment: 'receipt.test.js', lines: [11, 11], category: 'missing-test', text: 'The snapshot was updated to the wrong amount: 2 × 2.40 is not 2.40.' },
    { submit: 'request-changes', summary: 'Each line shows one item\'s price, and the snapshot was updated to agree.' }
  ]
}
