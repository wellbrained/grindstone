// Cookies & sessions 2.5: after the forged order Ben made the session SameSite=Strict, "the strictest is the safest".
// Now the pickup link in the order email (opened in Lena's webmail on mail.example) shows "Please sign in": a Strict
// cookie never goes with a request another site starts, a link included. Learn: Lax is right for a session (a link
// carries it, another site's POST doesn't); and neither None, nor leaving SameSite out (Lax+POST), nor a pickup page
// that asks nobody.
import { probesGoal } from '../debugging/checks'
import { ACCOUNT_HEAD, ACCOUNT_PAGE, ACCOUNT_ROUTES, CHEAP_FLOUR, LOOKALIKE_SITE, MAIL, ORDER_IN, UNNAMED_SITE, accountApp, accountGuards, cheapFlour, loginRoute, lookalikeAttack, unnamedAttack, webmail } from './accounts'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The login's cookie after the forged order. */
export const STRICT_COOKIE = 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'strict\' })'

/** The pickup page the order emails link to. */
export const PICKUP = `${API}/pickup/1042`

const SERVER = `${ACCOUNT_HEAD}

${loginRoute('/login', ['// Strict since the forged order: the strictest is the safest (Ben)', STRICT_COOKIE])}

// GET /pickup/:id: the pickup page the order emails link to (a page for the browser's tab)
app.get('/pickup/:id', (req, res) => {
  const customer = customerOf(req)
  if (!customer) return res.status(401).send('<h1>Please sign in</h1><p>Sign in to see your order.</p>')
  const order = Number(req.params.id)
  res.send(\`<h1>Order \${order}</h1><p>Ready for \${customer.name} tomorrow from 7:00.</p>\`)
})

${ACCOUNT_ROUTES}
`

const GUARDS = accountGuards()

export const emailLink: WebScenario = {
  id: 'web-10-email-link',
  track: 'web',
  kind: 'scenario',
  title: 'Signed out by the email link',
  difficulty: 2,
  minutes: 6,
  teaches: 'Strict',
  story: [
    'After the forged order Ben made the session cookie `SameSite=Strict`: “the strictest is the safest.” Now customers write in: the link in the order email, “See your order”, opens the pickup page and says *Please sign in*, although they signed in a minute before. Lena\'s webmail on `mail.example` is in the Other site panel.',
    'Predict what the pickup page says. Then fix `server.js` so the email\'s link shows Lena her order, while no other site can order on her account (the half-price page on `cheap-flour.example` still tries) and the pickup page shows nothing to anyone who isn\'t her. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'link',
      form: 'one',
      prompt: `Lena signed in a minute ago; her cookie is \`HttpOnly; Secure; SameSite=Strict\`. In her webmail on \`mail.example\` she clicks **See your order**, a link to \`${PICKUP}\`. What does the pickup page say?`,
      options: [
        { id: 'order', text: 'Her order: she is signed in, and a link is no attack.', fact: { server: 'GET /pickup/1042 200' } },
        { id: 'sign-in', text: '*Please sign in*: the link starts on another site, and a Strict cookie never goes with a request another site starts.', fact: { server: 'GET /pickup/1042 401' } },
        { id: 'cors', text: 'Nothing: the browser blocks it, because the API allows no CORS for `mail.example`.', fact: { row: `GET ${PICKUP} CORS error` } },
        { id: 'refused', text: '*Please sign in*: with `Strict` the browser refused the cookie when she signed in.', fact: { refused: 'session' } }
      ],
      answer: 'sign-in',
      rule: '`SameSite=Strict` keeps a cookie from every request another site starts, a link you click too; `Lax` lets a top-level link (a GET) carry it and still keeps it from another site\'s POST.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      sites: [webmail(PICKUP, 'See your order'), cheapFlour(), unnamedAttack(), lookalikeAttack()],
      scene: [{ click: '#sign-in' }, { visit: MAIL }]
    },
    probes: [
      { id: 'link', steps: [{ visit: MAIL }] },
      { id: 'fresh', steps: [{ navigate: `GET ${PICKUP}`, from: MAIL, credentials: 'omit' }] },
      { id: 'attack', steps: [{ visit: CHEAP_FLOUR }] },
      { id: 'other', steps: [{ visit: UNNAMED_SITE }] },
      { id: 'lookalike', steps: [{ visit: LOOKALIKE_SITE }] },
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: ACCOUNT_PAGE }, { 'app.js': accountApp(), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the pickup page says', 1),
    probesGoal('link', 'The email\'s link shows Lena her order, and nobody else\'s browser gets it; no other site can order on her account (cheap-flour.example, nor any site no text names), her own order still goes through with nothing red in the Console, and no script can read her session', { link: 200, fresh: { not: 200 }, attack: { not: 201 }, other: { not: 201 }, lookalike: { not: 201 }, own: ORDER_IN, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'In the Network panel, select the `GET 1042` tagged `mail.example` and read its cookies: the browser says why `session` stayed home.',
    '`Strict` keeps the cookie from everything another site starts, links included; `None` would send it with cheap-flour.example\'s form again. `Lax` is made for a session: a top-level link (a GET) carries it, another site\'s POST doesn\'t. Say it out loud, as in 2.2.',
    'On line 36 of `server.js`, change `sameSite: \'strict\'` to `sameSite: \'lax\'`. Save, then Reload.'
  ],
  debrief: {
    title: 'Lax is the session\'s SameSite',
    paragraphs: [
      '`SameSite=Strict` sends a cookie only with requests the cookie\'s own site starts. A link in an email is started by the webmail\'s site, so the pickup page saw no session and asked Lena to sign in. A reload on that page would have carried it (the request is then the API\'s site\'s own), which is why "it works when I refresh" is the classic Strict report.',
      '`Lax` is what sessions want: a top-level navigation with a safe method (a link, a typed address, a `GET` form) carries the cookie, and every other request another site starts doesn\'t: no forms posting orders, no images, no fetches. Strict still has a place, for a second cookie that guards the dangerous things (changing the password, paying), next to a Lax session.',
      'Lax is the simple fix. `None` sends the session with every site\'s request again, so it is safe only next to a check of its own on every order (the `Origin` compared exactly, or a CSRF token, as in 2.2); leaving SameSite out lets another site\'s `POST` carry a fresh session for two minutes (Chrome\'s Lax+POST); and a pickup page that asks nobody shows Lena\'s order to whoever has the link.'
    ]
  },
  solution: [
    { predict: 'sign-in' },
    { save: 'server.js', replace: [STRICT_COOKIE, 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })'] },
    'reload'
  ]
}
