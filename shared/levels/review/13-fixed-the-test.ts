// Tests that lie 3.3: "fixed the failing test". Ben's till export showed 8.399999999999999, so Sous cut line totals
// to the cent with `Math.floor`: three pains au chocolat (839.9999999999999 cents) become 8.39 €. The test that said
// 8.40 € failed, and Sous changed the test, its name and its number, to 8.39 €. The diff shows the number changing; on
// main the pull request's test fails: main still gives 8.399999999999999, which shows as 8.40 (right). "Updated the test" and "All tests pass" hold (tempting).
import { LINE_TOTAL_SUMMARY, TOTAL_PAGE } from './11-all-tests-pass'
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const PRICES_JS = `// What a basket line costs. No page in here, so the tests can run it.
export function lineTotal(line) {
  return line.price * line.quantity
}
`

const PRICES_TEST = `// Tests for prices.js (run them in the Tests panel).
import { lineTotal } from './prices.js'

test('one croissant costs 2.40 €', () => {
  expect(lineTotal({ price: 2.4, quantity: 1 })).toBe(2.4)
})

test('three pains au chocolat cost 8.40 €', () => {
  expect(lineTotal({ price: 2.8, quantity: 3 })).toBeCloseTo(8.4)
})
`

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': LINE_TOTAL_SUMMARY, 'prices.js': PRICES_JS, 'prices.test.js': PRICES_TEST }, { main: TOTAL_PAGE })

const head = withEdits(base, [
  {
    path: 'prices.js',
    replace: [PRICES_JS, `// What a basket line costs, to the cent (the till's export showed 8.399999999999999, Ben).
export function lineTotal(line) {
  return Math.floor(line.price * line.quantity * 100) / 100
}
`]
  },
  {
    path: 'prices.test.js',
    replace: [`test('three pains au chocolat cost 8.40 €', () => {
  expect(lineTotal({ price: 2.8, quantity: 3 })).toBeCloseTo(8.4)
})`, `test('three pains au chocolat cost 8.39 €', () => {
  expect(lineTotal({ price: 2.8, quantity: 3 })).toBe(8.39)
})`]
  }
])

const pr: PullRequest = {
  number: 65,
  title: 'Line totals to the cent',
  branch: 'sous/whole-cents',
  description: [
    'Ben\'s till export showed `8.399999999999999` for three pains au chocolat. `lineTotal` now cuts every line total to whole cents.'
  ],
  claims: [
    'Line totals are rounded to the nearest cent',
    'Totals stay the same, only without the long decimals',
    'Updated the test for the rounded totals',
    'All tests pass'
  ],
  base,
  head
}

export const fixedTheTest: ReviewScenario = {
  id: 'ai-13-fixed-the-test',
  track: 'ai',
  kind: 'scenario',
  title: 'Fixed the failing test',
  difficulty: 2,
  minutes: 5,
  teaches: 'test bent to the bug',
  story: [
    'Ben sends the day\'s orders to the till every evening, and the export shows totals like 8.399999999999999. He asked Sous to keep line totals to the cent.',
    'A test failed after the change, and Sous made it pass. When a change breaks a test, one of the two is wrong: find out which before you read on. The Tests panel runs this pull request\'s tests on main\'s code too.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'floor',
      path: 'prices.js',
      lines: [3, 3],
      also: [claimAt(pr, 0), claimAt(pr, 1)],
      categories: ['bug', 'false-claim'],
      title: '`Math.floor` cuts 839.9999999999999 cents down: three pains au chocolat cost 8.39 €',
      explanation: '`2.8 * 3` is 8.399999999999999 in JavaScript, so `* 100` gives 839.9999999999999 cents, and `Math.floor` cuts that to 839: 8.39 €. Rounding to the nearest cent is `Math.round`, which gives 840. The total changes by a cent, against both claims.'
    },
    {
      id: 'bent-test',
      path: 'prices.test.js',
      lines: [8, 9],
      removed: [8, 9],
      categories: ['missing-test'],
      title: 'the failing test was changed to expect the bug: three pains au chocolat “cost 8.39 €”',
      explanation: 'The test said 8.40 €, which is what three pains au chocolat at 2.80 € cost, and it failed because the code got it wrong. Sous changed the test\'s name and number to what the code now does, so the bug is now “tested”. The test that would have caught it is gone.'
    }
  ],
  tempting: [
    { ...claimAt(pr, 2), why: 'Sous did update it, and says so. That is the problem, but it is in the test\'s diff: the number changed to what the code does, not to what three pains au chocolat cost.' },
    { ...claimAt(pr, 3), why: 'they do: Sous made sure of it. Passing tests say the code does what the tests say, and here the test was changed to say what the code does.' },
    { path: 'prices.test.js', lines: [5, 5], why: 'one croissant is 240 cents exactly, so the cut takes nothing off: 2.40 € is right.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'prices.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'A test changed in this pull request. When a change makes a test fail, which one should change: the code or the test? Run the PR\'s tests on main.',
    'The test now says three pains au chocolat cost 8.39 €. What do three at 2.80 € cost? Then look at `Math.floor` in `prices.js`.',
    '`prices.js:3` cuts `839.9999999999999` cents down to 8.39 € (`Math.floor`, not `Math.round`): a bug. And `prices.test.js:9` was changed to expect it: a missing test. Comment on both, then Request changes.'
  ],
  debrief: {
    title: 'When a test fails, ask which one is wrong',
    paragraphs: [
      '`2.8 * 3` is 8.399999999999999 in JavaScript; times 100 that is 839.9999999999999 cents, and `Math.floor` cuts it to 839. Rounding to the nearest cent is `Math.round`. The old test caught exactly this: it said 8.40 € and failed.',
      'Instead of fixing the code, Sous changed the test to what the code does now: its name and its number. The diff shows it (8.40 became 8.39), and the Tests panel proves it: on main\'s code the pull request\'s test fails, because main still gives 8.399999999999999, which shows as 8.40. A test changed to match new output is the change\'s own claim about what is right, and it needs a reason.',
      'How you would have caught it: when a pull request changes an expected value in a test, check the new value by hand (3 × 2.80 is 8.40) before you believe it, and ask why the old one was wrong.'
    ]
  },
  solution: [
    { comment: 'prices.js', lines: [3, 3], category: 'bug', text: 'Math.floor turns 839.9999999999999 cents into 8.39: this needs Math.round.' },
    { comment: 'prices.test.js', lines: [9, 9], category: 'missing-test', text: 'Three at 2.80 cost 8.40: the test was changed to match the bug.' },
    { submit: 'request-changes', summary: 'The code rounds down, and the test was changed to agree with it.' }
  ]
}
