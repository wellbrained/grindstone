// Scope and size 6.2: "Add a pickup note". Maya wants customers to leave a note with their order (“sliced, please”).
// Everything Sous changes for it is needed, in five files: the field, its style, the request, the server that keeps
// it (server code: shown, never run). And one change isn't: `formatHour` in hours.js now uses Intl's time format, so
// every time on the page reads “7 AM” instead of the shop's “7:00”, against “Nothing else on the page changes”.
// Running both sides shows it in the header before anyone orders.
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, serverShop, withEdits } from './shop'
import { CART_JS, MENU_ROUTE, ORDER_BOX } from '../debugging/shop-server'
import type { BackendSpec } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

const HOURS = `// The opening hours in the header, and the time in the order confirmation (Maya).
export const OPENS_AT = 7
export const CLOSES_AT = 18

// 7 → "7:00", the way the paper menu writes times
export function formatHour(hour) {
  return \`\${hour}:00\`
}

document.querySelector('#hours').textContent = \`Open today \${formatHour(OPENS_AT)}–\${formatHour(CLOSES_AT)}\`
`

const ORDER = `// Sends the basket to the kitchen (Ben).
import { cart, clearCart } from './cart.js'
import { OPENS_AT, formatHour } from './hours.js'

const status = document.querySelector('#order-status')

async function placeOrder() {
  status.textContent = 'Sending your order…'
  const items = cart.items.map(item => ({ id: item.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  const order = await response.json()
  if (!response.ok) {
    status.textContent = order.error
    return
  }
  clearCart()
  status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from \${formatHour(OPENS_AT)}.\`
}

document.querySelector('#order').addEventListener('click', placeOrder)
`

const SERVER = `// The shop's server: orders from the order page (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function orderRoutes(app) {
  // an order, { items: [{ id, quantity }] }
  app.post('/api/orders', requireLogin, async (req, res) => {
    const lines = []
    for (const { id, quantity } of req.body.items) {
      const product = await db.products.find(id)
      if (!product || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'That isn\\'t on today\\'s menu.' })
      lines.push({ id, quantity, price: product.price })
    }
    const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    const order = await db.orders.create({ customer: req.user.id, lines, total })
    res.status(201).json({ number: order.number })
  })
}
`

const base = serverShop(
  { 'cart.js': CART_JS, 'hours.js': HOURS, 'order.js': ORDER, 'server/order-routes.js': SERVER },
  { imports: ['./order.js'], header: ['<p class="hours" id="hours"></p>'], main: ORDER_BOX }
)

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['      <button class="action" id="order"', `      <label class="note" for="note">A note for the bakery (optional)</label>
      <textarea id="note" rows="2" maxlength="200" placeholder="Sliced, please"></textarea>
      <button class="action" id="order"`]
  },
  {
    path: 'style.css',
    replace: ['h2 {', `textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 4px 0 10px;
  font: inherit;
}

h2 {`]
  },
  { path: 'order.js', replace: ['const status = document.querySelector(\'#order-status\')\n', 'const status = document.querySelector(\'#order-status\')\nconst note = document.querySelector(\'#note\')\n'] },
  { path: 'order.js', replace: ['body: JSON.stringify({ items })', 'body: JSON.stringify({ items, note: note.value.trim() })'] },
  { path: 'order.js', replace: ['  clearCart()\n', '  clearCart()\n  note.value = \'\'\n'] },
  { path: 'server/order-routes.js', replace: ['// an order, { items: [{ id, quantity }] }', '// an order, { items: [{ id, quantity }], note }: the note is the customer\'s, kept as text'] },
  {
    path: 'server/order-routes.js',
    replace: ['    const order = await db.orders.create({ customer: req.user.id, lines, total })', `    const note = String(req.body.note ?? '').slice(0, 200)
    const order = await db.orders.create({ customer: req.user.id, lines, total, note })`]
  },
  {
    path: 'hours.js',
    replace: [`// 7 → "7:00", the way the paper menu writes times
export function formatHour(hour) {
  return \`\${hour}:00\`
}`, `// 7 → "7 AM": Intl's own time format instead of a hand-made string
export function formatHour(hour) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(new Date(2026, 0, 1, hour))
}`]
  }
])

const backend: BackendSpec = {
  routes: [MENU_ROUTE, { method: 'POST', path: '/api/orders', respond: { status: 201, json: { number: 1043 }, delay: 150 } }]
}

const pr: PullRequest = {
  number: 97,
  title: 'A note for the bakery with every order',
  branch: 'sous/pickup-note',
  description: [
    'Maya wants customers to be able to say things like “sliced, please”. Adds a note field above the Order button; the page sends it with the order, and the server keeps it with the order.'
  ],
  claims: [
    'Customers can leave a note for the bakery with their order',
    'The server keeps the note with the order',
    'Nothing else on the page changes'
  ],
  base,
  head
}

export const pickupNote: ReviewScenario = {
  id: 'ai-27-pickup-note',
  track: 'ai',
  kind: 'scenario',
  title: 'Add a pickup note',
  difficulty: 2,
  minutes: 5,
  teaches: 'unrelated change',
  story: [
    'Customers keep calling the shop to ask for their loaf sliced. Maya asked Sous for a note field on the order page, kept with the order on the server (`server/order-routes.js`, server code: it never runs in the browser).',
    'A feature touches several files, and that\'s fine as long as each one is for the feature. Review it file by file, and run both sides on the scripted server.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'time-format',
    path: 'hours.js',
    lines: [5, 7],
    removed: [5, 5],
    also: [{ path: 'hours.js', removed: [7, 7] }, claimAt(pr, 2)],
    categories: ['scope', 'false-claim'],
    title: 'an unasked change to the time helper: every time on the page now reads “7 AM”',
    explanation: 'The note never touches hours.js. Sous swapped `formatHour` for Intl\'s time format on the side, so the header and the confirmation now say “7 AM” and “6 PM” where the shop writes 7:00 and 18:00, and nobody asked for it.'
  }],
  tempting: [
    { path: 'index.html', lines: [21, 22], why: 'the field itself: the note needs somewhere to be typed, and its label says what it is for.' },
    { path: 'style.css', lines: [115, 121], why: 'the field needs to look like the rest of the order box: a full-width text area in the page\'s font.' },
    { path: 'order.js', lines: [6, 6], why: 'the page reads the note from the field it added: needed to send it.' },
    { path: 'order.js', lines: [14, 14], why: 'the note goes with the order, trimmed: that is the feature.' },
    { path: 'server/order-routes.js', lines: [15, 16], why: 'the server has to keep the note, or it goes nowhere; it keeps it as text, at most 200 characters, like the field.' },
    { ...claimAt(pr, 0), why: 'they can: the field is above the Order button.' },
    { ...claimAt(pr, 1), why: 'it does: the route stores `note` with the order.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'order.js', backend },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Maya asked for a note field. For each changed file, ask: does the note need this?',
    'Run the PR, then main, and compare the header. One file changes something the note never touches.',
    '`hours.js` makes `formatHour` give “7 AM” instead of “7:00”, so every time on the page changes, and “Nothing else on the page changes” doesn\'t hold. Comment on it as scope, then Request changes.'
  ],
  debrief: {
    title: 'A note, and a new clock',
    paragraphs: [
      'Everything for the note is right: the field, its style, the request, the server keeping it. Then hours.js: Sous swapped the hand-made `formatHour` for Intl\'s time format, and every time on the page changed with it. The header says “Open today 7 AM–6 PM”, the confirmation “from 7 AM”; the shop writes 7:00, like the paper menu.',
      'Maybe Intl is the better helper, maybe Maya wants 7 AM. That is a decision for its own pull request, with its own description, not a side effect of a note field. Hidden in this one, it ships without anyone deciding it, and “Nothing else on the page changes” says the opposite.',
      'How you would have caught it: for every file in the diff, ask whether the feature needs it. The field, the request and the server do; the time helper doesn\'t. Running both sides shows it too: the header differs before you even order.'
    ]
  },
  solution: [
    { comment: 'hours.js', lines: [7, 7], category: 'scope', text: 'The note doesn\'t need this: every time on the page now reads 7 AM. Please leave formatHour as it was, or send it on its own.' },
    { submit: 'request-changes', summary: 'The note is fine; the change to formatHour doesn\'t belong here.' }
  ]
}
