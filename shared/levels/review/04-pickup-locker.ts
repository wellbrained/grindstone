// Read the diff 1.4: Jonas set up a pickup locker and wants it as a third way to get an order, free like pickup. Sous
// adds it to the list and rewrites deliveryFee as a switch, without a case for it: the fee is undefined and the total
// says NaN. The old `if` gave every unknown way the delivery fee; the switch gives none.
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const DELIVERY = `// How the customer gets the order, and what that costs on top (euros).
export const METHODS = {
  pickup: 'Pick up in the shop',
  delivery: 'Delivery by bike (3.50 €)'
}

export function deliveryFee(method) {
  if (method === 'pickup') return 0
  return 3.5
}
`

const SUMMARY_JS = `// The basket summary: how the customer gets the order, and the total with what that costs.
import { basketTotal } from './cart.js'
import { METHODS, deliveryFee } from './delivery.js'
import { formatPrice } from './money.js'

const method = document.querySelector('#method')
const totalText = document.querySelector('#order-total')

for (const [value, label] of Object.entries(METHODS)) {
  method.append(new Option(label, value))
}
method.addEventListener('change', () => renderSummary())

export function renderSummary() {
  const total = basketTotal() + deliveryFee(method.value)
  totalText.textContent = formatPrice(total)
}
`

const PAGE = [
  '<section class="summary" aria-label="Your basket">',
  '  <p><label>How you get it <select id="method"></select></label></p>',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '</section>'
]

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'delivery.js': DELIVERY }, { main: PAGE })

const head = withEdits(base, [
  { path: 'delivery.js', replace: ['  delivery: \'Delivery by bike (3.50 €)\'\n', '  delivery: \'Delivery by bike (3.50 €)\',\n  locker: \'Pickup locker at the station (Mühlenweg 4, open around the clock)\'\n'] },
  {
    path: 'delivery.js',
    replace: ['  if (method === \'pickup\') return 0\n  return 3.5\n', `  switch (method) {
    case 'pickup':
      return 0
    case 'delivery':
      return 3.5
  }
`]
  }
])

const pr: PullRequest = {
  number: 46,
  title: 'Add the station locker as a way to get an order',
  branch: 'sous/pickup-locker',
  description: [
    'Adds the station\'s pickup locker next to pickup and delivery. `deliveryFee` is a `switch` now, so every way is listed once and the next one is easy to add.'
  ],
  claims: [
    'Three ways to get an order: the shop, delivery and the locker',
    'The locker is free, like pickup',
    'Delivery still costs 3.50 €'
  ],
  base,
  head
}

export const pickupLocker: ReviewScenario = {
  id: 'ai-04-pickup-locker',
  track: 'ai',
  kind: 'scenario',
  title: 'A third way to get your order',
  difficulty: 2,
  minutes: 4,
  teaches: 'missing case',
  story: [
    'Jonas set up a pickup locker at the station, open around the clock. He asked Sous: “Add the locker as a third way to get an order. It\'s free, like picking up in the shop.”',
    'Sous added it and tidied the fee code while it was there. Review the pull request, and run it: the select under the products is where customers choose.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'no-locker-case',
    path: 'delivery.js',
    lines: [9, 14],
    also: [{ path: 'delivery.js', lines: [5, 5] }, paragraphAt(pr, 0), claimAt(pr, 1)],
    categories: ['bug', 'false-claim'],
    title: '`deliveryFee` has no case for the locker, so its fee is `undefined`',
    explanation: 'The `switch` covers pickup and delivery only: for `\'locker\'` no case matches and the function returns `undefined`. `basketTotal() + undefined` is `NaN`, so the total reads “NaN €”. It needs `case \'locker\':` next to pickup (and a `default` that says what happens to a way nobody handled).'
  }],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'delivery.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'The pull request adds a new value. Follow it: everywhere the code decides something by the way an order is picked up, does it know the new one?',
    'Walk `deliveryFee(\'locker\')` through the new `switch`: which case runs, and what does the function return when none does? Then run the PR and choose the locker.',
    'The `switch` in `delivery.js:9` to `delivery.js:14` has no `case \'locker\'`, so the fee is `undefined` and the total `NaN`. Comment on the switch as a bug, then Request changes.'
  ],
  debrief: {
    title: 'A new value, and one place that never heard of it',
    paragraphs: [
      'The locker is in `METHODS`, so it shows in the select. But `deliveryFee` has no case for it: no case matches, the `switch` ends, and a function that reaches its end returns `undefined`. `basketTotal() + undefined` is `NaN`, and the page says “Total NaN €”.',
      'The tidy-up made it worse in a quiet way. The old `if` charged every way it did not know 3.50 €, wrong but a number; the `switch` without a `default` returns nothing at all. And no `break` is missing: each case returns, so nothing falls through.',
      'How you would have caught it: when a pull request adds a value to a list, search the diff (and the code) for every place that decides by that list, and walk the new value through each one. Or run it and pick the new option.'
    ]
  },
  solution: [
    { comment: 'delivery.js', lines: [9, 14], category: 'bug', text: 'No case for \'locker\': deliveryFee returns undefined and the total is NaN.' },
    { submit: 'request-changes', summary: 'The locker has no fee case.' }
  ]
}
