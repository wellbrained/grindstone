// Tests that lie 3.1: "all tests pass". Maya's half-dozen deal, six croissants for 12.00 €, in `lineTotal`. The code is
// right; the test Sous added for it is `expect(total)` with no matcher, so it checks nothing: it passes on main too,
// where six croissants cost 14.40 €. The Tests panel shows it (no checks, and green on main). The deal's maths and
// "All tests pass" hold (tempting places).
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

/** The summary under the products: the basket's total, line by line from `lineTotal` (prices.js, which the tests run). */
export const LINE_TOTAL_SUMMARY = `// The basket summary: the total under the products.
import { cart } from './cart.js'
import { lineTotal } from './prices.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

export function renderSummary() {
  totalText.textContent = formatPrice(cart.lines.reduce((sum, line) => sum + lineTotal(line), 0))
}
`

/** The basket's total under the products. */
export const TOTAL_PAGE = [
  '<section class="summary" aria-label="Your basket">',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const PRICES_JS = `// What a basket line costs. No page in here, so the tests can run it.
export function lineTotal(line) {
  return line.price * line.quantity
}
`

const PRICES_TEST = `// Tests for prices.js (run them in the Tests panel).
import { lineTotal } from './prices.js'

test('one croissant costs 2.40 €', () => {
  expect(lineTotal({ id: 'croissant', price: 2.4, quantity: 1 })).toBe(2.4)
})

test('two loaves cost 13.00 €', () => {
  expect(lineTotal({ id: 'sourdough', price: 6.5, quantity: 2 })).toBe(13)
})
`

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': LINE_TOTAL_SUMMARY, 'prices.js': PRICES_JS, 'prices.test.js': PRICES_TEST }, { main: TOTAL_PAGE })

const head = withEdits(base, [
  {
    path: 'prices.js',
    replace: [PRICES_JS, `// What a basket line costs. No page in here, so the tests can run it.
// Croissants come in Maya's half-dozen deal: every six cost 12.00 €.
export const HALF_DOZEN = 6
export const HALF_DOZEN_PRICE = 12

export function lineTotal(line) {
  if (line.id !== 'croissant') return line.price * line.quantity
  const deals = Math.floor(line.quantity / HALF_DOZEN)
  const rest = line.quantity % HALF_DOZEN
  return deals * HALF_DOZEN_PRICE + rest * line.price
}
`]
  },
  {
    path: 'prices.test.js',
    replace: [PRICES_TEST, `${PRICES_TEST}
test('six croissants cost 12.00 €', () => {
  const total = lineTotal({ id: 'croissant', price: 2.4, quantity: 6 })
  expect(total)
})
`]
  }
])

const pr: PullRequest = {
  number: 61,
  title: 'Half-dozen deal on croissants',
  branch: 'sous/half-dozen',
  description: [
    'Adds Maya\'s half-dozen deal to `lineTotal`: every six croissants cost 12.00 €, the ones left over 2.40 € each. Other products are worked out as before.'
  ],
  claims: [
    'Six croissants cost 12.00 €, and so does every further six',
    'Fewer than six croissants cost 2.40 € each, as before',
    'Tested: a new test checks that six croissants cost 12.00 €',
    'All tests pass'
  ],
  base,
  head
}

export const allTestsPass: ReviewScenario = {
  id: 'ai-11-all-tests-pass',
  track: 'ai',
  kind: 'scenario',
  title: 'All tests pass',
  difficulty: 1,
  minutes: 4,
  teaches: 'no assertion',
  story: [
    'Maya wants a deal for the office crowd: six croissants for 12.00 €. Sous wrote it, added a test for it, and says all tests pass.',
    'This chapter is about the tests in a pull request. Run the PR: its Tests panel runs the tests on this pull request\'s code, and on main\'s. A test that passes on both can\'t be the one that checks the change.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'no-assertion',
    path: 'prices.test.js',
    lines: [12, 15],
    also: [claimAt(pr, 2)],
    categories: ['missing-test', 'false-claim'],
    title: 'the new test calls `expect(total)` with no matcher: it checks nothing',
    explanation: '`expect(total)` on its own compares `total` with nothing: without a matcher such as `.toBe(12)` no check runs, so the test passes whatever the deal costs, on main (14.40 €) as on this pull request. The deal is right, but nothing proves it, and the description says a test does.'
  }],
  tempting: [
    { path: 'prices.js', lines: [8, 10], why: 'the deal is right: seven croissants are one deal and one at 2.40 €, `12 + 2.4`, 14.40 €. Run the PR and add seven.' },
    { path: 'prices.js', lines: [7, 7], why: 'other products keep `price * quantity`, as before.' },
    { ...claimAt(pr, 3), why: 'they do, on main too: that is the trouble. A test that passes where six croissants cost 14.40 € can\'t be the one that checks the deal.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'prices.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'All tests pass, and Sous says one of them checks the deal. Run the PR and look at the Tests panel: how many checks did each test make?',
    'Read the new test: what does `expect(total)` compare `total` with? Then run the tests on main, where six croissants cost 14.40 €.',
    '`prices.test.js:14` is `expect(total)` with no matcher: it checks nothing, so the test passes whatever the deal costs. Comment on it as a missing test, then Request changes.'
  ],
  debrief: {
    title: 'An expect without a matcher checks nothing',
    paragraphs: [
      '`expect(total)` only wraps the value: the check is the matcher after it, `.toBe(12)`. Without one, nothing is compared, and the test passes whatever `lineTotal` returns. The Tests panel says so: the new test passed with no checks, and it passes on main too, where six croissants cost 14.40 €.',
      'The deal itself is right, which is why this is a missing test and not a bug: the code may well work, but nothing proves it, and the description\'s “a new test checks that six croissants cost 12.00 €” is false. Ask for the matcher, and for the case that would catch a slip: seven croissants, 14.40 €.',
      'How you would have caught it: for each new test, find the line that would make it fail. Then run it against main: a test of a change that passes without the change tests nothing.'
    ]
  },
  solution: [
    { comment: 'prices.test.js', lines: [14, 14], category: 'missing-test', text: 'expect(total) has no matcher: this test checks nothing. It needs .toBe(12).' },
    { submit: 'request-changes', summary: 'The new test passes on main too: it checks nothing.' }
  ]
}
