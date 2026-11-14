// Practice tasks for Read the diff (ADR 0008): two per scenario, about 30 s each, one small file. "Spot it": the pull
// request has one problem, comment on it and request changes. "Verdict": is it fine? Approve it or request changes, with
// a one-line reason (the review's summary); two of them are fine and should be approved.
import { reviewGoals } from '../checks'
import { emptyReview } from '../shop'
import type { PlantedIssue, PullRequest, ReviewPracticeTask, ReviewStep, TemptingSpot } from '../types'

interface TaskSpec {
  id: string
  practises: string
  title: string
  task: string
  pr: PullRequest
  issues: readonly PlantedIssue[]
  tempting?: readonly TemptingSpot[]
  hint: string
  why: string
  solution: ReviewStep[]
  difficulty?: 1 | 2
}

/** A "spot it" task: one planted issue; find it and request changes. */
function spotIt(spec: TaskSpec): ReviewPracticeTask {
  return {
    track: 'ai',
    kind: 'practice',
    difficulty: spec.difficulty ?? 1,
    minutes: 0.5,
    id: spec.id,
    practises: spec.practises,
    title: spec.title,
    task: spec.task,
    pr: spec.pr,
    issues: spec.issues,
    ...(spec.tempting ? { tempting: spec.tempting } : {}),
    verdict: 'request-changes',
    setup: emptyReview,
    goals: reviewGoals({ issues: spec.issues.length }),
    hints: [spec.hint],
    why: spec.why,
    solution: spec.solution
  }
}

/** A "verdict" task: fine (no issue: approve) or not (request changes on it), always with a one-line reason. */
function verdict(spec: TaskSpec): ReviewPracticeTask {
  return {
    ...spotIt(spec),
    verdict: spec.issues.length ? 'request-changes' : 'approve',
    reason: true,
    goals: reviewGoals({ issues: spec.issues.length, verdictTask: true })
  }
}

const VERDICT_TASK = 'Is this pull request fine? Approve it or request changes (on the line that is wrong), and say why in one line.'

export const openDays = spotIt({
  id: 'ai-practice-open-days',
  practises: 'ai-01-twelve-croissants',
  title: 'Open Tuesday to Sunday',
  task: 'Sous builds the header\'s opening days from the list of days. One line is off by one: comment on it and request changes.',
  pr: {
    number: 42,
    title: 'Build the opening days from the list of days',
    branch: 'sous/open-days',
    description: ['The header lists the days we are open instead of a fixed text, so a change of days is one edit.'],
    claims: ['The header says the shop is open Tuesday to Sunday'],
    base: {
      'hours.js': `// The opening days for the header. We are closed on Mondays.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function openDaysText() {
  return 'Open Tuesday to Sunday'
}
`
    },
    head: {
      'hours.js': `// The opening days for the header. We are closed on Mondays.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// every day but Monday
export const OPEN_DAYS = DAYS.slice(1, 6)

export function openDaysText() {
  return \`Open \${OPEN_DAYS.join(', ')}\`
}
`
    }
  },
  issues: [{
    id: 'slice-end',
    path: 'hours.js',
    lines: [5, 5],
    categories: ['bug', 'false-claim'],
    title: '`DAYS.slice(1, 6)` stops before Sunday',
    explanation: 'The end of a slice is not included: `slice(1, 6)` is Tuesday to Saturday. `DAYS.slice(1)` takes every day from Tuesday on.'
  }],
  hint: '`slice(start, end)` includes `start` and stops before `end`. Which day sits at index 6?',
  why: '`slice(1, 6)` stops before index 6, Sunday: a slice\'s end is not included. `DAYS.slice(1)` keeps every day from Tuesday on.',
  solution: [
    { comment: 'hours.js', lines: [5, 5], category: 'bug', text: 'slice(1, 6) stops before Sunday.' },
    { submit: 'request-changes' }
  ]
})

export const sameLoop = verdict({
  id: 'ai-practice-same-loop',
  practises: 'ai-01-twelve-croissants',
  title: 'The same loop, easier to read',
  task: VERDICT_TASK,
  pr: {
    number: 45,
    title: 'Write the receipt loop the usual way',
    branch: 'sous/receipt-loop',
    description: ['No change in behaviour: `i < lines.length` instead of `i <= lines.length - 1`, the way the rest of the code writes its loops.'],
    claims: ['The receipt total stays the same'],
    base: {
      'receipt.js': `// The receipt's total: every line's price times its quantity.
export function receiptTotal(lines) {
  let total = 0
  for (let i = 0; i <= lines.length - 1; i++) {
    total += lines[i].price * lines[i].quantity
  }
  return total
}
`
    },
    head: {
      'receipt.js': `// The receipt's total: every line's price times its quantity.
export function receiptTotal(lines) {
  let total = 0
  for (let i = 0; i < lines.length; i++) {
    total += lines[i].price * lines[i].quantity
  }
  return total
}
`
    }
  },
  issues: [],
  tempting: [{ path: 'receipt.js', lines: [4, 4], removed: [4, 4], why: 'both loops stop at the last index, `lines.length - 1`: for whole numbers `i <= n - 1` and `i < n` are the same test.' }],
  hint: 'Try both loops with three lines: which values does `i` take in each?',
  why: 'For whole numbers `i <= n - 1` and `i < n` stop at the same index, so every line still counts once; the new loop is just the usual way to write it. Nothing to fix: approve.',
  solution: [{ submit: 'approve', summary: 'Same loop: both stop at the last line.' }]
})

export const itemsNotLines = spotIt({
  id: 'ai-practice-items-not-lines',
  practises: 'ai-02-line-totals',
  title: 'Items, not lines',
  task: 'Sous simplified the basket counter in the header. Find what it counts now, comment on it and request changes.',
  pr: {
    number: 47,
    title: 'Count the basket without the helper',
    branch: 'sous/simpler-badge',
    description: ['`cart.lines.length` is the number of items already, so the counter does not need `itemCount()`.'],
    claims: ['The counter still shows how many items are in the basket'],
    base: {
      'badge.js': `// The counter in the header: how many items are in the basket.
import { itemCount } from './cart.js'

const badge = document.querySelector('#cart-count')

export function renderBadge() {
  badge.textContent = String(itemCount())
}
`
    },
    head: {
      'badge.js': `// The counter in the header: how many items are in the basket.
import { cart } from './cart.js'

const badge = document.querySelector('#cart-count')

export function renderBadge() {
  badge.textContent = String(cart.lines.length)
}
`
    }
  },
  issues: [{
    id: 'lines-count',
    path: 'badge.js',
    lines: [7, 7],
    categories: ['bug', 'false-claim'],
    title: 'the counter counts products, not items',
    explanation: '`cart.lines` has one line per product, with its quantity: two croissants are one line. `itemCount()` adds the quantities up.'
  }],
  hint: 'A basket line is one product with its quantity. Two croissants: how many lines, and how many items?',
  why: '`cart.lines` has one entry per product, so two croissants count as 1. The counter shows items: `itemCount()` adds up the quantities.',
  solution: [
    { comment: 'badge.js', lines: [7, 7], category: 'bug', text: 'Counts products, not items: two croissants show 1.' },
    { submit: 'request-changes' }
  ]
})

export const pickupTime = verdict({
  id: 'ai-practice-pickup-time',
  practises: 'ai-02-line-totals',
  title: 'Pick it up when?',
  task: VERDICT_TASK,
  pr: {
    number: 49,
    title: 'Use the shop\'s time format in the confirmation',
    branch: 'sous/confirmation-time',
    description: ['The confirmation shows times like the rest of the page, `7:30` instead of `07:30:00`.'],
    claims: ['Only the format of the time changes'],
    base: {
      'confirm.js': `// The message after an order goes in.
export function confirmationText(order) {
  return \`Thanks, \${order.name}! Pick up your order at \${order.pickupAt}.\`
}
`
    },
    head: {
      'confirm.js': `import { formatTime } from './time.js'

// The message after an order goes in.
export function confirmationText(order) {
  return \`Thanks, \${order.name}! Pick up your order at \${formatTime(order.createdAt)}.\`
}
`
    }
  },
  issues: [{
    id: 'created-at',
    path: 'confirm.js',
    lines: [5, 5],
    also: [{ path: 'confirm.js', removed: [3, 3] }],
    categories: ['bug', 'false-claim'],
    title: 'the confirmation formats `order.createdAt`, not `order.pickupAt`',
    explanation: '`createdAt` is when the order was placed: customers would be told to come at the time they ordered. The old line used `pickupAt`.'
  }],
  hint: 'Compare the removed line with the added one word by word: is the format the only thing that changed?',
  why: 'Besides the format, the line swapped `order.pickupAt` for `order.createdAt`: the confirmation would name the time the order was placed. Request changes on that line.',
  solution: [
    { comment: 'confirm.js', lines: [5, 5], category: 'bug', text: 'This is createdAt, the old line used pickupAt.' },
    { submit: 'request-changes', summary: 'It shows when the order was placed, not the pickup time.' }
  ]
})

export const soldOut = spotIt({
  id: 'ai-practice-sold-out',
  practises: 'ai-03-free-coffee',
  title: 'Sold out, the other way round',
  task: 'Sous added the sold-out marking for the product list. Comment on what is wrong and request changes.',
  pr: {
    number: 50,
    title: 'Grey out products that are sold out',
    branch: 'sous/sold-out',
    description: ['A product with nothing left is greyed out and its Add button turns off.'],
    claims: ['Sold-out products are greyed out and can\'t be added'],
    base: {},
    head: {
      'stock.js': `// Products with nothing left today: greyed out, and Add turned off (Maya).
export function markSoldOut(item, product) {
  item.classList.toggle('sold-out', product.left > 0)
  item.querySelector('.add').disabled = product.left > 0
}
`
    }
  },
  issues: [{
    id: 'in-stock',
    path: 'stock.js',
    lines: [3, 4],
    categories: ['bug', 'false-claim'],
    title: 'the products in stock get marked sold out',
    explanation: '`product.left > 0` is true while there is stock: the products you can buy are greyed out and the sold-out ones stay clickable. Sold out is `product.left === 0`.'
  }],
  hint: 'Read one line out loud with a croissant that has 8 left: is it sold out?',
  why: '`product.left > 0` is true while there is stock, so the products in stock are greyed out and the sold-out ones stay clickable. Sold out is `product.left === 0`.',
  solution: [
    { comment: 'stock.js', lines: [3, 4], category: 'bug', text: 'left > 0 means in stock: this marks the wrong products.' },
    { submit: 'request-changes' }
  ]
})

export const noDoubleNegative = verdict({
  id: 'ai-practice-no-double-negative',
  practises: 'ai-03-free-coffee',
  title: 'No double negative',
  task: VERDICT_TASK,
  pr: {
    number: 51,
    title: 'Simplify the free delivery check',
    branch: 'sous/free-delivery-check',
    description: ['Same rule, easier to read: `total >= FREE_FROM` instead of `!(total < FREE_FROM)`.'],
    claims: ['The same orders ship for free'],
    base: {
      'delivery.js': `// Delivery is free from 30 € (agreed with the shop team), else 3.50 €.
const FREE_FROM = 30

export function deliveryFee(total) {
  if (!(total < FREE_FROM)) return 0
  return 3.5
}
`
    },
    head: {
      'delivery.js': `// Delivery is free from 30 € (agreed with the shop team), else 3.50 €.
const FREE_FROM = 30

export function deliveryFee(total) {
  if (total >= FREE_FROM) return 0
  return 3.5
}
`
    }
  },
  issues: [],
  tempting: [{ path: 'delivery.js', lines: [5, 5], removed: [5, 5], why: '“Not less than 30” is “30 or more”: `!(total < FREE_FROM)` and `total >= FREE_FROM` hold for the same totals, 30.00 included.' }],
  hint: 'What is the opposite of “less than 30”? Check 29.99, 30 and 30.01 with both lines.',
  why: '“Not less than 30” is “at least 30”, so `total >= FREE_FROM` lets the same orders ship for free, 30.00 € included, without the double negative. Approve.',
  solution: [{ submit: 'approve', summary: 'Same rule: not below 30 is 30 or more.' }]
})

export const mediumCoffee = spotIt({
  id: 'ai-practice-medium-coffee',
  practises: 'ai-04-pickup-locker',
  title: 'A medium coffee',
  task: 'Sous added a medium coffee. Something it needs is missing: comment where, and request changes.',
  pr: {
    number: 52,
    title: 'Add a medium coffee',
    branch: 'sous/medium-coffee',
    description: ['Customers can pick a medium coffee too, for 0.40 € more than a small one.'],
    claims: ['Three sizes: small, medium and large'],
    base: {
      'coffee.js': `// Coffee to go with the order: a small one, or a large one for 0.80 € more.
export const SIZES = ['small', 'large']
const EXTRA = { small: 0, large: 0.8 }
export function coffeePrice(size) {
  return 2.2 + EXTRA[size]
}
`
    },
    head: {
      'coffee.js': `// Coffee to go with the order: small, medium (0.40 € more) or large (0.80 € more).
export const SIZES = ['small', 'medium', 'large']
const EXTRA = { small: 0, large: 0.8 }
export function coffeePrice(size) {
  return 2.2 + EXTRA[size]
}
`
    }
  },
  issues: [{
    id: 'no-medium-price',
    path: 'coffee.js',
    lines: [3, 3],
    also: [{ path: 'coffee.js', lines: [2, 2] }],
    categories: ['bug'],
    title: '`EXTRA` has no price for `medium`',
    explanation: '`EXTRA[\'medium\']` is `undefined`, so `2.2 + undefined` is `NaN`. A new size needs its price: `medium: 0.4`.'
  }],
  hint: 'The size is new. Follow `\'medium\'` into `return 2.2 + EXTRA[size]`: what is `EXTRA[\'medium\']`? Unchanged lines in the diff count too.',
  why: '`EXTRA` has no `medium`, so its extra is `undefined` and the price `NaN`. The problem sits on a line the pull request did not change: read the lines around a change too.',
  solution: [
    { comment: 'coffee.js', lines: [3, 3], category: 'bug', text: 'No price for medium: EXTRA.medium is undefined.' },
    { submit: 'request-changes' }
  ]
})

export const lockerFallsThrough = verdict({
  id: 'ai-practice-locker-falls-through',
  practises: 'ai-04-pickup-locker',
  title: 'The locker falls through',
  task: VERDICT_TASK,
  pr: {
    number: 53,
    title: 'Add the locker to the delivery fee',
    branch: 'sous/locker-fee',
    description: ['`deliveryFee` knows the station locker now. It is free, like pickup.'],
    claims: ['The locker is free'],
    base: {
      'delivery.js': `// What getting the order costs on top (euros).
export function deliveryFee(method) {
  switch (method) {
    case 'pickup':
      return 0
    case 'delivery':
      return 3.5
    default:
      throw new Error(\`No fee for \${method}\`)
  }
}
`
    },
    head: {
      'delivery.js': `// What getting the order costs on top (euros).
export function deliveryFee(method) {
  switch (method) {
    case 'pickup':
      return 0
    case 'locker':
    case 'delivery':
      return 3.5
    default:
      throw new Error(\`No fee for \${method}\`)
  }
}
`
    }
  },
  issues: [{
    id: 'falls-through',
    path: 'delivery.js',
    lines: [6, 6],
    categories: ['bug', 'false-claim'],
    title: '`case \'locker\'` falls through to the delivery fee',
    explanation: 'With nothing between `case \'locker\':` and `case \'delivery\':`, the locker runs into `return 3.5`. It belongs with pickup.'
  }],
  hint: 'A `case` with no code of its own runs the code of the next one. What does the locker cost here?',
  why: '`case \'locker\':` sits right above `case \'delivery\':` with nothing between them, so the locker falls through and costs 3.50 €. It belongs under `case \'pickup\':`.',
  solution: [
    { comment: 'delivery.js', lines: [6, 6], category: 'bug', text: 'Falls through to delivery: the locker costs 3.50.' },
    { submit: 'request-changes', summary: 'The locker is charged like delivery.' }
  ]
})

export const ryeByWeight = spotIt({
  id: 'ai-practice-rye-by-weight',
  practises: 'ai-05-office-discount',
  title: 'Rye by weight',
  task: 'The shop sells rye by weight now, and Sous wrote the price. Comment on what is wrong and request changes.',
  pr: {
    number: 54,
    title: 'Price rye by weight',
    branch: 'sous/rye-by-weight',
    description: ['Rye costs 4.20 € a kilo; the scale at the counter reports grams.'],
    claims: ['A 750 g loaf costs 3.15 €'],
    base: {
      'rye.js': `// A rye loaf, 3.80 €.
export function ryePrice() {
  return 3.8
}
`
    },
    head: {
      'rye.js': `// Rye is sold by weight: 4.20 € a kilo, the scale says grams.
const RYE_PER_KG = 4.2

export function ryePrice(grams) {
  return RYE_PER_KG * grams
}
`
    }
  },
  issues: [{
    id: 'grams-as-kilos',
    path: 'rye.js',
    lines: [5, 5],
    categories: ['bug', 'false-claim'],
    title: 'a price per kilo times grams',
    explanation: '`RYE_PER_KG * grams` treats grams as kilos: 750 g would cost 3,150 €. It needs `RYE_PER_KG * grams / 1000`.'
  }],
  hint: 'Put the description\'s loaf through the new line: 750 g at 4.20 € a kilo.',
  why: 'The price is per kilo and the scale gives grams, so 750 g would cost 3,150 €: `RYE_PER_KG * grams / 1000` is 3.15 €.',
  solution: [
    { comment: 'rye.js', lines: [5, 5], category: 'bug', text: 'Grams times a price per kilo: needs / 1000.' },
    { submit: 'request-changes' }
  ]
})

export const tenCents = verdict({
  id: 'ai-practice-ten-cents',
  practises: 'ai-05-office-discount',
  title: 'Rounded to what?',
  task: VERDICT_TASK,
  difficulty: 2,
  pr: {
    number: 55,
    title: 'Round prices before formatting them',
    branch: 'sous/round-prices',
    description: ['Rounds a price before it is formatted, so a price with half a cent shows the way the till rounds it.'],
    claims: ['Prices still show to the cent'],
    base: {
      'money.js': `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
export function formatPrice(amount) {
  return amount.toFixed(2)
}
`
    },
    head: {
      'money.js': `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
export function formatPrice(amount) {
  // round first, the way the till does
  return (Math.round(amount * 10) / 10).toFixed(2)
}
`
    }
  },
  issues: [{
    id: 'ten-cents',
    path: 'money.js',
    lines: [4, 4],
    categories: ['bug', 'false-claim'],
    title: '`Math.round(amount * 10) / 10` rounds to ten cents',
    explanation: 'Times 10, round, divided by 10 keeps one decimal: 2.45 € shows as 2.50 €. To the cent is `* 100` and `/ 100`.'
  }],
  hint: 'Put 2.45 through the new line step by step: what is left after `Math.round(amount * 10) / 10`?',
  why: '`Math.round(amount * 10) / 10` keeps one decimal, so 2.45 € shows as 2.50 €: every price is rounded to ten cents. To the cent is `* 100` and `/ 100`.',
  solution: [
    { comment: 'money.js', lines: [4, 4], category: 'bug', text: 'Rounds to ten cents: 2.45 becomes 2.50.' },
    { submit: 'request-changes', summary: 'Prices are rounded to ten cents.' }
  ]
})
