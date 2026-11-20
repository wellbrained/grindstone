// Security headers & CSP practice tasks (ADR 0009: prediction only, one question or a set of three, about 30 s each).
// Each has a small page server.js serves with its headers; its run shows the answer (the Console's lines in Chrome's
// words, the Network panel's rows, a frame another site tried) once it is given. The files are read-only.
import { predictedGoal } from '../checks'
import { CHEAP_FLOUR, SHOP_SERVER_HEAD, STATIC_FILES, TASTEBUDS, headersMiddleware, headersSite, shopServer } from '../headers'
import { MARKET } from '../32-free-flour'
import { SHOP } from '../site'
import type { OtherSite } from '../sites'
import type { WebPracticeTask } from '../types'

const javascript = (body: string) => ({ type: 'text/javascript; charset=utf-8', body })
const logs = (text: string) => javascript(`console.log('${text}')\n`)
const note = (lines: readonly string[]) => ['<section class="box" aria-labelledby="note-heading">', '  <h2 id="note-heading">Today\'s page</h2>', ...lines.map(line => `  ${line}`), '</section>']
const server = (middleware: readonly string[], more: readonly string[] = []) => [SHOP_SERVER_HEAD, '', headersMiddleware('The page\'s headers (Ben)', middleware), '', ...more, ...(more.length ? [''] : []), STATIC_FILES, ''].join('\n')

// --- 7.1: which scripts run (pick lines) ----------------------------------------------------------------------------

const SCRIPTS_POLICY = `script-src 'self' ${TASTEBUDS}`

export const whichScripts: WebPracticeTask = {
  id: 'web-practice-which-scripts',
  track: 'web',
  kind: 'practice',
  practises: 'web-31-lets-it-run',
  title: 'Which scripts run?',
  difficulty: 1,
  minutes: 1,
  task: `The page is sent with \`Content-Security-Policy: ${SCRIPTS_POLICY}\`. Each of its scripts writes a line in the Console when it runs, and the scene clicks the button. Pick the ones that run.`,
  prediction: {
    questions: [{
      id: 'scripts',
      form: 'lines',
      prompt: `\`Content-Security-Policy: ${SCRIPTS_POLICY}\`. Which of these run?`,
      options: [
        { id: 'app', text: '`<script type="module" src="./app.js">` (the shop\'s own file)', fact: { says: 'app.js ran' } },
        { id: 'widget', text: `\`<script src="${TASTEBUDS}/hello.js">\``, fact: { says: 'TasteBuds ran' } },
        { id: 'inline', text: '`<script>console.log(\'inline script ran\')</script>`', fact: { says: 'inline script ran' } },
        { id: 'onclick', text: '`<button onclick="console.log(\'onclick ran\')">`, clicked', fact: { says: 'onclick ran' } },
        { id: 'apex', text: '`<script src="https://tastebuds.example/old.js">` (TasteBuds\' main site)', fact: { says: 'tastebuds.example ran' } },
        { id: 'rival', text: `\`<script src="${CHEAP_FLOUR}/hello.js">\``, fact: { says: 'cheap-flour.example ran' } }
      ],
      answer: ['app', 'widget'],
      rule: 'Without \'unsafe-inline\', a nonce or a hash, no inline script or handler runs; a script from an address runs only when the address matches a source exactly (\'self\' is the page\'s own origin, a host is that host only).'
    }]
  },
  sandbox: {
    page: '/',
    open: 'index.html',
    web: shopServer({
      security: { hosts: [{ origin: TASTEBUDS, files: { '/hello.js': logs('TasteBuds ran') } }, { origin: 'https://tastebuds.example', files: { '/old.js': logs('tastebuds.example ran') } }, { origin: CHEAP_FLOUR, files: { '/hello.js': logs('cheap-flour.example ran') } }] },
      scene: [{ click: '#hi' }]
    }),
    probes: []
  },
  setup: () => ({
    files: headersSite({
      title: 'Scripts',
      main: note(['<p>Six scripts, one policy.</p>', '<button class="action" id="hi" type="button" onclick="console.log(\'onclick ran\')">Say hi</button>']),
      scripts: [`<script src="${TASTEBUDS}/hello.js"></script>`, '<script>console.log(\'inline script ran\')</script>', '<script src="https://tastebuds.example/old.js"></script>', `<script src="${CHEAP_FLOUR}/hello.js"></script>`]
    }, { 'app.js': 'console.log(\'app.js ran\')\n', 'server.js': server([`res.set('Content-Security-Policy', "${SCRIPTS_POLICY}")`]) }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Pick the scripts that run', 1)],
  hints: ['\'self\' is cornerbakery.shop exactly; a host source is that host only (not its parent domain); inline code needs \'unsafe-inline\', a nonce or a hash.'],
  why: 'A policy\'s script-src lists exact sources: anything inline, and any address that matches none of them, is refused with a line in the Console.',
  solution: [{ predict: ['app', 'widget'] }]
}

// --- 7.2: who may frame it (a set of three) -------------------------------------------------------------------------

const FRAMES_SERVER = server(['res.set(\'X-Content-Type-Options\', \'nosniff\')'], [
  '// Three pages other sites frame',
  'app.get(\'/a\', (req, res) => {',
  '  res.set(\'X-Frame-Options\', \'DENY\')',
  '  res.set(\'Content-Security-Policy\', \'frame-ancestors https://market.example\')',
  '  res.send(\'<p>Page A</p>\')',
  '})',
  'app.get(\'/b\', (req, res) => {',
  '  res.send(\'<meta http-equiv="X-Frame-Options" content="DENY"><p>Page B</p>\')',
  '})',
  'app.get(\'/c\', (req, res) => {',
  '  res.set(\'X-Frame-Options\', \'ALLOW-FROM https://market.example\')',
  '  res.send(\'<p>Page C</p>\')',
  '})'
])

const FRAME_SITES: OtherSite[] = [
  { origin: MARKET, title: 'Saturday market', role: 'other', intro: ['<h1>Saturday market</h1>'], actions: [{ frame: `${SHOP}/a` }] },
  { origin: CHEAP_FLOUR, title: 'Free flour', role: 'attacker', intro: ['<h1>Free flour</h1>'], actions: [{ frame: `${SHOP}/b` }, { frame: `${SHOP}/c` }] }
]

const shownOrNot = (path: string) => [
  { id: 'shown', text: 'The frame shows the page.', fact: { row: `GET /${path} 200` } },
  { id: 'refused', text: 'The browser refuses to show it.', fact: { row: `GET /${path} (blocked)` } }
]

export const whoMayFrame: WebPracticeTask = {
  id: 'web-practice-who-may-frame',
  track: 'web',
  kind: 'practice',
  practises: 'web-32-free-flour',
  title: 'Who may frame it?',
  difficulty: 2,
  minutes: 2,
  task: 'server.js answers three pages with three ways of saying no to frames; the market frames A, cheap-flour.example frames B and C. For each, say whether the frame shows.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`/a` sends `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors https://market.example`. market.example frames it.', options: shownOrNot('a'), answer: 'shown', rule: 'Chrome ignores X-Frame-Options once an enforced policy has frame-ancestors: the list decides, and the market is on it.' },
      { id: 'b', form: 'one', prompt: '`/b` sends no framing header; its HTML starts with `<meta http-equiv="X-Frame-Options" content="DENY">`. cheap-flour.example frames it.', options: shownOrNot('b'), answer: 'shown', rule: 'X-Frame-Options (and frame-ancestors) count only as a header: the browser decides before the page\'s HTML is read.' },
      { id: 'c', form: 'one', prompt: '`/c` sends `X-Frame-Options: ALLOW-FROM https://market.example`. cheap-flour.example frames it.', options: shownOrNot('c'), answer: 'shown', rule: 'Chrome knows only DENY and SAMEORIGIN: ALLOW-FROM is an invalid value, so the header is ignored (frame-ancestors is the way to list who may frame).' }
    ]
  },
  sandbox: {
    page: '/',
    open: 'server.js',
    web: shopServer({ sites: FRAME_SITES, scene: [{ visit: MARKET }, { visit: CHEAP_FLOUR }] }),
    probes: []
  },
  setup: () => ({ files: headersSite({ title: 'Frames', main: note(['<p>Pages A, B and C are framed by other sites: see Other site and Network.</p>']) }, { 'app.js': '// nothing to run here\n', 'server.js': FRAMES_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Only a header decides framing; an enforced frame-ancestors beats X-Frame-Options; X-Frame-Options has two values Chrome knows.'],
  why: 'Framing is decided from the answer\'s headers before the page shows: frame-ancestors lists who may (and overrides X-Frame-Options), and a meta tag or an unknown value says nothing.',
  solution: [{ predict: 'shown' }, { predict: 'shown' }, { predict: 'shown' }]
}

// --- 7.3: which requests go out (pick lines) ------------------------------------------------------------------------

const STATS = 'https://stats.cornerbakery.shop'
const CONNECT_POLICY = `default-src 'self'; connect-src 'self' ${TASTEBUDS}`
const CONNECT_APP = [
  '// Five requests the page\'s script sends (Maya)',
  'const send = (address) => fetch(address, { mode: \'no-cors\' }).then(',
  '  () => console.log(`sent: ${address}`),',
  '  () => console.log(`refused: ${address}`)',
  ')',
  'send(\'/api/hours\')',
  `send('${TASTEBUDS}/api/reviews?shop=cornerbakery')`,
  `send('${STATS}/hit')`,
  'send(\'https://cornerbakery.shop:8443/hit\')',
  'send(\'https://tastebuds.example/x\')',
  ''
].join('\n')

export const whichRequests: WebPracticeTask = {
  id: 'web-practice-which-requests',
  track: 'web',
  kind: 'practice',
  practises: 'web-33-phones-home',
  title: 'Which requests go out?',
  difficulty: 1,
  minutes: 1,
  task: `The page is sent with \`Content-Security-Policy: ${CONNECT_POLICY}\`, and its script sends five requests. Pick the ones that leave the browser.`,
  prediction: {
    questions: [{
      id: 'requests',
      form: 'lines',
      prompt: `\`Content-Security-Policy: ${CONNECT_POLICY}\`. Which requests go out?`,
      options: [
        { id: 'hours', text: '`/api/hours` (the shop\'s own)', fact: { row: 'GET /api/hours 200' } },
        { id: 'reviews', text: `\`${TASTEBUDS}/api/reviews\``, fact: { row: `GET ${TASTEBUDS}/api/reviews?shop=cornerbakery 200` } },
        { id: 'stats', text: `\`${STATS}/hit\` (the shop's stats server)`, fact: { row: `GET ${STATS}/hit 200` } },
        { id: 'port', text: '`https://cornerbakery.shop:8443/hit`', fact: { row: 'GET https://cornerbakery.shop:8443/hit 200' } },
        { id: 'apex', text: '`https://tastebuds.example/x`', fact: { row: 'GET https://tastebuds.example/x 200' } }
      ],
      answer: ['hours', 'reviews'],
      rule: 'connect-src (or default-src without it) is matched like script-src: \'self\' is the page\'s exact origin (no subdomain, no other port), a host is that host.'
    }]
  },
  sandbox: {
    page: '/',
    open: 'app.js',
    web: shopServer({ security: { hosts: [{ origin: TASTEBUDS, files: { '/api/reviews': { type: 'application/json; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' } } }, { origin: STATS, files: { '/hit': { type: 'image/gif', body: 'GIF89a' } } }, { origin: 'https://cornerbakery.shop:8443', files: { '/hit': { type: 'image/gif', body: 'GIF89a' } } }, { origin: 'https://tastebuds.example', files: { '/x': { type: 'text/plain', body: 'x' } } }] } }),
    probes: []
  },
  setup: () => ({ files: headersSite({ title: 'Requests', main: note(['<p>The Network panel shows what went out.</p>']) }, { 'app.js': CONNECT_APP, 'server.js': server([`res.set('Content-Security-Policy', "${CONNECT_POLICY}")`], ['app.get(\'/api/hours\', (req, res) => res.json([\'7:00–18:00\']))']) }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the requests that go out', 1)],
  hints: ['default-src covers what connect-src doesn\'t name, but here connect-src is set; then match each address against \'self\' and the one host.'],
  why: 'connect-src decides where the page\'s scripts may send; a refused request never leaves the browser (Network shows it as (blocked:csp)).',
  solution: [{ predict: ['hours', 'reviews'] }]
}

// --- 7.4: two policies (a set of three) -----------------------------------------------------------------------------

const TWO_HEADERS = [
  'res.set(\'Content-Security-Policy\', "script-src \'self\' \'unsafe-inline\'")',
  'res.set(\'Content-Security-Policy-Report-Only\', "script-src \'self\'")'
]
const META = '<meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'nonce-r4nd0m\'">'
const runsOrNot = (name: string, kind: 'script' | 'event handler') => [
  { id: 'runs', text: `${name} runs.`, fact: { says: `${name} ran` } },
  { id: 'refused', text: `${name} is refused.`, ...(kind === 'event handler' || name === 'A' ? { fact: { says: `Executing inline ${kind} violates the following Content Security Policy directive 'script-src 'self' 'nonce-r4nd0m''` } } : {}) }
]

export const twoPolicies: WebPracticeTask = {
  id: 'web-practice-two-policies',
  track: 'web',
  kind: 'practice',
  practises: 'web-34-only-watched',
  title: 'Two policies, one page',
  difficulty: 2,
  minutes: 2,
  task: `The page is sent with \`Content-Security-Policy: script-src 'self' 'unsafe-inline'\` and \`Content-Security-Policy-Report-Only: script-src 'self'\`, and its head has \`${META}\`. For each inline script, say whether it runs.`,
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: 'A: `<script>console.log(\'A ran\')</script>`, no nonce.', options: runsOrNot('A', 'script'), answer: 'refused', rule: 'Every enforced policy must allow it: the header\'s \'unsafe-inline\' would, but the meta tag\'s policy has no \'unsafe-inline\' and A has no nonce.' },
      { id: 'b', form: 'one', prompt: 'B: `<script nonce="r4nd0m">console.log(\'B ran\')</script>`.', options: runsOrNot('B', 'script'), answer: 'runs', rule: 'B passes both enforced policies (the header\'s \'unsafe-inline\', the meta tag\'s nonce); the report-only policy only writes a line.' },
      { id: 'c', form: 'one', prompt: 'C: `<button onclick="console.log(\'C ran\')">`, clicked.', options: runsOrNot('C', 'event handler'), answer: 'refused', rule: 'A nonce never applies to an event handler, so the meta tag\'s policy refuses C whatever the header allows.' }
    ]
  },
  sandbox: {
    page: '/',
    open: 'index.html',
    web: shopServer({ scene: [{ click: '#c' }] }),
    probes: []
  },
  setup: () => ({
    files: headersSite({
      title: 'Two policies',
      head: [META],
      main: note(['<button class="action" id="c" type="button" onclick="console.log(\'C ran\')">C</button>']),
      scripts: ['<script>console.log(\'A ran\')</script>', '<script nonce="r4nd0m">console.log(\'B ran\')</script>']
    }, { 'app.js': '// nothing here\n', 'server.js': server(TWO_HEADERS) }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Each enforced policy (header or meta) must allow a script; a report-only one only reports; nonces count for scripts, never for handlers.'],
  why: 'Policies add up: every enforced one must allow a script, so a second policy can only take away, and a report-only one takes nothing away.',
  solution: [{ predict: 'refused' }, { predict: 'runs' }, { predict: 'refused' }]
}

// --- 7.5: the headers a shop sends (a set of three) -----------------------------------------------------------------

const RESET_SERVER = [
  SHOP_SERVER_HEAD,
  '',
  '// The password reset page: its link carries the customer\'s one-time token (Ben)',
  'app.get(\'/reset\', (req, res) => {',
  '  res.set(\'Referrer-Policy\', \'no-referrer-when-downgrade\')',
  '  res.sendFile(\'index.html\', { root: \'public\' })',
  '})',
  '',
  '// What customers uploaded (a note for a cake order), as they sent it',
  'app.get(\'/uploads/note.txt\', (req, res) => res.type(\'text/plain\').send(\'console.log(\\\'note.txt ran\\\')\'))',
  '// The shop\'s files, with nosniff',
  'app.get(\'/files/card.txt\', (req, res) => {',
  '  res.set(\'X-Content-Type-Options\', \'nosniff\')',
  '  res.type(\'text/plain\').send(\'console.log(\\\'card.txt ran\\\')\')',
  '})',
  '',
  STATIC_FILES,
  ''
].join('\n')

const STATS_EXAMPLE = 'https://stats.example'
const RESET_PAGE = '/reset?token=t0k3n'

export const shopHeaders: WebPracticeTask = {
  id: 'web-practice-shop-headers',
  track: 'web',
  kind: 'practice',
  practises: 'web-35-widget-moved',
  title: 'The headers a shop sends',
  difficulty: 2,
  minutes: 2,
  task: `The password reset page (\`${RESET_PAGE}\`) loads two text files as scripts and counts the visit on ${STATS_EXAMPLE}. Say what each does.`,
  prediction: {
    questions: [
      { id: 'note', form: 'one', prompt: '`<script src="/uploads/note.txt">`: server.js answers it `Content-Type: text/plain`, no `X-Content-Type-Options`.', options: [{ id: 'runs', text: 'It runs.', fact: { says: 'note.txt ran' } }, { id: 'refused', text: 'Chrome refuses to run a text file.', fact: { says: 'Refused to execute script from \'https://cornerbakery.shop/uploads/note.txt\'' } }], answer: 'runs', rule: 'Without nosniff, Chrome runs a script whatever its type says, except images, audio, video and CSV: a customer\'s upload can become a script.' },
      { id: 'card', form: 'one', prompt: '`<script src="/files/card.txt">`: `Content-Type: text/plain` and `X-Content-Type-Options: nosniff`.', options: [{ id: 'runs', text: 'It runs.', fact: { says: 'card.txt ran' } }, { id: 'refused', text: 'Chrome refuses it: with nosniff, only a JavaScript type runs as a script.', fact: { says: 'Refused to execute script from \'https://cornerbakery.shop/files/card.txt\' because its MIME type (\'text/plain\') is not executable, and strict MIME type checking is enabled.' } }], answer: 'refused', rule: 'nosniff makes the browser believe the Content-Type: a text file is never run as a script.' },
      { id: 'referer', form: 'one', prompt: `The page is sent with \`Referrer-Policy: no-referrer-when-downgrade\`. What \`Referer\` does its \`fetch('${STATS_EXAMPLE}/hit')\` carry?`, options: [{ id: 'whole', text: `The whole address, token and all: \`${SHOP}${RESET_PAGE}\``, fact: { referer: `GET ${STATS_EXAMPLE}/hit ${SHOP}${RESET_PAGE}` } }, { id: 'origin', text: `Only the origin: \`${SHOP}/\``, fact: { referer: `GET ${STATS_EXAMPLE}/hit ${SHOP}/` } }, { id: 'none', text: 'None: another site gets no Referer.', fact: { referer: `GET ${STATS_EXAMPLE}/hit none` } }], answer: 'whole', rule: 'no-referrer-when-downgrade sends the whole address to any https site; the default (strict-origin-when-cross-origin) would send only the origin, and no-referrer nothing.' }
    ]
  },
  sandbox: {
    page: RESET_PAGE,
    open: 'server.js',
    web: shopServer({ security: { hosts: [{ origin: STATS_EXAMPLE, files: { '/hit': { type: 'image/gif', body: 'GIF89a' } } }] } }),
    probes: []
  },
  setup: () => ({
    files: headersSite({ title: 'New password', main: note(['<p>Choose a new password.</p>']), scripts: ['<script src="/uploads/note.txt"></script>', '<script src="/files/card.txt"></script>'] }, { 'app.js': `fetch('${STATS_EXAMPLE}/hit', { mode: 'no-cors' })\n`, 'server.js': RESET_SERVER }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['nosniff: believe the Content-Type. Referrer-Policy: what a request to another site learns of the page\'s address.'],
  why: 'X-Content-Type-Options: nosniff keeps text from running as a script, and Referrer-Policy keeps a page\'s address (and its tokens) from other sites.',
  solution: [{ predict: 'runs' }, { predict: 'refused' }, { predict: 'whole' }]
}
