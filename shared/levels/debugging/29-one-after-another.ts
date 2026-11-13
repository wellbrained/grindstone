// Performance 6.4: the order page loads the menu (400 ms), then today's specials (300 ms), then the opening hours
// (200 ms): each request waits for the answer before it, though none needs it. 900 ms where 400 would do. Learn: the
// Performance panel's requests over time show a waterfall (stairs, each sent once the one before had answered); send
// what doesn't depend on each other at once (Promise.all).
import { ORDER_PAGE, orderSite } from './bakery'
import { probesGoal } from './checks'
import type { BackendRoute, DebugScenario } from './types'

/** The page's three requests, each with its own server time. */
export const LOAD_ROUTES: BackendRoute[] = [
  {
    path: '/api/menu',
    respond: {
      status: 200,
      delay: 400,
      json: [
        { id: 'croissant', name: 'Butter croissant', price: 2.4 },
        { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
        { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 }
      ]
    }
  },
  { path: '/api/specials', respond: { status: 200, delay: 300, json: [{ name: 'Plum cake', note: 'with the last plums of the season' }] } },
  { path: '/api/hours', respond: { status: 200, delay: 200, json: { weekdays: '7:00–18:00', saturday: '7:00–13:00' } } }
]

/** The specials box under the menu. */
export const SPECIALS_BOX = [
  '<section class="box" aria-label="Today\'s specials">',
  '  <h2>Today\'s specials</h2>',
  '  <p class="note" id="specials">Loading…</p>',
  '</section>'
]

/** show.js: draws what the server sent (the menu, the specials, the hours). */
export const SHOW = `// Draws what the server sent: the menu, today's specials and the opening hours.
import { formatPrice } from './money.js'

export function showMenu(products) {
  document.querySelector('#products').innerHTML = products.map(product => \`
    <li class="product"><span class="photo" aria-hidden="true"></span>
      <span><span class="name">\${product.name}</span> <span class="price">\${formatPrice(product.price)}</span></span></li>\`).join('')
}

export function showSpecials(specials) {
  document.querySelector('#specials').textContent = specials.map(special => \`\${special.name}, \${special.note}\`).join(' · ')
}

export function showHours(hours) {
  document.querySelector('#hours').textContent = \`Mon–Fri \${hours.weekdays} · Sat \${hours.saturday}\`
}
`

const LOAD = `// Loading the order page (Maya): the menu, today's specials and the opening hours,
// each from the shop's server.
import { showHours, showMenu, showSpecials } from './show.js'

async function getJson(path) {
  const response = await fetch(path)
  return response.json()
}

export async function loadPage() {
  const menu = await getJson('/api/menu')
  const specials = await getJson('/api/specials')
  const hours = await getJson('/api/hours')
  showMenu(menu)
  showSpecials(specials)
  showHours(hours)
}
`

const APP = `// The order page: everything on it comes from the server.
import { loadPage } from './load.js'

loadPage()
`

export const SPECIALS_TEXT = 'Plum cake, with the last plums of the season'
export const HOURS_TEXT = 'Mon–Fri 7:00–18:00 · Sat 7:00–13:00'

export const oneAfterAnother: DebugScenario = {
  id: 'debugging-29-one-after-another',
  track: 'debugging',
  kind: 'scenario',
  title: 'The page loads one thing after another',
  difficulty: 2,
  minutes: 6,
  teaches: 'waterfall',
  story: [
    'Ben: “The order page stays empty for almost a second. The menu alone takes the server 400 ms, but then the page waits for the specials, and then for the opening hours.”',
    'Press Record in the Performance panel (the page loads again), then Stop, and look at the requests over time. Make the page wait only as long as its slowest request, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'load.js',
    performance: true,
    probes: [
      { id: 'waited', steps: [{ waited: 'load' }] },
      // guards: everything still shows
      { id: 'menu', steps: [{ count: '#products .product' }] },
      { id: 'specials', steps: [{ text: '#specials' }] },
      { id: 'hours', steps: [{ text: '#hours' }] },
      // guards: everything still comes from the server (an answer written into the code is no request)
      { id: 'menu-requests', steps: [{ requests: 'GET /api/menu' }] },
      { id: 'specials-requests', steps: [{ requests: 'GET /api/specials' }] },
      { id: 'hours-requests', steps: [{ requests: 'GET /api/hours' }] }
    ],
    backend: { routes: LOAD_ROUTES }
  },
  setup: () => ({ files: orderSite({ 'app.js': APP, 'load.js': LOAD, 'show.js': SHOW }, { header: ['<p class="hours" id="hours"></p>'], main: SPECIALS_BOX }, ['products.js', 'cart.js']), observed: null, picked: null }),
  goals: [
    probesGoal('at-once', `Everything shows after at most 400 ms of server time (now 900 ms): the 3 products, “${SPECIALS_TEXT}” and “${HOURS_TEXT}”, each still asked from the server once`, { 'waited': { atMost: 400 }, 'menu': 3, 'specials': SPECIALS_TEXT, 'hours': HOURS_TEXT, 'menu-requests': 1, 'specials-requests': 1, 'hours-requests': 1 })
  ],
  hints: [
    'Record, then Stop once the page is full. Under Requests over time the three bars are stairs: `specials` is sent once `menu` answered, `hours` once `specials` did. 400 + 300 + 200 ms.',
    'Each `await` on lines 11 to 13 waits for its answer before the next request even goes out, yet none of them needs another\'s answer: they could all be on their way at once.',
    'Send all three, then wait for them together: replace lines 11 to 13 with `const [menu, specials, hours] = await Promise.all([getJson(\'/api/menu\'), getJson(\'/api/specials\'), getJson(\'/api/hours\')])`. Save, then Reload.'
  ],
  debrief: {
    title: 'Ask for everything at once',
    paragraphs: [
      'An `await` before each request makes a waterfall: the specials were only asked for once the menu had arrived, the hours once the specials had. The page waited 400 + 300 + 200 ms, though the server could have worked on all three at the same time.',
      '`Promise.all` starts every request first and then waits for all of them: the page is ready when the slowest answer is in, 400 ms. Starting each request into a variable first (`const menuRequest = getJson(…)`) and awaiting them afterwards does the same, and so does drawing each part as its answer arrives.',
      'Waiting in turn is right when a request needs the answer before it (the order number for the receipt). The Performance panel shows the times on the server\'s clock, the scripted delays, so they are the same on every run; on a real network the stairs only get steeper.'
    ]
  },
  solution: [{
    save: 'load.js',
    replace: [
      '  const menu = await getJson(\'/api/menu\')\n  const specials = await getJson(\'/api/specials\')\n  const hours = await getJson(\'/api/hours\')\n',
      '  const [menu, specials, hours] = await Promise.all([getJson(\'/api/menu\'), getJson(\'/api/specials\'), getJson(\'/api/hours\')])\n'
    ]
  }, 'reload']
}
