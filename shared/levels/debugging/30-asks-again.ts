// Performance 6.5: the order page's two tabs, Menu and Specials, ask the server for their list on every visit: switching
// back and forth asks for the same menu again and again, and the customer waits for it each time. Learn: the Performance
// panel marks a request that repeats an earlier one; keep the answer (a cache per list) and ask once.
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { BackendRoute, DebugScenario } from './types'

export const TAB_ROUTES: BackendRoute[] = [
  {
    path: '/api/menu',
    respond: {
      status: 200,
      delay: 250,
      json: [
        { id: 'croissant', name: 'Butter croissant', price: 2.4 },
        { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
        { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
      ]
    }
  },
  { path: '/api/specials', respond: { status: 200, delay: 200, json: [{ id: 'plum-cake', name: 'Plum cake', price: 3.9 }, { id: 'pumpkin-loaf', name: 'Pumpkin loaf', price: 5.4 }] } }
]

/** The two tab buttons, under the tagline. */
export const TAB_BUTTONS = ['<p class="tabs"><button class="action" id="tab-menu" type="button">Menu</button> <button class="action" id="tab-specials" type="button">Specials</button></p>']

const TABS = `// The order page's two tabs (Jonas): today's menu and the specials, each from the server.
import { formatPrice } from './money.js'

const list = document.querySelector('#products')

function show(items) {
  list.innerHTML = items.map(item => \`<li class="product"><span class="photo" aria-hidden="true"></span><span><span class="name">\${item.name}</span> <span class="price">\${formatPrice(item.price)}</span></span></li>\`).join('')
}

async function showTab(name) {
  const response = await fetch(\`/api/\${name}\`)
  const items = await response.json()
  show(items)
}

document.querySelector('#tab-menu').addEventListener('click', () => showTab('menu'))
document.querySelector('#tab-specials').addEventListener('click', () => showTab('specials'))

showTab('menu')
`

const APP = `// The order page: the menu and the specials, as two tabs.
import './tabs.js'
`

const SPECIALS = '#tab-specials'
const MENU = '#tab-menu'

export const asksAgain: DebugScenario = {
  id: 'debugging-30-asks-again',
  track: 'debugging',
  kind: 'scenario',
  title: 'Every visit to the menu asks the server again',
  difficulty: 2,
  minutes: 6,
  teaches: 'cache',
  story: [
    'Jonas, looking at the server\'s log: “Someone looked at the specials and went back to the menu five times, and every time the page asked me for the whole menu again. The menu changes once a day.”',
    'Press Record in the Performance panel, switch between Menu and Specials a few times, then Stop, and look at the requests. Make each tab ask the server once while the page is open, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'tabs.js',
    performance: true,
    probes: [
      { id: 'menu-requests', steps: [{ click: SPECIALS }, { click: MENU }, { click: SPECIALS }, { click: MENU }, { requests: 'GET /api/menu' }] },
      { id: 'specials-requests', steps: [{ requests: 'GET /api/specials' }] },
      // guards: each tab still shows its own list (one answer kept for both tabs is no fix)
      { id: 'menu', steps: [{ text: '#products .name' }] },
      { id: 'specials', steps: [{ click: SPECIALS }, { text: '#products .name' }] }
    ],
    backend: { routes: TAB_ROUTES }
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'tabs.js': TABS }, { header: TAB_BUTTONS }, ['products.js', 'cart.js']), observed: null, picked: null }),
  goals: [
    probesGoal('asks-once', 'Menu, Specials, Menu, Specials, Menu asks the server once for each list (now 3 times for the menu, twice for the specials), and each tab still shows its own: “Butter croissant” first, “Plum cake” first', { 'menu-requests': 1, 'specials-requests': 1, 'menu': 'Butter croissant', 'specials': 'Plum cake' })
  ],
  hints: [
    'Record, click Specials, Menu, Specials, Menu, then Stop. Under Requests over time, which requests say “the same request again”? Their Sent from is the same line every time.',
    'Each click runs `showTab` (`tabs.js:10`), and line 11 asks the server, whether the page has that list already or not. Nothing keeps the answer.',
    'Keep each answer by its name: add `const answers = {}` above `showTab`, and replace lines 11 and 12 with `answers[name] ??= fetch(\'/api/\' + name).then(response => response.json())` (it asks only when there is no answer yet) and `const items = await answers[name]`. Save, then Reload.'
  ],
  debrief: {
    title: 'Keep what you already asked for',
    paragraphs: [
      'The page threw every answer away: each visit to a tab asked again, and the customer waited for the same menu each time. The Performance panel marks such a request as the same request again, with the line that sent it.',
      'A cache keeps the answer, here one per tab, by its name: `answers[name] ??= …` asks only when there is none yet. Keeping the promise rather than the list also covers a customer who clicks twice before the first answer is in: both get the one request. One cache for both tabs would be quick and wrong (the specials would show the menu).',
      'A cache needs a reason to forget: this one lives as long as the page is open, which suits a menu that changes once a day. Prices that can change every minute, or stock, need an expiry, or a server that says how long an answer stays fresh (`Cache-Control`).'
    ]
  },
  solution: [{
    save: 'tabs.js',
    replace: [
      'async function showTab(name) {\n  const response = await fetch(`/api/${name}`)\n  const items = await response.json()\n',
      'const answers = {}\n\nasync function showTab(name) {\n  answers[name] ??= fetch(`/api/${name}`).then(response => response.json())\n  const items = await answers[name]\n'
    ]
  }, 'reload']
}
