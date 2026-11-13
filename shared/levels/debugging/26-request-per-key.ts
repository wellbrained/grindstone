// Performance 6.1: search as you type asks the server on every key from the third letter on: seven requests for one
// croissant, each answered, the last one right. Nothing is wrong, it is just a lot (Jonas runs the server). Learn: the
// Performance panel lists a request per key; wait until the customer stops typing (a debounce) or presses Enter.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import { SEARCH_BOX, SEARCH_STYLE } from './17-wrong-results'
import type { BackendRoute, DebugScenario, JsonValue, ProbeStep } from './types'

const product = (id: string, name: string, price: number): JsonValue => ({ id, name, price })
const BUTTER = product('croissant', 'Butter croissant', 2.4)
const ALMOND = product('almond-croissant', 'Almond croissant', 3.1)
const CROQUE = product('croque-monsieur', 'Croque monsieur', 4.8)

/** GET /api/search?q=…: every search takes the server 150 ms (it looks through today's menu and what is sold out). */
export const KEY_SEARCH_ROUTES: BackendRoute[] = [
  { path: '/api/search', query: '^q=(?:croi|crois|croiss|croissa|croissan|croissant)$', respond: { status: 200, json: [BUTTER, ALMOND], delay: 150 } },
  { path: '/api/search', query: '^q=cro$', respond: { status: 200, json: [BUTTER, ALMOND, CROQUE], delay: 150 } },
  { path: '/api/search', query: '^q=rye$', respond: { status: 200, json: [product('rye', 'Rye with seeds', 4.9)], delay: 150 } },
  { path: '/api/search', respond: { status: 200, json: [], delay: 150 } }
]

const SEARCH = `// Search as you type (Maya's idea): from three letters on, every keystroke asks
// the server, which knows today's menu and what is sold out.
import { formatPrice } from './money.js'

const field = document.querySelector('#search')
const heading = document.querySelector('#results-heading')
const list = document.querySelector('#results')

function showResults(words, products) {
  heading.textContent = \`\${products.length} \${products.length === 1 ? 'result' : 'results'} for “\${words}”\`
  list.replaceChildren(...products.map((product) => {
    const item = document.createElement('li')
    item.className = 'result'
    item.textContent = \`\${product.name} · \${formatPrice(product.price)}\`
    return item
  }))
}

async function search() {
  const words = field.value.trim().toLowerCase()
  if (words.length < 3) return
  const response = await fetch(\`/api/search?q=\${encodeURIComponent(words)}\`)
  const products = await response.json()
  showResults(words, products)
}

field.addEventListener('input', search)
`

const APP = `// The order page: for now just the search (the menu comes back under it next week).
import './search.js'
`

export const CROISSANT_HEADING = '2 results for “croissant”'
export const RYE_HEADING = '1 result for “rye”'

/** A customer who types a word letter by letter (80 ms a key, quick), presses Enter, and reads once the page is quiet. */
export const typesWord = (field: string, word: string): ProbeStep[] => [{ keys: field, value: word }, { press: field, key: 'Enter' }, { wait: 700 }, { settle: true }]

export const requestPerKey: DebugScenario = {
  id: 'debugging-26-request-per-key',
  track: 'debugging',
  kind: 'scenario',
  title: 'Typing in the search sends a request per key',
  difficulty: 1,
  minutes: 5,
  teaches: 'debounce',
  story: [
    'Jonas runs the shop\'s server: “The new search works, but it sent me seven requests for one croissant. At lunchtime that is thousands a minute, and every one of them looks through the whole menu.”',
    'Press Record in the Performance panel, type `croissant` into the search, then Stop, and look at the requests. Make one search ask the server once, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'search.js',
    performance: true,
    probes: [
      { id: 'requests', steps: [...typesWord('#search', 'croissant'), { requests: 'GET /api/search' }] },
      { id: 'heading', steps: [{ text: '#results-heading' }] },
      // a guard: a short word still finds its result (searching only from nine letters on is no fix)
      { id: 'rye', steps: [{ type: '#search', value: '' }, ...typesWord('#search', 'rye'), { text: '#results-heading' }] }
    ],
    backend: { routes: KEY_SEARCH_ROUTES }
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'search.js': SEARCH, 'style.css': SEARCH_STYLE }, { main: SEARCH_BOX }, ['products.js', 'cart.js']), observed: null, picked: null }),
  goals: [
    probesGoal('one-request', `Typing “croissant” (and Enter) sends at most 1 search request and shows ${CROISSANT_HEADING}; “rye” still shows ${RYE_HEADING}`, { requests: { atMost: 1 }, heading: CROISSANT_HEADING, rye: RYE_HEADING })
  ],
  hints: [
    'Record, type `croissant`, Stop: under Requests over time the Performance panel lists one `search?q=…` per key from the third letter on, seven for one word, each one sent from `search.js:22`. What calls `search()`, and how often?',
    'Line 27 runs `search()` on every `input` event, which is every key. The customer only wants the results for the word they stopped at.',
    'Wait until they stop typing: replace line 27 with `let timer = null` and `field.addEventListener(\'input\', () => { clearTimeout(timer); timer = setTimeout(search, 300) })` (a debounce). Or search on `change` instead of `input`, which comes when they press Enter. Save, then Reload.'
  ],
  debrief: {
    title: 'Ask once the customer has stopped typing',
    paragraphs: [
      'Every key was an `input` event, and every `input` event a request: seven for “croissant”, of which only the last answer was ever wanted. Nothing failed, so only counting shows it, and the Performance panel counts: a request per action, each with its own bar on the server\'s clock.',
      'A debounce waits: each key cancels the timer of the key before (`clearTimeout`) and starts a new one, so the search runs once the customer pauses longer than the timer, 300 ms here, longer than the time between two keys. Searching on `change` (Enter, or leaving the field) is the other way: the customer says when.',
      'A debounce only sends fewer requests. Answers can still come back in the wrong order when someone pauses mid-word, which is the race from chapter 4: an `AbortController` or a check of the words handles that.'
    ]
  },
  solution: [
    { save: 'search.js', replace: ['field.addEventListener(\'input\', search)\n', 'let timer = null\nfield.addEventListener(\'input\', () => {\n  clearTimeout(timer)\n  timer = setTimeout(search, 300)\n})\n'] },
    'reload'
  ]
}
