// HTTP caching practice tasks (ADR 0009: prediction only, one question or a set of three, about 30 s each). Each has a
// small app whose run shows the answer (the Network panel's rows, server.js's access lines, the Application panel's
// Cache and the CDN's log) once it is given; the files are read-only, nothing to fix. A practice task follows its
// scenario in the chapter's list (index.ts).
import { CACHE_HEAD, MENU_CORS } from '../caching'
import { predictedGoal } from '../checks'
import { API, SHOP, SHOP_PAGE, webSite } from '../site'
import type { PickOneQuestion, WebPracticeTask } from '../types'

const LIST = (label: string) => [`<ul id="results" class="list" aria-label="${label}"></ul>`]
const BOXES = ['<button class="action" id="again" type="button">Show again</button>', ...LIST('What the API answered')]

// --- 4.1: ask, or not (a set of three) --------------------------------------------------------------------------------

const BOXES_APP = `// Opening hours, today's specials and what's in stock: three boxes from the API, and a button to show them again (Maya).
const API = '${API}'

async function show(path) {
  const response = await fetch(\`\${API}/\${path}\`)
  const lines = await response.json()
  console.log(\`\${path}: \${lines.join(' · ')}\`)
}

const showAll = () => Promise.all(['hours', 'specials', 'stock'].map(show))
document.querySelector('#again').addEventListener('click', showAll)
showAll()
`

const BOXES_SERVER = `${CACHE_HEAD}

${MENU_CORS}

app.get('/hours', (req, res) => {
  res.set('Cache-Control', 'max-age=600')
  res.json(['Weekdays 7:00–18:00', 'Saturday 7:00–13:00'])
})

app.get('/specials', (req, res) => {
  res.set('Cache-Control', 'max-age=60')
  res.json(['Apricot danish', 'Cinnamon bun'])
})

app.get('/stock', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(['Rye loaf: 4 left'])
})
`

const COPY = 'The browser answers from its copy: no request goes out.'
const CHECK = 'The browser asks with the copy\'s ETag, and server.js answers `304 Not Modified`.'
const WHOLE = 'The browser asks without a condition, and server.js sends the whole answer again.'

function askQuestion(id: string, control: string, answer: 'copy' | 'check' | 'whole', rule: string): PickOneQuestion {
  return {
    id,
    form: 'one',
    prompt: `At 09:41 the page got \`GET /${id}\` with \`Cache-Control: ${control}\` (and Express's ETag). At 09:46 it fetches \`/${id}\` again.`,
    options: [
      { id: 'copy', text: COPY, fact: { row: `GET ${API}/${id} 200 (disk cache)` } },
      { id: 'check', text: CHECK, fact: { server: `GET /${id} 304` } },
      { id: 'whole', text: WHOLE, fact: { server: `GET /${id} 200`, times: 2 } }
    ],
    answer,
    rule
  }
}

export const askOrNot: WebPracticeTask = {
  id: 'web-practice-ask-or-not',
  track: 'web',
  kind: 'practice',
  practises: 'web-16-old-price',
  title: 'Ask, or not?',
  difficulty: 1,
  minutes: 1,
  task: 'The page shows three boxes from the API, each with its own Cache-Control, and shows them again five minutes later. For each, say what the second request does.',
  prediction: {
    questions: [
      askQuestion('hours', 'max-age=600', 'copy', 'Five minutes is within ten: the copy is fresh, so the browser answers itself.'),
      askQuestion('specials', 'max-age=60', 'check', 'After a minute the copy is stale; it has an ETag, so the browser asks whether it changed, and an unchanged answer is a 304.'),
      askQuestion('stock', 'no-store', 'whole', '`no-store` keeps no copy, so there is nothing to ask about: the whole answer comes again.')
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'server.js',
    web: { api: API, server: 'server.js', application: true, time: true, cache: {}, scene: [{ later: 5 }, { click: '#again' }] },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Today', main: BOXES }, { 'app.js': BOXES_APP, 'server.js': BOXES_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A copy is fresh until it is as old as its max-age; after that the browser asks, with the ETag if the copy has one. `no-store` leaves no copy.'],
  why: 'max-age says how long the browser may answer itself; past it, a validator (the ETag) lets it ask cheaply; no-store means there is nothing to answer or ask with.',
  solution: [{ predict: 'copy' }, { predict: 'check' }, { predict: 'whole' }]
}

// --- 4.2: the page asks itself ---------------------------------------------------------------------------------------

/** The specials' ETag as Express makes it (the unit tests check it against the runtime's). */
export const SPECIALS_ETAG = 'W/"4b-m/ALGh2/yKrNx2bLKARssrMfl7g"'

const OWN_CONDITION_APP = `// The specials box: it remembers the specials' ETag from the last visit and asks only for what changed (Jonas).
const API = '${API}'
const saved = '${SPECIALS_ETAG}'

const response = await fetch(\`\${API}/specials\`, { headers: { 'If-None-Match': saved } })
console.log(\`Status \${response.status}\`)
try {
  const specials = await response.json()
  console.log(\`\${specials.length} specials\`)
} catch (error) {
  console.log(\`No specials: \${error.name}\`)
}
`

const OWN_CONDITION_SERVER = `${CACHE_HEAD}

// The shop's page may read our answers and send If-None-Match (Jonas)
app.use((req, res, next) => {
  if (req.get('Origin') === SHOP) res.set('Access-Control-Allow-Origin', SHOP)
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Headers', 'If-None-Match')
    return res.sendStatus(204)
  }
  next()
})

app.get('/specials', (req, res) => {
  res.set('Cache-Control', 'no-cache')
  res.json([{ name: 'Apricot danish', price: 3.2 }, { name: 'Cinnamon bun', price: 3.4 }])
})
`

export const ownCondition: WebPracticeTask = {
  id: 'web-practice-own-condition',
  track: 'web',
  kind: 'practice',
  practises: 'web-17-whole-menu',
  title: 'The page asks itself',
  difficulty: 2,
  minutes: 0.5,
  task: 'Jonas\'s page sends `If-None-Match` itself, with the ETag the specials still have. Say what `fetch` hands the page.',
  prediction: {
    questions: [{
      id: 'own',
      form: 'one',
      prompt: 'The page fetches `/specials` with `headers: { \'If-None-Match\': saved }`, and `saved` is the ETag the specials still have. server.js answers with `Cache-Control: no-cache`. What does `fetch` resolve with?',
      options: [
        { id: 'copy', text: 'A `200` with the specials: the browser fills in the body from its cache.', fact: { says: 'Status 200' } },
        { id: 'bare', text: 'The `304` itself, without a body: a request with its own condition goes past the browser\'s cache, so `response.json()` fails.', fact: { says: 'Status 304' } },
        { id: 'blocked', text: 'A CORS error: a page may not send If-None-Match to another origin.', fact: { row: `GET ${API}/specials CORS error` } }
      ],
      answer: 'bare',
      rule: 'A request that carries its own condition skips the browser\'s cache (Fetch makes it no-store), so the page gets the 304 itself and has to keep the body on its own.'
    }]
  },
  sandbox: { page: SHOP_PAGE, open: 'app.js', web: { api: API, server: 'server.js', application: true, time: true, cache: {} }, probes: [] },
  setup: () => ({ files: webSite({ title: 'Specials', main: LIST('Specials') }, { 'app.js': OWN_CONDITION_APP, 'server.js': OWN_CONDITION_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Say what fetch hands the page', 1)],
  hints: ['Who sent the condition: the browser\'s cache, or the page? A cache revalidating its own copy turns the 304 into its copy; a page that asks itself gets what server.js sent.'],
  why: 'Fetch treats a request with If-None-Match (or another condition) as no-store: the cache stays out of it, the 304 reaches the page as it is, and there is no body to read. Leave revalidation to the browser (`no-cache` on the server, or `cache: \'no-cache\'`). If-None-Match is no CORS-safelisted header either, so it costs a preflight.',
  solution: [{ predict: 'bare' }]
}

// --- 4.3: which answers may the CDN keep (pick lines) -----------------------------------------------------------------

const ROUTES: [path: string, control: string][] = [
  ['news', 'public, max-age=60'],
  ['basket', 'private, max-age=60'],
  ['prices', 'no-cache'],
  ['offers', 's-maxage=60, max-age=0'],
  ['receipt', 'no-store']
]

const FIVE_APP = `// Five boxes from the API, through the CDN (Ben).
const API = '${API}'

for (const path of [${ROUTES.map(([path]) => `'${path}'`).join(', ')}]) {
  fetch(\`\${API}/\${path}\`)
    .then(response => response.json())
    .then(lines => console.log(\`\${path}: \${lines.join(' · ')}\`))
}
`

const FIVE_SERVER = `${CACHE_HEAD}

${MENU_CORS}

${ROUTES.map(([path, control]) => `app.get('/${path}', (req, res) => {\n  res.set('Cache-Control', '${control}')\n  res.json(['${path}'])\n})`).join('\n\n')}
`

export const cdnKeeps: WebPracticeTask = {
  id: 'web-practice-cdn-keeps',
  track: 'web',
  kind: 'practice',
  practises: 'web-18-someone-elses-account',
  title: 'Which answers may the CDN keep?',
  difficulty: 2,
  minutes: 1,
  task: 'Lena\'s page asks for five addresses through the CDN; a moment later Sam\'s phone asks for the same five. Pick the answers the CDN keeps, so it answers Sam from its copy.',
  prediction: {
    questions: [{
      id: 'kept',
      form: 'lines',
      prompt: 'Which of these answers does the CDN keep, so that Sam\'s request is answered from its copy (served at once, or checked with server.js first)?',
      options: ROUTES.map(([path, control]) => ({
        id: path,
        text: `\`/${path}\`: \`Cache-Control: ${control}\``,
        fact: { cdn: `Sam GET ${API}/${path} ${path === 'prices' ? 'REVALIDATED' : 'HIT'}` }
      })),
      answer: ['news', 'prices', 'offers'],
      rule: 'A shared cache keeps what is public or has a lifetime for it (`s-maxage` wins there), and also `no-cache` answers, which it checks before every use; never `private` or `no-store`.'
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
      scene: [{ later: 0.25 }, ...ROUTES.map(([path]) => ({ other: 'Sam', request: `GET ${API}/${path}`, like: true }))]
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Today', main: LIST('What the API answered') }, { 'app.js': FIVE_APP, 'server.js': FIVE_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the answers the CDN keeps', 1)],
  hints: ['`private` is for one customer\'s browser only, `no-store` for nobody. `no-cache` doesn\'t mean "don\'t keep". A shared cache reads `s-maxage` before `max-age`.'],
  why: 'public and s-maxage give the CDN a lifetime (s-maxage=60 beats max-age=0 for it); no-cache lets it keep a copy it checks with server.js every time (a 304 keeps it); private and no-store keep it out.',
  solution: [{ predict: ['news', 'prices', 'offers'] }]
}

// --- 4.4: which requests get their own copy (pick lines) -------------------------------------------------------------

const LANGUAGE_APP = `// The specials, in the customer's language (Maya).
const API = '${API}'

const response = await fetch(\`\${API}/specials\`, { headers: { 'Accept-Language': 'en-GB' } })
const specials = await response.json()
console.log(\`Specials: \${specials.join(', ')}\`)
`

const LANGUAGE_SERVER = `${CACHE_HEAD}

${MENU_CORS}

const SPECIALS = { en: ['Apricot danish'], de: ['Aprikosenplunder'] }

// GET /specials: in the customer's language, through the CDN for five minutes (Maya)
app.get('/specials', (req, res) => {
  const language = (req.get('Accept-Language') ?? 'en').startsWith('de') ? 'de' : 'en'
  res.set('Cache-Control', 'public, max-age=300')
  res.vary('Accept-Language')
  res.json(SPECIALS[language])
})
`

/** Jo is the till's app (no browser: no Accept-Language, no Origin). */
const CUSTOMERS: [name: string, language: string | null][] = [['Sam', 'en-GB'], ['Mia', 'de-DE'], ['Jo', null]]

export const ownCopy: WebPracticeTask = {
  id: 'web-practice-own-copy',
  track: 'web',
  kind: 'practice',
  practises: 'web-19-vary-origin',
  title: 'Which requests get their own copy?',
  difficulty: 2,
  minutes: 1,
  task: '`/specials` says `Vary: Accept-Language`. Lena asks first, in `en-GB`; then Sam, Mia and the till\'s app. Pick the requests the CDN has to pass to server.js.',
  prediction: {
    questions: [{
      id: 'miss',
      form: 'lines',
      prompt: '`GET /specials` is answered with `Cache-Control: public, max-age=300` and `Vary: Accept-Language`. One after the other, these customers ask for it. Which requests does the CDN pass to server.js (a MISS)?',
      options: [
        { id: 'lena', text: 'Lena, first, with `Accept-Language: en-GB`', fact: { cdn: `Lena GET ${API}/specials MISS` } },
        { id: 'sam', text: 'Sam, with `Accept-Language: en-GB`', fact: { cdn: `Sam GET ${API}/specials MISS` } },
        { id: 'mia', text: 'Mia, with `Accept-Language: de-DE`', fact: { cdn: `Mia GET ${API}/specials MISS` } },
        { id: 'jo', text: 'Jo\'s app at the till, which sends no Accept-Language at all', fact: { cdn: `Jo GET ${API}/specials MISS` } }
      ],
      answer: ['lena', 'mia', 'jo'],
      rule: 'With Vary a shared cache keeps one copy for each value of the named request header (none is a value too), and answers only a request whose value matches.'
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
      scene: CUSTOMERS.map(([name, language]) => ({ other: name, request: `GET ${API}/specials`, ...(language ? { headers: { 'Accept-Language': language } } : { from: null }) }))
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Specials', main: LIST('Specials') }, { 'app.js': LANGUAGE_APP, 'server.js': LANGUAGE_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the requests that reach server.js', 1)],
  hints: ['The CDN compares the Accept-Language of each request with the one each of its copies was made for. A missing header is a value of its own.'],
  why: 'Vary: Accept-Language makes the header part of the copy\'s key: en-GB again is a HIT, de-DE and no header at all each need a copy of their own. Vary: Origin works the same way for CORS (4.4).',
  solution: [{ predict: ['lena', 'mia', 'jo'] }]
}

// --- 4.5: which fix reaches her today (a set of three) ---------------------------------------------------------------

const YESTERDAY = { 'access-control-allow-origin': SHOP, 'cache-control': 'max-age=86400', 'content-type': 'application/json; charset=utf-8' }

const DEPLOY_APP = `// Three boxes after this morning's deploy, each fixed a different way (Jonas).
const API = '${API}'

async function show(path, options) {
  const response = await fetch(\`\${API}\${path}\`, options)
  const data = await response.json()
  console.log(\`\${path}: \${JSON.stringify(data)}\`)
}

// 1. server.js sends no-cache since the deploy
show('/specials')
// 2. the page asks for a new address
show('/hours?v=2')
// 3. the page asks the browser to check its copy
show('/stock', { cache: 'no-cache' })
`

const DEPLOY_SERVER = `${CACHE_HEAD}

${MENU_CORS}

// Since this morning's deploy (Jonas)
app.get('/specials', (req, res) => {
  res.set('Cache-Control', 'no-cache')
  res.json([{ name: 'Plum cake', price: 3.2 }])
})

app.get('/hours', (req, res) => {
  res.set('Cache-Control', 'max-age=86400')
  res.json({ weekdays: '7:00–19:00', saturday: '7:00–14:00' })
})

app.get('/stock', (req, res) => {
  res.set('Cache-Control', 'max-age=86400')
  res.json([{ name: 'Rye loaf', left: 9 }])
})
`

const OLD = 'Yesterday\'s copy: her browser doesn\'t ask.'
const NEW = 'Today\'s answer, from server.js.'

function deployQuestion(id: string, prompt: string, request: string, answer: 'old' | 'new', rule: string): PickOneQuestion {
  return {
    id,
    form: 'one',
    prompt,
    options: [
      { id: 'old', text: OLD, fact: { row: `GET ${API}${request} 200 (disk cache)` } },
      { id: 'new', text: NEW, fact: { server: `GET ${request} 200` } }
    ],
    answer,
    rule
  }
}

export const reachesToday: WebPracticeTask = {
  id: 'web-practice-reaches-today',
  track: 'web',
  kind: 'practice',
  practises: 'web-20-stale-deploy',
  title: 'Which fix reaches her today?',
  difficulty: 2,
  minutes: 1,
  task: 'Lena\'s browser kept `/specials`, `/hours` and `/stock` yesterday at 18:00, each with `max-age=86400`. This morning\'s deploy fixed each a different way. For each, say what Lena gets at 09:41.',
  prediction: {
    questions: [
      deployQuestion('specials', 'server.js now answers `/specials` with `Cache-Control: no-cache`. The page fetches `/specials` as before.', '/specials', 'old', 'A new header only reaches a browser that asks; a fresh copy is used without asking.'),
      deployQuestion('hours', 'server.js still says `max-age=86400`, but the page now fetches `/hours?v=2`.', '/hours?v=2', 'new', 'Another address has no copy yet, so the browser asks: a new name is how a deploy reaches every browser at once.'),
      deployQuestion('stock', 'server.js still says `max-age=86400`, but the page fetches `/stock` with `cache: \'no-cache\'`.', '/stock', 'new', '`cache: \'no-cache\'` makes the browser check even a fresh copy; its old ETag no longer matches, so the new answer comes.')
    ]
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
        seeds: [
          { into: 'browser', url: `${API}/specials`, headers: { ...YESTERDAY, etag: 'W/"22-2cYYoGlL88c4z37Cl4CkbXSWXhk"' }, body: '[{"name":"Plum cake","price":3.1}]', minutesAgo: 941 },
          { into: 'browser', url: `${API}/hours`, headers: { ...YESTERDAY, etag: 'W/"35-5HtbOUWoy+/AFL+WyJtFuHfxlGg"' }, body: '{"weekdays":"7:00–18:00","saturday":"7:00–13:00"}', minutesAgo: 941 },
          { into: 'browser', url: `${API}/stock`, headers: { ...YESTERDAY, etag: 'W/"1e-coGOOb1lvvKuX4aAwElh4fCfngU"' }, body: '[{"name":"Rye loaf","left":4}]', minutesAgo: 941 }
        ]
      }
    },
    probes: []
  },
  setup: () => ({ files: webSite({ title: 'Today', main: LIST('What the API answered') }, { 'app.js': DEPLOY_APP, 'server.js': DEPLOY_SERVER }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Which of the three changes makes Lena\'s browser send a request at all? Only a request can bring her anything new.'],
  why: 'A copy that is still fresh is used without asking, whatever the server says now; a new address, or a page that asks the browser to revalidate, is what gets through.',
  solution: [{ predict: 'old' }, { predict: 'new' }, { predict: 'new' }]
}
