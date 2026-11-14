// Tests that lie 3.4: "100 % coverage". Offices split the bill: `splitBill` rounds each share to the cent, so the shares
// of a total that doesn't divide evenly don't add up to it (6.50 € between three: 2.17 three times, 6.51 €). The tests
// run every line of split.js, so the coverage claim is true, but they only split totals that divide evenly. Coverage
// says what ran, not what was checked. Equal shares and the coverage claim hold (tempting places).
import { reviewGoals } from './checks'
import { claimAt } from './diff'
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
  {
    path: 'index.html',
    replace: ['      <p>Total <strong id="order-total"></strong> €</p>\n', '      <p>Total <strong id="order-total"></strong> €</p>\n      <p>Split between <select id="people" aria-label="People"><option>1</option><option selected>2</option><option>3</option><option>4</option></select>: <strong id="shares"></strong> €</p>\n']
  },
  {
    path: 'summary.js',
    replace: [SUMMARY_JS, `// The basket summary: the total under the products, and each colleague's share for the offices' expense forms.
import { basketTotal } from './cart.js'
import { formatPrice } from './money.js'
import { splitBill } from './split.js'

const totalText = document.querySelector('#order-total')
const people = document.querySelector('#people')
const sharesText = document.querySelector('#shares')

export function renderSummary() {
  const total = basketTotal()
  totalText.textContent = formatPrice(total)
  sharesText.textContent = splitBill(total, Number(people.value)).map(formatPrice).join(' + ')
}

people.addEventListener('change', renderSummary)
`]
  },
  {
    path: 'split.js',
    replace: ['', `// Splits a bill between colleagues for the offices' expense forms (Jonas).
export function splitBill(total, people) {
  const share = Math.round(total / people * 100) / 100
  return Array.from({ length: people }, () => share)
}
`]
  },
  {
    path: 'split.test.js',
    replace: ['', `// Tests for split.js: every line runs (100 % coverage).
import { splitBill } from './split.js'

test('splits 9.00 € between three', () => {
  expect(splitBill(9, 3)).toEqual([3, 3, 3])
})

test('one person pays it all', () => {
  expect(splitBill(4.8, 1)).toEqual([4.8])
})
`]
  }
])

const pr: PullRequest = {
  number: 67,
  title: 'Split the bill between colleagues',
  branch: 'sous/split-bill',
  description: [
    'Offices split the bill for their expense forms. `splitBill` gives everyone the same share, rounded to the cent, and the summary lists the shares under the total.'
  ],
  claims: [
    'Everyone pays the same share',
    'The shares always add up to the total',
    '100 % test coverage: every line of `split.js` runs in the tests'
  ],
  base,
  head
}

export const fullCoverage: ReviewScenario = {
  id: 'ai-14-full-coverage',
  track: 'ai',
  kind: 'scenario',
  title: '100 % coverage',
  difficulty: 2,
  minutes: 5,
  teaches: 'untested edge',
  story: [
    'Jonas\'s colleagues pay for their own breakfast and fill in their expense forms with their share. He asked Sous to split the bill between up to four people.',
    'Sous proudly reports full test coverage. Coverage counts the lines a test ran, not what it checked: look at which cases the tests try, and try the one they don\'t, in the shop.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'lost-cent',
      path: 'split.js',
      lines: [3, 3],
      also: [claimAt(pr, 1)],
      categories: ['bug', 'false-claim'],
      title: 'each share is rounded on its own: 6.50 € between three is 2.17 € three times, 6.51 €',
      explanation: 'A total that doesn\'t divide evenly leaves a remainder, and rounding every share the same way loses or adds it: 6.50 € / 3 is 2.1666…, each share rounds to 2.17 €, and the three come to 6.51 €. One share has to take the difference (2.16 € here).'
    },
    {
      id: 'untested-edge',
      path: 'split.test.js',
      lines: [4, 10],
      categories: ['missing-test'],
      title: 'the tests only split totals that divide evenly: no case where rounding matters',
      explanation: '9.00 € between three and 4.80 € for one divide evenly, so rounding never comes into it. Both tests run every line of `split.js`, which is the 100 % coverage, and neither tries the case the function exists for: a total that doesn\'t split.'
    }
  ],
  tempting: [
    { ...claimAt(pr, 2), why: 'it is true: both tests run every line of `split.js`. Coverage says which lines ran, not which cases were checked, so it is the tests\' cases to point at, not the claim.' },
    { ...claimAt(pr, 0), why: 'it is: every share is the same rounded number. That is the cause of the lost cent, but the claim itself holds.' },
    { path: 'split.js', lines: [4, 4], why: 'one share per person, all the same: that part does what it says.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'split.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Coverage tells you which lines ran, not which cases were checked. Which totals do the tests split? Think of one that doesn\'t divide by three.',
    'Run the PR: add one sourdough loaf (6.50 €) and split it between 3. Add the shares up.',
    '`split.js:3` rounds each share on its own, so 6.50 € between three is 2.17 € three times, 6.51 €: a bug against “The shares always add up to the total”. The tests from `split.test.js:4` on only split totals that divide evenly: a missing test. Comment on both, then Request changes.'
  ],
  debrief: {
    title: 'Coverage counts lines, not cases',
    paragraphs: [
      '6.50 € between three is 2.1666… each; rounding every share to the cent makes 2.17 € three times, 6.51 €, a cent more than the bill. Splitting money needs one share to take the remainder. The claim “The shares always add up to the total” is what breaks.',
      'The tests run every line of `split.js`, so the 100 % coverage is true, and it means little: both tests split totals that divide evenly, the one kind of total where rounding can\'t go wrong. A test suite earns trust with the cases it tries, not the lines it touches.',
      'How you would have caught it: ask what could go wrong (here, rounding) and look for the test that tries it. When there is none, try it yourself: in the shop, one loaf, three people.'
    ]
  },
  solution: [
    { comment: 'split.js', lines: [3, 3], category: 'bug', text: '6.50 between three is 2.17 three times: 6.51. One share has to take the remainder.' },
    { comment: 'split.test.js', lines: [5, 5], category: 'missing-test', text: 'Only totals that divide evenly: no test where rounding matters.' },
    { submit: 'request-changes', summary: 'The shares can be a cent off, and no test tries a total that doesn\'t divide.' }
  ]
}
