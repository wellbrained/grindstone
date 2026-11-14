// Scope and size 6.3: "Round to 5 cents". The till has no 1 and 2 cent coins, so Maya wants totals rounded to 5
// cents: one line in `basketTotal` would do. Sous rewrites pricing.js into three classes (Rounding, LineCalculator,
// BasketCalculator): 15 lines become 39, with `calculator.lines.total(line)` where `lines` is a LineCalculator (scope
// and unclear). And the rewrite drops a rule: the offices' 10 % off from ten items is gone, against “Every other price
// rule works as before” (a bug, on the removed lines or where the new `total` should apply it). Eleven croissants:
// main 23.76, This PR 26.40.
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const PRICING = `// Prices for the basket (Ben). Amounts are euros as plain numbers.
const BULK_FROM = 10
const BULK_DISCOUNT = 0.1

export function lineTotal(line) {
  return line.price * line.quantity
}

export function basketTotal(lines) {
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  // offices order by the dozen: 10 % off from ten items (Maya)
  if (count >= BULK_FROM) return total * (1 - BULK_DISCOUNT)
  return total
}
`

const CLASSES = `// Prices for the basket (Ben). Amounts are euros as plain numbers.
// Reworked into small classes, so each pricing rule is its own object and easy to swap (Sous).
export class Rounding {
  constructor(step) {
    this.step = step
  }

  apply(amount) {
    return Math.round(amount / this.step) * this.step
  }
}

export class LineCalculator {
  total(line) {
    return line.price * line.quantity
  }
}

export class BasketCalculator {
  constructor(lines, rounding) {
    this.lines = lines
    this.rounding = rounding
  }

  total(items) {
    const sum = items.reduce((total, line) => total + this.lines.total(line), 0)
    return this.rounding.apply(sum)
  }
}

const calculator = new BasketCalculator(new LineCalculator(), new Rounding(0.05))

export function lineTotal(line) {
  return calculator.lines.total(line)
}

export function basketTotal(lines) {
  return calculator.total(lines)
}
`

const SUMMARY = `// The basket's total under the products (Ben).
import { cart } from './cart.js'
import { formatPrice } from './money.js'
import { basketTotal } from './pricing.js'

const total = document.querySelector('#order-total')

export function renderSummary() {
  total.textContent = formatPrice(basketTotal(cart.lines))
}
`

const base = shopFiles(
  { 'app.js': SUMMARY_APP, 'pricing.js': PRICING, 'summary.js': SUMMARY },
  { main: ['<section class="summary" aria-label="Your basket">', '  <p>Total <strong id="order-total"></strong> €</p>', '</section>'] }
)

const head = withEdits(base, [{ path: 'pricing.js', replace: [PRICING, CLASSES] }])

const pr: PullRequest = {
  number: 98,
  title: 'Round totals to 5 cents',
  branch: 'sous/five-cents',
  description: [
    'The till has no 1 and 2 cent coins, so totals are rounded to 5 cents. I reworked pricing.js into small classes (Rounding, LineCalculator, BasketCalculator), so each rule is its own object and rounding is easy to change.'
  ],
  claims: [
    'Totals are rounded to 5 cents, for the till',
    'Every other price rule works as before',
    'Each rule can be tested on its own'
  ],
  base,
  head
}

export const fiveCents: ReviewScenario = {
  id: 'ai-28-five-cents',
  track: 'ai',
  kind: 'scenario',
  title: 'Round to 5 cents',
  difficulty: 2,
  minutes: 5,
  teaches: 'rewrite',
  story: [
    'The shop\'s till has no 1 and 2 cent coins, and Ben is tired of rounding by hand. Maya asked Sous to round basket totals to 5 cents.',
    'Before you read the diff, think how big the change should be. Then review what Sous sent, and run both sides with a basket an office would order.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'rewrite',
      path: 'pricing.js',
      lines: [2, 38],
      removed: [2, 3],
      also: [{ path: 'pricing.js', removed: [6, 6] }, { path: 'pricing.js', removed: [10, 11] }, { path: 'pricing.js', removed: [14, 14] }],
      categories: ['scope', 'unclear'],
      title: 'three classes where one line would do: the whole pricing module rewritten to round a total',
      explanation: 'Rounding to 5 cents is `Math.round(total * 20) / 20` on what `basketTotal` returns. Sous rewrote the module into three classes instead: 15 lines became 39, every caller now goes through objects nobody asked for, and `calculator.lines.total(line)` reads as if `lines` were the basket\'s lines.'
    },
    {
      id: 'lost-discount',
      path: 'pricing.js',
      removed: [12, 13],
      also: [{ path: 'pricing.js', lines: [25, 28] }, claimAt(pr, 1)],
      categories: ['bug', 'false-claim'],
      title: 'the bulk discount is gone: offices pay the full price from ten items',
      explanation: 'The old `basketTotal` took 10 % off from ten items. The new `total` adds up the lines and rounds, and nothing in the three classes knows the discount: an office\'s eleven croissants cost 26.40 € instead of 23.75 €.'
    }
  ],
  tempting: [
    { ...claimAt(pr, 0), why: 'they are: `Rounding(0.05)` rounds every total to 5 cents.' },
    { ...claimAt(pr, 2), why: 'true, each class can be tested alone. Nobody asked for it, though: the trouble is the size of the change, not this sentence.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'pricing.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'How many lines does rounding a total to 5 cents take? Compare that with the diff. Then run both sides with eleven croissants, an office\'s order.',
    'A rewrite has to keep every rule the old code had. Read the removed lines of `basketTotal` one by one: where did each one go?',
    'The classes are a rewrite where `Math.round(total * 20) / 20` would do: comment on them as scope (or unclear). And the removed `if (count >= BULK_FROM)` line has gone nowhere: comment on it as a bug. Then Request changes.'
  ],
  debrief: {
    title: 'Three classes for one line',
    paragraphs: [
      'Rounding to 5 cents is one line: `return Math.round(total * 20) / 20`. Sous rewrote the module instead: three classes, 15 lines become 39, and `calculator.lines.total(line)` to read where `lineTotal` was plain. Nobody can check in a minute that 39 lines do what 15 did, and nobody asked them to.',
      'They don\'t: the rewrite dropped the offices\' discount. The old `basketTotal` took 10 % off from ten items; none of the classes knows it. Eleven croissants cost 23.76 on main; on This PR 26.40, where the discount and the rounding would make it 23.75.',
      'How you would have caught it: size the change before you read it. When a one-line ask comes back as a rewrite, ask for the one line, and read the rewrite\'s removed lines as a checklist: every rule they hold must turn up again.'
    ]
  },
  solution: [
    { comment: 'pricing.js', lines: [3, 10], category: 'scope', text: 'Rounding is one line at the end of basketTotal: please drop the classes.' },
    { comment: 'pricing.js', removed: [12, 13], category: 'bug', text: 'The bulk discount is gone: ten items no longer get 10 % off.' },
    { submit: 'request-changes', summary: 'One line would do, and the rewrite lost the bulk discount.' }
  ]
}
