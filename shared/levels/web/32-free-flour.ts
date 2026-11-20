// Security headers & CSP 7.2: free flour, one click. The farmers' market's site shows the shop's quick-order page in a
// frame, so Ben made the session cookie SameSite=None. cheap-flour.example frames the same page, see-through, over its
// "Claim your free flour" button: Lena's click lands on "Order the weekly box", and her cookie goes along. Clickjacking.
// Learn: the page says who may frame it, with Content-Security-Policy: frame-ancestors (a list; X-Frame-Options knows
// only DENY and SAMEORIGIN, its ALLOW-FROM is ignored); a meta tag can't say it.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { BREAD_OFFERS, CHEAP_FLOUR, SHOP_SERVER_HEAD, STATIC_FILES, headersMiddleware, headersSite, shopServer } from './headers'
import type { OtherSite, SiteAction } from './sites'
import type { WebScenario } from './types'

export const MARKET = 'https://market.example'
const FLOUR_FRIENDS = 'https://flour-friends.example'
const QUICK_ORDER = 'https://cornerbakery.shop/quick-order'
export const SUBSCRIBED = 'Subscribed: your first box comes on Saturday.'

const order = (over?: string): SiteAction => ({ frame: QUICK_ORDER, ...(over ? { over } : {}), click: { fetch: '/subscriptions', method: 'POST', body: { box: 'weekly' }, label: 'Order the weekly box' } })

const SITES: OtherSite[] = [
  { origin: CHEAP_FLOUR, title: 'Free flour for bakers', role: 'attacker', intro: ['<h1>Free flour for bakers</h1>', '<p>One bag of rye flour, free, for the first 100 bakers. Just click.</p>'], actions: [order('Claim your free flour')] },
  { origin: MARKET, title: 'Saturday market', role: 'other', intro: ['<h1>Saturday market</h1>', '<p>Order bread from our bakers, pick it up at the stall.</p>'], actions: [order()] },
  { origin: BREAD_OFFERS, title: 'Bread offers', role: 'attacker', hidden: true, noReferrer: true, intro: ['<h1>Win a year of bread</h1>'], actions: [order('Enter the draw')] },
  // a site no text names frames the market's page, which frames the shop's: the market is the shop's parent there
  { origin: FLOUR_FRIENDS, title: 'Flour friends', role: 'attacker', hidden: true, intro: ['<h1>Flour friends</h1>'], actions: [{ ...order('Join the club'), via: MARKET }] }
]

const SERVER = [
  SHOP_SERVER_HEAD,
  '',
  headersMiddleware('The page\'s security headers (Ben)', ['res.set(\'X-Content-Type-Options\', \'nosniff\')']),
  '',
  '// The quick-order page: the farmers\' market shows it in a frame on market.example (Maya)',
  'app.get(\'/quick-order\', (req, res) => res.sendFile(\'index.html\', { root: \'public\' }))',
  STATIC_FILES,
  '',
  '// Who is signed in: the session cookie. SameSite=None since the market\'s frame (a page inside another',
  '// site\'s frame gets no Lax cookie), so customers can order there as themselves (Ben)',
  'const SESSIONS = { \'lena-7f3a\': \'lena\' }',
  'const CUSTOMERS = { lena: { name: \'Lena\', boxes: 0 } }',
  'function customerOf(req) {',
  '  const session = (req.get(\'Cookie\') ?? \'\').match(/(?:^|; )session=([^;]*)/)?.[1]',
  '  return CUSTOMERS[SESSIONS[session]] ?? null',
  '}',
  '',
  '// POST /subscriptions: the weekly bread box for the signed-in customer, 18.00 a week',
  'app.post(\'/subscriptions\', (req, res) => {',
  '  const customer = customerOf(req)',
  '  if (!customer) return res.status(401).json({ error: \'Please sign in\' })',
  '  customer.boxes += 1',
  '  res.status(201).json({ first: \'Saturday\' })',
  '})',
  ''
].join('\n')

const PAGE_MAIN = [
  '<section class="box" aria-labelledby="box-heading">',
  '  <h2 id="box-heading">Weekly bread box</h2>',
  '  <p>A sourdough loaf, a rye loaf and four croissants every Saturday · 18.00 a week</p>',
  '  <button class="action" id="subscribe" type="button">Order the weekly box</button>',
  '  <p id="subscribed" role="status"></p>',
  '</section>'
]

const APP = [
  '// The quick-order page (Maya): one button, the weekly box',
  'document.querySelector(\'#subscribe\').addEventListener(\'click\', async () => {',
  '  const response = await fetch(\'/subscriptions\', { method: \'POST\', body: new URLSearchParams({ box: \'weekly\' }) })',
  '  document.querySelector(\'#subscribed\').textContent = response.ok',
  '    ? \'Subscribed: your first box comes on Saturday.\'',
  '    : \'Please sign in first.\'',
  '})',
  ''
].join('\n')

export const freeFlour: WebScenario = {
  id: 'web-32-free-flour',
  track: 'web',
  kind: 'scenario',
  title: 'Free flour, one click',
  difficulty: 2,
  minutes: 7,
  teaches: 'frame-ancestors',
  story: [
    'The farmers\' market shows the shop\'s quick-order page in a frame on `market.example`, so customers can order a weekly bread box there. For that, Ben made the session cookie `SameSite=None`. Today Lena has a weekly box she never ordered. She had clicked "Claim your free flour" on `cheap-flour.example` (the Other site panel has its page).',
    'Predict what her click did. Then make the shop\'s pages refuse every frame but the shop\'s own and the market\'s, while the market\'s frame and the page itself still take orders. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'click',
      form: 'one',
      prompt: 'cheap-flour.example puts `https://cornerbakery.shop/quick-order` in a see-through frame over its "Claim your free flour" button. The shop sends no `X-Frame-Options` and no `frame-ancestors`; Lena\'s session cookie is `SameSite=None`. She clicks the button. What happens?',
      options: [
        { id: 'default', text: 'Nothing: a browser doesn\'t show another site\'s page in a frame unless that page allows it.', fact: { row: 'GET /quick-order (blocked)' } },
        { id: 'subscribed', text: 'The frame shows; her click lands on "Order the weekly box" in it, and the order goes with her session cookie: she is subscribed.', fact: { server: 'POST /subscriptions 201' } },
        { id: 'nocookie', text: 'The frame shows and her click lands on the shop\'s button, but a request from inside another site\'s frame carries no cookie: the shop says "Please sign in".', fact: { server: 'POST /subscriptions 401' } }
      ],
      answer: 'subscribed',
      rule: 'Any site may show any page in a frame unless the page\'s own headers say who may (Content-Security-Policy: frame-ancestors, or X-Frame-Options); a see-through frame turns a click on the bait into a click on the page.'
    }]
  },
  sandbox: {
    page: '/quick-order',
    open: 'server.js',
    web: shopServer({ cookies: [{ url: 'https://cornerbakery.shop/login', line: 'session=lena-7f3a; Path=/; Secure; HttpOnly; SameSite=None', minutesAgo: 29 }], sites: SITES, scene: [{ visit: CHEAP_FLOUR }] }),
    probes: [
      // the market's frame is asked before the attackers and after them: a server.js that counts frames can't tell
      { id: 'marketFirst', steps: [{ visit: MARKET }] },
      { id: 'cheapFlour', steps: [{ visit: CHEAP_FLOUR }] },
      { id: 'unnamed', steps: [{ visit: BREAD_OFFERS }] },
      { id: 'nested', steps: [{ visit: FLOUR_FRIENDS }] },
      { id: 'market', steps: [{ visit: MARKET }] },
      { id: 'own', steps: [{ click: '#subscribe' }, { text: '#subscribed' }] }
    ]
  },
  setup: () => ({
    files: headersSite({ title: 'Quick order', main: PAGE_MAIN }, { 'app.js': APP, 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Lena\'s click did', 1),
    probesGoal('framed', 'Only the shop and the farmers\' market may frame the shop\'s pages: cheap-flour.example\'s frame (and any other site\'s, also around the market\'s page) is refused, the market\'s frame still takes orders, and the quick-order page still works on its own', { marketFirst: 201, cheapFlour: 'refused', unnamed: 'refused', nested: 'refused', market: 201, own: SUBSCRIBED })
  ],
  hints: [
    'In Network, the row tagged `cheap-flour.example` of type iframe loaded `/quick-order` with 200, and the `POST /subscriptions` after it carried Lena\'s cookie. Open the frame\'s response: no header says who may frame the page.',
    '`X-Frame-Options: DENY` or `SAMEORIGIN` would also refuse the market (try it: the market\'s frame shows Chrome\'s refusal), and `ALLOW-FROM` is no value Chrome knows. `Content-Security-Policy: frame-ancestors` takes a list of who may frame the page; it only works as a header, never in a meta tag.',
    'In server.js, add `res.set(\'Content-Security-Policy\', "frame-ancestors \'self\' https://market.example")` to Ben\'s middleware. Save, then Reload.'
  ],
  debrief: {
    title: 'A page says who may frame it',
    paragraphs: [
      'That was clickjacking: cheap-flour.example showed the shop\'s real page, see-through, over its own button, and Lena\'s click went to the shop. The browser did nothing wrong: any page may frame any other unless that one says no, and the shop\'s cookie was `SameSite=None` (Lax would keep it from a request inside another site\'s frame, which is also why the market\'s orders needed None).',
      '`Content-Security-Policy: frame-ancestors \'self\' https://market.example` lists exactly who may frame the page: the shop itself and the market. Every other site gets Chrome\'s "Framing … violates … frame-ancestors" in its own Console and an empty frame. `X-Frame-Options` is the older header: `DENY` and `SAMEORIGIN` would shut the market out too, and Chrome ignores `ALLOW-FROM` (and the whole header once a `frame-ancestors` is there). Neither works in a `<meta>` tag: a page can\'t be asked not to be framed after it is already loaded in the frame.',
      'Frame-busting scripts (`if (top !== self) top.location = …`) are no substitute: the framing page can sandbox its iframe so the script can\'t navigate the top page. The header is checked before the page is shown at all.'
    ]
  },
  solution: [
    { predict: 'subscribed' },
    { save: 'server.js', replace: ['  res.set(\'X-Content-Type-Options\', \'nosniff\')', '  res.set(\'X-Content-Type-Options\', \'nosniff\')\n  res.set(\'Content-Security-Policy\', "frame-ancestors \'self\' https://market.example")'] },
    'reload'
  ]
}
