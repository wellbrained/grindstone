// HTTP caching 4.4: the menu fails on one address. The shop answers on cornerbakery.shop and www.cornerbakery.shop, and
// server.js echoes the asking page's origin in Access-Control-Allow-Origin (chapter 1's fix for several origins). The
// CDN keeps the menu five minutes, one copy for the address. Mia opened it on www at 09:41; a moment later Lena gets
// Mia's copy, whose Allow-Origin names www, and her browser refuses it. Learn: an answer that depends on a request
// header must say so with Vary (`Vary: Origin`), or the shared cache hands it to requests it doesn't fit; `*` fits every
// origin for a public menu. Not caching it at all, or asking server.js every time, gives up what the CDN is for.
import { probesGoal } from '../debugging/checks'
import { CACHE_HEAD, CROISSANT, WWW, croissantAt, menuApp } from './caching'
import { predictedGoal } from './checks'
import { API, MENU_DATA, SHOP, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The line that echoes the asking shop's origin. */
export const ECHO_ORIGIN = '  if (SHOPS.includes(origin)) res.set(\'Access-Control-Allow-Origin\', origin)'

const SERVER = `${CACHE_HEAD}

// The shop answers on two addresses since the redesign: both may read the menu (Ben)
const SHOPS = [SHOP, '${WWW}']

${MENU_DATA}

// GET /menu: the same for everyone, so the CDN keeps it five minutes (Ben)
app.get('/menu', (req, res) => {
  const origin = req.get('Origin')
${ECHO_ORIGIN}
  res.set('Cache-Control', 'public, max-age=300')
  res.json(MENU)
})
`

const PAGE = [
  '<section class="box" aria-labelledby="menu-heading">',
  '  <h2 id="menu-heading">Today\'s menu</h2>',
  '  <button class="action" id="show-menu" type="button">See today\'s menu</button>',
  '  <ul id="products" class="list" aria-label="Today\'s menu"></ul>',
  '</section>'
]

/** A customer on www opens the menu (the same page, another origin). */
const onWww = (name: string, like: boolean) => ({ other: name, request: `GET ${API}/menu`, from: WWW, ...(like ? { like: true } : {}) })

export const varyOrigin: WebScenario = {
  id: 'web-19-vary-origin',
  track: 'web',
  kind: 'scenario',
  title: 'The menu fails on one address',
  difficulty: 3,
  minutes: 7,
  teaches: 'Vary',
  story: [
    'The shop answers on `https://cornerbakery.shop` and `https://www.cornerbakery.shop`, and server.js lets both read the menu by echoing the page\'s origin in `Access-Control-Allow-Origin`. The CDN keeps the menu five minutes. Now customers write in: the menu stays empty for some of them, and only on one address, never the same one for long.',
    'At 09:41 Mia opened the menu on www. Predict what happens when Lena opens it a moment later. Then fix `server.js` so both addresses get the menu while the CDN still answers it. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'lena',
      form: 'one',
      prompt: 'At 09:41 Mia\'s page on `https://www.cornerbakery.shop` asks for `GET /menu`; server.js answers with `Access-Control-Allow-Origin: https://www.cornerbakery.shop` and `Cache-Control: public, max-age=300`, and the CDN keeps it. Half a minute later Lena\'s page on `https://cornerbakery.shop` asks for `GET /menu`. What happens?',
      options: [
        { id: 'asks', text: 'The CDN asks server.js: Lena\'s request has another Origin, so it is another request.', fact: { cdn: 'Lena GET https://api.cornerbakery.shop/menu MISS' } },
        { id: 'refused', text: 'The CDN hands Lena Mia\'s copy; its Allow-Origin names www, so her browser keeps it from her page and the menu stays empty.', fact: { row: 'GET https://api.cornerbakery.shop/menu CORS error' } },
        { id: 'shows', text: 'The menu shows: the copy is the same menu, and the CDN fixes the Allow-Origin for her.', fact: { says: 'Menu loaded' } },
        { id: 'stale', text: 'The CDN refuses: a copy may only go to the origin that asked for it.' }
      ],
      answer: 'refused',
      rule: 'A shared cache picks a copy by its address and the request headers its Vary names, so an answer that depends on Origin needs `Vary: Origin`, or it goes to pages it doesn\'t fit.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      time: true,
      cache: { cdn: true },
      // Mia opens the menu on www at 09:41; half a minute later Lena opens it on cornerbakery.shop
      scene: [onWww('Mia', false), { later: 0.5 }, { click: '#show-menu' }]
    },
    probes: [
      { id: 'menu', steps: [{ text: CROISSANT }] },
      // the kitchen's tablet reads the menu too (an app: no Origin), then a customer on www asks exactly as the page does
      // (the same address, the same headers): still the menu
      { id: 'app', steps: [{ other: 'Kitchen', request: `GET ${API}/menu`, from: null }] },
      { id: 'mia', steps: [onWww('Mia', true)] },
      // another customer on cornerbakery.shop: the menu too
      { id: 'sam', steps: [{ other: 'Sam', request: `GET ${API}/menu`, from: SHOP, like: true }] },
      // and the CDN still answers: server.js sent the menu at most once for each kind of asker (www, the shop, the app)
      { id: 'load', steps: [{ reached: `GET ${API}/menu` }] }
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Menu', main: PAGE }, { 'app.js': menuApp({ comment: 'The order page: today\'s menu from the API when the customer asks for it (Jonas).', onClick: '#show-menu' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Lena\'s page gets', 1),
    probesGoal('both', 'Lena sees the menu, the kitchen\'s app and customers on www and on cornerbakery.shop get it after her, and the CDN still answers: server.js sends it once for each kind of asker at most', { menu: croissantAt('2.40'), app: 200, mia: 200, sam: 200, load: { atMost: 3 } }, { clean: true })
  ],
  hints: [
    'Open the Network panel: Lena\'s `GET /menu` is a CORS error, its headers say `x-cache: HIT` and whose origin it allows. The Application panel\'s Cache shows the CDN\'s copy and who it was fetched for.',
    'The CDN picked its copy by the address alone. The answer depends on the request\'s `Origin`, and a cache only takes request headers into account when the answer names them in `Vary`: then it keeps one copy for each origin.',
    'In `server.js`, after line 26 (the echo), add `res.vary(\'Origin\')`, on every answer. Save, then Reload.'
  ],
  debrief: {
    title: 'Say what it depends on',
    paragraphs: [
      'The CDN keeps one copy per address unless the answer says otherwise. Mia\'s copy carried `Access-Control-Allow-Origin: https://www.cornerbakery.shop`; Lena\'s page on `https://cornerbakery.shop` got that copy, and her browser did exactly what chapter 1 taught: another origin, no read. Whoever asked first in each five minutes decided which address worked.',
      '`Vary: Origin` tells every cache that the answer depends on the request\'s Origin, so the CDN keeps one copy per origin and picks by it (Express\'s `res.vary(\'Origin\')`). Send it on every answer of the route, also the ones without an Allow-Origin, or a copy made for a page with no CORS rights is handed to one that has them. For a public menu `Access-Control-Allow-Origin: *` is simpler still: one copy fits every page.',
      '`private`, `no-store` or `no-cache` also stop the refusals, by having server.js answer every request: the CDN is then only in the way. Chapter 1 left `Vary: Origin` as advice, because there was no cache; this is what it was for.'
    ]
  },
  solution: [
    { predict: 'refused' },
    { save: 'server.js', replace: [`${ECHO_ORIGIN}\n`, `${ECHO_ORIGIN}\n  res.vary('Origin')\n`] },
    'reload'
  ]
}
