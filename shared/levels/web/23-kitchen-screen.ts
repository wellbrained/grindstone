// The event loop 5.3: the kitchen screen stutters. At 7:00 Maya taps Overnight orders and the night's 40 orders are added
// to the kitchen's list, which keeps the newest in view: after each row Jonas's code reads `list.scrollHeight`. Each read
// comes right after a change, so the browser lays out the page there and then: 40 layouts in one tap (layout thrashing).
// Learn: reading a size or position after changing the page forces a synchronous layout; batch the changes, then read
// once (or read before writing).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { loopSite, loopSpec } from './eventloop'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** addOrder's last lines: the row added, then the list scrolled to its end (a read after the change). */
export const ADD_AND_SCROLL = `  list.append(row)
  list.scrollTop = list.scrollHeight
}`

/** The tap's loop: every order added (the fix scrolls once, after it). */
export const ADD_ALL = '  for (const order of OVERNIGHT) addOrder(order)\n'

export const ORDERS = `// The orders that came in overnight, from the shop's API (kept here for the kitchen screen).
const NAMES = ['Lena', 'Sam', 'Mia', 'Ben', 'Jo']
const ITEMS = ['2 × Butter croissant', '1 × Rye loaf', '3 × Cinnamon bun', '1 × Sourdough loaf', '2 × Apricot danish']

export const OVERNIGHT = Array.from({ length: 40 }, (_, i) => ({
  number: 1001 + i,
  time: \`\${String(Math.floor(i / 4)).padStart(2, '0')}:\${String((i % 4) * 15).padStart(2, '0')}\`,
  name: NAMES[i % 5],
  items: ITEMS[(i * 3) % 5]
}))
`

const APP = `// The kitchen screen (Jonas): at 7:00 Maya taps Overnight orders, and the night's orders are added to the list,
// which keeps the newest one in view.
import { OVERNIGHT } from './orders.js'

const list = document.querySelector('#orders')
const count = document.querySelector('#count')

function addOrder(order) {
  const row = document.createElement('li')
  row.className = 'order'
  row.textContent = \`\${order.time} · #\${order.number} \${order.name} · \${order.items}\`
${ADD_AND_SCROLL}

document.querySelector('#overnight').addEventListener('click', () => {
${ADD_ALL}  count.textContent = \`\${list.children.length} orders\`
  console.log(\`\${OVERNIGHT.length} orders added\`)
})
`

const MAIN = [
  '<section class="box" aria-labelledby="orders-heading">',
  '  <h2 id="orders-heading">Kitchen · today\'s orders</h2>',
  '  <button class="action" id="overnight" type="button">Overnight orders</button>',
  '  <p id="count" class="note" role="status">0 orders</p>',
  '  <ol id="orders" class="orders" aria-label="Orders, newest last"></ol>',
  '</section>'
]

export const ORDERS_STYLE = `
.orders {
  max-height: 260px;
  overflow-y: auto;
  margin: 8px 0 0;
  padding: 0 0 0 2.2rem;
  border: 1px solid #eadfd0;
  border-radius: 8px;
}

.order {
  padding: 6px 4px;
  border-bottom: 1px solid #eadfd0;
  font-size: 13px;
}
`

export const kitchenScreen: WebScenario = {
  id: 'web-23-kitchen-screen',
  track: 'web',
  kind: 'scenario',
  title: 'The kitchen screen stutters',
  difficulty: 2,
  minutes: 6,
  teaches: 'forced layout',
  story: [
    'At 7:00 Maya taps Overnight orders on the kitchen\'s tablet, and the 40 orders from the night are added to the list. Jonas made the list keep the newest order in view. Every morning the tablet hangs before the orders show up, and it gets worse with every order.',
    'Predict how often the browser lays out the page for the 40 orders. Then fix `app.js` so they are added with at most one layout, the newest still in view. Save, then Reload: the Event loop panel shows each forced layout.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'layouts',
      form: 'one',
      prompt: 'The tap adds the 40 orders one by one; after each row, `list.scrollTop = list.scrollHeight` scrolls the list to its end. How often does the browser lay out the page during that tap?',
      options: [
        { id: 'once', text: 'Once, at the next frame: the browser lays out after the task, all changes at once.', fact: { layouts: 1 } },
        { id: 'forty', text: '40 times, in the task itself: each `scrollHeight` read comes right after a row was added, so the browser must lay out the page right there.', fact: { layouts: 40 } },
        { id: 'eighty', text: '80 times: once for each row added and once for each read.', fact: { layouts: 80 } },
        { id: 'none', text: 'Not at all until Maya scrolls: the list is scrolled without a layout.' }
      ],
      answer: 'forty',
      rule: 'Reading a size or position after changing the page forces the browser to lay it out at once; a loop that writes and reads in turn lays it out every time.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([{ selector: '#count', name: 'count', text: true }], [{ click: '#overnight' }]),
    probes: [
      // the whole load: Maya's tap is the page's only work
      { id: 'forced', steps: [{ forced: 'load' }] },
      { id: 'rows', steps: [{ count: '#orders .order' }] },
      { id: 'count', steps: [{ text: '#count' }] },
      // the newest order is in view: a tap on it lands on it
      { id: 'newest', steps: [{ hit: '#orders .order:last-child' }] }
    ]
  },
  setup: () => ({
    files: loopSite({ title: 'Kitchen', main: MAIN }, ORDERS_STYLE, { 'app.js': APP, 'orders.js': ORDERS }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict how often the browser lays out the page', 1),
    probesGoal('smooth', 'The 40 orders show, the newest in view, with at most one forced layout', { forced: { atMost: 1 }, rows: 40, count: '40 orders', newest: 'itself' }, { clean: true })
  ],
  hints: [
    'Open the Event loop panel at Maya\'s tap: the red layout lines say what forced a layout, how often, and from which line.',
    'Adding a row changes the page; reading `scrollHeight` right after needs an up-to-date layout, so the browser does one there and then, 40 times. Add all the rows first, then read once.',
    'Take `list.scrollTop = list.scrollHeight` out of `addOrder` (line 13) and put it once in the tap\'s listener, after the `for` loop on line 17. Save, then Reload.'
  ],
  debrief: {
    title: 'Read after write, 40 times',
    paragraphs: [
      'Changing the page (adding a row, setting a style or a class) only marks the layout as out of date; the browser would work it out once, at the next frame. But `scrollHeight`, `offsetHeight`, `getBoundingClientRect()` and a computed size need the layout now, so a read right after a change makes the browser lay out the page in the middle of your code: a forced (synchronous) layout. In the loop each read came after a new row, so the page was laid out 40 times, each time a little bigger.',
      'Batch the writes, then read: add all the rows (or one DocumentFragment with them all), then scroll once. Reading before writing works too, as long as no write comes in between. Where the read is only for the screen, doing it in a `requestAnimationFrame` callback, once, keeps it next to the frame\'s own layout.',
      'The Performance tab of DevTools marks these as "Forced reflow" with the line that caused it; in Grindstone the Event loop panel lists them as forced layouts.'
    ]
  },
  solution: [
    { predict: 'forty' },
    { save: 'app.js', replace: [ADD_AND_SCROLL, '  list.append(row)\n}'] },
    { save: 'app.js', replace: [ADD_ALL, `${ADD_ALL}  list.scrollTop = list.scrollHeight\n`] },
    'reload'
  ]
}
