// HTTP caching 4.5: yesterday's menu after the deploy. Last month Jonas let browsers keep the menu for a day
// (`max-age=86400`: "it changes once a day"). This morning's deploy changed the API and the page to prices in cents.
// Lena's browser kept yesterday's menu at 18:00 and won't ask before 18:00 today, so her new page reads euros as cents:
// `NaN €`. Learn: a max-age the browser already has can't be taken back; changing server.js's header now only reaches
// browsers that ask. The page must ask for an address her browser has no copy of (`/menu?v=2`: the hashed file names of
// a build), and server.js must stop promising a day for an address whose answer changes, or the next deploy strands
// her again.
import { probesGoal } from '../debugging/checks'
import { CACHE_HEAD, CROISSANT, MENU_CORS, MENU_PAGE, croissantAt, kitchenSets, menuApp, menuData, menuFetch } from './caching'
import { predictedGoal } from './checks'
import { API, SHOP, SHOP_PAGE, webSite } from './site'
import type { WebScenario } from './types'

/** The line that lets browsers keep the menu for a day. */
export const DAY_IN_CACHE = '  res.set(\'Cache-Control\', \'max-age=86400\')'
/** The page's request for the menu (the line the fix changes). */
export const MENU_REQUEST = menuFetch({})

/** What `GET /menu` answered yesterday at 18:00, before the deploy: prices in euros. */
export const YESTERDAYS_MENU = '[{"id":"croissant","name":"Butter croissant","price":2.4},{"id":"pain-au-chocolat","name":"Pain au chocolat","price":2.8},{"id":"apricot-danish","name":"Apricot danish","price":3.2},{"id":"sourdough","name":"Sourdough loaf","price":6.5},{"id":"rye","name":"Rye loaf","price":5},{"id":"cinnamon-bun","name":"Cinnamon bun","price":3.4}]'
/** Its ETag, as Express made it (the unit tests check it against the runtime's). */
export const YESTERDAYS_ETAG = 'W/"14e-W/PjPH6hefdza5fKP81UMkzIp2c"'

const SERVER = `${CACHE_HEAD}

${MENU_CORS}

${menuData('priceCents')}

// GET /menu: today's menu. It changes once a day, so browsers may keep it a day (Jonas, last month)
app.get('/menu', (req, res) => {
${DAY_IN_CACHE}
  res.json(MENU)
})
`

export const staleDeploy: WebScenario = {
  id: 'web-20-stale-deploy',
  track: 'web',
  kind: 'scenario',
  title: 'Yesterday\'s menu after the deploy',
  difficulty: 3,
  minutes: 8,
  teaches: 'stale deploy',
  story: [
    'Last month Jonas let browsers keep the menu for a day: `Cache-Control: max-age=86400`, “it changes once a day.” This morning at 07:00 he deployed prices in cents: the API now sends `priceCents`, and the page reads it. Most customers are fine. Lena, who looked at the menu yesterday at 18:00, sees `NaN €` everywhere.',
    'Predict what Lena\'s browser does with the menu at 09:41. Then fix it so she gets today\'s menu now, and the next change reaches her within minutes, not tomorrow: the page\'s `app.js` and `server.js` are both in Code. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'lena',
      form: 'one',
      prompt: 'Yesterday at 18:00 Lena\'s browser kept `GET /menu` with `Cache-Control: max-age=86400` (prices in euros, and an ETag). Since 07:00 server.js sends prices in cents, and the page reads `priceCents`. At 09:41 Lena opens the page. What does her browser do with `GET /menu`?',
      options: [
        { id: 'new', text: 'It fetches today\'s menu: a deploy makes every copy stale.', fact: { says: 'Menu loaded · croissant 2.60 €' } },
        { id: 'old', text: 'It answers from yesterday\'s copy without asking (fresh until 18:00 today), and the page reads euros as cents: `NaN €`.', fact: { row: 'GET https://api.cornerbakery.shop/menu 200 (disk cache)' } },
        { id: 'revalidates', text: 'It asks with yesterday\'s ETag; the menu changed, so server.js sends today\'s menu in full.', fact: { server: 'GET /menu 200' } },
        { id: 'not-modified', text: 'It asks with yesterday\'s ETag and server.js answers `304`, so it keeps yesterday\'s menu.', fact: { server: 'GET /menu 304' } }
      ],
      answer: 'old',
      rule: 'A copy the browser holds stays fresh for the max-age it came with, whatever the server sends now, so only a new address (or a page that asks to revalidate) reaches it before then.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: {
      api: API,
      server: 'server.js',
      application: true,
      time: true,
      cache: {
        seeds: [{
          into: 'browser',
          url: `${API}/menu`,
          headers: { 'access-control-allow-origin': SHOP, 'cache-control': 'max-age=86400', 'content-type': 'application/json; charset=utf-8', 'etag': YESTERDAYS_ETAG },
          body: YESTERDAYS_MENU,
          // yesterday at 18:00
          minutesAgo: 941
        }]
      }
    },
    probes: [
      { id: 'today', steps: [{ text: CROISSANT }] },
      // an unchanged Refresh a few seconds later costs no whole menu (her copy, or a 304): the network has answered the page
      // in full once, for the load; a new address on every request would fill her cache with day-long copies instead
      { id: 'cheap', steps: [{ later: 0.1 }, { click: '#refresh' }, { whole: `GET ${API}/` }] },
      // the next change (Maya, ten minutes later) reaches Lena on her next Refresh: not tomorrow
      { id: 'next', steps: [kitchenSets('croissant', '2.9'), { later: 10 }, { click: '#refresh' }, { text: CROISSANT }] }
    ]
  },
  setup: () => ({
    files: webSite({ title: 'Menu', main: MENU_PAGE }, { 'app.js': menuApp({ comment: 'The order page, deployed this morning at 07:00: prices come in cents now (Jonas).', price: 'product.priceCents / 100' }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Lena\'s browser does with the menu', 1),
    probesGoal('today', 'Lena, whose browser kept yesterday\'s menu until 18:00, sees today\'s prices now', { today: croissantAt('2.60') }),
    probesGoal('next', 'An unchanged Refresh costs no whole menu, and the next price change reaches her on her next Refresh ten minutes later, not tomorrow', { cheap: { atMost: 1 }, next: croissantAt('2.90') })
  ],
  hints: [
    'The Network panel marks Lena\'s `GET /menu` (disk cache), and the Server panel never saw it. The Application panel\'s Cache shows her copy from 18:00 yesterday: fresh for another eight hours.',
    'Nothing server.js sends now reaches a browser that doesn\'t ask. What reaches her is an address she has no copy of: a build gives its files a new name for every deploy for this reason. And so the next change doesn\'t strand her, `/menu` must stop promising a day: `no-cache` (with Express\'s ETag, an unchanged menu is a 304).',
    'In `app.js`, line 8, ask for `/menu?v=2`. In `server.js`, line 36, send `res.set(\'Cache-Control\', \'no-cache\')`. Save both, then Reload.'
  ],
  debrief: {
    title: 'You can\'t take back a max-age',
    paragraphs: [
      'Yesterday\'s answer told Lena\'s browser the menu stays right until 18:00 today, and the browser has no way to hear otherwise: it doesn\'t ask. Changing server.js\'s header now reaches only browsers that ask, so it fixes nothing for her (and a CDN could be purged, a customer\'s browser can\'t).',
      'What reaches her is an address she has no copy of. Builds do this for scripts and styles: `app.3f9c2e.js`, a new name for every deploy, kept for a year, while the HTML that names them is `no-cache`. Here the page asks for `/menu?v=2`; the page itself, loaded fresh, is the HTML. A page that asks to revalidate (`fetch(url, { cache: \'no-cache\' })`) gets there too, with yesterday\'s ETag, which no longer matches.',
      'Then the cause: a day-long `max-age` on an address whose answer changes. `no-cache` with Express\'s ETag costs a short 304 when nothing changed and shows a change at once. A long max-age belongs only to an address whose content never changes (a versioned one); `Clear-Site-Data: "cache"` on some other answer could also empty her cache in a real browser (the model leaves it out).'
    ]
  },
  solution: [
    { predict: 'old' },
    { save: 'app.js', replace: [MENU_REQUEST, menuFetch({ path: '/menu?v=2' })] },
    { save: 'server.js', replace: [DAY_IN_CACHE, '  res.set(\'Cache-Control\', \'no-cache\')'] },
    'reload'
  ]
}
