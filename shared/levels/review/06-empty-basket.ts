// Claims vs. code 2.1: offices want the average price per item for their expense forms. Sous's description promises
// that an empty basket is handled; the code divides the total by the item count, and for an empty basket `0 / 0` is
// NaN. The comment above the line writes Sous's wrong reasoning down. The total itself is untouched: the claim that
// says so holds (a tempting place).
import { reviewGoals } from './checks'
import { DESCRIPTION_PATH, claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const SUMMARY_JS = `// The basket summary: the total under the products.
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
  { path: 'index.html', replace: ['      <p>Total <strong id="order-total"></strong> €</p>\n', '      <p>Total <strong id="order-total"></strong> €</p>\n      <p>Average per item <strong id="order-average"></strong> €</p>\n'] },
  {
    path: 'summary.js',
    replace: [SUMMARY_JS, `// The basket summary: the total under the products, and the average per item for the offices' expense forms.
import { basketTotal, itemCount } from './cart.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')
const averageText = document.querySelector('#order-average')

export function renderSummary() {
  const total = basketTotal()
  totalText.textContent = formatPrice(total)
  // an empty basket has a total of 0, so its average is 0 as well
  averageText.textContent = formatPrice(total / itemCount())
}
`]
  }
])

const pr: PullRequest = {
  number: 51,
  title: 'Show the average price per item',
  branch: 'sous/average-per-item',
  description: [
    'Adds the average price per item under the total, for the offices\' expense forms. It divides by `itemCount()`, so two croissants count as two items.'
  ],
  claims: [
    'Shows the average price per item under the total',
    'Handles an empty basket: the average says 0.00 until something is in it',
    'The total is worked out as before'
  ],
  base,
  head
}

export const emptyBasket: ReviewScenario = {
  id: 'ai-06-empty-basket',
  track: 'ai',
  kind: 'scenario',
  title: 'Handles empty baskets',
  difficulty: 1,
  minutes: 4,
  teaches: 'empty case',
  story: [
    'Offices fill in expense forms per item. Jonas asked Sous: “Show the average price per item under the total.” Sous opened a pull request, and its description lists what the change does.',
    'Sous\'s description is numbered like a file: you can comment on a claim there, or on the lines that break it. A claim that doesn\'t hold is a false claim. Read the claims, check each against the code, and run the PR.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'empty-nan',
    path: 'summary.js',
    lines: [11, 12],
    also: [claimAt(pr, 1)],
    categories: ['false-claim'],
    title: 'an empty basket shows “NaN” as its average: `0 / 0` is not 0',
    explanation: 'With nothing in the basket, `total / itemCount()` is `0 / 0`, which is `NaN` in JavaScript, so the page opens with “Average per item NaN €”. The description promises 0.00; the code needs `itemCount() === 0 ? 0 : total / itemCount()`.'
  }],
  tempting: [
    { ...claimAt(pr, 2), why: 'it is: `basketTotal()` is kept in `total` and formatted as before; only the average is new.' },
    { path: 'summary.js', lines: [9, 10], why: 'the total is the same `basketTotal()` as before, kept in a variable so the average can use it too.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'summary.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Sous makes three claims. Take the one about an edge case and check it against the code: what does the new line do when the basket is empty?',
    'Work out `total / itemCount()` for an empty basket: what is `0 / 0` in JavaScript? Or run the PR and look under the total before you add anything.',
    'The claim on line 3 of the description, “Handles an empty basket”, doesn\'t hold: `summary.js:12` divides 0 by 0, which is `NaN`. Comment on that claim (or on that line) as a false claim, then Request changes.'
  ],
  debrief: {
    title: 'A claimed edge case is the first thing to try',
    paragraphs: [
      '`total / itemCount()` with an empty basket is `0 / 0`, and in JavaScript that is `NaN`, not 0: the page opens with “Average per item NaN €” before anyone has touched it. The comment above the line says why Sous believed otherwise, “a total of 0, so its average is 0 as well”. The reasoning is written down, and it is wrong.',
      'It is a bug, and the review calls it a false claim: the description promised the empty basket works. Pointing at the claim tells Sous, and everyone who reads the pull request later, that the description can\'t be trusted here; a false-claim comment on the line that breaks it says the same.',
      'How you would have caught it: read the claims first and turn each into a check. “Handles an empty basket” is the easiest one to try: run the PR and look before you add anything. The other two claims hold, which is normal: a description is mostly right, and the one claim that isn\'t is the one nobody tried.'
    ]
  },
  solution: [
    { comment: DESCRIPTION_PATH, lines: claimAt(pr, 1).lines, category: 'false-claim', text: 'An empty basket shows NaN: 0 / 0 isn\'t 0.' },
    { submit: 'request-changes', summary: 'The empty basket isn\'t handled: the average says NaN.' }
  ]
}
