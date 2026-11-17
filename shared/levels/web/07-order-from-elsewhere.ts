// Cookies & sessions 2.2: cross-site request forgery. Ben made the session cookie SameSite=None (and Secure), so a page
// on cheap-flour.example that submits a hidden form to POST /orders orders 40 sourdough loaves on Lena's account: the
// form carries her cookie, and CORS has no say over a form. Learn: SameSite=Lax keeps a cookie from another site's POST
// (said out loud: Chrome's Lax+POST sends a cookie without SameSite for two minutes); or check where a request comes
// from, exactly (a CSRF token, or the Origin compared with the shop's), never by the attacker's name.
import { probesGoal } from '../debugging/checks'
import { ACCOUNT_HEAD, ACCOUNT_PAGE, ACCOUNT_ROUTES, CHEAP_FLOUR, LOOKALIKE_SITE, ORDER_IN, UNNAMED_SITE, accountApp, accountGuards, cheapFlour, loginRoute, lookalikeAttack, unnamedAttack } from './accounts'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The login's cookie as Ben left it. */
export const NONE_SECURE_COOKIE = 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'none\' })'

const SERVER = `${ACCOUNT_HEAD}

${loginRoute('/login', ['// None and Secure: then the browser sends it everywhere, and nobody gets signed out again (Ben)', NONE_SECURE_COOKIE])}

${ACCOUNT_ROUTES}
`

const GUARDS = accountGuards()

export const orderFromElsewhere: WebScenario = {
  id: 'web-07-order-from-elsewhere',
  track: 'web',
  kind: 'scenario',
  title: 'An order Lena never placed',
  difficulty: 3,
  minutes: 8,
  teaches: 'CSRF',
  story: [
    'After the sign-in trouble Ben made Lena\'s session cookie `SameSite=None; Secure`: “then the browser sends it everywhere, and nobody gets signed out again.” This morning Lena found an order for 40 sourdough loaves she never placed. She remembers a half-price flour page on `cheap-flour.example`, opened in another tab while she was signed in; its page is in the Other site panel.',
    'Predict what that page did. Then fix `server.js` so no other site can order on Lena\'s account, while her own order from the shop\'s page still goes through. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'form',
      form: 'one',
      prompt: 'Lena is signed in; her session cookie is `HttpOnly; Secure; SameSite=None`. She opens `cheap-flour.example`, and its page submits a hidden form: `POST https://api.cornerbakery.shop/orders` with `item=sourdough&quantity=40`. What happens?',
      options: [
        { id: 'cors', text: 'Nothing: the browser blocks a request from another origin (CORS).', fact: { row: 'POST https://api.cornerbakery.shop/orders CORS error' } },
        { id: 'preflight', text: 'The browser asks first with `OPTIONS`, and server.js does not allow it.', fact: { server: 'OPTIONS /orders 204' } },
        { id: 'placed', text: 'The order goes through: the form carries her cookie, and server.js can\'t tell it from one of hers.', fact: { server: 'POST /orders 201' } },
        { id: 'no-cookie', text: 'The form arrives without her cookie, and server.js answers `401`.', fact: { server: 'POST /orders 401' } }
      ],
      answer: 'placed',
      rule: 'A cookie goes with every request its SameSite allows, whoever starts it: with `None`, another site\'s form posts as Lena. CORS only decides who may read an answer; `Lax` keeps the cookie from another site\'s POST.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      sites: [cheapFlour(), unnamedAttack(), lookalikeAttack()],
      scene: [{ click: '#sign-in' }, { visit: CHEAP_FLOUR }, { click: '#refresh' }]
    },
    probes: [
      { id: 'attack', steps: [{ visit: CHEAP_FLOUR }] },
      { id: 'other', steps: [{ visit: UNNAMED_SITE }] },
      { id: 'lookalike', steps: [{ visit: LOOKALIKE_SITE }] },
      { id: 'before', steps: [{ click: '#refresh' }, { count: '#orders li' }] },
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      { id: 'after', steps: [{ count: '#orders li' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: ACCOUNT_PAGE }, { 'app.js': accountApp(), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what cheap-flour.example\'s page does', 1),
    probesGoal('orders', 'No other site can order on Lena\'s account (cheap-flour.example, nor any site no text names), and her own order from the shop still goes through and is her only one, with nothing red in the Console; no script on the page can read her session', { attack: { not: 201 }, other: { not: 201 }, lookalike: { not: 201 }, before: 0, own: ORDER_IN, after: 1, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'In the Network panel, the `POST orders` tagged `cheap-flour.example` is the hidden form. Read its cookies and its Origin, and what server.js answered (the Server panel too).',
    'A form is no `fetch`: CORS never stops it, and with `SameSite=None` it carries Lena\'s cookie. `Lax` keeps a cookie from another site\'s POST (a link still carries it), `Strict` from everything another site starts. Say it out loud: Chrome sends a cookie without SameSite with another site\'s POST for two minutes after it was set.',
    'On line 36 of `server.js`, change `sameSite: \'none\'` to `sameSite: \'lax\'`. Save, then Reload.'
  ],
  debrief: {
    title: 'Whoever starts it, the cookie goes along',
    paragraphs: [
      'That was cross-site request forgery: cheap-flour.example\'s page made Lena\'s browser send a request to the API, and the browser added her cookie, because `SameSite=None` allows it with any site\'s request. server.js saw her session and placed the order. CORS played no part: a form is a navigation, not a `fetch`, and even a `fetch` is sent before CORS decides whether the page may read the answer.',
      '`SameSite=Lax` keeps the cookie from every request another site starts except a top-level `GET` (a link), so the form arrives without it and server.js answers `401`. Leaving SameSite out is not the same: Chrome treats it as Lax, but for two minutes after a cookie is set it still sends it with another site\'s `POST` (the Network panel says "Sent anyway"), and Lena had just signed in.',
      'The other real fix is on the server: accept an order only with proof that it came from the shop\'s page, a CSRF token the page got at sign-in, or the `Origin` compared with exactly `https://cornerbakery.shop`. Not the attacker\'s name (the next one has another), not a `Referer` that may be missing (a page can send none), and nothing loose like `startsWith` or `includes(\'cornerbakery.shop\')`: a host like `https://cornerbakery.shop.deals.example` passes both.'
    ]
  },
  solution: [
    { predict: 'placed' },
    { save: 'server.js', replace: [NONE_SECURE_COOKIE, 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })'] },
    'reload'
  ]
}
