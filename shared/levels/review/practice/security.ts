// Practice tasks for Security (ADR 0008): two per scenario, about 30 s each over one or two small files. "Spot it": a
// hole someone could misuse (a name put in as HTML, a mail key in the page, a staff route any customer can call, a
// `?next=` that leaves the site, an id taken from the address); comment on it as security and request changes.
// "Verdict": is it safe, and does it do what it says? Three are safe and should be approved (a publishable key with the
// secret one on the server, a redirect checked by its origin, an order looked up for its own customer); one escapes
// text that `textContent` already shows as text (a bug, not a hole: the category is a choice), and one moves the staff
// check from the server into the page. Server code is a `server/…` file, shown like any other.
import { CART } from '../../debugging/bakery'
import { withEdits } from '../shop'
import { spotIt, verdict } from './tasks'

const SPOT_TASK = 'Someone could misuse this. Comment on the line that lets them, and request changes.'
const VERDICT_TASK = 'Is it safe, and does it do what it says? Approve it, or request changes on the line that isn\'t, and say why in one line.'

const MENU_ROUTES = `// The shop's server: today's menu (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireStaff } from './auth.js'

export function menuRoutes(app) {
  // staff only: a new price for a product
  app.patch('/api/menu/:id', requireStaff, async (req, res) => {
    res.json(await db.products.update(req.params.id, { price: req.body.price }))
  })
}
`

export const welcomeBack = spotIt({
  id: 'ai-practice-welcome-back',
  practises: 'ai-21-customer-reviews',
  title: 'Welcome back',
  task: SPOT_TASK,
  pr: {
    number: 86,
    title: 'Greet customers by name',
    branch: 'sous/welcome-back',
    description: ['Maya wants signed-in customers greeted by the name on their account.'],
    claims: ['Signed-in customers see “Welcome back, Sam!” at the top', 'The name shows in bold'],
    base: { 'cart.js': CART },
    head: {
      'cart.js': CART,
      'welcome.js': `// "Welcome back, Sam!" at the top for signed-in customers (Maya).
const banner = document.querySelector('#welcome')

export function renderWelcome(customer) {
  banner.innerHTML = \`Welcome back, <strong>\${customer.name}</strong>!\`
  banner.hidden = false
}
`
    }
  },
  issues: [{
    id: 'name-html',
    path: 'welcome.js',
    lines: [5, 5],
    categories: ['security'],
    title: 'the customer\'s name goes into `innerHTML`: a name with markup in it runs its code',
    explanation: 'Customers choose their own name when they sign up, so it is text from outside: in `innerHTML` it becomes markup, and a name with an image whose `onerror` holds code runs that code.'
  }],
  tempting: [{ claim: 1, why: 'it does: the strong element is fixed text in the template. It is the name inside it that must not be HTML.' }],
  hint: 'Who writes `customer.name`? And what does `innerHTML` do with a name that looks like a tag?',
  why: 'A name is text the customer typed: in `innerHTML` it is markup, and its code runs. Make the strong element with `createElement` and put the name in with `textContent`.',
  solution: [
    { comment: 'welcome.js', lines: [5, 5], category: 'security', text: 'customer.name goes into innerHTML: a name with markup runs. createElement + textContent.' },
    { submit: 'request-changes' }
  ]
})

export const escapedTwice = verdict({
  id: 'ai-practice-escaped-twice',
  practises: 'ai-21-customer-reviews',
  title: 'Escaped twice',
  task: VERDICT_TASK,
  pr: {
    number: 87,
    title: 'Escape reviews before they show',
    branch: 'sous/escape-reviews',
    description: ['To be extra safe, review texts are escaped before they go into the page.'],
    claims: ['Reviews are safe to show: no markup in them runs', 'Reviews show exactly as customers wrote them'],
    base: {},
    head: {
      'review-text.js': `// A review's text under the products, escaped first to be extra safe (Sous).
function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function reviewText(review) {
  const text = document.createElement('p')
  text.textContent = escapeHtml(review.text)
  return text
}
`
    }
  },
  issues: [{
    id: 'double-escape',
    path: 'review-text.js',
    lines: [8, 8],
    breaks: [1],
    categories: ['bug', 'false-claim'],
    title: '`textContent` already shows text as text: escaped first, “Bread & butter” shows as “Bread &amp; butter”',
    explanation: '`textContent` never reads markup, so escaping before it only puts the entities on screen: `&` shows as `&amp;`, `<3` as `&lt;3`. Safe, but wrong: a bug, not a hole.'
  }],
  tempting: [
    { path: 'review-text.js', lines: [3, 3], why: 'the escaping is right, for text that goes into HTML. Here nothing does: `textContent` takes text as it is.' },
    { claim: 0, why: 'that holds: `textContent` never runs markup, escaped or not.' }
  ],
  hint: 'Does `textContent` read markup? Then what does escaping before it put on the screen?',
  why: 'Request changes, as a bug: `textContent` is already safe, so the escaping shows up as text (“&amp;”). Either `textContent` or escaping into HTML, never both.',
  solution: [
    { comment: 'review-text.js', lines: [8, 8], category: 'bug', text: 'textContent is already safe: escaping first shows &amp; on screen.' },
    { submit: 'request-changes', summary: 'Escaped and then textContent: customers see &amp; instead of &.' }
  ]
})

export const mailKey = spotIt({
  id: 'ai-practice-mail-key',
  practises: 'ai-22-payment-key',
  title: 'Mail from the page',
  task: SPOT_TASK,
  pr: {
    number: 88,
    title: 'Contact form sends Maya an email',
    branch: 'sous/contact-mail',
    description: ['The contact form now emails Maya straight from the page, through the shop\'s mail service.'],
    claims: ['Messages from the contact form reach Maya by email', 'The mail key is safe in `contact.js`: customers never see it'],
    base: {},
    head: {
      'contact.js': `// The contact form: sends the message to Maya by email, through the mail service (Sous).
const MAIL_API = 'https://api.mail-service.example/v3/send'
const MAIL_KEY = 'ms_live_key-9Tq4-Wd2X-p7Lc'

export async function sendMessage(from, text) {
  const response = await fetch(MAIL_API, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${MAIL_KEY}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'maya@cornerbakery.shop', replyTo: from, text })
  })
  return response.ok
}
`
    }
  },
  issues: [{
    id: 'mail-key',
    path: 'contact.js',
    lines: [3, 3],
    also: [{ path: 'contact.js', lines: [8, 8] }],
    breaks: [1],
    categories: ['security', 'false-claim'],
    title: 'the mail service\'s secret key ships to every visitor: anyone can send mail as the shop',
    explanation: 'Every visitor downloads `contact.js`, and every message sends the key in its Authorization header: with it anyone can send mail in the shop\'s name (spam, phishing).'
  }],
  hint: 'Who downloads `contact.js`? What could anyone do with `MAIL_KEY`?',
  why: 'Everything the browser gets is public. The page posts the message to the shop\'s own server, which sends the mail with a key from its environment, and this key gets rotated.',
  solution: [
    { comment: 'contact.js', lines: [3, 3], category: 'security', text: 'The mail key ships to every visitor: anyone can send mail as the shop. Send it from the server, rotate the key.' },
    { submit: 'request-changes' }
  ]
})

export const publishableKey = verdict({
  id: 'ai-practice-publishable-key',
  practises: 'ai-22-payment-key',
  title: 'A key made for the browser',
  task: VERDICT_TASK,
  pr: {
    number: 89,
    title: 'Pay by card, the safe way',
    branch: 'ben/card-payments',
    description: ['Ben\'s take on card payments: the server makes the payment for the order, and Crumbpay\'s card form in the page takes the card.'],
    claims: ['The secret key stays on the server, in its environment', 'The page gets only the publishable key', 'Customers pay the total the server worked out for their own order'],
    base: {},
    head: {
      'payment.js': `// Pay by card: the server makes the payment, Crumbpay's card form (its script, in index.html) takes the card.
const PUBLISHABLE_KEY = 'pk_live_cb-3Fz8-Qm1W-k6Pd'

export async function payOrder(order, box) {
  const response = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: order.number }) })
  const { payment } = await response.json()
  window.Crumbpay.cardForm(box, { key: PUBLISHABLE_KEY, payment })
}
`,
      'server/payment-routes.js': `// The shop's server: card payments (Ben). This file runs on the server, never in the browser.
import { crumbpay } from './crumbpay.js'
import { db } from './db.js'
import { requireLogin } from './auth.js'

const payments = crumbpay(process.env.CRUMBPAY_SECRET_KEY)

export function paymentRoutes(app) {
  app.post('/api/payments', requireLogin, async (req, res) => {
    const order = await db.orders.find(req.body.order)
    if (!order || order.customer !== req.user.id) return res.status(404).json({ error: 'No such order' })
    const payment = await payments.create({ amount: Math.round(order.total * 100), currency: 'eur' })
    res.json({ payment: payment.id })
  })
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'payment.js', lines: [2, 2], why: 'a publishable key is made for the browser: it can only show Crumbpay\'s card form for this shop, never charge, refund or read payments.' },
    { path: 'server/payment-routes.js', lines: [6, 6], why: 'the secret key comes from the server\'s environment: it is in no file, and never reaches a browser.' },
    { path: 'server/payment-routes.js', lines: [12, 12], why: 'the amount is the order\'s total from the server\'s own database, in cents: the page only says which order.' }
  ],
  hint: 'Which key does the browser get, and what can that kind of key do? Where does the secret one come from, and where does the amount?',
  why: 'Approve: the publishable key is made for the browser, the secret key comes from the server\'s environment, and the server charges its own total for the customer\'s own order.',
  solution: [{ submit: 'approve', summary: 'Only the publishable key is in the page; the secret one and the amount stay on the server.' }]
})

export const refundAnyone = spotIt({
  id: 'ai-practice-refund-anyone',
  practises: 'ai-23-staff-button',
  title: 'Refunds for everyone',
  task: SPOT_TASK,
  pr: {
    number: 90,
    title: 'Refund button on the staff page',
    branch: 'sous/refunds',
    description: ['When an order goes wrong, Maya wants to give the money back from the staff page.'],
    claims: ['Staff can refund an order from the staff page', 'Only staff can give money back'],
    base: {},
    head: {
      'server/refund-routes.js': `// The shop's server: refunds, for an order that went wrong (Sous). Runs on the server, never in the browser.
import { db } from './db.js'
import { refund } from './payments.js'
import { requireLogin } from './auth.js'

export function refundRoutes(app) {
  // the Refund button on the staff page
  app.post('/api/orders/:number/refund', requireLogin, async (req, res) => {
    const order = await db.orders.find(Number(req.params.number))
    if (!order) return res.status(404).json({ error: 'No such order' })
    await refund(order)
    res.json({ refunded: order.total })
  })
}
`
    }
  },
  issues: [{
    id: 'login-not-staff',
    path: 'server/refund-routes.js',
    lines: [8, 8],
    breaks: [1],
    categories: ['security', 'false-claim'],
    title: '`requireLogin` lets every signed-in customer refund any order, their own included',
    explanation: 'Signed in is not staff: any customer can send the POST and get money back, for an order they already ate. A staff action needs `requireStaff` on the route itself.'
  }],
  tempting: [{ path: 'server/refund-routes.js', lines: [10, 10], why: 'a 404 for a number that isn\'t an order is right.' }],
  hint: 'The route needs someone signed in. Which of the people who can sign in should be able to give money back?',
  why: '`requireLogin` only says someone is signed in: every customer could refund any order. A staff route needs `requireStaff`, on the server.',
  solution: [
    { comment: 'server/refund-routes.js', lines: [8, 8], category: 'security', text: 'requireLogin, not requireStaff: any customer can refund any order.' },
    { submit: 'request-changes' }
  ]
})

export const checkedInPage = verdict({
  id: 'ai-practice-checked-in-page',
  practises: 'ai-23-staff-button',
  title: 'Checked in the page',
  task: VERDICT_TASK,
  pr: {
    number: 91,
    title: 'One staff check is enough',
    branch: 'sous/one-check',
    description: ['The staff page only shows the price field to staff now, so the server doesn\'t need to check again. One check is easier to keep right.'],
    claims: ['Staff can still change prices', 'Customers still can\'t change prices: they never see the field'],
    base: { 'server/menu-routes.js': MENU_ROUTES },
    head: {
      'server/menu-routes.js': withEdits({ 'server/menu-routes.js': MENU_ROUTES }, [
        { path: 'server/menu-routes.js', replace: ['import { requireStaff } from \'./auth.js\'\n', ''] },
        { path: 'server/menu-routes.js', replace: ['  // staff only: a new price for a product\n  app.patch(\'/api/menu/:id\', requireStaff, async', '  // staff only: a new price for a product (the page shows the field to staff only)\n  app.patch(\'/api/menu/:id\', async'] }
      ])['server/menu-routes.js']!
    }
  },
  issues: [{
    id: 'check-removed',
    path: 'server/menu-routes.js',
    lines: [6, 6],
    removed: [7, 7],
    also: [{ path: 'server/menu-routes.js', removed: [3, 3] }],
    breaks: [1],
    says: [0],
    categories: ['security', 'false-claim'],
    title: 'without `requireStaff` anyone can send the PATCH and set a price, field or not',
    explanation: 'The field is the page; the request is anyone\'s. With the check gone from the route, a customer can send the PATCH and make the croissant cost 0.01 €.'
  }],
  hint: 'Hiding the field decides what customers see. What decides what they can send?',
  why: 'Request changes: the page hides the field, but anyone can still send the PATCH. The check that keeps them out is `requireStaff`, on the server.',
  solution: [
    { comment: 'server/menu-routes.js', lines: [6, 6], category: 'security', text: 'Without requireStaff anyone can send this PATCH: hiding the field is no check.' },
    { submit: 'request-changes', summary: 'The staff check moved from the server into the page, where it protects nothing.' }
  ]
})

export const backWhereYouWere = spotIt({
  id: 'ai-practice-back-where-you-were',
  practises: 'ai-24-price-from-basket',
  title: 'Back where you were',
  task: SPOT_TASK,
  difficulty: 2,
  pr: {
    number: 92,
    title: 'Back to the page you came from after signing in',
    branch: 'sous/next-after-login',
    description: ['Links to the sign-in page say where to go afterwards: /login?next=/orders.'],
    claims: ['After signing in, customers land on the page they came from', 'Only our own pages: an address on another site goes to the order page'],
    base: {},
    head: {
      'login.js': `// After signing in, back to the page the customer came from: /login?next=/orders (Sous).
export function nextPage(search) {
  const next = new URLSearchParams(search).get('next')
  if (next && next.startsWith('/')) return next
  return '/order'
}

// after a good sign-in
export function afterSignIn() {
  location.assign(nextPage(location.search))
}
`
    }
  },
  issues: [{
    id: 'protocol-relative',
    path: 'login.js',
    lines: [4, 4],
    breaks: [1],
    categories: ['security', 'false-claim'],
    title: '`//bakery-deals.example` starts with a slash too: the browser takes it to another site (an open redirect)',
    explanation: 'An address that starts with two slashes leaves out only the scheme: `//bakery-deals.example/login` is another site, and so is `/\\bakery-deals.example/login` (browsers read a backslash in an address as a slash). A link to /login?next=//… sends freshly signed-in customers wherever its author wants.'
  }],
  tempting: [{ path: 'login.js', lines: [3, 3], why: 'reading `next` from the query is fine: it is what the next line lets through that matters.' }],
  hint: 'Which addresses start with a slash? Where does the browser go for `//bakery-deals.example/login`?',
  why: '`//bakery-deals.example/login` (or `/\\bakery-deals.example/login`) starts with a slash and is another site, so anyone can make a sign-in link that ends there: an open redirect. Compare origins: `new URL(next, location.origin).origin === location.origin`.',
  solution: [
    { comment: 'login.js', lines: [4, 4], category: 'security', text: 'startsWith(\'/\') lets //other.site through: an open redirect. Compare the URL\'s origin with ours.' },
    { submit: 'request-changes' }
  ]
})

export const ownPagesOnly = verdict({
  id: 'ai-practice-own-pages-only',
  practises: 'ai-24-price-from-basket',
  title: 'Only our own pages',
  task: VERDICT_TASK,
  difficulty: 2,
  pr: {
    number: 93,
    title: 'Back where you were, on our own site only',
    branch: 'ben/next-after-login',
    description: ['After signing in, back to the page you came from, as long as it is one of ours.'],
    claims: ['Customers land on the page they came from', 'An address on another site goes to the order page'],
    base: {},
    head: {
      'login.js': `// After signing in, back to the page the customer came from, on our own site only (Ben).
export function nextPage(search) {
  const next = new URLSearchParams(search).get('next') ?? '/order'
  try {
    const url = new URL(next, location.origin)
    return url.origin === location.origin ? url.href : '/order'
  } catch {
    // not an address at all (http://[): the order page too
    return '/order'
  }
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'login.js', lines: [5, 5], why: '`new URL(next, location.origin)` reads a path against our own address and keeps a whole address\'s own: `//bakery-deals.example` and `javascript:…` get another origin.' },
    { path: 'login.js', lines: [6, 6], why: 'comparing origins is the check that holds: only our own site passes, and the whole address goes on, so no path can turn into another site.' }
  ],
  hint: 'What does `new URL` make of `//bakery-deals.example`, and of `/orders`? What do their origins say?',
  why: 'Approve: `new URL` gives every address its real origin (`//other.site`, a backslash and `javascript:` included), only our own passes, and one that isn\'t an address at all goes to the order page. That is the allow-list a redirect needs.',
  solution: [{ submit: 'approve', summary: 'The origin check sends anything off our site to the order page.' }]
})

export const whoseId = spotIt({
  id: 'ai-practice-whose-id',
  practises: 'ai-25-order-by-number',
  title: 'Whose id?',
  task: SPOT_TASK,
  difficulty: 2,
  pr: {
    number: 94,
    title: 'Receipts, checked against the customer',
    branch: 'sous/receipts-checked',
    description: ['Receipts are now checked: the address names the customer, and the order has to be theirs.'],
    claims: ['A customer\'s receipt is at /api/customers/c-1187/orders/1042', 'Customers can only open their own orders'],
    base: {},
    head: {
      'server/receipt-routes.js': `// The shop's server: receipts (Sous). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function receiptRoutes(app) {
  app.get('/api/customers/:customer/orders/:number', requireLogin, async (req, res) => {
    const order = await db.orders.find(Number(req.params.number))
    if (!order || order.customer !== req.params.customer) return res.status(404).json({ error: 'No such order' })
    res.json(order)
  })
}
`
    }
  },
  issues: [{
    id: 'id-from-address',
    path: 'server/receipt-routes.js',
    lines: [8, 8],
    breaks: [1],
    says: [0],
    categories: ['security', 'false-claim'],
    title: 'the order is checked against the customer the address names, which the caller writes',
    explanation: 'The address is the caller\'s: anyone who asks for /api/customers/c-2231/orders/1041 passes the check with Lena\'s id. Who is asking is `req.user.id`, from the login.'
  }],
  hint: 'Who writes `req.params.customer`? Which id says who is really asking?',
  why: 'The address is the caller\'s, so the check compares the order with an id anyone can type. Compare with `req.user.id`, the customer the login says it is.',
  solution: [
    { comment: 'server/receipt-routes.js', lines: [8, 8], category: 'security', text: 'req.params.customer comes from the caller: compare with req.user.id.' },
    { submit: 'request-changes' }
  ]
})

export const yourOrdersOnly = verdict({
  id: 'ai-practice-your-orders-only',
  practises: 'ai-25-order-by-number',
  title: 'Your orders only',
  task: VERDICT_TASK,
  pr: {
    number: 95,
    title: 'Receipts for the customer\'s own orders',
    branch: 'ben/receipts',
    description: ['The receipt route, with the check that the order is the customer\'s.'],
    claims: ['Customers can open the receipts of their own orders', 'Someone else\'s order answers 404, as if it didn\'t exist'],
    base: {},
    head: {
      'server/receipt-routes.js': `// The shop's server: receipts (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireLogin } from './auth.js'

export function receiptRoutes(app) {
  app.get('/api/orders/:number', requireLogin, async (req, res) => {
    const order = await db.orders.find(Number(req.params.number))
    // someone else's order is not found either: nobody learns which numbers are taken
    if (!order || order.customer !== req.user.id) return res.status(404).json({ error: 'No such order' })
    res.json(order)
  })
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'server/receipt-routes.js', lines: [9, 9], why: '404 rather than 403 is on purpose: someone else\'s order looks like none at all, so trying numbers tells nobody which exist.' },
    { path: 'server/receipt-routes.js', lines: [7, 7], why: 'looking the order up by its number is fine: the line after it checks whose it is, with `req.user.id` from the login.' }
  ],
  hint: 'Where does the id the order is compared with come from: the request, or the login?',
  why: 'Approve: the order is compared with `req.user.id`, the customer the login says it is, and anything else is a 404.',
  solution: [{ submit: 'approve', summary: 'The order is checked against the signed-in customer, and other orders are a 404.' }]
})
