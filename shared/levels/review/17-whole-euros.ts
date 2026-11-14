// Invented APIs 4.2: whole euros. Maya's paper menu writes whole euros without decimals (the rye loaf costs 5), and
// she wants the page to match. Sous moves `formatPrice` to `Intl.NumberFormat` with `hideTrailingZeros: true`, an
// option Intl doesn't have: it is ignored without an error, so the rye loaf still shows 5.00, as on main. The real
// option is `trailingZeroDisplay: 'stripIfInteger'`. `minimumFractionDigits` and `useGrouping: false` are real and
// right (tempting).
import { MONEY, PRODUCTS, orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

/** Today's products with a loaf at a whole-euro price (before the sourdough, so it shows without scrolling the app). */
const PRODUCTS_WITH_RYE = PRODUCTS.replace('  { id: \'sourdough\'', '  { id: \'rye\', name: \'Rye loaf\', price: 5 },\n  { id: \'sourdough\'')

const base = orderSite({ 'products.js': PRODUCTS_WITH_RYE })

const head = withEdits(base, [
  {
    path: 'money.js',
    replace: [MONEY, `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
// Whole euros without decimals, as on the paper menu: 5, not 5.00 (Maya).
const euros = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  useGrouping: false,
  hideTrailingZeros: true
})

export function formatPrice(amount) {
  return euros.format(amount)
}
`]
  }
])

const pr: PullRequest = {
  number: 72,
  title: 'Whole euros without decimals',
  branch: 'sous/whole-euros',
  description: [
    'Maya\'s paper menu writes whole euros without decimals, and she wants the page to match.'
  ],
  claims: [
    'Whole euros show without decimals: the rye loaf costs 5',
    'Every other price keeps its two decimals: 2.40',
    'No thousands separator, as before',
    'Uses the browser\'s own `Intl.NumberFormat`, no library'
  ],
  base,
  head
}

export const wholeEuros: ReviewScenario = {
  id: 'ai-17-whole-euros',
  track: 'ai',
  kind: 'scenario',
  title: 'Whole euros',
  difficulty: 1,
  minutes: 4,
  teaches: 'ignored option',
  story: [
    'The new rye loaf costs exactly 5 euros, and the page says 5.00. Maya\'s paper menu says 5, and she asked Sous to make the page match: whole euros without decimals, every other price as it is.',
    'Run the PR and look at the price the change is about. Not every invented API throws.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'ignored-option',
    path: 'money.js',
    lines: [6, 6],
    also: [claimAt(pr, 0)],
    categories: ['invented-api', 'false-claim'],
    title: '`Intl.NumberFormat` has no `hideTrailingZeros` option: it is ignored, and the rye loaf still shows 5.00',
    explanation: 'Intl reads only the options it knows and ignores the rest, without an error. The real option is `trailingZeroDisplay: \'stripIfInteger\'`, which shows 5 and keeps 2.40.'
  }],
  tempting: [
    { path: 'money.js', lines: [4, 4], why: 'it is real and needed: at least two decimals keeps 2.40 from becoming 2.4. Whole euros lose them only with the option that drops .00, which this one isn\'t.' },
    { path: 'money.js', lines: [5, 5], why: '`useGrouping` is real: without it Intl writes 1,234.50, and `toFixed` never did, so this keeps big office totals as they were.' },
    { ...claimAt(pr, 1), why: 'it does: 2.40, 2.80 and 6.50 keep their two decimals.' },
    { ...claimAt(pr, 3), why: 'it does: `Intl.NumberFormat` is built into every browser.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'money.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR and read the rye loaf\'s price. Then switch to main. Did anything change?',
    'The Console shows no error: `Intl.NumberFormat` doesn\'t complain about an option it doesn\'t know, it ignores it. Which of the three options is one Intl doesn\'t have?',
    '`money.js:6` (`hideTrailingZeros: true`) is an option Intl doesn\'t have, so it does nothing; the real one is `trailingZeroDisplay: \'stripIfInteger\'`. Comment on it as an invented API, then Request changes.'
  ],
  debrief: {
    title: 'Unknown options are ignored',
    paragraphs: [
      '`hideTrailingZeros` sounds exactly like what Maya wants, but `Intl.NumberFormat` has no such option. An options object can hold anything, and Intl reads only the options it knows, so the made-up one is dropped without an error: the rye loaf still shows 5.00, on this pull request as on main.',
      'The real option has a less obvious name: `trailingZeroDisplay: \'stripIfInteger\'` shows 5 and keeps 2.40. The other two are real and right: `minimumFractionDigits: 2` keeps the two decimals, `useGrouping: false` keeps 1234.50 from becoming 1,234.50.',
      'How you would have caught it: run it and look at the one price the change is about. When nothing changed and nothing failed, suspect an option that was ignored: a formatter\'s `resolvedOptions()` lists every option it took, and a made-up one is never among them.'
    ]
  },
  solution: [
    { comment: 'money.js', lines: [6, 6], category: 'invented-api', text: 'Intl has no hideTrailingZeros, so it is ignored: still 5.00. trailingZeroDisplay: \'stripIfInteger\' is the real option.' },
    { submit: 'request-changes', summary: 'The option doesn\'t exist, so whole euros still show 5.00.' }
  ]
}
