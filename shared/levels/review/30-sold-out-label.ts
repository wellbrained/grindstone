// Scope and size 6.5: "Show what's sold out". The menu from the server already says `soldOut`, and the order page
// still sells it: Maya asks for a label and a switched-off Add button. Sous does that (right), and keeps going: a
// “Tell me when it's back” button, a module for it, its style and a server route that stores customers' wishes, more
// than half of the diff and nobody asked for it (scope, a feature on top). And it is half a feature: the button tells
// customers “we'll email you”, the server only stores the wish, and nothing in the pull request sends anything,
// against “They get an email as soon as it is back on the menu” (a false claim, found on the claim or the promise).
// Run the PR: the pain au chocolat says “Sold out”, Add is off, the extra button posts its wish; main still sells it.
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, emptyReview, serverShop, withEdits } from './shop'
import type { BackendRoute, BackendSpec, JsonValue } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

const RESTOCK = `// "Tell me when it's back" under a sold-out product: the customer asks, the server keeps who wants what (Sous).
export function restockButton(product) {
  const button = document.createElement('button')
  button.className = 'restock'
  button.type = 'button'
  button.textContent = 'Tell me when it\\'s back'
  button.addEventListener('click', async () => {
    const response = await fetch('/api/restock-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: product.id })
    })
    if (response.ok) button.textContent = 'Done: we\\'ll email you when it\\'s back'
    button.disabled = response.ok
  })
  return button
}
`

const SERVER = `// The shop's server: who wants to hear when a product is back (Sous). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function restockRoutes(app) {
  // a signed-in customer asks to be told when a sold-out product is back
  app.post('/api/restock-alerts', requireLogin, async (req, res) => {
    await db.restockAlerts.create({ product: String(req.body.product), customer: req.user.id })
    res.status(201).json({ ok: true })
  })
}
`

const base = serverShop({})

const head = withEdits(base, [
  { path: 'app.js', replace: ['import { formatPrice } from \'./money.js\'\n', 'import { formatPrice } from \'./money.js\'\nimport { restockButton } from \'./restock.js\'\n'] },
  {
    path: 'app.js',
    replace: ['    item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))\n', `    item.querySelector('.add').addEventListener('click', () => addToCart(product))
    if (product.soldOut) {
      item.classList.add('sold-out')
      item.querySelector('.price').textContent = 'Sold out'
      item.querySelector('.add').disabled = true
      item.append(restockButton(product))
    }
`]
  },
  {
    path: 'style.css',
    replace: ['h2 {', `.sold-out .photo,
.sold-out .name {
  opacity: 0.5;
}

.restock {
  grid-column: 2 / -1;
  justify-self: start;
  font: inherit;
  font-size: 12px;
}

h2 {`]
  },
  { path: 'restock.js', replace: ['', RESTOCK] },
  { path: 'server/restock-routes.js', replace: ['', SERVER] }
])

/** Today's menu as the kitchen app has it this afternoon: the pain au chocolat is gone. */
const MENU: JsonValue = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8, soldOut: true },
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
]
const MENU_ROUTE: BackendRoute = { path: '/api/menu', respond: { status: 200, json: MENU, delay: 80 } }

const backend: BackendSpec = {
  routes: [MENU_ROUTE, { method: 'POST', path: '/api/restock-alerts', respond: { status: 201, json: { ok: true }, delay: 120 } }]
}

const pr: PullRequest = {
  number: 100,
  title: 'Show which products are sold out',
  branch: 'sous/sold-out-label',
  description: [
    'Maya asked for sold-out products to show it: the menu from the server already says `soldOut`, and the page now says “Sold out”, fades the product and turns its Add button off.',
    'I also added a “Tell me when it\'s back” button under each sold-out product, for customers who came for it: the server keeps who asked for what (`server/restock-routes.js`).'
  ],
  claims: [
    'Sold-out products say “Sold out”, and their Add button is off',
    'Customers can ask to hear when a sold-out product is back',
    'They get an email as soon as it is back on the menu'
  ],
  base,
  head
}

export const soldOutLabel: ReviewScenario = {
  id: 'ai-30-sold-out-label',
  track: 'ai',
  kind: 'scenario',
  title: 'Show what\'s sold out',
  difficulty: 3,
  minutes: 5,
  teaches: 'unasked feature',
  story: [
    'In the afternoon Maya marks what is gone in the kitchen app, and the menu from the server says `soldOut`. The order page ignores it and still sells the last pain au chocolat. She asked Sous for a “Sold out” label and an Add button that is off.',
    'Review what Sous sent against what Maya asked for, file by file (`server/restock-routes.js` is server code: it never runs in the browser), and run both sides on the scripted server.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'extra-feature',
      path: 'restock.js',
      lines: [1, 17],
      also: [
        { path: 'app.js', lines: [5, 5] },
        { path: 'app.js', lines: [25, 25] },
        { path: 'style.css', lines: [120, 125] },
        { path: 'server/restock-routes.js', lines: [1, 11] }
      ],
      categories: ['scope'],
      title: 'a feature nobody asked for: restock alerts, with a button, a module, a style and a server route',
      explanation: 'Maya asked for a label and an Add button that is off. On top of it Sous built a second feature: a button, restock.js, its style and a server route that stores customers\' wishes, more than half of the diff. Whether the shop wants it, and who answers those customers, is Maya\'s call, in a pull request of its own.'
    },
    {
      id: 'no-email',
      path: 'restock.js',
      lines: [13, 13],
      also: [{ path: 'server/restock-routes.js', lines: [8, 8] }, claimAt(pr, 2)],
      categories: ['false-claim'],
      title: 'the email it promises is never sent: the server stores the wish, and nothing in the pull request reads it',
      explanation: 'The button tells customers “we\'ll email you”, and the route only writes the wish to `db.restockAlerts`. Nothing in the pull request sends a mail when a product is back, so the promise to the customer, and “They get an email as soon as it is back on the menu”, don\'t hold.'
    }
  ],
  tempting: [
    { path: 'app.js', lines: [21, 24], why: 'that is what Maya asked for: the product says “Sold out”, fades, and its Add button is off.' },
    { path: 'style.css', lines: [115, 118], why: 'the faded look of a sold-out product: part of the label Maya asked for.' },
    { ...paragraphAt(pr, 1), why: 'that\'s true: Sous says openly that it added the button. Saying so doesn\'t make it asked for: comment on its code as scope.' },
    { ...claimAt(pr, 0), why: 'they do: the pain au chocolat says “Sold out”, and Add is off.' },
    { ...claimAt(pr, 1), why: 'true, they can tap the button. The trouble isn\'t this sentence but that nobody asked for the feature: comment on its code.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'app.js', backend, baseBackend: { routes: [MENU_ROUTE] } },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Maya asked for a label and an Add button that is off. Which of the changed files does that need, and which are for something else?',
    'Run the PR: there is a button nobody asked for. It promises an email: look through the diff for the code that sends it.',
    '`restock.js`, its style, its import and `server/restock-routes.js` are a second feature: comment on them as scope. And nothing sends the email: the route only stores the wish, so “They get an email as soon as it is back on the menu” is a false claim. Then Request changes.'
  ],
  debrief: {
    title: 'A label, and a feature on top',
    paragraphs: [
      'What Maya asked for is right: the pain au chocolat says “Sold out”, fades, and its Add button is off; run main and it is still for sale. Then Sous kept going: a “Tell me when it\'s back” button, a module for it, its style, a server route and a table of customers\' wishes. Nobody asked for it, and it is more than half of the diff.',
      'And it is half a feature: the button says “we\'ll email you”, the route stores the wish, and nothing anywhere sends the mail. A customer who taps it waits for an email that never comes. Extras an assistant adds unasked are often like that: they look finished in the diff, and nobody owns them.',
      'How you would have caught it: hold every file against the ask. The label needs app.js and a style; it doesn\'t need restock.js or a server route. Ask for the label alone, and for the alerts as a proposal of their own, where Maya can decide whether she wants them and who sends the mail.'
    ]
  },
  solution: [
    { comment: 'app.js', lines: [25, 25], category: 'scope', text: 'Nobody asked for restock alerts: please take them out here, and propose them on their own.' },
    { comment: 'restock.js', lines: [13, 13], category: 'false-claim', text: 'Nothing ever sends this email: the route only stores the wish.' },
    { submit: 'request-changes', summary: 'The label is right; the restock alerts are a second, unfinished feature.' }
  ]
}
