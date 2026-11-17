// Cookies & sessions practice tasks (ADR 0009: prediction only, one question or a set of three, about 30 s each). Each
// has a small app (and other sites' pages) whose run shows the answer in the Network and Application panels once it is
// given; the files are read-only. A practice task follows its scenario in the chapter's list (index.ts).
import { CHEAP_FLOUR, MAIL, cheapFlour, webmail } from '../accounts'
import { predictedGoal } from '../checks'
import { API, HOURS_ROUTE, SERVER_HEAD, SHOP_PAGE, webSite } from '../site'
import type { OtherSite } from '../sites'
import type { PickOneQuestion, WebPracticeTask } from '../types'

const NOTE = (text: string) => [`<p class="note" id="note">${text}</p>`]
/** A page whose app does nothing itself: the practice is about another site's requests. */
const QUIET_APP = '// The shop\'s page: Lena is signed in. This practice is about what other sites make her browser send.\n'

// --- 2.1: which cookies the browser keeps ----------------------------------------------------------------------------

const PREFS_APP = `// Saves Lena's preferences: the API answers with a few cookies (Jonas tried several ways).
const API = '${API}'

fetch(\`\${API}/prefs\`, { credentials: 'include' })
  .then(response => response.json())
  .then(() => console.log('Preferences saved'))
`

const PREFS_SERVER = `${SERVER_HEAD}

// GET /prefs: the customer's preferences, as cookies
app.get('/prefs', (req, res) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  res.set('Access-Control-Allow-Credentials', 'true')
  res.append('Set-Cookie', 'lang=en; SameSite=None')
  res.append('Set-Cookie', 'region=eu; SameSite=None; Secure')
  res.append('Set-Cookie', 'promo=xmas; Domain=shop')
  res.append('Set-Cookie', 'partner=cf; Domain=cheap-flour.example')
  res.append('Set-Cookie', 'theme=dark; Domain=cornerbakery.shop; Secure')
  res.json({ saved: true })
})
`

export const whichStored: WebPracticeTask = {
  id: 'web-practice-which-stored',
  track: 'web',
  kind: 'practice',
  practises: 'web-06-sign-in-lost',
  title: 'Which cookies does the browser keep?',
  difficulty: 2,
  minutes: 0.5,
  task: 'The page asks `GET https://api.cornerbakery.shop/prefs` with credentials, and the API answers with five `Set-Cookie` lines. Pick the cookies the browser keeps.',
  prediction: {
    questions: [{
      id: 'stored',
      form: 'lines',
      prompt: 'The answer from `api.cornerbakery.shop` sets these cookies. Which does the browser keep?',
      options: [
        { id: 'lang', text: '`lang=en; SameSite=None`', fact: { stored: 'lang' } },
        { id: 'region', text: '`region=eu; SameSite=None; Secure`', fact: { stored: 'region' } },
        { id: 'promo', text: '`promo=xmas; Domain=shop`', fact: { stored: 'promo' } },
        { id: 'partner', text: '`partner=cf; Domain=cheap-flour.example`', fact: { stored: 'partner' } },
        { id: 'theme', text: '`theme=dark; Domain=cornerbakery.shop; Secure`', fact: { stored: 'theme' } }
      ],
      answer: ['region', 'theme'],
      rule: '`SameSite=None` needs `Secure`, and `Domain` must be the host or a parent of it that is not a public suffix (`shop` is one); anything else the browser refuses.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'server.js', web: { api: API, server: 'server.js', application: true }, probes: [] },
  setup: () => ({ files: webSite({ title: 'Preferences', main: NOTE('Saving your preferences…') }, { 'app.js': PREFS_APP, 'server.js': PREFS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the cookies the browser keeps', 1)],
  hints: ['Two rules decide: `SameSite=None` only with `Secure`, and a `Domain` the answer\'s host belongs to (never a bare suffix like `shop`, never another site).'],
  why: 'The browser checks every Set-Cookie line before it keeps it: SameSite=None needs Secure, and Domain must cover the host that answered without being a public suffix.',
  solution: [{ predict: ['region', 'theme'] }]
}

// --- 2.2: which of another site's requests carry a Lax cookie ---------------------------------------------------------

const LAX_SERVER = `${SERVER_HEAD}

// What cheap-flour.example's page asks for (nothing here checks who asks)
app.get('/pixel', (req, res) => res.type('text').send('ok'))
app.post('/basket', (req, res) => res.status(201).json({ added: true }))
app.get('/deals', (req, res) => res.send('<h1>Corner Bakery deals</h1>'))
`

const LAX_ATTACKER = cheapFlour([
  { img: `${API}/pixel` },
  { fetch: `${API}/basket`, method: 'POST', credentials: 'include', mode: 'no-cors', body: { item: 'rye' } },
  { link: `${API}/deals`, text: 'See the bakery\'s deals' }
])

export const attackerRequests: WebPracticeTask = {
  id: 'web-practice-attacker-requests',
  track: 'web',
  kind: 'practice',
  practises: 'web-07-order-from-elsewhere',
  title: 'Which requests carry a Lax cookie?',
  difficulty: 2,
  minutes: 0.5,
  task: 'Lena\'s session is `SameSite=Lax`. On `cheap-flour.example` the page loads an image from the API, sends a `fetch` with credentials, and Lena clicks its link to the API. Pick the requests that carry her session.',
  prediction: {
    questions: [{
      id: 'lax',
      form: 'lines',
      prompt: 'Lena\'s cookie at the API is `session=lena-7f3a; HttpOnly; Secure; SameSite=Lax` (set this morning). Which of `cheap-flour.example`\'s requests carry it?',
      options: [
        { id: 'pixel', text: 'The image: `GET /pixel`', fact: { sent: `GET ${API}/pixel session` } },
        { id: 'basket', text: 'The `fetch` with credentials: `POST /basket`', fact: { sent: `POST ${API}/basket session` } },
        { id: 'deals', text: 'The link Lena clicks: `GET /deals`', fact: { sent: `GET ${API}/deals session` } }
      ],
      answer: ['deals'],
      rule: 'A `Lax` cookie goes with another site\'s request only when it navigates the top level with a safe method: a link, never an image, a fetch or a form\'s POST.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      cookies: [{ url: `${API}/login`, line: 'session=lena-7f3a; HttpOnly; Secure; SameSite=Lax', minutesAgo: 30 }],
      sites: [LAX_ATTACKER],
      scene: [{ visit: CHEAP_FLOUR }]
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Your account', main: NOTE('Signed in as Lena.') }, { 'app.js': QUIET_APP, 'server.js': LAX_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the requests that carry her session', 1)],
  hints: ['Lax lets a cookie go with a request another site starts only when the tab itself goes there, with a GET.'],
  why: 'Lax is the browser saying: a link someone follows may carry the session, anything a page does by itself (images, fetches, forms that post) may not.',
  solution: [{ predict: ['deals'] }]
}

// --- 2.3: same site or not (a set of three) ---------------------------------------------------------------------------

const SITE_SERVER = `${SERVER_HEAD}

// Where the three pages' requests land (nothing here checks who asks)
app.get('/from/:page', (req, res) => res.type('text').send('ok'))
`

/** A page that fetches the API with credentials, from somewhere that only looks like the shop's site. */
const lookalike = (origin: string, title: string, path: string): OtherSite => ({
  origin,
  title,
  role: 'other',
  intro: [`<h1>${title}</h1>`],
  actions: [{ fetch: `${API}/from/${path}`, credentials: 'include', mode: 'no-cors' }]
})

const SITES = [
  lookalike('https://promo.cornerbakery.shop', 'Christmas at Corner Bakery', 'promo'),
  lookalike('http://cornerbakery.shop', 'Corner Bakery (the old http address)', 'http'),
  lookalike('https://cornerbakery.shop.cheap-flour.example', 'Corner Bakery deals', 'lookalike')
]

function siteQuestion(id: string, origin: string, path: string, same: boolean, rule: string): PickOneQuestion {
  return {
    id,
    form: 'one',
    prompt: `A page on \`${origin}\` fetches \`${API}/from/${path}\` with credentials. Lena's session there is \`SameSite=Strict\`.`,
    options: [
      { id: 'same', text: 'The same site as the API: her Strict cookie goes along.', fact: { sent: `GET ${API}/from/${path} session` } },
      { id: 'other', text: 'Another site: her Strict cookie stays home.' }
    ],
    answer: same ? 'same' : 'other',
    rule
  }
}

export const sameSiteOrNot: WebPracticeTask = {
  id: 'web-practice-same-site',
  track: 'web',
  kind: 'practice',
  practises: 'web-08-script-reads-session',
  title: 'Same site or not?',
  difficulty: 2,
  minutes: 1,
  task: 'Three pages fetch from the API with credentials, and Lena\'s session is `SameSite=Strict`. For each, say whether the browser takes it as the API\'s own site.',
  prediction: {
    questions: [
      siteQuestion('promo', 'https://promo.cornerbakery.shop', 'promo', true, 'A site is the scheme and the registrable domain: `promo.cornerbakery.shop` and `api.cornerbakery.shop` are two origins and one site, `https://cornerbakery.shop`.'),
      siteQuestion('http', 'http://cornerbakery.shop', 'http', false, 'Sites are schemeful: `http://cornerbakery.shop` and `https://cornerbakery.shop` are two sites.'),
      siteQuestion('lookalike', 'https://cornerbakery.shop.cheap-flour.example', 'lookalike', false, 'The registrable domain is read from the end: `cornerbakery.shop.cheap-flour.example` belongs to `cheap-flour.example`, whatever it starts with.')
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      cookies: [{ url: `${API}/login`, line: 'session=lena-7f3a; HttpOnly; Secure; SameSite=Strict', minutesAgo: 30 }],
      sites: SITES,
      scene: SITES.map(site => ({ visit: site.origin }))
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Your account', main: NOTE('Signed in as Lena.') }, { 'app.js': QUIET_APP, 'server.js': SITE_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A site is the scheme plus the last two labels of the host here (the registrable domain): compare those, and only those.'],
  why: 'Same site means the same scheme and the same registrable domain; subdomains share it, another scheme or another domain at the end does not.',
  solution: [{ predict: 'same' }, { predict: 'other' }, { predict: 'other' }]
}

// --- 2.4: which hosts get a cookie (Domain) ---------------------------------------------------------------------------

const DOMAIN_APP = `// Lena's basket from the API, and the opening hours from the shop's own server.
const API = '${API}'

fetch(\`\${API}/basket\`, { credentials: 'include' })
fetch('/api/hours')
`

const DOMAIN_SERVER = `${SERVER_HEAD}

// GET /basket: the shop's page may read it with the customer's cookie
app.get('/basket', (req, res) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  res.set('Access-Control-Allow-Credentials', 'true')
  res.json([])
})
`

export const whichHosts: WebPracticeTask = {
  id: 'web-practice-domain',
  track: 'web',
  kind: 'practice',
  practises: 'web-09-cookie-path',
  title: 'Which hosts get the cookie?',
  difficulty: 2,
  minutes: 0.5,
  task: 'The API set two cookies earlier: `basket` without `Domain`, `lang` with `Domain=cornerbakery.shop`. The page asks the API for the basket and the shop\'s own server for the hours. Pick which cookie goes where.',
  prediction: {
    questions: [{
      id: 'hosts',
      form: 'lines',
      prompt: '`api.cornerbakery.shop` set `basket=b-1041; Path=/; Secure` and `lang=en; Domain=cornerbakery.shop; Path=/; Secure`. The page sends `GET https://api.cornerbakery.shop/basket` (with credentials) and `GET /api/hours` on its own origin. Which go where?',
      options: [
        { id: 'basket-api', text: '`basket` with the API\'s `GET /basket`', fact: { sent: `GET ${API}/basket basket` } },
        { id: 'basket-shop', text: '`basket` with the shop\'s `GET /api/hours`', fact: { sent: 'GET /api/hours basket' } },
        { id: 'lang-api', text: '`lang` with the API\'s `GET /basket`', fact: { sent: `GET ${API}/basket lang` } },
        { id: 'lang-shop', text: '`lang` with the shop\'s `GET /api/hours`', fact: { sent: 'GET /api/hours lang' } }
      ],
      answer: ['basket-api', 'lang-api', 'lang-shop'],
      rule: 'Without `Domain` a cookie is host-only: it goes to the host that set it, never to another one; `Domain=cornerbakery.shop` sends it to that host and every one under it.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      shop: { routes: [HOURS_ROUTE] },
      cookies: [
        { url: `${API}/basket`, line: 'basket=b-1041; Path=/; Secure; SameSite=Lax', minutesAgo: 30 },
        { url: `${API}/prefs`, line: 'lang=en; Domain=cornerbakery.shop; Path=/; Secure; SameSite=Lax', minutesAgo: 30 }
      ]
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Basket', main: NOTE('Loading your basket…') }, { 'app.js': DOMAIN_APP, 'server.js': DOMAIN_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick which cookie goes where', 1)],
  hints: ['A cookie without Domain belongs to exactly one host. With Domain it belongs to that domain and everything under it.'],
  why: 'Host-only cookies stay with the host that set them; a Domain cookie goes to every host under its domain, the shop\'s own too.',
  solution: [{ predict: ['basket-api', 'lang-api', 'lang-shop'] }]
}

// --- 2.5: which cookies go with a link from another site --------------------------------------------------------------

const PICKUP_SERVER = `${SERVER_HEAD}

// GET /pickup/:id: the pickup page the order emails link to
app.get('/pickup/:id', (req, res) => res.send('<h1>Your order</h1>'))
`

export const linkCookies: WebPracticeTask = {
  id: 'web-practice-link-cookies',
  track: 'web',
  kind: 'practice',
  practises: 'web-10-email-link',
  title: 'Which cookies go with a link?',
  difficulty: 2,
  minutes: 0.5,
  task: 'Lena has four cookies at the API, one per SameSite value. In her webmail on `mail.example` she clicks a link to the API\'s pickup page. Pick the cookies that go along.',
  prediction: {
    questions: [{
      id: 'link',
      form: 'lines',
      prompt: 'Set this morning at the API: `prefs` (`SameSite=Strict`), `session` (`SameSite=Lax`), `widget` (`SameSite=None`), `lang` (no SameSite), all `Secure`. Lena clicks a link on `mail.example` to `https://api.cornerbakery.shop/pickup/1042`. Which go along?',
      options: [
        { id: 'prefs', text: '`prefs` (Strict)', fact: { sent: `GET ${API}/pickup/1042 prefs` } },
        { id: 'session', text: '`session` (Lax)', fact: { sent: `GET ${API}/pickup/1042 session` } },
        { id: 'widget', text: '`widget` (None)', fact: { sent: `GET ${API}/pickup/1042 widget` } },
        { id: 'lang', text: '`lang` (no SameSite)', fact: { sent: `GET ${API}/pickup/1042 lang` } }
      ],
      answer: ['session', 'widget', 'lang'],
      rule: 'A link from another site is a top-level `GET`: `Lax` (and a cookie without SameSite, which is Lax) and `None` go along, `Strict` never does.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      cookies: [
        { url: `${API}/login`, line: 'prefs=quiet; Secure; SameSite=Strict', minutesAgo: 30 },
        { url: `${API}/login`, line: 'session=lena-7f3a; HttpOnly; Secure; SameSite=Lax', minutesAgo: 30 },
        { url: `${API}/login`, line: 'widget=on; Secure; SameSite=None', minutesAgo: 30 },
        { url: `${API}/login`, line: 'lang=en; Secure', minutesAgo: 30 }
      ],
      sites: [webmail(`${API}/pickup/1042`, 'See your order')],
      scene: [{ visit: MAIL }]
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Your account', main: NOTE('Signed in as Lena.') }, { 'app.js': QUIET_APP, 'server.js': PICKUP_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the cookies that go along', 1)],
  hints: ['Strict refuses every request another site starts; Lax allows a top-level GET; None allows everything (with Secure).'],
  why: 'A followed link is the one request from another site that Lax lets through; Strict keeps even that out, which is why it breaks links into a signed-in page.',
  solution: [{ predict: ['session', 'widget', 'lang'] }]
}
