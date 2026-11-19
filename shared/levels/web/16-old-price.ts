// HTTP caching 4.1: still the old price. Jonas lets browsers keep the menu for an hour (`max-age=3600`) so the API isn't
// asked on every visit. At 09:43 Maya raises the croissant's price in the kitchen; at 09:45 Lena presses Refresh menu and
// still sees the old one, because within max-age her browser answers from its copy without asking. Learn: max-age is a
// promise that the answer stays right for that long; nothing the server does in the meantime reaches the browser. The
// fix: `no-cache` (keep it, but ask every time; Express's ETag makes the answer a 304 when nothing changed).
import { probesGoal } from '../debugging/checks'
import { CACHE_HEAD, CROISSANT, MENU_CORS, MENU_PAGE, croissantAt, kitchenSets, menuApp, menuData } from './caching'
import { predictedGoal } from './checks'
import { API, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The line that lets browsers keep the menu for an hour. */
export const HOUR_IN_CACHE = '  res.set(\'Cache-Control\', \'max-age=3600\')'

const SERVER = `${CACHE_HEAD}

${MENU_CORS}

${menuData()}

// GET /menu: today's menu. An hour in the browser's cache, so the API isn't asked on every visit (Jonas)
app.get('/menu', (req, res) => {
${HOUR_IN_CACHE}
  res.json(MENU)
})
`

export const oldPrice: WebScenario = {
  id: 'web-16-old-price',
  track: 'web',
  kind: 'scenario',
  title: 'Still the old price',
  difficulty: 1,
  minutes: 5,
  teaches: 'max-age',
  story: [
    'The menu loads on every visit, so Jonas told browsers to keep it for an hour: `Cache-Control: max-age=3600`. At 09:43 Maya raises the croissant to 2.60 € on the kitchen\'s tablet. At 09:45 Lena presses Refresh menu and still sees 2.40 €; at the till she pays 2.60 €.',
    'Predict what Lena\'s Refresh does. Then fix `server.js` so a new price shows on the next Refresh. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'refresh',
      form: 'one',
      prompt: 'At 09:41 the page loads `GET /menu`, answered with `Cache-Control: max-age=3600`. At 09:43 the croissant goes up to 2.60 € on the server. At 09:45 Lena presses Refresh menu, which fetches `/menu` again. What happens?',
      options: [
        { id: 'asks', text: 'The browser asks server.js again and the page shows 2.60 €.', fact: { says: 'Menu loaded · croissant 2.60 €' } },
        { id: 'cache', text: 'The browser answers from its own copy without asking: still 2.40 €, and server.js never sees a second `GET /menu`.', fact: { row: 'GET https://api.cornerbakery.shop/menu 200 (disk cache)' } },
        { id: 'not-modified', text: 'The browser asks with `If-None-Match`, server.js answers `304 Not Modified`, and the page keeps 2.40 €.', fact: { server: 'GET /menu 304' } },
        { id: 'fails', text: 'Refresh fails: the page may not fetch an address the browser still has a copy of.' }
      ],
      answer: 'cache',
      rule: 'Within its max-age the browser uses its copy without asking the server, so nothing the server changes shows until the copy is stale.'
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
      // the page loads at 09:41, the kitchen changes the price at 09:43, Lena presses Refresh at 09:45
      scene: [{ later: 2 }, kitchenSets('croissant', '2.6'), { later: 2 }, { click: '#refresh' }]
    },
    probes: [
      { id: 'now', steps: [{ text: CROISSANT }] },
      // the next change shows on the very next Refresh, a second later (a page that writes the price itself, or any
      // max-age but 0, doesn't)
      { id: 'again', steps: [kitchenSets('croissant', '2.8'), { later: 0.02 }, { click: '#refresh' }, { text: CROISSANT }] }
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Menu', main: MENU_PAGE }, { 'app.js': menuApp({ comment: 'The order page: today\'s menu from the API, and a button for the latest prices (Jonas).' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Lena\'s Refresh does', 1),
    probesGoal('fresh', 'A new price shows on Lena\'s next Refresh: 2.60 € at 09:45, and 2.80 € a second after the next change', { now: croissantAt('2.60'), again: croissantAt('2.80') })
  ],
  hints: [
    'Open the Network panel: the Refresh at 09:45 is a row marked (disk cache), and the Server panel has only one `GET /menu`. The Application panel\'s Cache shows the copy, its age and how long it stays fresh.',
    '`max-age=3600` tells the browser the answer stays right for an hour, so it doesn\'t ask. To keep a copy but ask every time whether it is still right, the server says `no-cache`: Express already sends an ETag, so an unchanged menu comes back as a short 304.',
    'On line 36 of `server.js`, send `res.set(\'Cache-Control\', \'no-cache\')` instead. Save, then Reload.'
  ],
  debrief: {
    title: 'An hour is a promise',
    paragraphs: [
      '`max-age=3600` promises the browser that the menu stays right for an hour, and the browser keeps its side: until the copy is an hour old it answers the page itself, without a request (Chrome marks the row "(disk cache)"). Maya\'s new price was on the server from 09:43, and nothing told Lena\'s browser.',
      '`no-cache` doesn\'t mean "don\'t cache": the browser keeps the copy and asks every time, sending the copy\'s ETag as `If-None-Match`. Express made that ETag from the body, so while nothing changes server.js answers `304 Not Modified` without a body, and after a change it sends the new menu. `max-age=0` does the same; `no-store` works too, but downloads the whole menu every time (the next scenario).',
      'Changing the page instead (`fetch(url, { cache: \'no-cache\' })`, or a new query on every request) also gets the new price, but every other page that reads `/menu` still gets the old one for an hour: say how long an answer stays right where it is made, on the server.'
    ]
  },
  solution: [
    { predict: 'cache' },
    { save: 'server.js', replace: [HOUR_IN_CACHE, '  res.set(\'Cache-Control\', \'no-cache\')'] },
    'reload'
  ]
}
