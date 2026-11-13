// Incidents 7.4: most orders come in, some don't, and Jonas can't make it fail. The logs show every failed order is
// one whose note has a quote or a line break: order.js glues the note into the JSON by hand, so a quote ends the string
// early and a line break is not allowed inside one; the server can't read the body (400). Learn: compare the requests
// that fail with those that don't; let JSON.stringify write JSON (never glue strings into JSON, HTML or SQL).
import { orderSite } from './bakery'
import { probesGoal } from './checks'
import { deployHistory, liveFiles } from './deploys'
import { INCIDENT_MENU, INCIDENT_STYLE, THANKS, accessRow, incidentPage, pastLines } from './incident-shop'
import { CART_JS, MENU_JS, ORDER_APP } from './shop-server'
import type { BackendRoute, DebugScenario } from './types'

const ORDER = `// Sends the basket to the kitchen. The server answers with the order number (Ben).
import { cart, clearCart } from './cart.js'

const status = document.querySelector('#order-status')

export async function placeOrder() {
  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
  if (!response.ok) {
    status.textContent = \`Sorry, your order did not go through (reference \${response.headers.get('x-request-id')}). Please try again.\`
    return
  }
  const order = await response.json()
  clearCart()
  status.textContent = \`Thanks! Order \${order.number} is in. Pick it up tomorrow from 7:00.\`
}
`

const BASE = orderSite({ 'app.js': ORDER_APP, 'cart.js': CART_JS, 'menu.js': MENU_JS, 'order.js': ORDER, 'style.css': INCIDENT_STYLE }, incidentPage(false), ['products.js'])

/** Monday's order notes (the hand-built body) and Wednesday's photos (live). */
export const NOTES_DEPLOYS = deployHistory(BASE, [
  {
    id: '6d2e0a1',
    author: 'Jonas',
    at: 'Monday 10:15',
    message: 'Order notes: customers can leave a note for the bakery',
    edits: [
      { path: 'index.html', replace: ['<section class="summary" aria-label="Your order">\n', '<section class="summary" aria-label="Your order">\n      <label class="note" for="note">A note for the bakery (optional)</label>\n      <textarea id="note" rows="2"></textarea>\n'] },
      { path: 'order.js', replace: ['  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))\n', '  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))\n  const note = document.querySelector(\'#note\').value.trim()\n'] },
      { path: 'order.js', replace: ['    body: JSON.stringify({ items })', '    body: \'{"items":\' + JSON.stringify(items) + \',"note":"\' + note + \'"}\''] }
    ]
  },
  {
    id: '9b1c0de',
    author: 'Maya',
    at: 'Wednesday 14:02',
    message: 'Rounder photos for the products',
    edits: [{ path: 'style.css', replace: ['  border-radius: 6px;\n  background: linear-gradient', '  border-radius: 12px;\n  background: linear-gradient'] }]
  }
])

const LIVE = liveFiles(NOTES_DEPLOYS)

/**
 * A body the server can read: items, and a note that is one JSON string: no raw quote or line break, and a backslash
 * only in one of JSON's escapes (`\"`, `\\`, `\n` …), so a stray `\o` is as unreadable as for a real JSON parser.
 */
const READABLE = String.raw`^(?=.*"items":\[)(?=.*"note":"(?:[^"\\\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"[,}])`

const ROUTES: BackendRoute[] = [
  INCIDENT_MENU,
  { method: 'POST', path: '/api/orders', body: READABLE, respond: { status: 201, json: { number: 1042 }, delay: 120, log: [{ level: 'info', message: 'order 1042 created: {body}' }] } },
  { method: 'POST', path: '/api/orders', respond: { status: 400, json: { error: 'Bad Request' }, delay: 20, log: [{ level: 'warn', message: 'the order is not valid JSON: {body}' }] } }
]

const created = (at: string, request: string, number: number, body: string) => [
  [at, 'info', 'POST /api/orders', request, `order ${number} created: ${body}`],
  accessRow(at, 'POST', '/api/orders', request, 201, 'Created', 120)
] as const

const unreadable = (at: string, request: string, body: string) => [
  [at, 'warn', 'POST /api/orders', request, `the order is not valid JSON: ${body}`],
  accessRow(at, 'POST', '/api/orders', request, 400, 'Bad Request', 20)
] as const

export const QUOTED = 'Write "Happy birthday, Oma!" on the cake'
export const TWO_LINES = 'Leave it with\nthe neighbour'
export const BACKSLASH = 'Smiley \\o/ please'

const GOALS = [
  probesGoal('quotes', `A note with quotes reaches the bakery as typed: ${QUOTED} (“${THANKS}”)`, { 'quoted': THANKS, 'quoted-note': QUOTED }),
  probesGoal('two-lines', `So do a note on two lines (“Leave it with” / “the neighbour”) and one with a backslash (\`${BACKSLASH}\`)`, { 'two-lines': THANKS, 'two-lines-note': TWO_LINES, 'backslash': THANKS, 'backslash-note': BACKSLASH })
]

export const someCustomers: DebugScenario = {
  id: 'debugging-34-some-customers',
  track: 'debugging',
  kind: 'scenario',
  title: 'Only some customers',
  difficulty: 2,
  minutes: 7,
  teaches: 'hand-built JSON',
  report: {
    author: 'Anna',
    text: 'Some customers can\'t order, but most can. Mrs Weber tried three times this morning. Jonas ordered on his phone and it worked every time.'
  },
  story: [
    'Most orders come in, some don\'t. Find out in the server\'s logs what the orders that fail have in common.',
    'Then fix it so every customer can order, with their note exactly as they typed it. Fix the code, Save, then Reload.'
  ].join('\n\n'),
  sandbox: {
    page: '/order',
    open: 'order.js',
    probes: [
      { id: 'quoted', steps: [{ type: '#note', value: QUOTED }, { click: '[data-id="croissant"] .add' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'quoted-note', steps: [{ sent: 'POST /api/orders', json: 'note' }] },
      { id: 'two-lines', steps: [{ type: '#note', value: TWO_LINES }, { click: '[data-id="sourdough"] .add' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'two-lines-note', steps: [{ sent: 'POST /api/orders', json: 'note' }] },
      { id: 'backslash', steps: [{ type: '#note', value: BACKSLASH }, { click: '[data-id="pain-au-chocolat"] .add' }, { click: '#order' }, { text: '#order-status' }] },
      { id: 'backslash-note', steps: [{ sent: 'POST /api/orders', json: 'note' }] }
    ],
    backend: { routes: ROUTES },
    logs: {
      now: '14:20:00.000',
      firstRequest: 8810,
      history: pastLines([
        ...created('09:02:11.410', 'req-8701', 1201, '{"items":[{"id":"croissant","quantity":1}],"note":"Ring twice"}'),
        ...unreadable('09:15:40.032', 'req-8708', '{"items":[{"id":"sourdough","quantity":1}],"note":"Write "Happy 80th" on the card"}'),
        ...unreadable('09:16:22.905', 'req-8710', '{"items":[{"id":"sourdough","quantity":1}],"note":"Write "Happy 80th" on the card"}'),
        ...unreadable('09:17:51.118', 'req-8713', '{"items":[{"id":"sourdough","quantity":1}],"note":"Write "Happy 80th" on the card"}'),
        ...created('10:30:05.664', 'req-8740', 1209, '{"items":[{"id":"pain-au-chocolat","quantity":1}],"note":""}'),
        ...unreadable('11:12:48.250', 'req-8752', '{"items":[{"id":"croissant","quantity":1}],"note":"Please leave it at the door\nif nobody opens"}'),
        ...created('12:44:31.006', 'req-8779', 1218, '{"items":[{"id":"croissant","quantity":1}],"note":"Extra crispy please :)"}'),
        ...unreadable('12:51:07.338', 'req-8783', '{"items":[{"id":"pain-au-chocolat","quantity":1}],"note":"Smiley \\o/ for the kids"}'),
        ['13:00:00.000', 'info', '', null, 'server restarted after a settings change'],
        ...unreadable('13:58:19.420', 'req-8801', '{"items":[{"id":"sourdough","quantity":1}],"note":"For "Oma" Weber, thank you"}'),
        ...created('14:05:02.773', 'req-8805', 1224, '{"items":[{"id":"croissant","quantity":2}],"note":"thanks!"}')
      ])
    },
    deploys: NOTES_DEPLOYS
  },
  setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
  goals: GOALS,
  teammates: [{
    id: 'jonas-short-notes',
    author: 'Jonas',
    trigger: { afterCommands: 6 },
    apply: state => state,
    notice: 'Weird, mine all went through. I only ever type short notes like “thanks!”. Do the failed ones in the logs look different from mine?'
  }],
  hints: [
    'Choose Warnings and errors in the Logs panel and put the failed orders next to the ones that went through (filter for `created`). What do the failed notes have that the others don\'t?',
    'Every failed note has a `"`, a line break or a `\\`. `order.js` line 12 glues the note into the JSON by hand, so a quote in it ends the string early, a line break is not allowed inside a JSON string and a backslash starts an escape: the server can\'t read the body and answers `400`.',
    'Let JSON write the JSON: in `order.js`, line 12, `body: JSON.stringify({ items, note })`. Save, then Reload.'
  ],
  debrief: {
    title: 'Only some customers type what breaks it',
    paragraphs: [
      'The failed orders had one thing in common, and the logs showed it once you put them side by side: a quote in the note, a line break or a backslash. Jonas\'s notes were short and plain, so it worked every time for him.',
      'Gluing text into JSON breaks on exactly the characters JSON gives a meaning to: a `"` ends the string, a line break is not allowed in one, a `\\` starts an escape. `JSON.stringify` escapes them all (`\\"`, `\\n`), and the server reads the note exactly as the customer typed it.',
      'The same goes for HTML (`textContent` instead of gluing into `innerHTML`) and SQL (parameters instead of gluing into the query). And test with the input real people type: quotes, line breaks, emoji, long text.'
    ]
  },
  solution: [{ save: 'order.js', replace: ['    body: \'{"items":\' + JSON.stringify(items) + \',"note":"\' + note + \'"}\'', '    body: JSON.stringify({ items, note })'] }, 'reload']
}
