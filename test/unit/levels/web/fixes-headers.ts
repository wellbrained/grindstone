// Other edits a player may make to a chapter 7 level (Security headers & CSP): real fixes the goals must accept and
// tempting non-fixes they must reject, the chapter's list among them: 'unsafe-inline' kept, `*` or a scheme as a
// source, a static nonce, 'strict-dynamic' without a nonce, a policy in a meta tag where only a header counts (frame-
// ancestors) or outside the head, X-Frame-Options (DENY, SAMEORIGIN, ALLOW-FROM) where a list is needed, a wildcard
// that takes the attacker in, connect-src without img-src, a CDN or a folder on it allowed (one exact file pinned passes), report-only kept, the page's
// own code fixing it instead of the policy (a MutationObserver that strips handlers, a wrapped fetch), the attacker
// refused by name. Applied like fixes.ts's; run in a browser by e2e/web-levels.spec.ts.
import { createHash } from 'node:crypto'
import { LOOSE_POLICY } from '../../../../shared/levels/web/31-lets-it-run'
import { STATS } from '../../../../shared/levels/web/33-phones-home'
import { PICKUP, PICKUP_SCRIPT } from '../../../../shared/levels/web/34-only-watched'
import { CDN, LOADER } from '../../../../shared/levels/web/35-widget-moved'
import { TASTEBUDS } from '../../../../shared/levels/web/headers'
import type { OtherFix } from './fixes'

type Edit = OtherFix['edits'][number]

const sha = (text: string) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`
const server = (from: string, to: string): Edit => ({ save: 'server.js', replace: [from, to] })
const page = (from: string, to: string): Edit => ({ save: 'index.html', replace: [from, to] })
const app = (from: string, to: string): Edit => ({ save: 'app.js', replace: [from, to] })
const policyLine = (value: string, header = 'Content-Security-Policy') => `res.set('${header}', "${value}")`

// --- 7.1 ---------------------------------------------------------------------------------------------------------------

const LOOSE_LINE = policyLine(LOOSE_POLICY)
const STRICT = `script-src 'self' ${TASTEBUDS}`
const looseTo = (value: string, header?: string) => server(LOOSE_LINE, policyLine(value, header))
/** The button's code into app.js (addEventListener), as the solution does. */
const MOVE_HANDLER: Edit[] = [
  page(' onclick="placeOrder()"', ''),
  app('    : \'Sorry, your order did not go through.\'\n}\n', '    : \'Sorry, your order did not go through.\'\n}\ndocument.querySelector(\'#place\').addEventListener(\'click\', placeOrder)\n')
]
const META = (value: string) => `<meta http-equiv="Content-Security-Policy" content="${value}">`
const NO_POLICY = server(`  ${LOOSE_LINE}\n`, '')
/** app.js writes the reviews itself (the review of 2026-11-20: the count alone was fakeable) */
const FAKE_REVIEWS = app('const who = document.querySelector(\'#who\')', 'for (const name of [\'Mara\', \'Mallory\', \'Sam\']) { const item = document.createElement(\'li\'); item.textContent = name; document.querySelector(\'#tastebuds-reviews\').append(item) }\nconst who = document.querySelector(\'#who\')')

const letsItRun: OtherFix[] = [
  { name: 'the button\'s handler allowed by its hash with \'unsafe-hashes\' (onclick kept)', solves: true, edits: [looseTo(`${STRICT} 'unsafe-hashes' '${sha('placeOrder()')}'`)] },
  { name: 'the policy in a meta tag in the head instead of the header, the handler moved', solves: true, edits: [NO_POLICY, page('<link rel="stylesheet" href="./style.css">', `<link rel="stylesheet" href="./style.css">\n  ${META(STRICT)}`), ...MOVE_HANDLER] },
  { name: 'the handler moved, \'unsafe-inline\' kept', solves: false, edits: MOVE_HANDLER },
  { name: '\'unsafe-inline\' dropped, the onclick kept (Place order breaks)', solves: false, edits: [looseTo(STRICT)] },
  { name: 'script-src * (nothing inline, any address)', solves: false, edits: [looseTo('script-src *'), ...MOVE_HANDLER] },
  { name: 'script-src \'self\' https: (any https address)', solves: false, edits: [looseTo('script-src \'self\' https:'), ...MOVE_HANDLER] },
  { name: 'default-src \'self\' with the scripts (the widget\'s own requests refused)', solves: false, edits: [looseTo(`default-src 'self'; ${STRICT}`), ...MOVE_HANDLER] },
  { name: 'default-src \'self\' with the scripts, and app.js writing the reviews itself', solves: false, edits: [looseTo(`default-src 'self'; ${STRICT}`), ...MOVE_HANDLER, FAKE_REVIEWS] },
  { name: '\'strict-dynamic\' added to the loose policy (no nonce: nothing loads)', solves: false, edits: [looseTo(`${LOOSE_POLICY} 'strict-dynamic'`)] },
  { name: 'no policy at all, the handler moved', solves: false, edits: [NO_POLICY, ...MOVE_HANDLER] },
  { name: 'the strict policy in a meta tag at the end of the body (outside the head: ignored)', solves: false, edits: [NO_POLICY, page('  <script type="module" src="./app.js"></script>', `  ${META(STRICT)}\n  <script type="module" src="./app.js"></script>`), ...MOVE_HANDLER] },
  {
    name: 'the page\'s own MutationObserver strips every on… attribute (the policy still loose)',
    solves: false,
    edits: [app('const who = document.querySelector(\'#who\')', [
      'new MutationObserver((records) => {',
      '  for (const record of records) for (const node of record.addedNodes) if (node.querySelectorAll) for (const element of [node, ...node.querySelectorAll(\'*\')]) for (const name of element.getAttributeNames()) if (name.startsWith(\'on\') && element.id !== \'place\') element.removeAttribute(name)',
      '}).observe(document, { childList: true, subtree: true })',
      'const who = document.querySelector(\'#who\')'
    ].join('\n'))]
  }
]

// --- 7.2 ---------------------------------------------------------------------------------------------------------------

const NOSNIFF = '  res.set(\'X-Content-Type-Options\', \'nosniff\')'
const frameHeader = (...lines: string[]) => server(NOSNIFF, [NOSNIFF, ...lines.map(line => `  ${line}`)].join('\n'))

const freeFlour: OtherFix[] = [
  { name: 'frame-ancestors https://market.example (without \'self\')', solves: true, edits: [frameHeader(policyLine('frame-ancestors https://market.example'))] },
  { name: 'frame-ancestors with X-Frame-Options: DENY beside it (Chrome ignores the second)', solves: true, edits: [frameHeader('res.set(\'X-Frame-Options\', \'DENY\')', policyLine('frame-ancestors \'self\' https://market.example'))] },
  { name: 'X-Frame-Options: DENY (the market refused too)', solves: false, edits: [frameHeader('res.set(\'X-Frame-Options\', \'DENY\')')] },
  { name: 'X-Frame-Options: SAMEORIGIN', solves: false, edits: [frameHeader('res.set(\'X-Frame-Options\', \'SAMEORIGIN\')')] },
  { name: 'X-Frame-Options: ALLOW-FROM https://market.example (ignored)', solves: false, edits: [frameHeader('res.set(\'X-Frame-Options\', \'ALLOW-FROM https://market.example\')')] },
  { name: 'frame-ancestors in a meta tag', solves: false, edits: [page('<link rel="stylesheet" href="./style.css">', `<link rel="stylesheet" href="./style.css">\n  ${META('frame-ancestors \'self\' https://market.example')}`)] },
  { name: 'frame-ancestors https://*.example (the rival too)', solves: false, edits: [frameHeader(policyLine('frame-ancestors \'self\' https://*.example'))] },
  { name: 'frame-ancestors *', solves: false, edits: [frameHeader(policyLine('frame-ancestors *'))] },
  { name: 'frame-ancestors only as report-only', solves: false, edits: [frameHeader(policyLine('frame-ancestors \'self\' https://market.example', 'Content-Security-Policy-Report-Only'))] },
  { name: 'cheap-flour.example refused by its Referer (another site gets through)', solves: false, edits: [server('// The quick-order page: the farmers\' market shows it in a frame on market.example (Maya)\n', '// The quick-order page: the farmers\' market shows it in a frame on market.example (Maya)\napp.use((req, res, next) => (req.get(\'Referer\') ?? \'\').includes(\'cheap-flour\') ? res.sendStatus(403) : next())\n')] },
  { name: 'the session cookie set again as SameSite=Lax (the market\'s orders lose it)', solves: false, edits: [frameHeader('res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })')] },
  { name: 'X-Frame-Options: DENY unless the Referer is the market\'s (a site framing the market\'s page gets through)', solves: false, edits: [frameHeader('if (req.get(\'Referer\') !== \'https://market.example/\') res.set(\'X-Frame-Options\', \'DENY\')')] },
  { name: 'X-Frame-Options: DENY but for the second frame the market asks for (counting requests)', solves: false, edits: [server('// The page\'s security headers (Ben)\n', '// The page\'s security headers (Ben)\nlet framed = 0\n'), frameHeader('if (req.get(\'Referer\')) framed += 1', 'if (req.get(\'Referer\') && !(framed === 2 && req.get(\'Referer\') === \'https://market.example/\')) res.set(\'X-Frame-Options\', \'DENY\')')] }
]

// --- 7.3 ---------------------------------------------------------------------------------------------------------------

const BEN = `res.set('Content-Security-Policy', "${STRICT}")`
const phonesPolicy = (value: string) => server(BEN, policyLine(value))

const phonesHome: OtherFix[] = [
  { name: 'connect-src and img-src beside script-src (no default-src)', solves: true, edits: [phonesPolicy(`${STRICT}; connect-src 'self' ${TASTEBUDS} ${STATS}; img-src 'self'`)] },
  { name: 'default-src \'none\' with what the page needs', solves: true, edits: [phonesPolicy(`default-src 'none'; ${STRICT}; connect-src 'self' ${TASTEBUDS} ${STATS}; img-src 'self'; style-src 'self'`)] },
  { name: 'connect-src without img-src (an image still goes anywhere)', solves: false, edits: [phonesPolicy(`${STRICT}; connect-src 'self' ${TASTEBUDS} ${STATS}`)] },
  { name: 'connect-src *', solves: false, edits: [phonesPolicy(`default-src 'self'; ${STRICT}; connect-src *`)] },
  { name: 'connect-src \'self\' https:', solves: false, edits: [phonesPolicy(`default-src 'self'; ${STRICT}; connect-src 'self' https:`)] },
  { name: 'default-src \'self\' alone with the scripts (the widget\'s reviews and the stats refused)', solves: false, edits: [phonesPolicy(`default-src 'self'; ${STRICT}`)] },
  { name: 'the widget\'s tag taken out', solves: false, edits: [page(`  <script src="${TASTEBUDS}/reviews.js" async></script>\n`, '')] },
  { name: 'the page wraps fetch to drop requests to cheap-flour.example', solves: false, edits: [app('const who = document.querySelector(\'#who\')', 'const send = window.fetch\nwindow.fetch = (address, init) => String(address).includes(\'cheap-flour\') ? Promise.resolve(new Response(\'\')) : send(address, init)\nconst who = document.querySelector(\'#who\')')] }
]

// --- 7.4 ---------------------------------------------------------------------------------------------------------------

const WATCHED = `script-src 'self' ${TASTEBUDS}; report-uri /csp-report`
const WATCH_LINE = policyLine(WATCHED, 'Content-Security-Policy-Report-Only')
const watchTo = (...lines: string[]) => server(WATCH_LINE, lines.join('\n  '))
const PICKUP_TO_APP: Edit[] = [
  page(`\n  <script>${PICKUP_SCRIPT}</script>`, ''),
  app('document.querySelector(\'#place\').addEventListener(\'click\', placeOrder)\n', `document.querySelector('#place').addEventListener('click', placeOrder)\ndocument.querySelector('#pickup').textContent = '${PICKUP}'\n`)
]

const onlyWatched: OtherFix[] = [
  { name: 'enforced with the pickup script\'s hash', solves: true, edits: [watchTo(policyLine(`script-src 'self' ${TASTEBUDS} '${sha(PICKUP_SCRIPT)}'; report-uri /csp-report`))] },
  { name: 'enforced, and the report-only header kept beside it', solves: true, edits: [watchTo(policyLine(WATCHED), WATCH_LINE), ...PICKUP_TO_APP] },
  { name: 'enforced as it is (the pickup line refused)', solves: false, edits: [watchTo(policyLine(WATCHED))] },
  { name: 'enforced with \'unsafe-inline\' for the pickup line', solves: false, edits: [watchTo(policyLine(`script-src 'self' ${TASTEBUDS} 'unsafe-inline'; report-uri /csp-report`))] },
  { name: 'enforced with the hash of the pickup script\'s text trimmed (not what the page has)', solves: false, edits: [watchTo(policyLine(`script-src 'self' ${TASTEBUDS} '${sha(PICKUP_SCRIPT.trim())}'; report-uri /csp-report`))] },
  { name: 'the report-only policy in a meta tag too (ignored there)', solves: false, edits: [page('<link rel="stylesheet" href="./style.css">', `<link rel="stylesheet" href="./style.css">\n  <meta http-equiv="Content-Security-Policy-Report-Only" content="script-src 'self' ${TASTEBUDS}">`), ...PICKUP_TO_APP] },
  { name: 'the pickup line moved, still report-only', solves: false, edits: PICKUP_TO_APP },
  { name: 'enforced with a nonce that never changes on the pickup script', solves: false, edits: [watchTo(policyLine(`script-src 'self' ${TASTEBUDS} 'nonce-abc'; report-uri /csp-report`)), page('<script>', '<script nonce="abc">')] }
]

// --- 7.5 ---------------------------------------------------------------------------------------------------------------

const MOVED_LINE = policyLine(STRICT)
const movedTo = (value: string) => server(MOVED_LINE, policyLine(value))
const NONCES: Edit[] = [
  page('<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js" nonce="{{nonce}}"></script>'),
  page(`<script src="${LOADER}" async></script>`, `<script src="${LOADER}" nonce="{{nonce}}" async></script>`)
]
const STATIC_NONCES: Edit[] = [
  page('<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js" nonce="r4nd0m"></script>'),
  page(`<script src="${LOADER}" async></script>`, `<script src="${LOADER}" nonce="r4nd0m" async></script>`)
]
/** server.js serves the page with a nonce of its own making (`nonce` is the expression, with req and served in reach). */
const ownNonceRoute = (nonce: string, before = ''): Edit => server('// The page and its files from public/ (index.html, app.js, style.css)', [
  'const fs = require(\'fs\')',
  'const crypto = require(\'crypto\')',
  'const PAGE = fs.readFileSync(\'public/index.html\', \'utf8\')',
  'let served = 0',
  'app.get(\'/\', (req, res) => {',
  '  served += 1',
  ...(before ? [`  ${before}`] : []),
  `  const nonce = ${nonce}`,
  '  res.set(\'Content-Security-Policy\', `script-src \'nonce-${nonce}\' \'strict-dynamic\'`)',
  '  res.send(PAGE.replaceAll(\'{{nonce}}\', nonce))',
  '})',
  '// The page and its files from public/ (index.html, app.js, style.css)'
].join('\n'))
const RANDOM = 'crypto.randomBytes(16).toString(\'base64\')'
/** server.js serves the page with a fresh nonce; `policy` gets it as $NONCE. */
const nonceRoute = (policy: string): Edit => server('// The page and its files from public/ (index.html, app.js, style.css)', [
  'const fs = require(\'fs\')',
  'const crypto = require(\'crypto\')',
  'const PAGE = fs.readFileSync(\'public/index.html\', \'utf8\')',
  'app.get(\'/\', (req, res) => {',
  '  const nonce = crypto.randomBytes(16).toString(\'base64\')',
  `  res.set('Content-Security-Policy', \`${policy.replace('$NONCE', '\'nonce-${nonce}\'')}\`)`,
  '  res.send(PAGE.replaceAll(\'{{nonce}}\', nonce))',
  '})',
  '// The page and its files from public/ (index.html, app.js, style.css)'
].join('\n'))
const DROP_BEN = server(`  ${MOVED_LINE}\n`, '')
const LOADER_INLINE = [
  '<script>',
  '    for (const [src, type] of [[\'./app.js\', \'module\'], [\'' + LOADER + '\', \'\']]) {',
  '      const script = document.createElement(\'script\')',
  '      if (type) script.type = type',
  '      script.src = src',
  '      document.body.append(script)',
  '    }',
  '  </script>'
].join('\n')
const LOADER_TEXT = LOADER_INLINE.slice('<script>'.length, -'</script>'.length)

const widgetMoved: OtherFix[] = [
  { name: 'a hash-based strict policy: one inline loader by its hash, \'strict-dynamic\' for what it adds', solves: true, edits: [page('<script type="module" src="./app.js"></script>', LOADER_INLINE), page(`\n  <script src="${LOADER}" async></script>`, ''), movedTo(`script-src '${sha(LOADER_TEXT)}' 'strict-dynamic'`)] },
  { name: 'nonces with \'strict-dynamic\' plus https: and \'unsafe-inline\' for old browsers', solves: true, edits: [...NONCES, DROP_BEN, nonceRoute('script-src $NONCE \'strict-dynamic\' https: \'unsafe-inline\'')] },
  { name: 'the CDN added to the allowlist (its other files too)', solves: false, edits: [movedTo(`${STRICT} ${CDN}`)] },
  { name: 'the CDN\'s TasteBuds folder added (an old version with JSONP is in it)', solves: false, edits: [movedTo(`${STRICT} ${CDN}/npm/@tastebuds/`)] },
  { name: 'the CDN\'s folder of this version added (its legacy JSONP endpoint is in it)', solves: false, edits: [movedTo(`${STRICT} ${CDN}/npm/@tastebuds/reviews@2.4/`)] },
  { name: 'the one exact file of the widget on the CDN pinned', solves: true, edits: [movedTo(`${STRICT} ${CDN}/npm/@tastebuds/reviews@2.4/dist/reviews.js`)] },
  { name: 'a nonce that never changes, with \'strict-dynamic\'', solves: false, edits: [...STATIC_NONCES, movedTo('script-src \'nonce-r4nd0m\' \'strict-dynamic\'')] },
  { name: 'fresh nonces without \'strict-dynamic\' (the loader\'s script refused)', solves: false, edits: [...NONCES, DROP_BEN, nonceRoute('script-src $NONCE')] },
  { name: '\'strict-dynamic\' without a nonce or hash (nothing loads)', solves: false, edits: [movedTo(`${STRICT} 'strict-dynamic'`)] },
  { name: 'Ben\'s policy kept, and app.js writing the reviews itself', solves: false, edits: [FAKE_REVIEWS] },
  { name: 'the static nonce on the first answer only, fresh ones after', solves: false, edits: [...NONCES, DROP_BEN, ownNonceRoute(`served === 1 ? 'r4nd0m' : ${RANDOM}`)] },
  { name: 'the static nonce until the browser has a seen cookie', solves: false, edits: [...NONCES, DROP_BEN, ownNonceRoute(`(req.get('Cookie') ?? '').includes('seen=') ? ${RANDOM} : 'r4nd0m'`, 'res.cookie(\'seen\', \'1\')')] },
  { name: 'the static nonce until app.js writes a cookie', solves: false, edits: [...NONCES, DROP_BEN, ownNonceRoute(`(req.get('Cookie') ?? '').includes('seen=') ? ${RANDOM} : 'r4nd0m'`), app('const who = document.querySelector(\'#who\')', 'document.cookie = \'seen=1\'\nconst who = document.querySelector(\'#who\')')] },
  { name: 'the static nonce, and a 500 for every page after the first', solves: false, edits: [...NONCES, DROP_BEN, ownNonceRoute('\'r4nd0m\'', 'if (served > 1) return res.status(500).send(\'busy\')')] },
  {
    name: 'the static nonce unless another server.js answers over a BroadcastChannel',
    solves: false,
    edits: [...NONCES, DROP_BEN, ownNonceRoute(`others ? ${RANDOM} : 'r4nd0m'`, 'void 0'), server('const app = express()\n', 'const app = express()\nlet others = false\ntry {\n  const channel = new BroadcastChannel(\'shop-servers\')\n  channel.onmessage = (event) => { if (event.data === \'anyone?\') channel.postMessage(\'me\'); else others = true }\n  channel.postMessage(\'anyone?\')\n} catch {}\n')]
  },
  { name: 'the static nonce unless the scripted random values give away a second server.js', solves: false, edits: [...NONCES, DROP_BEN, ownNonceRoute(`SECOND ? ${RANDOM} : 'r4nd0m'`), server('const app = express()\n', 'const app = express()\nconst SECOND = require(\'crypto\').randomBytes(16).toString(\'base64\') === \'ICVeiKAoRDD3vJUGLN+hCA==\'\n')] },
  { name: 'one nonce for everyone, a fresh one only for an exact replay of the first request', solves: false, edits: [...NONCES, DROP_BEN, server('const app = express()\n', 'const app = express()\nconst SHARED = require(\'crypto\').randomBytes(16).toString(\'base64\')\nlet first = null\n'), ownNonceRoute(`replay ? ${RANDOM} : SHARED`, 'const replay = first !== null && JSON.stringify(req.headers) === first; if (first === null) first = JSON.stringify(req.headers)')] },
  { name: 'the hash-based policy with a static nonce named in the header too', solves: false, edits: [page('<script type="module" src="./app.js"></script>', LOADER_INLINE), page(`\n  <script src="${LOADER}" async></script>`, ''), movedTo(`script-src '${sha(LOADER_TEXT)}' 'nonce-r4nd0m' 'strict-dynamic'`)] },
  {
    name: 'fresh nonces without \'strict-dynamic\', app.js adding the widget with the page\'s own nonce',
    solves: true,
    edits: [...NONCES, DROP_BEN, nonceRoute('script-src $NONCE'), app('const who = document.querySelector(\'#who\')', `const widget = document.createElement('script')\nwidget.nonce = document.querySelector('script[nonce]').nonce\nwidget.src = '${CDN}/npm/@tastebuds/reviews@2.4/dist/reviews.js'\ndocument.head.append(widget)\nconst who = document.querySelector('#who')`)]
  },
  { name: 'a nonce that never changes, with a decoy nonce first in the page', solves: false, edits: [...STATIC_NONCES, page('<link rel="stylesheet" href="./style.css">', '<link rel="stylesheet" href="./style.css">\n  <script nonce="decoy"></script>'), movedTo('script-src \'nonce-r4nd0m\' \'strict-dynamic\'')] },
  { name: 'a static nonce for requests with a cookie, fresh ones for the rest', solves: false, edits: [...NONCES, DROP_BEN, server('// The page and its files from public/ (index.html, app.js, style.css)', [
    'const fs = require(\'fs\')',
    'const crypto = require(\'crypto\')',
    'const PAGE = fs.readFileSync(\'public/index.html\', \'utf8\')',
    'app.get(\'/\', (req, res) => {',
    '  const nonce = req.get(\'Cookie\') ? \'r4nd0m\' : crypto.randomBytes(16).toString(\'base64\')',
    '  res.set(\'Content-Security-Policy\', `script-src \'nonce-${nonce}\' \'strict-dynamic\'`)',
    '  res.send(PAGE.replaceAll(\'{{nonce}}\', nonce))',
    '})',
    '// The page and its files from public/ (index.html, app.js, style.css)'
  ].join('\n'))] }
]

export const headersFixes: Record<string, OtherFix[]> = {
  'web-31-lets-it-run': letsItRun,
  'web-32-free-flour': freeFlour,
  'web-33-phones-home': phonesHome,
  'web-34-only-watched': onlyWatched,
  'web-35-widget-moved': widgetMoved
}
