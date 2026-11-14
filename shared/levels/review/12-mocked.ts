// Tests that lie 3.2: "mocked the thing under test". The office discount goes live in `pricing.applyDiscount`, and
// Sous's test spies on that very function, tells it to return 21.6 and checks that it returns 21.6: it never runs the
// code. It passes on main too, where nothing is discounted. And the code is wrong as well: `count > BULK_FROM` starts
// the discount at eleven items, so ten pay the full 24.00 €. The discount's maths and smaller orders hold (tempting).
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const SUMMARY_JS = `// The basket summary: the total under the products, with the office discount.
import { basketTotal, itemCount } from './cart.js'
import { pricing } from './discount.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

export function renderSummary() {
  totalText.textContent = formatPrice(pricing.applyDiscount(basketTotal(), itemCount()))
}
`

const DISCOUNT_JS = `// The office discount, as the till calls it (pricing.applyDiscount). Not live yet: every order pays the full price.
export const pricing = {
  applyDiscount(total, count) {
    return total
  }
}
`

const DISCOUNT_TEST = `// Tests for discount.js.
import { pricing } from './discount.js'

test('small orders pay the full price', () => {
  expect(pricing.applyDiscount(4.8, 2)).toBe(4.8)
})
`

const PAGE = [
  '<section class="summary" aria-label="Your basket">',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'discount.js': DISCOUNT_JS, 'discount.test.js': DISCOUNT_TEST }, { main: PAGE })

const head = withEdits(base, [
  {
    path: 'discount.js',
    replace: [DISCOUNT_JS, `// The office discount, as the till calls it (pricing.applyDiscount): 10 % off orders of ten items or more (Jonas).
export const BULK_FROM = 10
export const BULK_DISCOUNT = 0.1

export const pricing = {
  applyDiscount(total, count) {
    if (count > BULK_FROM) return total * (1 - BULK_DISCOUNT)
    return total
  }
}
`]
  },
  {
    path: 'discount.test.js',
    replace: [DISCOUNT_TEST, `${DISCOUNT_TEST}
test('ten items get 10 % off', () => {
  vi.spyOn(pricing, 'applyDiscount').mockReturnValue(21.6)
  expect(pricing.applyDiscount(24, 10)).toBe(21.6)
})
`]
  }
])

const pr: PullRequest = {
  number: 63,
  title: 'Turn on the office discount',
  branch: 'sous/office-discount',
  description: [
    'Turns on the office discount Jonas asked for. `applyDiscount` was a placeholder that took nothing off; the summary already calls it.'
  ],
  claims: [
    'Orders of ten items or more get 10 % off',
    'Smaller orders pay the full price, as before',
    'Tested: a new test checks that ten items get 10 % off'
  ],
  base,
  head
}

export const mocked: ReviewScenario = {
  id: 'ai-12-mocked',
  track: 'ai',
  kind: 'scenario',
  title: 'Mocked the thing under test',
  difficulty: 2,
  minutes: 5,
  teaches: 'mocked',
  story: [
    'Jonas buys breakfast for his whole office and asked for the discount the shop promised: 10 % off orders of ten items or more. The till already calls `pricing.applyDiscount`, which so far gave nothing off.',
    'Sous wrote it, with a test. A mock stands in for something the code talks to; here, look at what it stands in for. Run the tests on This PR and on main, and run the shop with ten croissants.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'mocked',
      path: 'discount.test.js',
      lines: [8, 11],
      also: [claimAt(pr, 2)],
      categories: ['missing-test', 'false-claim'],
      title: 'the test replaces `applyDiscount` with a mock that returns 21.6, then checks the mock',
      explanation: '`vi.spyOn(pricing, \'applyDiscount\').mockReturnValue(21.6)` swaps the function under test for a stand-in that answers 21.6, and the next line checks that it answers 21.6. The real `applyDiscount` never runs, so the test passes whatever it does, on main too, where nothing is discounted.'
    },
    {
      id: 'from-eleven',
      path: 'discount.js',
      lines: [7, 7],
      also: [claimAt(pr, 0)],
      categories: ['bug', 'false-claim'],
      title: 'the discount starts at eleven items: `count > BULK_FROM` leaves out exactly ten',
      explanation: '`count > BULK_FROM` is false for ten items, so an order of ten croissants pays the full 24.00 € instead of 21.60 €. “Ten items or more” is `count >= BULK_FROM`. A test that ran the real function with ten items would have failed.'
    }
  ],
  tempting: [
    { path: 'discount.js', lines: [2, 3], why: 'ten items and 0.1, a share: `1 - BULK_DISCOUNT` keeps 90 % of the total. The maths is right; where it starts is not.' },
    { path: 'discount.js', lines: [8, 8], why: 'smaller orders pay the full total, as before.' },
    { ...claimAt(pr, 1), why: 'they do: below the limit `applyDiscount` returns the total unchanged, and the old test still checks it.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'discount.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Two things to check: does the discount start at ten, and does the new test prove it? Run the PR\'s tests on This PR and on main, then add ten croissants in the shop.',
    'The new test passes on main too, where nothing is discounted. What does `mockReturnValue(21.6)` make `pricing.applyDiscount` return? And for exactly ten items, is `count > BULK_FROM` true?',
    '`discount.test.js:9` replaces `applyDiscount` with a mock that returns 21.6, and the next line checks the mock: a missing test. `discount.js:7` gives the discount from eleven items: a bug. Comment on both, then Request changes.'
  ],
  debrief: {
    title: 'A test of a mock tests the mock',
    paragraphs: [
      'The new test spies on `pricing.applyDiscount`, tells the spy to answer 21.6, and checks that it answers 21.6. The function the pull request changed never runs: the test would pass with any code, and it does pass on main, where nothing is discounted. That makes “Tested: a new test checks that ten items get 10 % off” false.',
      'Meanwhile the real code starts the discount one item late: `count > BULK_FROM` is false for ten, so ten croissants cost 24.00 €. A test that called the real function with ten items would have caught it at once. Mocks are for what the code talks to (the till, the network, the clock), never for the code under test.',
      'How you would have caught it: in a test, find the line that calls the code being changed, and check it isn\'t a stand-in. Then try the edge the description names: ten items, in the shop.'
    ]
  },
  solution: [
    { comment: 'discount.test.js', lines: [9, 9], category: 'missing-test', text: 'This mocks applyDiscount and then tests the mock: the real function never runs.' },
    { comment: 'discount.js', lines: [7, 7], category: 'bug', text: 'Ten items get no discount: this needs >=.' },
    { submit: 'request-changes', summary: 'The test checks a mock, and ten items pay the full price.' }
  ]
}
