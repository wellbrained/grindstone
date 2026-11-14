// Read the diff 1.5: offices get 10 % off from 10 items, rounded to the cent (Maya). Sous keeps the percentage as 10 and
// multiplies by `1 - 10` (a unit slip: the total turns negative), and rounds to whole euros. `count < BULK_FROM` looks
// like 1.1's off-by-one and is right: the tempting false alarm.
import { SUMMARY } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { ReviewScenario } from './types'

const SUMMARY_JS = `// The basket summary: the total under the products.
import { basketTotal, itemCount } from './cart.js'
import { discountedTotal } from './discount.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

export function renderSummary() {
  const total = discountedTotal(basketTotal(), itemCount())
  totalText.textContent = formatPrice(total)
}
`

const DISCOUNT = `// Discounts on the whole basket. Prices are euros.

export function discountedTotal(total, count) {
  return total
}
`

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'discount.js': DISCOUNT }, { main: SUMMARY })

const head = withEdits(base, [
  {
    path: 'discount.js',
    replace: [`// Discounts on the whole basket. Prices are euros.

export function discountedTotal(total, count) {
  return total
}
`, `// Discounts on the whole basket. Prices are euros.
// Office orders: from 10 items, 10 % off the whole basket, rounded to the cent (Maya).
export const BULK_FROM = 10
export const BULK_DISCOUNT = 10 // percent

export function discountedTotal(total, count) {
  if (count < BULK_FROM) return total
  const discounted = total * (1 - BULK_DISCOUNT)
  return Math.round(discounted)
}
`]
  }
])

export const officeDiscount: ReviewScenario = {
  id: 'ai-05-office-discount',
  track: 'ai',
  kind: 'scenario',
  title: 'Ten percent for offices',
  difficulty: 2,
  minutes: 5,
  teaches: 'units',
  story: [
    'Offices order in bulk, and Maya wants to thank them: “From 10 items, 10 % off the whole basket. Round to the cent, please, the till does too.” She asked Sous.',
    'The pull request is a handful of lines in one file, and it has more than one problem. Review it, and run it with a basket of ten.'
  ].join('\n\n'),
  pr: {
    number: 48,
    title: 'Office discount: 10 % off from 10 items',
    branch: 'sous/office-discount',
    description: [
      'Adds the bulk discount Maya asked for. The threshold and the percentage are constants, so the shop can change them without touching the logic. The summary already passes the total and the item count through `discountedTotal`, so nothing else changes.'
    ],
    claims: [
      '10 % off from 10 items',
      'Smaller orders pay the full price',
      'Rounded to the cent'
    ],
    base,
    head
  },
  issues: [
    {
      id: 'percent-as-factor',
      path: 'discount.js',
      lines: [8, 8],
      categories: ['bug'],
      title: '`1 - BULK_DISCOUNT` is `1 - 10`: the total becomes minus nine times itself',
      explanation: '`BULK_DISCOUNT` is a percentage (10), and the line uses it as a share of 1. `total * (1 - 10)` is `-9 * total`: ten croissants come to −216 €. It needs `1 - BULK_DISCOUNT / 100`.'
    },
    {
      id: 'whole-euros',
      path: 'discount.js',
      lines: [9, 9],
      categories: ['bug', 'false-claim'],
      title: '`Math.round(discounted)` rounds to whole euros, not to the cent',
      explanation: '`Math.round` rounds to a whole number, so 21.60 € becomes 22 €. Rounding to the cent is `Math.round(discounted * 100) / 100`, as Maya asked and the description claims.'
    }
  ],
  tempting: [
    { path: 'discount.js', lines: [7, 7], why: '“from 10 items” means 10 get the discount, so only fewer than 10 pay the full price, and `count < BULK_FROM` says exactly that.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'discount.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Check every number in the new code against its unit: is it a count, euros, or a percentage? Then compare the rounding with what Maya asked for.',
    'Work it out for ten croissants (24.00 €): what is `1 - BULK_DISCOUNT`, and what does `Math.round` do to 21.60? Run the PR and add ten croissants to see the total.',
    '`discount.js:8` uses the percentage as a share (`1 - 10`, so the total goes negative) and `discount.js:9` rounds to whole euros. Comment on each as a bug, then Request changes.'
  ],
  debrief: {
    title: 'Ten is not a tenth',
    paragraphs: [
      '`BULK_DISCOUNT` is stored as a percentage, `10`, and the formula treats it as a share of 1: `total * (1 - 10)` is minus nine times the total. Ten croissants cost −216 €. The comment next to the constant even says “percent”; the line using it did not listen. Then `Math.round` rounds to whole euros: 21.60 € would have become 22 €, the cents Maya asked for gone.',
      '`if (count < BULK_FROM) return total` looks like the off-by-one from 1.1 and is right: “from 10 items” means ten get the discount, so only fewer than ten pay full price. Worth checking, not worth flagging.',
      'How you would have caught it: put a real number through every line, with its unit (24.00 € and 10 items here). Units are where assistants slip most: percent and share, euros and cents, grams and kilos. And try the boundary you were given: 9 items, then 10.'
    ]
  },
  solution: [
    { comment: 'discount.js', lines: [8, 8], category: 'bug', text: 'BULK_DISCOUNT is a percentage: 1 - 10 makes the total negative. Needs BULK_DISCOUNT / 100.' },
    { comment: 'discount.js', lines: [9, 9], category: 'bug', text: 'This rounds to whole euros. To the cent: Math.round(discounted * 100) / 100.' },
    { submit: 'request-changes', summary: 'The discount turns totals negative and drops the cents.' }
  ]
}
