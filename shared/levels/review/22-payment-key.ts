// Security 5.2: "Added the payment key". Maya signed the shop up with Crumbpay (a made-up payment provider) for card
// payments. Sous puts both of Crumbpay's keys into payment.js, a file every customer's browser downloads, and uses the
// secret one from the page: Run the PR's Network panel shows `Authorization: Bearer sk_live_…` going out with every
// Pay. And the amount is the one the browser worked out from its basket (a second issue: 5.4's lesson). The fix: the
// shop's server makes the payment page, for the amount it works out itself, with the secret key from its environment,
// and the leaked key is rotated. Tempting: the publishable key, which is made for the browser. The keys are made up,
// with no long run of letters or digits, so provider-specific secret scanners don't take them for real ones.
import { orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { BackendSpec } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

/** Crumbpay's two keys as Sous pasted them (made up). */
export const PUBLISHABLE_KEY = 'pk_live_cb-3Fz8-Qm1W-k6Pd'
export const SECRET_KEY = 'sk_live_cb-7Hq2-Lw9R-t4Xn'

const base = orderSite({})

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['aria-label="Today\'s products"></ul>\n', `aria-label="Today's products"></ul>
    <section class="summary" aria-label="Pay">
      <button class="action" id="pay" type="button">Pay by card</button>
      <p class="note" id="pay-methods"></p>
      <p class="note" id="pay-status" role="status"></p>
    </section>
`]
  },
  {
    path: 'payment.js',
    replace: ['', `// Card payments with Crumbpay, which Maya signed the shop up for (keys: Crumbpay's dashboard, Developers).
import { cart } from './cart.js'
import { formatPrice } from './money.js'

const CRUMBPAY = 'https://api.crumbpay.example/v1'
const PUBLISHABLE_KEY = '${PUBLISHABLE_KEY}'
const SECRET_KEY = '${SECRET_KEY}'

// what the shop takes, for the line under the Pay button
async function paymentMethods() {
  const response = await fetch(\`\${CRUMBPAY}/methods\`, { headers: { Authorization: \`Bearer \${PUBLISHABLE_KEY}\` } })
  if (!response.ok) return []
  return (await response.json()).methods
}

// a page on Crumbpay where the customer pays this amount by card
async function paymentLink(total) {
  const response = await fetch(\`\${CRUMBPAY}/payment-links\`, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${SECRET_KEY}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(total * 100), currency: 'eur' })
  })
  if (!response.ok) throw new Error(\`Crumbpay answered \${response.status}\`)
  return (await response.json()).url
}

const status = document.querySelector('#pay-status')

document.querySelector('#pay').addEventListener('click', async () => {
  const total = cart.items.reduce((sum, item) => sum + item.price, 0)
  if (total === 0) return
  const link = document.createElement('a')
  link.href = await paymentLink(total)
  link.textContent = \`Pay \${formatPrice(total)} € on Crumbpay\`
  status.replaceChildren(link)
})

paymentMethods().then((methods) => {
  document.querySelector('#pay-methods').textContent = \`We take \${methods.join(' and ')}.\`
})
`]
  },
  { path: 'app.js', replace: ['import { formatPrice } from \'./money.js\'\n', 'import { formatPrice } from \'./money.js\'\nimport \'./payment.js\'\n'] }
])

/** What Crumbpay's API answers for the shop's keys (another origin: its answers allow the shop's page). */
const CORS = {
  'Access-Control-Allow-Origin': 'https://cornerbakery.shop',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
}

const backend: BackendSpec = {
  routes: [
    { path: 'https://api.crumbpay.example/v1/methods', respond: { status: 200, json: { methods: ['cards', 'bank transfers'] }, headers: CORS, delay: 90 } },
    { method: 'POST', path: 'https://api.crumbpay.example/v1/payment-links', respond: { status: 201, json: { url: 'https://pay.crumbpay.example/pl_4127' }, headers: CORS, delay: 120 } }
  ]
}

const pr: PullRequest = {
  number: 82,
  title: 'Pay by card with Crumbpay',
  branch: 'sous/card-payments',
  description: [
    'Maya signed the shop up with Crumbpay for card payments. Pay by card now asks Crumbpay for a payment page for the basket\'s total and links to it.',
    'Crumbpay\'s dashboard gave us two keys. Both are in `payment.js`, so this works without a server change.'
  ],
  claims: [
    'Customers can pay their basket by card',
    'The secret key stays private: it is only in our code, never shown on the page',
    'The publishable key is the one Crumbpay made for the browser',
    'Amounts go to Crumbpay in cents, as its API wants'
  ],
  base,
  head
}

export const paymentKey: ReviewScenario = {
  id: 'ai-22-payment-key',
  track: 'ai',
  kind: 'scenario',
  title: 'Added the payment key',
  difficulty: 2,
  minutes: 5,
  teaches: 'secret in code',
  story: [
    'Corner Bakery takes cards now: Maya signed up with Crumbpay, and its dashboard gave her two keys, a publishable one and a secret one. She passed both to Sous with “make the Pay button work”.',
    'Sous\'s pull request works: try it. Then look at where each key ends up, and who can read it there.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'secret-key',
    path: 'payment.js',
    lines: [7, 7],
    also: [{ path: 'payment.js', lines: [20, 20] }, paragraphAt(pr, 1), claimAt(pr, 1)],
    categories: ['security', 'false-claim'],
    title: 'the secret key is in a file every customer\'s browser downloads: anyone can read it, and charge, refund and read payments as the shop',
    explanation: 'Whatever the browser gets is public: anyone can read `payment.js`, and every Pay sends the secret key in its Authorization header. The secret key belongs on the shop\'s server, read from its environment, and this one has to be rotated.'
  }, {
    id: 'browser-amount',
    path: 'payment.js',
    lines: [21, 21],
    also: [{ path: 'payment.js', lines: [30, 30] }],
    categories: ['security'],
    title: 'the amount is the basket total the customer\'s browser worked out: whoever has the page decides what they pay',
    explanation: 'The total comes from `cart.items` in the browser, and the customer can change anything there. Turning euros into cents is right; where the euros come from is not: the server works the amount out from the order itself, as it holds the key.'
  }],
  tempting: [
    { path: 'payment.js', lines: [6, 6], why: 'a publishable key is public by design: Crumbpay made it for the browser, and it can only say which shop is asking (here: what it takes), never charge, refund or read payments. That is true of this kind of key because its provider says so; any other key or token is a secret.' },
    { ...claimAt(pr, 2), why: 'it is: Crumbpay\'s publishable key (`pk_`) is made for pages, and it can\'t move money.' },
    { ...claimAt(pr, 3), why: 'they do: `Math.round(total * 100)`, so 4.80 € goes as 480. Whose total it is, is another question.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'payment.js', backend },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Run the PR, add a croissant and click Pay by card. Then open the Network panel and look at what the page sent to Crumbpay. Who else can see that?',
    'Every customer\'s browser downloads `payment.js` and sends its requests where anyone can read them. Of the two keys, which one may a browser have, and which one can charge and refund? And who works out the amount?',
    '`payment.js:7` puts the secret key into the page\'s own code, and `payment.js:21` asks for the amount the browser worked out. Comment on both as security (the server holds the key and works out the amount; this key must be rotated), then Request changes.'
  ],
  debrief: {
    title: 'Anything the browser gets is public',
    paragraphs: [
      'Every file of the order page goes to every customer\'s browser: anyone can open `payment.js` (view the source), and every Pay sends `Authorization: Bearer sk_live_…` where the Network panel shows it. So the secret key is public the moment this ships, and with it anyone can charge, refund and read the shop\'s payments. No way of writing it hides it: a key the browser has is a key the customer has.',
      'The fix: the page asks the shop\'s own server for the payment page of an order, and the server works out the amount from the order itself (the browser\'s total is the customer\'s to change, as in 5.4) and asks Crumbpay with the secret key, which it reads from its environment (`process.env.CRUMBPAY_SECRET_KEY`), never from a file in the repository. And since the key is now in a pull request, treat it as leaked: rotate it in Crumbpay\'s dashboard (make a new one, switch the old one off). Deleting the line doesn\'t take it back, it stays in the history: the Git track\'s Committed a secret shows why.',
      'The publishable key is fine where it is: Crumbpay made it for the browser, and it can only say which shop is asking. That is true of that one kind of key because the provider says so; treat every other key, token and password as a secret. How you would have caught it: for every key in a pull request, ask what it can do, and who gets the file it is in.'
    ]
  },
  solution: [
    { comment: 'payment.js', lines: [7, 7], category: 'security', text: 'The secret key ships to every browser: anyone can charge and refund with it. Make the payment on the server, key from the environment, and rotate this one.' },
    { comment: 'payment.js', lines: [21, 21], category: 'security', text: 'The amount is the browser\'s basket total: a customer can pay what they like. The server works it out from the order.' },
    { submit: 'request-changes', summary: 'The secret Crumbpay key is in the page\'s code, and the amount is the one the browser worked out.' }
  ]
}
