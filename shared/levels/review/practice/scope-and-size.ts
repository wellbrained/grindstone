// Practice tasks for Scope and size (ADR 0008): two per scenario, about 30 s each over one or a few small files.
// "Spot it": the pull request does what was asked and something more (a list sorted on the side, an unasked change to
// the money helper, a class where a number would do, a value changed inside a rename, a countdown nobody asked for);
// comment on what doesn't belong, as scope (a value changed silently inside a rename or a reformat is a bug too, as
// 6.1's lost line is), and request changes. "Verdict": does it change what was asked, and only
// that? Three are the right size and should be approved (a phone number that touches three files for one reason,
// rounding in one line, a rename done everywhere it must be); one hides a changed value in a pull request that says it
// only formats, and one adds a dark look to a button made bigger for phones.
import { spotIt, verdict } from './tasks'

const SPOT_TASK = 'Sous did what was asked, and something more. Comment on what doesn\'t belong, and request changes.'
const VERDICT_TASK = 'Does it change what was asked, and only that? Approve it, or request changes on the line that doesn\'t belong, and say why in one line.'

const MONEY = `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
export function formatPrice(amount) {
  return amount.toFixed(2)
}
`

const DELIVERY = `// Delivery for orders under 20 € (Ben).
// Agreed with the shop team: orders from 20 € deliver free.
const FREE_FROM = 20
const FEE = 3.5

export function deliveryFee(total) {
  return total >= FREE_FROM ? 0 : FEE
}

// the fee as text for the order page: "3.50 €", or "free"
export function feeText(total) {
  const fee = deliveryFee(total)
  return fee === 0 ? 'free' : \`\${fee.toFixed(2)} €\`
}
`

export const alphabetical = spotIt({
  id: 'ai-practice-alphabetical',
  practises: 'ai-26-menu-typo',
  title: 'Alphabetical, too',
  task: SPOT_TASK,
  pr: {
    number: 101,
    title: 'Fix the typo in Baguette',
    branch: 'sous/baguette-typo',
    description: ['The order page said “Baguete”. Fixed, and the list is sorted by name now, so products are easy to find.'],
    claims: ['“Baguette” is spelled right', 'Only the name changes'],
    base: {
      'products.js': `// Today's products, in the order Maya wants them on the page: the bread first. Prices are in euros.
export const products = [
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 },
  { id: 'baguette', name: 'Baguete', price: 2.2 },
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'cinnamon-bun', name: 'Cinnamon bun', price: 3.2 }
]
`
    },
    head: {
      'products.js': `// Today's products, sorted by name so they are easy to find (Sous). Prices are in euros.
export const products = [
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 },
  { id: 'baguette', name: 'Baguette', price: 2.2 },
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'cinnamon-bun', name: 'Cinnamon bun', price: 3.2 }
].sort((a, b) => a.name.localeCompare(b.name))
`
    }
  },
  issues: [{
    id: 'sorted',
    path: 'products.js',
    lines: [7, 7],
    removed: [7, 7],
    also: [{ path: 'products.js', lines: [1, 1], removed: [1, 1] }],
    breaks: [1],
    categories: ['scope', 'false-claim'],
    title: 'the list is sorted by name: the page no longer shows Maya\'s order, bread first',
    explanation: 'Maya asked for one letter. The `.sort` on the end puts the Baguette first and the Sourdough loaf last, and drops the order Maya chose for the page.'
  }],
  tempting: [
    { path: 'products.js', lines: [4, 4], why: 'the fix Maya asked for: “Baguette” with two t\'s.' },
    { claim: 0, why: 'it is: line 4 says “Baguette”.' }
  ],
  hint: 'Maya asked for one letter. Which changed line does more than fix it?',
  why: 'A typo fix changes the typo. Sorting the list changes what the page shows, and Maya chose that order: that is its own pull request, if she wants it.',
  solution: [
    { comment: 'products.js', lines: [7, 7], category: 'scope', text: 'The sort isn\'t part of the typo fix, and it drops Maya\'s order: please take it out.' },
    { submit: 'request-changes' }
  ]
})

export const formattingOnly = verdict({
  id: 'ai-practice-formatting-only',
  practises: 'ai-26-menu-typo',
  title: 'Formatting only',
  task: VERDICT_TASK,
  pr: {
    number: 102,
    title: 'Format hours.js',
    branch: 'sous/format-hours',
    description: ['Ben asked for the formatter on hours.js in a pull request of its own, as we agreed: semicolons and double quotes, like the newer files.'],
    claims: ['Semicolons and double quotes, like the newer files', 'Formatting only: no value changes'],
    base: {
      'hours.js': `// Opening hours for the header and the order confirmation (Maya)
export const OPENS_AT = 7
export const CLOSES_AT = 18
export const SATURDAY_CLOSES_AT = 13
export const OPEN_DAYS = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
`
    },
    head: {
      'hours.js': `// Opening hours for the header and the order confirmation (Maya)
export const OPENS_AT = 7;
export const CLOSES_AT = 18;
export const SATURDAY_CLOSES_AT = 14;
export const OPEN_DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
`
    }
  },
  issues: [{
    id: 'saturday',
    path: 'hours.js',
    lines: [4, 4],
    removed: [4, 4],
    breaks: [1],
    // a changed value hides in a reformat (6.1's debrief) as a lost line does: a bug too, not only more than was asked
    categories: ['scope', 'bug', 'false-claim'],
    title: 'a value changed inside the reformat: on Saturdays the shop now closes at 14, not 13',
    explanation: 'Every line changed for the formatter, and one changed more: `SATURDAY_CLOSES_AT` went from 13 to 14. In a diff where every line is new, a changed value is easy to miss, and that is why a reformat must change nothing else.'
  }],
  tempting: [
    { path: 'hours.js', lines: [5, 5], removed: [5, 5], why: 'only the quotes and the semicolon: the same six days.' },
    { claim: 0, why: 'they are: every line ends in a semicolon, the days are in double quotes.' }
  ],
  hint: 'A pull request that only formats keeps every value. Read the removed lines and the added ones side by side.',
  why: 'Request changes: a reformat in its own pull request is right, but it changed Saturday\'s closing time from 13 to 14. Formatting only means every value stays.',
  solution: [
    { comment: 'hours.js', lines: [4, 4], category: 'scope', text: 'Saturday closes at 14 now, not 13: that isn\'t formatting.' },
    { submit: 'request-changes', summary: 'The reformat changes Saturday\'s closing time.' }
  ],
  difficulty: 2
})

export const veganBadge = spotIt({
  id: 'ai-practice-vegan-badge',
  practises: 'ai-27-pickup-note',
  title: 'A vegan badge',
  task: SPOT_TASK,
  pr: {
    number: 103,
    title: 'A “Vegan” badge on vegan products',
    branch: 'sous/vegan-badge',
    description: ['Maya wants vegan products marked on the order page.'],
    claims: ['Vegan products get a “Vegan” badge next to their name', 'Prices look as they did'],
    base: {
      'product-row.js': `// One product on the order page: its name and price (Ben).
import { formatPrice } from './money.js'

export function productRow(product) {
  const row = document.createElement('li')
  row.className = 'product'
  row.textContent = \`\${product.name} \${formatPrice(product.price)}\`
  return row
}
`,
      'money.js': MONEY
    },
    head: {
      'product-row.js': `// One product on the order page: its name and price (Ben).
import { formatPrice } from './money.js'

export function productRow(product) {
  const row = document.createElement('li')
  row.className = 'product'
  row.textContent = \`\${product.name} \${formatPrice(product.price)}\`
  if (product.vegan) {
    const badge = document.createElement('span')
    badge.className = 'badge'
    badge.textContent = 'Vegan'
    row.append(' ', badge)
  }
  return row
}
`,
      'money.js': `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
export function formatPrice(amount) {
  return \`\${amount.toFixed(2)} €\`
}
`
    }
  },
  issues: [{
    id: 'euro-sign',
    path: 'money.js',
    lines: [3, 3],
    removed: [3, 3],
    breaks: [1],
    categories: ['scope', 'false-claim'],
    title: 'an unasked change to the money helper: every price in the shop now ends in “ €”',
    explanation: 'The badge never needs money.js. `formatPrice` writes every price in the shop, and each one now gets a “€” nobody asked for; the order page\'s total already writes “€” after its amount, so it would say “6.50 € €”.'
  }],
  tempting: [{ path: 'product-row.js', lines: [8, 12], why: 'the badge Maya asked for, its text put in with `textContent`.' }],
  hint: 'Maya asked for a badge. Which file does the badge not need?',
  why: 'Every file in a pull request should be there for what was asked. The badge needs product-row.js; a new `formatPrice` changes every price in the shop, and belongs in a pull request that says so.',
  solution: [
    { comment: 'money.js', lines: [3, 3], category: 'scope', text: 'The badge doesn\'t need this, and every price gets a second €. Please leave formatPrice as it was.' },
    { submit: 'request-changes' }
  ]
})

export const phoneNumber = verdict({
  id: 'ai-practice-phone-number',
  practises: 'ai-27-pickup-note',
  title: 'A number to call',
  task: VERDICT_TASK,
  pr: {
    number: 104,
    title: 'A phone number with the order',
    branch: 'sous/order-phone',
    description: ['Maya wants to be able to call a customer when something they ordered is gone. The order box gets a phone field, the page sends it, and the server keeps it with the order.'],
    claims: ['Customers can leave a phone number with their order', 'The server keeps it with the order', 'Nothing else changes'],
    base: {
      'order-box.html': `<section class="summary" aria-label="Your order">
  <button class="action" id="order" type="button">Order for pickup</button>
  <p class="note" id="order-status" role="status"></p>
</section>
`,
      'order.js': `// Sends the basket to the kitchen (Ben).
import { cart } from './cart.js'

export async function placeOrder() {
  const items = cart.items.map(item => ({ id: item.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  return response.json()
}
`,
      'server/order-routes.js': `// The shop's server: orders from the order page (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function orderRoutes(app) {
  app.post('/api/orders', requireLogin, async (req, res) => {
    const order = await db.orders.create({ customer: req.user.id, items: req.body.items })
    res.status(201).json({ number: order.number })
  })
}
`
    },
    head: {
      'order-box.html': `<section class="summary" aria-label="Your order">
  <label class="note" for="phone">A phone number, if we should call you (optional)</label>
  <input id="phone" type="tel" maxlength="30" autocomplete="tel">
  <button class="action" id="order" type="button">Order for pickup</button>
  <p class="note" id="order-status" role="status"></p>
</section>
`,
      'order.js': `// Sends the basket to the kitchen (Ben).
import { cart } from './cart.js'

const phone = document.querySelector('#phone')

export async function placeOrder() {
  const items = cart.items.map(item => ({ id: item.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, phone: phone.value.trim() })
  })
  return response.json()
}
`,
      'server/order-routes.js': `// The shop's server: orders from the order page (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function orderRoutes(app) {
  app.post('/api/orders', requireLogin, async (req, res) => {
    const phone = String(req.body.phone ?? '').slice(0, 30)
    const order = await db.orders.create({ customer: req.user.id, items: req.body.items, phone })
    res.status(201).json({ number: order.number })
  })
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'server/order-routes.js', lines: [7, 7], why: 'the server keeps the number as text, at most 30 characters like the field: it never trusts the page to have checked.' },
    { path: 'order.js', lines: [4, 4], why: 'the page reads the number from the field it added: needed to send it.' }
  ],
  hint: 'Three files change. For each one, ask: does the phone number need it?',
  why: 'Approve: three files, one reason. The field, the request and the server are each needed for the number, and nothing else changes. A change\'s size is what it needs, not how many files it touches.',
  solution: [{ submit: 'approve', summary: 'Every file is there for the phone number, and nothing else changes.' }]
})

export const feeClass = spotIt({
  id: 'ai-practice-fee-class',
  practises: 'ai-28-five-cents',
  title: 'A class for one number',
  task: SPOT_TASK,
  pr: {
    number: 105,
    title: 'Delivery costs 3.90 €',
    branch: 'sous/delivery-fee',
    description: ['Ben: the courier charges more, so delivery is 3.90 € now. The fee is its own small class, so other kinds of fee can be plugged in later.'],
    claims: ['Delivery costs 3.90 € under 20 €', 'Orders from 20 € still deliver free'],
    base: { 'delivery.js': DELIVERY },
    head: {
      'delivery.js': `// Delivery for orders under 20 € (Ben).
// Agreed with the shop team: orders from 20 € deliver free.
const FREE_FROM = 20

class FlatFee {
  constructor(amount) { this.amount = amount }
  for(total) { return total >= FREE_FROM ? 0 : this.amount }
}

const fee = new FlatFee(3.9)

export function deliveryFee(total) {
  return fee.for(total)
}

// the fee as text for the order page: "3.50 €", or "free"
export function feeText(total) {
  const fee = deliveryFee(total)
  return fee === 0 ? 'free' : \`\${fee.toFixed(2)} €\`
}
`
    }
  },
  issues: [{
    id: 'fee-class',
    path: 'delivery.js',
    lines: [5, 13],
    removed: [4, 4],
    also: [{ path: 'delivery.js', removed: [7, 7] }],
    categories: ['scope', 'unclear'],
    title: 'a class where a number would do: `const FEE = 3.9` was the whole change',
    explanation: 'The ask was one number. Sous wrapped it in `FlatFee` with a method called `for`, for kinds of fee nobody has asked for: two changed lines became eight, and the next reader has to check that they still do what one line did.'
  }],
  tempting: [{ claim: 1, why: 'they do: `total >= FREE_FROM` is still 0.' }],
  hint: 'How many lines does a new delivery price take?',
  why: 'A new price is `const FEE = 3.9`. A class for kinds of fee nobody asked for makes a one-line change a rewrite to review: ask for the one line.',
  solution: [
    { comment: 'delivery.js', lines: [5, 8], category: 'scope', text: 'A new fee is one line: const FEE = 3.9. Please drop the class.' },
    { submit: 'request-changes' }
  ]
})

export const fiveCentsLine = verdict({
  id: 'ai-practice-five-cents-line',
  practises: 'ai-28-five-cents',
  title: 'Five cents, one line',
  task: VERDICT_TASK,
  pr: {
    number: 106,
    title: 'Round totals to 5 cents',
    branch: 'ben/five-cents',
    description: ['Ben\'s take: the till has no 1 and 2 cent coins, so the basket total is rounded to 5 cents, the bulk discount first.'],
    claims: ['Totals are rounded to 5 cents, for the till', 'The bulk discount works as before'],
    base: {
      'pricing.js': `// Prices for the basket (Ben). Amounts are euros as plain numbers.
const BULK_FROM = 10
const BULK_DISCOUNT = 0.1

export function basketTotal(lines) {
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  // offices order by the dozen: 10 % off from ten items (Maya)
  if (count >= BULK_FROM) return total * (1 - BULK_DISCOUNT)
  return total
}
`
    },
    head: {
      'pricing.js': `// Prices for the basket (Ben). Amounts are euros as plain numbers.
const BULK_FROM = 10
const BULK_DISCOUNT = 0.1

export function basketTotal(lines) {
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  // offices order by the dozen: 10 % off from ten items (Maya)
  const discounted = count >= BULK_FROM ? total * (1 - BULK_DISCOUNT) : total
  // the till has no 1 and 2 cent coins: round to 5 cents, twenty steps to the euro
  return Math.round(discounted * 20) / 20
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'pricing.js', lines: [11, 11], why: 'twenty steps of 5 cents to the euro: 23.76 € times 20 is 475.2, rounded 475, and back 23.75 €.' },
    { path: 'pricing.js', lines: [9, 9], why: 'the same discount as the old `if`, from ten items, kept for the rounding after it.' }
  ],
  hint: 'Is the discount still there for ten items or more? And does every total go through the rounding?',
  why: 'Approve: the discount is the same rule in one line, and every total, discounted or not, goes through one rounding. That is the size the ask needs.',
  solution: [{ submit: 'approve', summary: 'One rounding at the end, and the discount kept: the change the till needs.' }]
})

export const renamedAndRaised = spotIt({
  id: 'ai-practice-renamed-and-raised',
  practises: 'ai-29-cart-to-basket',
  title: 'Renamed, and raised',
  task: SPOT_TASK,
  pr: {
    number: 107,
    title: 'Clearer name: FREE_DELIVERY_FROM',
    branch: 'sous/free-delivery-name',
    description: ['Ben found `FREE_FROM` hard to read: free what? It is `FREE_DELIVERY_FROM` now.'],
    claims: ['Only the name changes', 'Every use of it is renamed'],
    base: { 'delivery.js': DELIVERY },
    head: {
      'delivery.js': DELIVERY
        .replace('const FREE_FROM = 20', 'const FREE_DELIVERY_FROM = 25')
        .replace('return total >= FREE_FROM ? 0 : FEE', 'return total >= FREE_DELIVERY_FROM ? 0 : FEE')
    }
  },
  issues: [{
    id: 'raised',
    path: 'delivery.js',
    lines: [3, 3],
    removed: [3, 3],
    breaks: [0],
    // against the agreement on the line above: a bug too, not only a second change in a rename
    categories: ['scope', 'bug', 'false-claim'],
    title: 'the renamed line also raises free delivery from 20 € to 25 €',
    explanation: 'The new name is fine. On the same line the value went from 20 to 25, so orders from 20 € to 24.99 € pay delivery again, against the shop team\'s agreement on the line above.'
  }],
  tempting: [
    { path: 'delivery.js', lines: [7, 7], removed: [7, 7], why: 'the rename where the name is used: the same check, `total >=` the threshold.' },
    { claim: 1, why: 'it is: both lines say `FREE_DELIVERY_FROM`.' }
  ],
  hint: 'A rename changes names. Is there a changed line that changes something else too?',
  why: 'One line did two things: the name and the threshold. A rename must change nothing else; a new threshold is the shop team\'s call, in a pull request that says so.',
  solution: [
    { comment: 'delivery.js', lines: [3, 3], category: 'scope', text: 'The rename also raises free delivery to 25 €: please keep it at 20.' },
    { submit: 'request-changes' }
  ]
})

export const renamedEverywhere = verdict({
  id: 'ai-practice-renamed-everywhere',
  practises: 'ai-29-cart-to-basket',
  title: 'Renamed everywhere',
  task: VERDICT_TASK,
  pr: {
    number: 108,
    title: 'Rename formatPrice to formatEuros',
    branch: 'sous/format-euros',
    description: ['Ben asked for a name that says the unit: `formatPrice` is `formatEuros` now, in money.js and the two files that call it.'],
    claims: ['Only the name changes', 'Every file that called `formatPrice` calls `formatEuros` now'],
    base: {
      'money.js': MONEY,
      'receipt.js': `// One line of the receipt: "2 × Butter croissant  4.80" (Ben).
import { formatPrice } from './money.js'

export function receiptLine(line) {
  return \`\${line.quantity} × \${line.name}  \${formatPrice(line.price * line.quantity)}\`
}
`,
      'summary.js': `// The basket's total under the products (Ben).
import { formatPrice } from './money.js'

export function totalText(total) {
  return \`Total \${formatPrice(total)} €\`
}
`
    },
    head: {
      'money.js': MONEY.replace('export function formatPrice(amount)', 'export function formatEuros(amount)'),
      'receipt.js': `// One line of the receipt: "2 × Butter croissant  4.80" (Ben).
import { formatEuros } from './money.js'

export function receiptLine(line) {
  return \`\${line.quantity} × \${line.name}  \${formatEuros(line.price * line.quantity)}\`
}
`,
      'summary.js': `// The basket's total under the products (Ben).
import { formatEuros } from './money.js'

export function totalText(total) {
  return \`Total \${formatEuros(total)} €\`
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'receipt.js', lines: [5, 5], removed: [5, 5], why: 'only the name: the same amount, the same two decimals.' },
    { path: 'money.js', lines: [2, 2], removed: [2, 2], why: 'the function itself, renamed; its body is untouched.' }
  ],
  hint: 'Check every changed line: does each one only swap the name? And is there a call left with the old name?',
  why: 'Approve: three files, one reason. Every changed line swaps `formatPrice` for `formatEuros` and nothing else, and no call is left behind.',
  solution: [{ submit: 'approve', summary: 'A rename and nothing else, in every file that used the name.' }]
})

export const closingCountdown = spotIt({
  id: 'ai-practice-closing-countdown',
  practises: 'ai-30-sold-out-label',
  title: 'Closes in…',
  task: SPOT_TASK,
  pr: {
    number: 109,
    title: 'Today\'s opening hours in the header',
    branch: 'sous/hours-header',
    description: ['Maya wants today\'s opening hours in the header. I added a live countdown to closing time as well, so customers know how long they have.'],
    claims: ['The header shows today\'s opening hours', 'A countdown shows how long until we close'],
    base: {},
    head: {
      'hours.js': `// Today's opening hours in the header (Maya).
const OPENS_AT = 7
const CLOSES_AT = 18

const hours = document.querySelector('#hours')
hours.textContent = \`Open today \${OPENS_AT}:00–\${CLOSES_AT}:00\`

// and a countdown to closing time, every second (Sous)
const countdown = document.querySelector('#countdown')
setInterval(() => {
  const left = new Date().setHours(CLOSES_AT, 0, 0, 0) - Date.now()
  countdown.textContent = \`Closes in \${Math.floor(left / 3600000)} h \${Math.floor(left / 60000) % 60} min\`
}, 1000)
`
    }
  },
  issues: [{
    id: 'countdown',
    path: 'hours.js',
    lines: [8, 13],
    categories: ['scope'],
    title: 'a countdown nobody asked for, redrawn every second',
    explanation: 'Maya asked for the hours. The countdown is a second feature, with its own questions nobody asked Maya: what it says after closing time (it counts on below zero), whether a header that changes every second is what the shop wants.'
  }],
  tempting: [
    { path: 'hours.js', lines: [5, 6], why: 'the hours Maya asked for, in the header.' },
    { claim: 1, why: 'true, it does. That nobody asked for it is the problem: comment on its code.' }
  ],
  hint: 'Maya asked for the hours. Which lines are for something else?',
  why: 'The hours are two lines. The countdown is a feature of its own (and after six it counts on below zero): ask for the hours alone, and suggest the countdown separately if it is worth having.',
  solution: [
    { comment: 'hours.js', lines: [10, 10], category: 'scope', text: 'Nobody asked for a countdown: please send the hours alone.' },
    { submit: 'request-changes' }
  ]
})

export const darkModeToo = verdict({
  id: 'ai-practice-dark-mode-too',
  practises: 'ai-30-sold-out-label',
  title: 'Bigger, and dark too',
  task: VERDICT_TASK,
  pr: {
    number: 110,
    title: 'Bigger Add buttons on phones',
    branch: 'sous/bigger-add',
    description: ['Maya: the Add button is hard to tap on a phone. It is at least 44 px tall on small screens now. And a dark look for the button, for evening shoppers.'],
    claims: ['Add is at least 44 px tall on phones', 'Large screens look as before'],
    base: {
      'style.css': `/* The order page's buttons, in the colours of the paper menu (Maya). */
.add {
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  background: #7a3e12;
  color: #fff;
}
`
    },
    head: {
      'style.css': `/* The order page's buttons, in the colours of the paper menu (Maya). */
.add {
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  background: #7a3e12;
  color: #fff;
}

/* easier to tap on phones (Maya) */
@media (max-width: 480px) {
  .add {
    min-height: 44px;
    padding: 10px 16px;
  }
}

/* a dark look for evening shoppers (Sous) */
@media (prefers-color-scheme: dark) {
  .add {
    background: #c98a4b;
  }
}
`
    }
  },
  issues: [{
    id: 'dark-look',
    path: 'style.css',
    lines: [18, 23],
    breaks: [1],
    categories: ['scope', 'false-claim'],
    title: 'a dark look nobody asked for, in a fix for small screens, and on every screen size',
    explanation: 'Maya asked for a bigger button on phones. The dark block is a second change, for large screens too (so they don\'t look as before), and a half one: it lightens the button and keeps the white text on it.'
  }],
  tempting: [
    { path: 'style.css', lines: [11, 16], why: 'what Maya asked for: on small screens the button is at least 44 px tall.' },
    { claim: 0, why: 'it is: `min-height: 44px` under 480 px.' }
  ],
  hint: 'Which lines make the button easier to tap, and which do something else?',
  why: 'Request changes: the media query for phones is the fix; the dark look is a second change nobody asked for, on every screen (and it leaves white text on light brown). Send it separately, if Maya wants it.',
  solution: [
    { comment: 'style.css', lines: [19, 19], category: 'scope', text: 'A dark look isn\'t part of a bigger button: please take it out.' },
    { submit: 'request-changes', summary: 'The bigger button is right; the dark look is a second change.' }
  ]
})
