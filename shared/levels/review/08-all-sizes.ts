// Claims vs. code 2.3: coffee comes in three sizes now, and Sous reports a test of all three with their prices. The
// medium case compares with 'meduim', so a medium coffee falls through to the small price: the test report can't be
// what happened. The other claims hold (tempting), and so does the plain `return 2.2` at the end.
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const COFFEE = `// A coffee to go with the order, ready at pickup (Anna).
export const COFFEES = { none: 'No coffee', small: 'Coffee (2.20 €)' }

export function coffeePrice(size) {
  return size === 'small' ? 2.2 : 0
}
`

const SUMMARY_JS = `// The basket summary: a coffee to go with it, and the total.
import { basketTotal } from './cart.js'
import { COFFEES, coffeePrice } from './coffee.js'
import { formatPrice } from './money.js'

const coffee = document.querySelector('#coffee-size')
const totalText = document.querySelector('#order-total')

for (const [value, label] of Object.entries(COFFEES)) {
  coffee.append(new Option(label, value))
}
coffee.addEventListener('change', () => renderSummary())

export function renderSummary() {
  const total = basketTotal() + coffeePrice(coffee.value)
  totalText.textContent = formatPrice(total)
}
`

const PAGE = [
  '<section class="summary" aria-label="Your basket">',
  '  <p><label>With it <select id="coffee-size"></select></label></p>',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'coffee.js': COFFEE }, { main: PAGE })

const head = withEdits(base, [
  {
    path: 'coffee.js',
    replace: [COFFEE, `// A coffee to go with the order, ready at pickup (Anna): three sizes since May.
export const COFFEES = {
  none: 'No coffee',
  small: 'Small coffee (2.20 €)',
  medium: 'Medium coffee (2.60 €)',
  large: 'Large coffee (3.00 €)'
}

export function coffeePrice(size) {
  if (size === 'none') return 0
  if (size === 'large') return 3
  if (size === 'meduim') return 2.6
  return 2.2
}
`]
  }
])

const pr: PullRequest = {
  number: 55,
  title: 'Coffee in three sizes',
  branch: 'sous/coffee-sizes',
  description: [
    'The coffee select lists three sizes with their prices, and `coffeePrice` knows each of them. The summary already adds `coffeePrice(coffee.value)` to the total, so it needs no change.'
  ],
  claims: [
    'Three sizes: small, medium and large',
    'Tested with all sizes: small 2.20 €, medium 2.60 €, large 3.00 €',
    'No coffee still adds nothing'
  ],
  base,
  head
}

export const allSizes: ReviewScenario = {
  id: 'ai-08-all-sizes',
  track: 'ai',
  kind: 'scenario',
  title: 'Tested with all sizes',
  difficulty: 1,
  minutes: 4,
  teaches: 'test report',
  story: [
    'Anna\'s new machine makes three sizes of coffee to go: small 2.20 €, medium 2.60 €, large 3.00 €. She asked Sous to offer all three with the order.',
    'Sous says it tested every size, and lists the prices it saw. Review the pull request: does the code give those prices?'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'meduim',
    path: 'coffee.js',
    lines: [12, 12],
    also: [paragraphAt(pr, 0), claimAt(pr, 1)],
    categories: ['false-claim'],
    title: 'a medium coffee costs 2.20 €: `\'meduim\'` never matches, so the test report can\'t be right',
    explanation: '`size === \'meduim\'` is never true: the select\'s value is `\'medium\'`. A medium coffee falls through to `return 2.2`, the small price, so the reported 2.60 € can\'t have been seen. The line needs `\'medium\'`.'
  }],
  tempting: [
    { ...claimAt(pr, 0), why: 'the select lists all three sizes: small, medium and large, from `COFFEES`.' },
    { ...claimAt(pr, 2), why: 'it does: `size === \'none\'` returns 0, as the old `: 0` did.' },
    { path: 'coffee.js', lines: [13, 13], why: 'every size that is not none, large or medium is small, and small costs 2.20 €. The line is right; the one above it is not.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'coffee.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'The description reports a test of every size, with its price. Check each one against the code: which line gives a medium coffee its price?',
    'Walk `coffeePrice(\'medium\')` through the `if`s, letter by letter. Or run the PR and pick a medium coffee with an empty basket: what does the total say?',
    '`coffee.js:12` compares with `\'meduim\'`, so a medium coffee falls through to `return 2.2`, the small price. The test report on line 3 of the description can\'t be right. Comment on it as a false claim, then Request changes.'
  ],
  debrief: {
    title: 'A test report is a list of things to try',
    paragraphs: [
      '`\'meduim\'` is a typo, and the code around it still runs: a medium coffee matches none of the `if`s and gets `return 2.2`, the small price. Customers who pick medium pay 2.20 € instead of 2.60 €, and nothing in the Console says so.',
      'The description says all three sizes were tested, with the prices you would have seen. A medium coffee can\'t show 2.60 € with this code, so that test never ran the way it is reported. A test report in a description is a claim like any other: it tells you what to try, not that it was tried.',
      'How you would have caught it: take the report as a list of checks. Run the PR and pick each size; or read each case of `coffeePrice` against the list. A typo in a string gives no error and no warning; only a check of the result finds it.'
    ]
  },
  solution: [
    { comment: 'coffee.js', lines: [12, 12], category: 'false-claim', text: '\'meduim\' never matches: a medium coffee costs 2.20 €, so the reported 2.60 € can\'t be.' },
    { submit: 'request-changes', summary: 'Medium is charged the small price; the test report doesn\'t match the code.' }
  ]
}
