// HTTP caching 4.2: the whole menu, every time. After the old prices (4.1) Ben made sure nothing keeps the menu:
// `no-store`. Now every Refresh downloads the whole menu, even when nothing changed, and the API's traffic bill doubled.
// Learn: no-store keeps no copy, so there is nothing to ask about; `no-cache` keeps one and asks first, and Express's
// ETag turns an unchanged answer into a 304 without a body. Turning off the ETag, or an ETag that doesn't change with
// the menu, loses one half or the other.
import { probesGoal } from '../debugging/checks'
import { CACHE_HEAD, CROISSANT, MENU_CORS, MENU_PAGE, croissantAt, kitchenSets, menuApp, menuData } from './caching'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The line that keeps the menu out of every cache. */
export const NO_STORE = '  res.set(\'Cache-Control\', \'no-store\')'

const SERVER = `${CACHE_HEAD}

${MENU_CORS}

${menuData()}

// GET /menu: never an old price again: nothing may keep the menu (Ben, after Monday's prices)
app.get('/menu', (req, res) => {
${NO_STORE}
  res.json(MENU)
})
`

export const wholeMenu: WebScenario = {
  id: 'web-17-whole-menu',
  track: 'web',
  kind: 'scenario',
  title: 'The whole menu, every time',
  difficulty: 2,
  minutes: 6,
  teaches: 'no-cache',
  story: [
    'After Monday\'s old prices Ben made sure nothing keeps the menu: `Cache-Control: no-store`. Prices are right now, but every Refresh downloads the whole menu again, even when nothing changed (the real one has photos), and the API\'s traffic bill has doubled.',
    'Predict what Lena\'s second Refresh costs. Then fix `server.js` so an unchanged menu costs a `304` without a body, and a changed one still shows at once. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'cost',
      form: 'one',
      prompt: '`GET /menu` is answered with `Cache-Control: no-store` (and the ETag Express adds). The page loads the menu at 09:41; at 09:42 Lena presses Refresh menu, and nothing on the menu has changed. What does the second `GET /menu` cost?',
      options: [
        { id: 'cache', text: 'Nothing: the browser answers from its copy.', fact: { row: 'GET https://api.cornerbakery.shop/menu 200 (disk cache)' } },
        { id: 'whole', text: 'The whole menu again: `no-store` keeps no copy, so the browser has nothing to ask about, and server.js answers `200` with every product.', fact: { server: 'GET /menu 200', times: 2 } },
        { id: 'not-modified', text: 'A `304` without a body: the browser sends the ETag, and server.js sees nothing changed.', fact: { server: 'GET /menu 304' } }
      ],
      answer: 'whole',
      rule: '`no-store` keeps no copy, so every request downloads the whole answer; `no-cache` keeps one and asks first, and an unchanged answer is a 304 without a body.'
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
      cache: {},
      // the page loads at 09:41; at 09:42 Lena presses Refresh, nothing changed
      scene: [{ later: 1 }, { click: '#refresh' }]
    },
    probes: [
      // the unchanged Refresh was a 304: the copy was still good, no body came
      { id: 'saved', steps: [{ notModified: `GET ${API}/menu` }] },
      // and a change still shows on the very next Refresh, a second later
      { id: 'fresh', steps: [kitchenSets('croissant', '2.6'), { later: 0.02 }, { click: '#refresh' }, { text: CROISSANT }] }
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Menu', main: MENU_PAGE }, { 'app.js': menuApp({ comment: 'The order page: today\'s menu from the API, and a button for the latest prices (Jonas).' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the second Refresh costs', 1),
    probesGoal('revalidated', 'An unchanged menu costs a 304 without a body, and a new price still shows on the next Refresh', { saved: { atLeast: 1 }, fresh: croissantAt('2.60') })
  ],
  hints: [
    'In the Network panel both `GET /menu` rows are `200`, and the Server panel answered both in full. The Application panel\'s Cache is empty: `no-store` keeps nothing.',
    'To ask "has it changed?" the browser needs a copy and a validator. `no-cache` keeps the copy and asks every time; the ETag Express already adds (see the answer\'s headers) goes back as `If-None-Match`, and Express answers `304` when it still matches.',
    'On line 36 of `server.js`, send `res.set(\'Cache-Control\', \'no-cache\')` instead of `no-store`. Save, then Reload.'
  ],
  debrief: {
    title: 'Keep it, and ask',
    paragraphs: [
      '`no-store` is for answers that must never be written down anywhere (a bank statement): the browser keeps no copy, so it has nothing to compare and downloads the whole answer every time. Ben wanted something else: never show a stale menu.',
      '`no-cache` says exactly that: keep a copy, but ask before using it. The browser sends the copy\'s ETag as `If-None-Match`; Express computes the ETag of the menu it would send (a hash of the body), and when they match it answers `304 Not Modified` with no body, so the browser uses its copy. After Maya\'s change the hash differs, and the new menu comes in full.',
      'Both halves matter: without an ETag (`app.set(\'etag\', false)`) every answer is a whole `200` again, and an ETag that doesn\'t change with the menu (`"menu-v1"`) makes the browser keep the old prices with a clear conscience. `max-age=0` works like `no-cache`; a short `max-age` (a minute) trades a minute of old prices for fewer requests.'
    ]
  },
  solution: [
    { predict: 'whole' },
    { save: 'server.js', replace: [NO_STORE, '  res.set(\'Cache-Control\', \'no-cache\')'] },
    'reload'
  ]
}
