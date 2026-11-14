// Steer the assistant 7.2: Maya's afternoon deal, three pains au chocolat for 7.50 €. The code is right; Sous's test
// for it is `expect(total)` with no matcher, so it checks nothing, and the description says it is tested. Named a
// missing test (or the claim a false claim), Sous adds the check. Named a bug, Sous "fixes the test" with
// `toBeDefined()`: it passes, and still checks nothing that matters; named unclear, it renames the test. Flag the deal's
// `Math.floor` (right: a deal needs three whole pastries) and Sous rounds instead, so two pains au chocolat cost 13.10 €,
// and the tests still pass.
import { LINE_TOTAL_SUMMARY, TOTAL_PAGE } from './11-all-tests-pass'
import { ORDER_PAGE, SUMMARY_APP, shopFiles, withEdits } from './shop'
import { steerScenario } from './steer'
import type { PullRequest } from './types'

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
// Pains au chocolat come in threes for 7.50 € (Maya's afternoon deal).
export const TRIO = 3
export const TRIO_PRICE = 7.5

export function lineTotal(line) {
  if (line.id !== 'pain-au-chocolat') return line.price * line.quantity
  const trios = Math.floor(line.quantity / TRIO)
  return trios * TRIO_PRICE + (line.quantity % TRIO) * line.price
}
`]
  },
  {
    path: 'prices.test.js',
    replace: [PRICES_TEST, `${PRICES_TEST}
test('three pains au chocolat cost 7.50 €', () => {
  const total = lineTotal({ id: 'pain-au-chocolat', price: 2.8, quantity: 3 })
  expect(total)
})
`]
  }
])

const pr: PullRequest = {
  number: 112,
  title: 'Afternoon deal: three pains au chocolat for 7.50 €',
  branch: 'sous/afternoon-deal',
  description: [
    'Adds Maya\'s afternoon deal to `lineTotal`, with a test in `prices.test.js`. All tests pass.'
  ],
  claims: [
    'Three pains au chocolat cost 7.50 €',
    'Tested: three cost 7.50 €'
  ],
  base,
  head
}

const NAME = 'test(\'three pains au chocolat cost 7.50 €\''
const CHECKED = { path: 'prices.test.js', replace: ['expect(total)\n', 'expect(total).toBe(7.5)\n'] } as const

export const afternoonDeal = steerScenario({
  id: 'ai-32-afternoon-deal',
  track: 'ai',
  kind: 'scenario',
  title: 'Tested, it says',
  difficulty: 2,
  minutes: 5,
  teaches: 'missing test, not bug',
  story: [
    'Maya has a new afternoon deal: “Three pains au chocolat for 7.50 €. And have Sous test it, please, I don\'t want to find out at the till.” Sous opened a pull request: the deal, and a test.',
    'Run the tests, read what they check, and steer Sous: your comments decide what its next commit changes. Approve it once it\'s right, by round 3.'
  ].join('\n\n'),
  pr,
  steer: {
    rounds: 3,
    start: ['no-check'],
    problems: [
      {
        id: 'no-check',
        at: { path: 'prices.test.js', text: 'expect(total)\n' },
        breaks: [1],
        categories: ['missing-test', 'false-claim'],
        title: '`expect(total)` has no matcher: the deal\'s test checks nothing',
        explanation: 'Without a matcher `expect` checks nothing, so the test passes whatever the deal costs (on main too, where three cost 8.40 €). The description says the deal is tested; it isn\'t. It needs `toBe(7.5)`.',
        fix: { edits: [CHECKED], reply: 'Added the check: `expect(total).toBe(7.5)`. It passes, and it fails on main, where three cost 8.40 €.' },
        misread: [
          {
            as: ['bug'],
            edits: [{ path: 'prices.test.js', replace: ['expect(total)\n', 'expect(total).toBeDefined()\n'] }],
            becomes: ['defined-only'],
            reply: 'Fixed the test: it now expects a total, with `toBeDefined()`. All tests pass.'
          },
          {
            as: ['unclear'],
            edits: [{ path: 'prices.test.js', replace: [NAME, 'test(\'the afternoon deal: three pains au chocolat cost 7.50 €\''] }],
            becomes: ['renamed-no-check'],
            reply: 'Renamed the test, so it says which deal it is about.'
          }
        ]
      },
      {
        id: 'defined-only',
        at: { path: 'prices.test.js', text: 'expect(total).toBeDefined()' },
        breaks: [1],
        categories: ['missing-test', 'false-claim'],
        title: '`toBeDefined()` passes for any number: the deal is still not tested',
        explanation: 'Any total is defined, 8.40 € too, so the test still passes whatever the deal costs. It needs the price: `toBe(7.5)`.',
        fix: { edits: [{ path: 'prices.test.js', replace: ['expect(total).toBeDefined()', 'expect(total).toBe(7.5)'] }], reply: 'Now it checks the price itself: `expect(total).toBe(7.5)`.' }
      },
      {
        id: 'renamed-no-check',
        at: { path: 'prices.test.js', text: 'expect(total)\n' },
        breaks: [1],
        categories: ['missing-test', 'false-claim'],
        title: 'a better name, and `expect(total)` still checks nothing',
        explanation: 'The name says what the test is about; the test still has no matcher, so it passes whatever the deal costs. It needs `toBe(7.5)`.',
        fix: { edits: [CHECKED], reply: 'Added the check the name promises: `expect(total).toBe(7.5)`.' }
      },
      {
        id: 'rounded-trios',
        at: { path: 'prices.js', text: 'Math.round(line.quantity / TRIO)' },
        categories: ['bug'],
        title: '`Math.round` counts two pains au chocolat as a deal: 13.10 € instead of 5.60 €',
        explanation: '`Math.round(2 / 3)` is 1, so two pastries get the deal and pay for two more on top. A deal needs three whole pastries: `Math.floor`. The tests still pass: they never try two.',
        fix: { edits: [{ path: 'prices.js', replace: ['Math.round(line.quantity / TRIO)', 'Math.floor(line.quantity / TRIO)'] }], reply: 'Back to `Math.floor`: a deal takes three whole pastries.' }
      }
    ],
    tempting: [
      {
        id: 'floor',
        at: { path: 'prices.js', text: 'Math.floor(line.quantity / TRIO)' },
        why: 'a deal needs three whole pastries: four are one deal and one at the full price, so rounding down is right.',
        overreach: {
          edits: [{ path: 'prices.js', replace: ['Math.floor(line.quantity / TRIO)', 'Math.round(line.quantity / TRIO)'] }],
          becomes: ['rounded-trios'],
          reply: 'Rounded the number of deals instead of flooring it.'
        }
      },
      { id: 'deal-claim', at: { claim: 0 }, why: 'it does: `lineTotal` makes three pains au chocolat one deal at 7.50 €.' }
    ]
  },
  run: { page: ORDER_PAGE, open: 'prices.js' },
  hints: [
    'Run the PR\'s tests on This PR and on main, and read what each one checks. Then think about what your comment asks Sous for.',
    '`expect(total)` has no matcher: the Tests panel says it ran no checks, and it passes on main too. The deal\'s code is right, so a bug comment sends Sous to fix something that isn\'t broken; what\'s missing is the check.',
    'Comment on `prices.test.js:14` as a missing test (or on the claim as a false claim), Request changes, and approve once the test checks `toBe(7.5)`.'
  ],
  debrief: {
    title: 'Ask for the check, not for a fix',
    paragraphs: [
      '`expect(total)` without a matcher checks nothing: the test passes whatever the deal costs, on main too. The code was right all along, so what the pull request lacks is a test that would fail without it, and “missing test” on that line asks for exactly that: `toBe(7.5)`.',
      'Call it a bug and Sous goes looking for something to fix: it “fixes the test” with `toBeDefined()`, which passes for 8.40 € as happily as for 7.50 €. Call it unclear and you get a better name on the same empty test. Flag `Math.floor`, which is right, and Sous rounds instead: two pains au chocolat cost 13.10 €, and every test still passes, because none tries two.',
      'How to steer a test: say what it should check, then run the new test on main as well. A test that passes there too doesn\'t check the change.'
    ]
  },
  solution: [
    { comment: 'prices.test.js', lines: [14, 14], category: 'missing-test', text: 'This checks nothing: add toBe(7.5), so it fails if the deal is wrong.' },
    { submit: 'request-changes', summary: 'The deal\'s test needs a real check.' },
    { submit: 'approve', summary: 'The test checks 7.50 € now.' }
  ]
})
