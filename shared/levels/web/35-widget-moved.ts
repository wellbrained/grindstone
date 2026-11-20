// Security headers & CSP 7.5: the widget moved house. TasteBuds' new tag is a loader that adds the widget from a public
// CDN (cdn.jsfast.example, which serves every package on npm); Ben's allowlist doesn't name the CDN, so the reviews are
// gone. Naming the CDN (or TasteBuds' folder on it) brings them back, and also every other file there: the same package
// ships a legacy JSONP endpoint, a script an attacker can point anywhere. Learn: a strict policy trusts scripts by a
// nonce the server makes fresh for every page (or by a hash) and lets 'strict-dynamic' pass that trust on to the scripts
// they add; host and folder allowlists of big CDNs don't hold (pinning the one exact file does, until the next version).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { ACCOUNT_BOX, ACCOUNT_ROUTES, ATTACKER_HOSTS, REVIEWS, REVIEWS_BOX, SHOP_SERVER_HEAD, STATIC_FILES, stillWorks, TASTEBUDS, WIDGET, headersApp, headersMiddleware, headersSite, nextXss, orderBox, shopServer } from './headers'
import { SHOP } from './site'
import type { WebScenario } from './types'

export const CDN = 'https://cdn.jsfast.example'
export const CDN_WIDGET = `${CDN}/npm/@tastebuds/reviews@2.4/dist/reviews.js`
/** A legacy JSONP endpoint in the same package version on the CDN: whoever names a callback runs code. */
export const CDN_GADGET = `${CDN}/npm/@tastebuds/reviews@2.4/dist/legacy/jsonp.js`
export const LOADER = `${TASTEBUDS}/loader.js`

const LOADER_SOURCE = [
  '/* TasteBuds loader v2 · adds the current widget from our CDN */',
  '(function () {',
  '  var script = document.createElement(\'script\');',
  `  script.src = '${CDN_WIDGET}';`,
  '  document.head.appendChild(script);',
  '})();',
  ''
].join('\n')

const javascript = (body: string) => ({ type: 'text/javascript; charset=utf-8', body })

const POLICY = `script-src 'self' ${TASTEBUDS}`
const POLICY_LINE = `res.set('Content-Security-Policy', "${POLICY}")`
const MIDDLEWARE = headersMiddleware('The page\'s security headers (Ben: our scripts and TasteBuds\', nothing inline)', [POLICY_LINE])

const SERVER = [SHOP_SERVER_HEAD, '', MIDDLEWARE, '', STATIC_FILES, '', ACCOUNT_ROUTES, ''].join('\n')

/** The solution's page route: index.html with a fresh nonce in its script tags, and the strict policy with it. */
const NONCE_ROUTE = [
  '// The page, with a fresh nonce for its own script tags on every answer (Ben)',
  'const fs = require(\'fs\')',
  'const crypto = require(\'crypto\')',
  'const PAGE = fs.readFileSync(\'public/index.html\', \'utf8\')',
  'app.get(\'/\', (req, res) => {',
  '  const nonce = crypto.randomBytes(16).toString(\'base64\')',
  '  res.set(\'Content-Security-Policy\', `script-src \'nonce-${nonce}\' \'strict-dynamic\'`)',
  '  res.send(PAGE.replaceAll(\'{{nonce}}\', nonce))',
  '})'
].join('\n')

const GUARDS = nextXss({ nonce: true, gadget: `${CDN_GADGET}?callback=steal` })

export const widgetMoved: WebScenario = {
  id: 'web-35-widget-moved',
  track: 'web',
  kind: 'scenario',
  title: 'The widget moved house',
  difficulty: 3,
  minutes: 10,
  teaches: 'strict-dynamic',
  story: [
    `TasteBuds sent a new tag: \`${LOADER}\`, a small loader that adds the widget from \`${CDN}\`, the public CDN that serves every package on npm. Since Maya put it in, the reviews are gone. Ben's first idea is to add the CDN to the policy.`,
    'Predict what the policy does with the new tag. Then make the policy trust the page\'s own script tags and what they add, no host or folder: the reviews, the account line and Place order must work, and an attacker\'s inline code (even with a nonce from a page they loaded a moment ago) or a file from that CDN must be refused. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'moved',
      form: 'one',
      prompt: `The page is sent with \`Content-Security-Policy: ${POLICY}\`. Its tag \`<script src="${LOADER}">\` runs \`document.createElement('script')\` with the src \`${CDN_WIDGET}\` and appends it. What happens?`,
      options: [
        { id: 'trusted', text: 'The reviews show: TasteBuds\' loader is allowed, so what it adds is allowed too.' },
        { id: 'loader', text: 'The loader itself is refused: a script that adds scripts needs \'unsafe-eval\'.', fact: { says: `Loading the script '${LOADER}' violates` } },
        { id: 'cdn', text: 'The loader runs, but the script it adds is refused: cdn.jsfast.example is no source the policy lists.', fact: { says: `Loading the script '${CDN_WIDGET}' violates` } }
      ],
      answer: 'cdn',
      rule: 'Without \'strict-dynamic\' a policy checks every script by its address, also one an allowed script adds; with it, a script trusted by a nonce or hash passes the trust on, and addresses no longer count.'
    }]
  },
  sandbox: {
    page: '/',
    open: 'server.js',
    web: shopServer({
      security: {
        hosts: [
          { origin: TASTEBUDS, files: { '/loader.js': javascript(LOADER_SOURCE), '/reviews.js': javascript(WIDGET), '/api/reviews': { type: 'application/json; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(REVIEWS) } } },
          { origin: CDN, files: { '/npm/@tastebuds/reviews@2.4/dist/reviews.js': javascript(WIDGET), '/npm/@tastebuds/reviews@2.4/dist/legacy/jsonp.js': javascript('/* TasteBuds legacy JSONP: calls the callback the address names */\n') } },
          ...ATTACKER_HOSTS
        ]
      }
    }),
    probes: [
      ...stillWorks(CDN_WIDGET).probes,
      { id: 'email', steps: [{ arrived: `POST ${SHOP}/account/email` }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: headersSite({ main: [...ACCOUNT_BOX, ...orderBox(false), ...REVIEWS_BOX], scripts: [`<script src="${LOADER}" async></script>`] }, { 'app.js': headersApp({ listener: true }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the policy does with the new tag', 1),
    probesGoal('strict', 'The policy trusts the page\'s own script tags and what they add, no host or folder: the TasteBuds reviews, the account line and Place order work, Mallory\'s onerror never runs, and an attacker\'s inline code (with a nonce from a page they loaded) or a script from the CDN or another site is refused', { ...stillWorks(CDN_WIDGET).expected, email: 0, ...GUARDS.expected })
  ],
  hints: [
    `The Console says the CDN's script was refused, and Network shows its row as (blocked:csp). Adding \`${CDN}\` (or TasteBuds' folder on it) to the list would bring the reviews back, and also every other file there, the package's legacy JSONP endpoint among them.`,
    'A nonce: server.js makes a fresh random value for every answer, puts it in the policy (`\'nonce-…\'`) and on the page\'s own script tags (`nonce="…"`). An attacker\'s code can\'t know the next one. `\'strict-dynamic\'` lets a script trusted that way add more scripts (the loader\'s), and makes the policy ignore addresses.',
    'In index.html, add `nonce="{{nonce}}"` to the app.js tag and to the loader\'s tag. In server.js, take the policy out of Ben\'s middleware and add, before `express.static`, a route for `/` that reads index.html (`fs.readFileSync(\'public/index.html\', \'utf8\')`), makes `crypto.randomBytes(16).toString(\'base64\')`, sends `Content-Security-Policy: script-src \'nonce-…\' \'strict-dynamic\'` and the page with `{{nonce}}` replaced. Save both, then Reload.'
  ],
  debrief: {
    title: 'Trust the tags, not the addresses',
    paragraphs: [
      'An allowlist trusts addresses, and a big CDN is an address that serves anyone\'s files: an old library with a JSONP endpoint, or a version with a known hole, turns "scripts from cdn.jsfast.example" into "any code an attacker likes". Studies of real policies found most host allowlists bypassable this way. Pinning the one exact file of the widget holds, but only until TasteBuds ships the next version, and a CDN that redirects makes the browser ignore the path.',
      'A strict policy trusts something an attacker can\'t copy: a nonce the server makes fresh for every page (`\'nonce-…\'` in the header, `nonce="…"` on the page\'s own tags), or the hash of an inline script. `\'strict-dynamic\'` passes that trust to whatever those scripts add with `createElement(\'script\')` (TasteBuds\' loader) and makes the browser ignore addresses and `\'unsafe-inline\'` (browsers too old for it read those instead). A nonce that never changes is no nonce: anyone who loaded the page once can put it on their own script.',
      'Inline event handlers stay refused under a strict policy, and a page written for it uses `addEventListener` (7.1). Google\'s recommended policy is `script-src \'nonce-…\' \'strict-dynamic\'; object-src \'none\'; base-uri \'none\'`.'
    ]
  },
  solution: [
    { predict: 'cdn' },
    { save: 'index.html', replace: ['<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js" nonce="{{nonce}}"></script>'] },
    { save: 'index.html', replace: [`<script src="${LOADER}" async></script>`, `<script src="${LOADER}" nonce="{{nonce}}" async></script>`] },
    { save: 'server.js', replace: [`${MIDDLEWARE}\n\n${STATIC_FILES}`, `${NONCE_ROUTE}\n\n${STATIC_FILES}`] },
    'reload'
  ]
}
