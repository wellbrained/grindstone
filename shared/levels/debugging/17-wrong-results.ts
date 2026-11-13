// State & async 4.2: search as you type. "cro" takes the server 1.5 s (short words match more), "croissant" 120 ms, so
// the answer to the older request arrives last and overwrites the newer results: the field says "croissant", the page
// shows the three results for "cro". Learn: answers do not come back in the order they were asked for (the Network
// panel's times show it); ignore an answer that is no longer wanted, or cancel the old request (AbortController).
import { ORDER_PAGE, STYLE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { BackendRoute, DebugScenario, JsonValue } from './types'

const product = (id: string, name: string, price: number): JsonValue => ({ id, name, price })
const BUTTER = product('croissant', 'Butter croissant', 2.4)
const ALMOND = product('almond-croissant', 'Almond croissant', 3.1)
const CROQUE = product('croque-monsieur', 'Croque monsieur', 4.8)

/** GET /api/search?q=…: what the server finds for a word (it ignores the case: the page sends lower case). */
export const SEARCH_ROUTES: BackendRoute[] = [
  // a short word matches more, so the server takes longer to look through everything
  { path: '/api/search', query: '^q=cro$', respond: { status: 200, json: [BUTTER, ALMOND, CROQUE], delay: 1500 } },
  { path: '/api/search', query: '^q=croi', respond: { status: 200, json: [BUTTER, ALMOND], delay: 120 } },
  { path: '/api/search', query: '^q=croq', respond: { status: 200, json: [CROQUE], delay: 120 } },
  { path: '/api/search', query: '^q=(?:but|butter)', respond: { status: 200, json: [BUTTER], delay: 120 } },
  { path: '/api/search', query: '^q=alm', respond: { status: 200, json: [ALMOND], delay: 120 } },
  { path: '/api/search', query: '^q=pai', respond: { status: 200, json: [product('pain-au-chocolat', 'Pain au chocolat', 2.8)], delay: 120 } },
  { path: '/api/search', query: '^q=sou', respond: { status: 200, json: [product('sourdough', 'Sourdough loaf', 6.5)], delay: 120 } },
  { path: '/api/search', query: '^q=rye', respond: { status: 200, json: [product('rye', 'Rye with seeds', 4.9)], delay: 120 } },
  { path: '/api/search', respond: { status: 200, json: [], delay: 120 } }
]

/** The search field and its results, on the order page. */
export const SEARCH_BOX = [
  '<label class="search">Search today\'s menu <input id="search" type="search" autocomplete="off" placeholder="croissant, sourdough …"></label>',
  '<p class="note" id="results-heading" role="status"></p>',
  '<ul id="results" class="list" aria-label="Search results"></ul>'
]

/** The order page's stylesheet with the search field. */
export const SEARCH_STYLE = `${STYLE}
.search {
  display: block;
  margin: 4px 0 8px;
  font-size: 13px;
}

.result {
  border-top: 1px solid #eadfd0;
  padding: 8px 0;
}

.search input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin-top: 4px;
  border: 1px solid #c9b8a3;
  border-radius: 6px;
  padding: 7px 10px;
  font: inherit;
  font-size: 16px;
  color: inherit;
  background: #fff;
}
`

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

export const CROISSANT_RESULTS = '2 results for “croissant”'
export const CRO_RESULTS = '3 results for “cro”'

/** A customer who types "cro", stops for a moment, then types the rest; then the page is read once it is quiet. */
export const TYPES_CROISSANT = [{ type: '#search', value: 'cro' }, { wait: 450 }, { type: '#search', value: 'croissant' }, { wait: 600 }, { settle: true }] as const

export const wrongResults: DebugScenario = {
  id: 'debugging-17-wrong-results',
  track: 'debugging',
  kind: 'scenario',
  title: 'Search shows results for the wrong word',
  difficulty: 2,
  minutes: 7,
  teaches: 'race',
  story: [
    'Maya tried the new search on her phone: “I typed croissant and got a croque monsieur. The field says croissant, the list says cro. Sometimes. Now it works?”',
    'Type `cro` into the search, wait a moment, then type the rest of `croissant`, and watch the Network panel\'s Time column. Make the page show the results for what is in the field, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'search.js',
    probes: [
      { id: 'heading', steps: [...TYPES_CROISSANT, { text: '#results-heading' }] },
      { id: 'results', steps: [{ count: '#results li' }] },
      // a guard: a short word still searches (asking only from four letters on hides the race, it doesn't fix it)
      { id: 'short-word', steps: [{ type: '#search', value: 'cro' }, { wait: 600 }, { settle: true }, { text: '#results-heading' }] }
    ],
    backend: { routes: SEARCH_ROUTES }
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'search.js': SEARCH, 'style.css': SEARCH_STYLE }, { main: SEARCH_BOX }, ['products.js', 'cart.js']), observed: null, picked: null }),
  goals: [
    probesGoal('latest-word', `After “cro”, a pause and “croissant”, the page shows ${CROISSANT_RESULTS}; “cro” alone still shows ${CRO_RESULTS}; nothing red in the Console`, { 'heading': CROISSANT_RESULTS, 'results': 2, 'short-word': CRO_RESULTS }, { clean: true })
  ],
  hints: [
    'In the Network panel, `search?q=cro` takes 1.5 s, `search?q=croissant` a tenth of that. Which answer reaches `showResults` last?',
    'Every keystroke starts its own `search()`, and each one shows whatever comes back, whenever it comes back. The answer for `cro` is no longer wanted once the field says more, but nothing checks that.',
    'In `search.js`, after `const products = await response.json()` (line 23), add `if (words !== field.value.trim().toLowerCase()) return`: an answer for older words is dropped. Save, then Reload.'
  ],
  debrief: {
    title: 'Answers do not wait their turn',
    paragraphs: [
      'Two requests were on their way at once, and the server answered the newer one first: a short word matches more, so `cro` took longer. Each `search()` showed its own answer when it arrived, so the slow, old one came last and won. That is a race: the result depends on which request finishes first, which is why it happened only sometimes.',
      'The fix is to decide what is still wanted when an answer arrives. Comparing the words with the field works; so does a counter (`const ticket = ++latest`, then drop the answer when `ticket !== latest`). Or cancel the old request: an `AbortController` per search, `controller.abort()` before the next one. An aborted `fetch` rejects with an `AbortError` (the Network panel says `canceled`), so catch that and ignore it, or the Console turns red.',
      'Waiting a little before asking (a debounce) sends fewer requests but does not fix the race: a customer who pauses longer than it waits starts two requests again.'
    ]
  },
  solution: [
    { save: 'search.js', replace: ['  const products = await response.json()\n', '  const products = await response.json()\n  if (words !== field.value.trim().toLowerCase()) return\n'] },
    'reload'
  ]
}
