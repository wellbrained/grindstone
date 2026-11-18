// Auth & tokens 3.2: a review runs. The page shows the reviews customers write with innerHTML, and Mallory's review is
// an image whose onerror sends a request as Lena: it changes the email her receipts go to. Her session is an HttpOnly,
// SameSite=Lax cookie, and neither helps: the handler runs as the page's own code, from the page's own site. Learn:
// show untrusted text with textContent (or escape it where it becomes HTML); a sanitising regex misses what the next
// customer writes, and HttpOnly and SameSite only keep a session from being taken or ridden by other sites.
import { probesGoal } from '../debugging/checks'
import { accountGuards } from './accounts'
import { AUTH_HEAD, COOKIE_API, COOKIE_CUSTOMER, SIGNED_IN, authApp, authPage } from './auth'
import { predictedGoal } from './checks'
import { API, SHOP, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** Mallory's review, as the review form stored it. */
export const MALLORY = 'Lovely crust! <img src="x" onerror="fetch(\'https://api.cornerbakery.shop/account/email\', { method: \'POST\', credentials: \'include\', body: new URLSearchParams(\'email=mallory@cheap-flour.example\') })">'

/**
 * Reviews no text names, posted by the check run as other customers would (guards): each would get past a sanitising
 * regex (a capital IMG, spaces around `=`, a `<script>` among them), and each must show as written, as text.
 */
export const GUARD_REVIEWS = [
  { name: 'Sam', text: 'Five stars <IMG SRC=x ONERROR=this.remove()> from me' },
  { name: 'Jo', text: 'Nice <b onmouseover = "this.remove()">rye</b> & <script>alert(1)</script> soft inside' }
] as const

/** How the page shows one review (as text, once fixed). */
export const reviewLine = (review: { name: string, text: string }) => `“${review.text}” · ${review.name}`

/** The line that puts the reviews into the page as HTML. */
export const AS_HTML = '  reviews.innerHTML = all.map(review => `<li>“${review.text}” · ${review.name}</li>`).join(\'\')'

const REVIEWS_APP = [
  '',
  '// The reviews, as customers wrote them (Jonas)',
  'const reviews = document.querySelector(\'#reviews\')',
  'async function showReviews() {',
  '  const response = await fetch(`${API}/reviews`)',
  '  const all = await response.json()',
  AS_HTML,
  '}',
  'document.querySelector(\'#reviews-open\').addEventListener(\'click\', showReviews)'
]

const SERVER = `${AUTH_HEAD}

${COOKIE_CUSTOMER}

// POST /login: the session cookie holds a signed token, HttpOnly and SameSite=Lax since the widget (Ben)
app.post('/login', (req, res) => {
  const customer = signInAs(req)
  if (!customer) return res.status(401).json({ error: 'Wrong email or password' })
  res.cookie('session', jwt.sign({ sub: customer }, SECRET, { expiresIn: '1h' }), { httpOnly: true, secure: true, sameSite: 'lax' })
  res.json({ name: CUSTOMERS[customer].name })
})

// GET /account: who is signed in
app.get('/account', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json({ name: customer.name })
})

// POST /account/email: where the signed-in customer's receipts go
app.post('/account/email', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  customer.email = String(req.body?.email ?? '')
  res.json({ email: customer.email })
})

// GET /orders and POST /orders: the signed-in customer's orders, and a new one
app.get('/orders', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  res.json(customer.orders)
})
const MENU = { croissant: 'Butter croissant', sourdough: 'Sourdough loaf', rye: 'Rye loaf' }
app.post('/orders', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in' })
  const name = MENU[req.body?.item]
  const quantity = Number(req.body?.quantity)
  if (!name || !(quantity >= 1)) return res.status(400).json({ error: 'Which item, and how many?' })
  customer.orders.push({ name, quantity })
  res.status(201).json({ number: 1041 + customer.orders.length })
})

// What customers wrote: the review form posts here, anyone may read them (Maya)
const REVIEWS = [
  { name: 'Mara', text: 'Best croissants in town.' },
  { name: 'Mallory', text: \`${MALLORY}\` }
]
app.get('/reviews', (req, res) => res.json(REVIEWS))
app.post('/reviews', (req, res) => {
  const name = String(req.body?.name ?? '').slice(0, 40)
  const text = String(req.body?.text ?? '').slice(0, 500)
  if (!name || !text) return res.status(400).json({ error: 'A name and a review, please' })
  REVIEWS.push({ name, text })
  res.status(201).json({ reviews: REVIEWS.length })
})
`

const GUARDS = accountGuards()

export const reviewRuns: WebScenario = {
  id: 'web-12-review-runs',
  track: 'web',
  kind: 'scenario',
  title: 'A review that runs',
  difficulty: 2,
  minutes: 7,
  teaches: 'innerHTML',
  story: [
    'The shop now shows what customers write about it: the page asks `GET /reviews` and puts each one into the list. Lena\'s session is an `HttpOnly`, `SameSite=Lax` cookie since the widget affair. This morning her receipts went to an address at `cheap-flour.example`. A review by Mallory looks odd.',
    'Predict what Mallory\'s review does when Lena opens the reviews. Then fix the page so every review shows exactly as its customer wrote it, as text, whatever the next one says. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'review',
      form: 'one',
      prompt: 'Lena is signed in with an `HttpOnly; SameSite=Lax` session cookie. Mallory\'s review reads `Lovely crust! <img src="x" onerror="fetch(\'…/account/email\', { method: \'POST\', credentials: \'include\', … })">`, and the page shows reviews with `innerHTML`. Lena opens the reviews. What happens?',
      options: [
        { id: 'text', text: 'Nothing: `innerHTML` doesn\'t run scripts, so the review shows as written.' },
        { id: 'httponly', text: 'The handler runs, but its request goes without Lena\'s cookie: HttpOnly keeps the cookie from scripts.', fact: { server: 'POST /account/email 401' } },
        { id: 'samesite', text: 'The handler runs, but SameSite=Lax keeps the cookie from a request a script sends.', fact: { server: 'POST /account/email 401' } },
        { id: 'changed', text: 'The image fails to load, its `onerror` runs as the page\'s own code, and the browser adds Lena\'s cookie: her email is changed.', fact: { server: 'POST /account/email 200' } }
      ],
      answer: 'changed',
      rule: '`innerHTML` turns text into elements, and an element\'s event handler (`onerror`, `onload`) runs as the page\'s own script; `HttpOnly` and `SameSite` don\'t stop a script on the page from sending requests as Lena.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      storage: [],
      time: true,
      scene: [{ click: '#sign-in' }, { click: '#reviews-open' }]
    },
    probes: [
      { id: 'who', steps: [{ text: '#who' }] },
      { id: 'mallory', steps: [{ text: '#reviews li:nth-child(2)' }] },
      { id: 'email', steps: [{ arrived: `POST ${API}/account/email` }] },
      // two more customers write reviews no text names, then Lena opens the reviews again
      {
        id: 'guarded',
        steps: [
          ...GUARD_REVIEWS.map(review => ({ fetchFrom: SHOP, request: `POST ${API}/reviews`, credentials: 'omit' as const, body: { name: review.name, text: review.text } })),
          { click: '#reviews-open' },
          { count: '#reviews li' }
        ]
      },
      { id: 'sam', steps: [{ text: '#reviews li:nth-child(3)' }] },
      { id: 'jo', steps: [{ text: '#reviews li:nth-child(4)' }] },
      { id: 'elements', steps: [{ count: '#reviews li *' }] },
      { id: 'emailAfter', steps: [{ arrived: `POST ${API}/account/email` }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: authPage({ reviews: 'list' }) }, { 'app.js': authApp(COOKIE_API, { comment: 'The shop\'s page: Lena signs in at the API, sees her orders and the reviews (Jonas).', extra: REVIEWS_APP }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Mallory\'s review does', 1),
    probesGoal('reviews', 'Every review shows exactly as its customer wrote it, as text (Mallory\'s, and the ones the next customers write): nothing in one becomes part of the page or sends anything, with nothing red in the Console, and Lena stays signed in', { who: SIGNED_IN, mallory: reviewLine({ name: 'Mallory', text: MALLORY }), email: 0, guarded: 4, sam: reviewLine(GUARD_REVIEWS[0]), jo: reviewLine(GUARD_REVIEWS[1]), elements: 0, emailAfter: 0, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'In the Network panel, the `POST account/email` came from the page itself, sent from the `onerror` of an image in Mallory\'s review. Read its cookie: the browser added Lena\'s session.',
    '`innerHTML` reads its text as HTML: a tag in a review becomes an element, and an element\'s `onerror` runs as the page\'s code. A regex that removes `<script>` or `onerror=` misses the next customer\'s spelling. `textContent` never makes elements: what a customer wrote stays text.',
    'In `app.js`, replace the `innerHTML` line in `showReviews` with one list item per review whose `textContent` is `` `“${review.text}” · ${review.name}` ``: `reviews.replaceChildren(...all.map((review) => { const item = document.createElement(\'li\'); item.textContent = …; return item }))`. Save, then Reload.'
  ],
  debrief: {
    title: 'Text stays text',
    paragraphs: [
      'That was cross-site scripting: Mallory\'s text became part of the page. `innerHTML` doesn\'t run a `<script>` it makes, but every other element it makes is real, and an image that fails to load runs its `onerror` as the page\'s own code. That code asked for Lena\'s email to change, and the browser added her cookie, as it does for any request from her page.',
      '`HttpOnly` kept the session from being read and `SameSite` kept other sites from riding it; neither helps against a script that runs on the page itself. The fix is where the text meets the page: `textContent` (or `createElement` with `textContent`) never makes an element, so every review shows as written, `<` and all. Escaping `&`, `<`, `>` and quotes before `innerHTML` does the same; a regex that strips `<script>` or `onerror=` misses `<IMG SRC=x ONERROR=…>` and the next spelling.',
      'Rejecting reviews with `<` or deleting Mallory\'s review would only fix today, and turn away the customer who writes "<3". Content-Security-Policy (chapter 7) is a second wall behind this one, not a replacement.'
    ]
  },
  solution: [
    { predict: 'changed' },
    { save: 'app.js', replace: [AS_HTML, '  reviews.replaceChildren(...all.map((review) => {\n    const item = document.createElement(\'li\')\n    item.textContent = `“${review.text}” · ${review.name}`\n    return item\n  }))'] },
    'reload'
  ]
}
