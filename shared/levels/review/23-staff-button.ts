// Security 5.3: "A button for staff". Maya wants to take a sold-out product off today's menu from the order page. Sous
// shows a Remove button to staff only and adds `DELETE /api/menu/:id` to the server without `requireStaff`, which the
// PATCH route right below it has: the button is hidden, the request isn't. Run the PR as Sam, a customer: no button,
// and still `removeProduct('croissant')` in the Console gets a 204 (the Network panel shows it); main has no such
// route (404). The pull request shows the server's code as a file of the diff (`server/menu-routes.js`, which never
// runs in the browser); Run the PR's scripted server answers as that code would. Tempting: hiding the button (right,
// just not the lock), `removeProduct` put on window (it gives nobody anything fetch doesn't), the PATCH route's check.
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, serverShop, withEdits } from './shop'
import { MENU_ROUTE } from '../debugging/shop-server'
import type { BackendRoute } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

const ACCOUNT = `// Who is signed in: the shop's server knows from the login cookie (Ben).
export async function whoAmI() {
  const response = await fetch('/api/me')
  return response.json()
}
`

const SERVER = `// The shop's server: today's menu (Ben). This file runs on the server, never in the browser.
import { db } from './db.js'
import { requireStaff } from './auth.js'

export function menuRoutes(app) {
  // everyone: today's products
  app.get('/api/menu', async (req, res) => {
    res.json(await db.products.today())
  })

  // staff only: a new price for a product
  app.patch('/api/menu/:id', requireStaff, async (req, res) => {
    res.json(await db.products.update(req.params.id, { price: req.body.price }))
  })
}
`

const base = serverShop({ 'account.js': ACCOUNT, 'server/menu-routes.js': SERVER }, { whoAmI: true })

const head = withEdits(base, [
  {
    path: 'server/menu-routes.js',
    replace: ['  })\n\n  // staff only: a new price', `  })

  // take a product off today's menu (the Remove button)
  app.delete('/api/menu/:id', async (req, res) => {
    await db.products.remove(req.params.id)
    res.status(204).end()
  })

  // staff only: a new price`]
  },
  {
    path: 'menu.js',
    replace: ['  return response.json()\n}\n', `  return response.json()
}

// staff: takes a product off today's menu (Maya, when something sells out)
export async function removeProduct(id) {
  const response = await fetch(\`/api/menu/\${id}\`, { method: 'DELETE' })
  return response.ok
}
`]
  },
  { path: 'app.js', replace: ['import { loadMenu } from \'./menu.js\'', 'import { loadMenu, removeProduct } from \'./menu.js\''] },
  {
    path: 'app.js',
    replace: ['    item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))\n', `    item.querySelector('.add').addEventListener('click', () => addToCart(product))
    if (me.role === 'staff') {
      const remove = document.createElement('button')
      remove.className = 'action'
      remove.type = 'button'
      remove.textContent = 'Remove'
      remove.addEventListener('click', async () => {
        if (await removeProduct(product.id)) item.remove()
      })
      item.querySelector('.add').after(remove)
    }
`]
  },
  { path: 'app.js', replace: ['Object.assign(window, { cart })', 'Object.assign(window, { cart, removeProduct })'] }
])

const PRODUCT_IDS = ['croissant', 'pain-au-chocolat', 'sourdough']

/** The shop's server as both sides have it: Sam is a customer; a new price is for staff only (403). */
const SHARED: BackendRoute[] = [
  { path: '/api/me', respond: { status: 200, json: { name: 'Sam', role: 'customer' } } },
  MENU_ROUTE,
  ...PRODUCT_IDS.map((id): BackendRoute => ({ method: 'PATCH', path: `/api/menu/${id}`, respond: { status: 403, json: { error: 'Staff only' } } }))
]

/** This pull request's server: the new route takes a product off for anyone who asks. */
const DELETES: BackendRoute[] = PRODUCT_IDS.map(id => ({ method: 'DELETE', path: `/api/menu/${id}`, respond: { status: 204 } }))

const pr: PullRequest = {
  number: 83,
  title: 'A Remove button for staff',
  branch: 'sous/remove-product',
  description: [
    'Maya wants to take a product off today\'s menu when it sells out, from the order page, without calling Ben.',
    'Staff get a Remove button next to each product; customers never see it. The server gets the route the button calls.'
  ],
  claims: [
    'Staff can take a product off today\'s menu',
    'Only staff can remove products',
    'Customers don\'t see the Remove button',
    'The menu loads as before'
  ],
  base,
  head
}

export const staffButton: ReviewScenario = {
  id: 'ai-23-staff-button',
  track: 'ai',
  kind: 'scenario',
  title: 'A button for staff',
  difficulty: 2,
  minutes: 5,
  teaches: 'missing check',
  story: [
    'When the croissants sell out, Maya calls Ben to take them off the menu. She asked Sous for a Remove button on the order page, for staff only.',
    'This pull request changes the shop\'s server too: `server/menu-routes.js` is server code, shown in the diff like any file; it never runs in the browser. Run the PR on a scripted server that answers as that code would, signed in as Sam, a customer.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'no-staff-check',
    path: 'server/menu-routes.js',
    lines: [12, 12],
    also: [claimAt(pr, 1)],
    categories: ['security', 'false-claim'],
    title: 'the new DELETE route doesn\'t check who sends it: any customer can take products off the menu, button or not',
    explanation: 'Hiding the button only tidies the page: the route itself has no `requireStaff`, so anyone who sends a DELETE (from the Console, or with curl) takes a product off. The PATCH route below it has the check.'
  }],
  tempting: [
    { path: 'app.js', lines: [22, 22], why: 'hiding the button from customers is right: they have no use for it. It just isn\'t the lock, because anyone can send the request without a button; the check that keeps them out belongs on the server, on the route.' },
    { path: 'app.js', lines: [41, 41], why: 'putting `removeProduct` on window gives nobody anything: anyone can send the same request with `fetch` or curl. That is exactly why the server has to check.' },
    { path: 'server/menu-routes.js', lines: [18, 18], why: 'this route has its check: `requireStaff` answers 403 to anyone who isn\'t staff. Compare it with the route the pull request adds.' },
    { ...claimAt(pr, 2), why: 'that holds: the button only shows when `me.role` is staff. Hidden is not forbidden, though.' },
    { ...claimAt(pr, 3), why: 'it does: `loadMenu` and the menu\'s route are unchanged.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'app.js', backend: { routes: [...SHARED, ...DELETES] }, baseBackend: { routes: SHARED } },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR. You are Sam, a customer: no Remove buttons. The page put `removeProduct` on window for trying it out, so call `await removeProduct(\'croissant\')` in the Console and look at the Network panel. What did the server answer?',
    'The button is hidden, the request isn\'t: anyone can send it. Which side decides who may take a product off the menu? Compare the new route with the one below it.',
    '`server/menu-routes.js:12` adds the DELETE route without `requireStaff`, so the server takes products off for anyone. Comment on it as security, then Request changes.'
  ],
  debrief: {
    title: 'Hidden is not forbidden',
    paragraphs: [
      'The Remove button only shows for staff, but the button was never the lock. The browser is the customer\'s: Sam can call `removeProduct`, or send `DELETE /api/menu/croissant` with `fetch` or curl, and the server answers 204 and takes the croissants off the menu. The route Sous added has no `requireStaff`, the check the PATCH route right below it has (try it: PATCH answers Sam 403).',
      'The fix is on the server: `app.delete(\'/api/menu/:id\', requireStaff, …)`, so the route itself refuses anyone who isn\'t staff, as PATCH does. Keep hiding the button too: that is good manners, not security. A test that calls the route as a customer and expects 403 keeps it that way.',
      'How you would have caught it: for every new route, ask who may call it and where that is checked. A check in the page decides what people see; only a check on the server decides what they can do.'
    ]
  },
  solution: [
    { comment: 'server/menu-routes.js', lines: [12, 12], category: 'security', text: 'No requireStaff: any customer can send DELETE and take products off, button or not. Add the check, as PATCH has.' },
    { submit: 'request-changes', summary: 'The DELETE route doesn\'t check that the caller is staff.' }
  ]
}
