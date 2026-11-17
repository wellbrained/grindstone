// Cookies & sessions 2.1: Jonas moved the sign-in to the API and gave the session cookie SameSite=None ("the API is on
// another origin"). Chrome refuses a SameSite=None cookie without Secure, so Lena is never signed in. The tempting fix is
// what Chrome's message asks for, Secure, and then any site's request carries her session. Learn: SameSite is about
// sites, not origins; the shop and its API are one site, so Lax (said out loud) is what they need.
import { probesGoal } from '../debugging/checks'
import { ACCOUNT_HEAD, ACCOUNT_PAGE, ACCOUNT_ROUTES, CHEAP_FLOUR, SIGNED_IN, accountApp, accountGuards, cheapFlour, loginRoute } from './accounts'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The login's cookie as Jonas wrote it. */
export const NONE_COOKIE = 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, sameSite: \'none\' })'

const SERVER = `${ACCOUNT_HEAD}

${loginRoute('/login', ['// the API is on another origin than the shop, so its cookie has to go cross-site (Jonas)', NONE_COOKIE])}

${ACCOUNT_ROUTES}
`

/** cheap-flour.example's page in this level: a fetch with credentials that orders on whoever's account it can. */
const ATTACKER = cheapFlour([{ fetch: `${API}/orders`, method: 'POST', credentials: 'include', mode: 'no-cors', body: { item: 'sourdough', quantity: '40' } }])

const GUARDS = accountGuards()

export const signInLost: WebScenario = {
  id: 'web-06-sign-in-lost',
  track: 'web',
  kind: 'scenario',
  title: 'Lena can\'t stay signed in',
  difficulty: 2,
  minutes: 6,
  teaches: 'SameSite=None',
  story: [
    'Jonas moved the sign-in to the API: the page posts Lena\'s email and password to `https://api.cornerbakery.shop/login`, and the API answers with her session cookie. “The API is on another origin,” he says, “so I made the cookie `SameSite=None`, or the browser won\'t send it there.” Lena taps Sign in, and the page says she isn\'t signed in.',
    'Predict what the browser does with the cookie. Then fix `server.js` so Lena stays signed in. Her session is hers: no request from another site (like the half-price page on `cheap-flour.example` in the Other site panel) may carry it, and a script on the page may not read it. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'cookie',
      form: 'one',
      prompt: 'Lena taps **Sign in as Lena**. The API answers `200` with `Set-Cookie: session=lena-7f3a; Path=/; HttpOnly; SameSite=None`, and the page then asks `GET /account` with `credentials: \'include\'`. What happens?',
      options: [
        { id: 'signed-in', text: 'Lena is signed in: the browser keeps the cookie and sends it with `/account`.', fact: { sent: 'GET https://api.cornerbakery.shop/account session' } },
        { id: 'refused', text: 'The browser refuses the cookie: `SameSite=None` needs `Secure`. `/account` gets no cookie and answers `401`.', fact: { refused: 'session' } },
        { id: 'kept-home', text: 'The browser keeps the cookie, but never sends it to another origin: `/account` answers `401`.', fact: { stored: 'session' } },
        { id: 'cors', text: 'CORS blocks the sign-in\'s answer, so the page never gets the cookie.', fact: { row: 'POST https://api.cornerbakery.shop/login CORS error' } }
      ],
      answer: 'refused',
      rule: 'A `SameSite=None` cookie must also be `Secure` or the browser refuses it; and SameSite is about sites, not origins: the shop and its API are one site, so `Lax` is enough.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: { api: API, server: 'server.js', application: true, sites: [ATTACKER], scene: [{ click: '#sign-in' }] },
    probes: [
      { id: 'who', steps: [{ text: '#who' }] },
      { id: 'account', steps: [{ carried: `GET ${API}/account`, cookie: 'session' }] },
      { id: 'attack', steps: [{ visit: CHEAP_FLOUR }, { carried: `POST ${API}/orders`, cookie: 'session' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: ACCOUNT_PAGE }, { 'app.js': accountApp(), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the browser does with the cookie', 1),
    probesGoal('signed-in', 'Lena stays signed in: after Sign in the page shows her name, read with her cookie, with nothing red in the Console; no other site\'s request carries her session, and no script on the page can read it', { who: SIGNED_IN, account: { atLeast: 1 }, attack: 0, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'In the Network panel, select `POST login` and read its cookies: the browser says why it did not keep `session`. The Application panel lists it under the refused ones.',
    '`SameSite=None` is only allowed with `Secure`, but adding `Secure` alone lets every other site\'s request carry Lena\'s session (try it: Visit cheap-flour.example). SameSite looks at sites: `api.cornerbakery.shop` and `cornerbakery.shop` are one site, so the cookie needs no `None`.',
    'On line 36 of `server.js`, make it `res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })`. Save, then Reload.'
  ],
  debrief: {
    title: 'One site, so Lax',
    paragraphs: [
      'Chrome refuses a `SameSite=None` cookie that isn\'t `Secure`, and says so in the Network panel: "…had the "SameSite=None" attribute but didn’t have the "Secure" attribute". The sign-in answered `200`, so nothing looked wrong until `/account` arrived without a cookie.',
      'Adding `Secure` is what the message asks for, and it would have signed Lena in, and handed her session to every site: with `None`, a request from `cheap-flour.example` carries her cookie too. SameSite is not about origins but sites: the scheme and the registrable domain. `api.cornerbakery.shop` and `cornerbakery.shop` are two origins and one site, so a `Lax` cookie goes with every request between them, and none from another site but a top-level link.',
      'Say `sameSite: \'lax\'` out loud even though Chrome treats a cookie without SameSite as Lax: for its first two minutes such a cookie still goes with another site\'s form `POST` (2.2 shows why that matters).'
    ]
  },
  solution: [
    { predict: 'refused' },
    { save: 'server.js', replace: [NONE_COOKIE, 'res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })'] },
    'reload'
  ]
}
