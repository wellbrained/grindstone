// Same-origin & CORS practice tasks (ADR 0009: prediction only, one question or a set of three, about 30 s each). Each
// has a small app whose run shows the answer (the Network, Server and Console panels) once it is given; the files are
// read-only, nothing to fix. A practice task follows its scenario in the chapter's list (index.ts).
import { predictedGoal } from '../checks'
import { API, API_SERVER, HOURS_ROUTE, SERVER_HEAD, SHOP_PAGE, webSite } from '../site'
import type { PickOneQuestion, WebPracticeTask } from '../types'

const LIST = (label: string) => [`<ul id="results" class="list" aria-label="${label}"></ul>`]

// --- 1.1: the order of the Console's lines ---------------------------------------------------------------------------

const SPECIALS_APP = `// The specials box: asks the API for today's specials (Jonas).
const API = '${API}'

console.log('Asking for the specials…')
fetch(\`\${API}/specials\`)
  .then(response => response.json())
  .then(specials => console.log(\`\${specials.length} specials\`))
  .catch(error => console.log('No specials:', error.message))
console.log('Page ready')
`

const SPECIALS_SERVER = `${SERVER_HEAD}

// GET /specials: today's specials (no CORS headers yet)
app.get('/specials', (req, res) => {
  res.json([{ name: 'Apricot danish', price: 3.2 }])
})
`

export const consoleOrder: WebPracticeTask = {
  id: 'web-practice-console-order',
  track: 'web',
  kind: 'practice',
  practises: 'web-01-menu-blocked',
  title: 'Which line comes first?',
  difficulty: 1,
  minutes: 0.5,
  task: 'The page logs a line before it asks the API for the specials, and one after. The server sends no CORS headers. Put the four Console lines in the order they appear.',
  prediction: {
    questions: [{
      id: 'order',
      form: 'order',
      prompt: 'Put these Console lines in the order they appear.',
      options: [
        { id: 'blocked', text: '`Access to fetch at \'https://api.cornerbakery.shop/specials\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: …`', fact: { says: 'Access to fetch at \'https://api.cornerbakery.shop/specials\'' } },
        { id: 'ready', text: '`Page ready`', fact: { says: 'Page ready' } },
        { id: 'none', text: '`No specials: Failed to fetch`', fact: { says: 'No specials: Failed to fetch' } },
        { id: 'asking', text: '`Asking for the specials…`', fact: { says: 'Asking for the specials…' } }
      ],
      answer: ['asking', 'ready', 'blocked', 'none'],
      rule: '`fetch` never stops the code that called it: the browser\'s CORS line and your `catch` come once the answer is back, after the page\'s own lines.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'app.js', web: API_SERVER, probes: [] },
  setup: () => ({ files: webSite({ main: LIST('Specials') }, { 'app.js': SPECIALS_APP, 'server.js': SPECIALS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Put the four lines in order', 1)],
  hints: ['Which lines run before the request has an answer? The browser checks CORS only once the server\'s answer is back.'],
  why: 'The request takes a round trip; the CORS check happens when the answer arrives, so both synchronous lines come first, then the browser\'s refusal, then the rejection reaches your catch.',
  solution: [{ predict: ['asking', 'ready', 'blocked', 'none'] }]
}

// --- 1.1: same origin or not (a set of three) -------------------------------------------------------------------------

const HOURS_APP = `// Opening hours, from three addresses Ben tried while moving the shop's servers.
const addresses = [
  'https://cornerbakery.shop:443/api/hours',
  'https://www.cornerbakery.shop/api/hours',
  'https://cornerbakery.shop:8443/api/hours'
]

for (const address of addresses) {
  fetch(address)
    .then(response => response.json())
    .then(hours => console.log(\`\${address}: open \${hours.weekdays}\`))
    .catch(error => console.log(\`\${address}: \${error.message}\`))
}
`

const SAME = 'Same origin: the page reads the answer, no CORS check.'
const OTHER = 'Another origin: the browser checks CORS, and the shop\'s server sends no CORS headers.'

function originQuestion(id: string, address: string, row: string, same: boolean, rule: string): PickOneQuestion {
  return {
    id,
    form: 'one',
    prompt: `The page is on \`https://cornerbakery.shop\`. It fetches \`${address}\`.`,
    options: [
      { id: 'same', text: SAME, fact: { row: `GET ${row} 200` } },
      { id: 'other', text: OTHER, fact: { row: `GET ${row} CORS error` } }
    ],
    answer: same ? 'same' : 'other',
    rule
  }
}

export const sameOrigin: WebPracticeTask = {
  id: 'web-practice-same-origin',
  track: 'web',
  kind: 'practice',
  practises: 'web-01-menu-blocked',
  title: 'Same origin or not?',
  difficulty: 2,
  minutes: 1,
  task: 'The shop\'s own server answers on three addresses. For each, say whether the browser treats it as the page\'s own origin.',
  prediction: {
    questions: [
      originQuestion('port-443', 'https://cornerbakery.shop:443/api/hours', '/api/hours', true, '443 is the default port of https, so scheme, host and port all match: the page\'s own origin.'),
      originQuestion('www', 'https://www.cornerbakery.shop/api/hours', 'https://www.cornerbakery.shop/api/hours', false, '`www.cornerbakery.shop` is another host, so another origin, even when the same server answers it.'),
      originQuestion('port-8443', 'https://cornerbakery.shop:8443/api/hours', 'https://cornerbakery.shop:8443/api/hours', false, 'Another port is another origin: scheme, host and port all count.')
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: { api: API, shop: { routes: [HOURS_ROUTE], alsoOn: ['https://www.cornerbakery.shop', 'https://cornerbakery.shop:8443'] } },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Hours', main: LIST('Opening hours') }, { 'app.js': HOURS_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['An origin is the scheme, the host and the port, compared exactly. What is the port of `https://cornerbakery.shop` when none is written?'],
  why: 'Two addresses share an origin only when scheme, host and port are the same; a written default port (443 for https) is the same port.',
  solution: [{ predict: 'same' }, { predict: 'other' }, { predict: 'other' }]
}

// --- 1.2: simple or preflighted (a set of three) ----------------------------------------------------------------------

const THREE_APP = `// Three requests from the shop's page: Jonas wants to know which ones ask first.
const API = '${API}'

// 1. the newsletter form
fetch(\`\${API}/newsletter\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'email=lena%40example.com'
})

// 2. the menu, with the kitchen app's token
fetch(\`\${API}/menu\`, { headers: { Authorization: 'Bearer 7f3a' } })

// 3. an order, as JSON text
fetch(\`\${API}/orders\`, {
  method: 'POST',
  body: JSON.stringify({ items: [{ id: 'rye', quantity: 1 }] })
})
`

const THREE_SERVER = `${SERVER_HEAD}

// Every page may read these answers, and every preflight is answered (Ben's test server)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.sendStatus(204)
  }
  next()
})

app.post('/newsletter', (req, res) => res.status(201).json({ subscribed: true }))
app.get('/menu', (req, res) => res.json([{ id: 'rye', name: 'Rye loaf', price: 5 }]))
app.post('/orders', (req, res) => {
  if (!req.body?.items) return res.status(400).json({ error: 'Send the order as JSON' })
  res.status(201).json({ number: 1042 })
})
`

function simpleQuestion(id: string, request: string, path: string, preflighted: boolean, rule: string): PickOneQuestion {
  return {
    id,
    form: 'one',
    prompt: request,
    options: [
      { id: 'simple', text: 'Simple: it goes straight out.' },
      { id: 'preflight', text: 'Preflighted: an `OPTIONS` request goes first.', fact: { row: `OPTIONS ${API}${path} 204` } }
    ],
    answer: preflighted ? 'preflight' : 'simple',
    rule
  }
}

export const simpleOrPreflight: WebPracticeTask = {
  id: 'web-practice-simple-or-preflight',
  track: 'web',
  kind: 'practice',
  practises: 'web-02-order-preflight',
  title: 'Simple or preflighted?',
  difficulty: 2,
  minutes: 1,
  task: 'The page sends three requests to the API (`app.js` shows them). For each, say whether the browser asks first.',
  prediction: {
    questions: [
      simpleQuestion('newsletter', 'Request 1: a `POST` to `/newsletter` with `Content-Type: application/x-www-form-urlencoded`.', '/newsletter', false, 'A `POST` with a form\'s content type is a simple request, the kind a plain HTML form could always send.'),
      simpleQuestion('token', 'Request 2: a `GET` of `/menu` with an `Authorization` header.', '/menu', true, 'Any header beyond the few safelisted ones, `Authorization` among them, makes the request ask first.'),
      simpleQuestion('json-text', 'Request 3: a `POST` to `/orders` whose body is `JSON.stringify(…)`, with no headers set.', '/orders', false, 'A string body without a `Content-Type` of its own goes as `text/plain`, which is safelisted: no preflight (and the server\'s `express.json()` doesn\'t read it).')
    ]
  },
  sandbox: { page: SHOP_PAGE, open: 'app.js', web: API_SERVER, probes: [] },
  setup: () => ({ files: webSite({ main: LIST('Requests') }, { 'app.js': THREE_APP, 'server.js': THREE_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A request asks first when its method isn\'t `GET`, `HEAD` or `POST`, or when it sets a header (or a `Content-Type`) a plain form couldn\'t. What `Content-Type` does a string body get?'],
  why: 'Simple means "a form could have sent it": a simple method, safelisted headers, and a form\'s content type; a string body without one is text/plain, so request 3 never asks.',
  solution: [{ predict: 'simple' }, { predict: 'preflight' }, { predict: 'simple' }]
}

// --- 1.3: which answers the page may read -----------------------------------------------------------------------------

const ANSWERS_APP = `// Four of Lena's things, each from its own route, all with her cookie (Jonas is trying CORS headers out).
const API = '${API}'

for (const path of ['/stamps', '/favourites', '/address', '/last-order']) {
  fetch(\`\${API}\${path}\`, { credentials: 'include' })
    .then(response => response.json())
    .then(() => console.log(\`\${path}: read\`))
    .catch(error => console.log(\`\${path}: \${error.message}\`))
}
`

const ANSWERS_SERVER = `${SERVER_HEAD}

app.get('/stamps', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true' })
  res.json({ stamps: 7 })
})

app.get('/favourites', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': SHOP, 'Access-Control-Allow-Credentials': 'true' })
  res.json(['Rye loaf'])
})

app.get('/address', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': SHOP })
  res.json({ street: 'Mill Lane 4' })
})

app.get('/last-order', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': SHOP + '/', 'Access-Control-Allow-Credentials': 'true' })
  res.json({ number: 1041 })
})
`

export const readableAnswers: WebPracticeTask = {
  id: 'web-practice-readable-answers',
  track: 'web',
  kind: 'practice',
  practises: 'web-03-basket-credentials',
  title: 'Which answers can the page read?',
  difficulty: 2,
  minutes: 1,
  task: 'The page asks four routes for Lena\'s things, each with `credentials: \'include\'`. Each route answers `200` with other CORS headers. Pick the answers the page may read.',
  prediction: {
    questions: [{
      id: 'readable',
      form: 'lines',
      prompt: 'Which of these answers may the page on `https://cornerbakery.shop` read? Pick every one.',
      options: [
        { id: 'stamps', text: '`/stamps`: `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`', fact: { row: `GET ${API}/stamps 200` } },
        { id: 'favourites', text: '`/favourites`: `Access-Control-Allow-Origin: https://cornerbakery.shop` and `Access-Control-Allow-Credentials: true`', fact: { row: `GET ${API}/favourites 200` } },
        { id: 'address', text: '`/address`: `Access-Control-Allow-Origin: https://cornerbakery.shop`, no `Access-Control-Allow-Credentials`', fact: { row: `GET ${API}/address 200` } },
        { id: 'last-order', text: '`/last-order`: `Access-Control-Allow-Origin: https://cornerbakery.shop/` and `Access-Control-Allow-Credentials: true`', fact: { row: `GET ${API}/last-order 200` } }
      ],
      answer: ['favourites'],
      rule: 'With credentials the answer needs the page\'s exact origin (no `*`, no slash at the end) and `Access-Control-Allow-Credentials: true`.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'server.js', web: API_SERVER, probes: [] },
  setup: () => ({ files: webSite({ main: LIST('Lena\'s things') }, { 'app.js': ANSWERS_APP, 'server.js': ANSWERS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the readable answers', 1)],
  hints: ['With credentials, two things must hold together: the origin, exactly as the browser sends it in `Origin`, and `true` in Allow-Credentials.'],
  why: 'An origin has no path, so `https://cornerbakery.shop/` is not it; `*` never counts with credentials; and without Allow-Credentials the browser drops a credentialed answer.',
  solution: [{ predict: ['favourites'] }]
}

// --- 1.4: which headers ask first ------------------------------------------------------------------------------------

const HEADERS_APP = `// The kitchen tablet's menu request, with every header it sets (Ben).
const API = '${API}'

fetch(\`\${API}/menu\`, {
  headers: {
    'Accept': 'application/json',
    'Content-Language': 'en',
    'X-Basket-Id': 'laptop-1',
    'Authorization': 'Bearer 7f3a',
    'Content-Type': 'text/plain'
  }
}).then(response => console.log('Menu:', response.status))
`

const HEADERS_SERVER = `${SERVER_HEAD}

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Headers', req.get('Access-Control-Request-Headers') ?? '')
    return res.sendStatus(204)
  }
  next()
})

app.get('/menu', (req, res) => res.json([{ id: 'rye', name: 'Rye loaf', price: 5 }]))
`

export const whichHeaders: WebPracticeTask = {
  id: 'web-practice-which-headers',
  track: 'web',
  kind: 'practice',
  practises: 'web-04-basket-header',
  title: 'Which headers ask first?',
  difficulty: 2,
  minutes: 0.5,
  task: 'The page sends one `GET` to the API with five headers of its own. Pick the headers its preflight asks about.',
  prediction: {
    questions: [{
      id: 'asked',
      form: 'lines',
      prompt: 'Which of these headers does the preflight name in `Access-Control-Request-Headers`? Pick every one.',
      options: [
        { id: 'accept', text: '`Accept: application/json`', fact: { asks: 'accept' } },
        { id: 'language', text: '`Content-Language: en`', fact: { asks: 'content-language' } },
        { id: 'basket', text: '`X-Basket-Id: laptop-1`', fact: { asks: 'x-basket-id' } },
        { id: 'authorization', text: '`Authorization: Bearer 7f3a`', fact: { asks: 'authorization' } },
        { id: 'type', text: '`Content-Type: text/plain`', fact: { asks: 'content-type' } }
      ],
      answer: ['basket', 'authorization'],
      rule: 'Only `Accept`, `Accept-Language`, `Content-Language` and a form\'s `Content-Type` go without asking; every other header the page sets is named in the preflight.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'app.js', web: API_SERVER, probes: [] },
  setup: () => ({ files: webSite({ main: LIST('Requests') }, { 'app.js': HEADERS_APP, 'server.js': HEADERS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the headers the preflight asks about', 1)],
  hints: ['Four headers are safelisted (with simple values): Accept, Accept-Language, Content-Language and Content-Type with a form\'s type. Is `text/plain` one of those types?'],
  why: 'A safelisted header with a simple value needs no permission; X-Basket-Id and Authorization are the page\'s own, so the preflight asks for "authorization,x-basket-id".',
  solution: [{ predict: ['basket', 'authorization'] }]
}

// --- 1.5: which methods ask first ------------------------------------------------------------------------------------

const METHODS_APP = `// One request per method to the API's test route (Jonas checks what the browser does).
const API = '${API}'

for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
  fetch(\`\${API}/try/\${method.toLowerCase()}\`, { method })
}
`

const METHODS_SERVER = `${SERVER_HEAD}

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', SHOP)
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE')
    return res.sendStatus(204)
  }
  next()
})

app.all('/try/:method', (req, res) => res.json({ method: req.method }))
`

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']

export const whichMethods: WebPracticeTask = {
  id: 'web-practice-which-methods',
  track: 'web',
  kind: 'practice',
  practises: 'web-05-works-with-curl',
  title: 'Which methods ask first?',
  difficulty: 1,
  minutes: 0.5,
  task: 'The page sends one request with each method to the API, with no headers of its own. Pick the methods the browser sends a preflight for.',
  prediction: {
    questions: [{
      id: 'methods',
      form: 'lines',
      prompt: 'For which methods does the browser ask first with `OPTIONS`? Pick every one.',
      options: METHODS.map(method => ({ id: method.toLowerCase(), text: `\`${method}\``, fact: { row: `OPTIONS ${API}/try/${method.toLowerCase()} 204` } })),
      answer: ['put', 'patch', 'delete'],
      rule: '`GET`, `HEAD` and `POST` are the simple methods; every other one asks first, and needs `Access-Control-Allow-Methods`.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'app.js', web: API_SERVER, probes: [] },
  setup: () => ({ files: webSite({ main: LIST('Requests') }, { 'app.js': METHODS_APP, 'server.js': METHODS_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the methods that ask first', 1)],
  hints: ['Three methods are simple, the ones a plain HTML page could always send (a link, an image, a form).'],
  why: 'A page could always send GET, HEAD and POST without any script, so servers expect them; PUT, PATCH and DELETE need the server\'s yes first.',
  solution: [{ predict: ['put', 'patch', 'delete'] }]
}
