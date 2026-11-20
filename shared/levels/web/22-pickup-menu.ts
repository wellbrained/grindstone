// The event loop 5.2: the pickup menu won't open. Jonas's menu opens after `await loadSlots()` (kept, so it resolves at
// once); Ben's listener on the document closes the menu with any tap elsewhere. Jonas's test calls `toggle.click()` and
// the menu stays open. A customer's real tap runs the microtasks after each listener: the menu opens before the click
// bubbles to the document, whose listener closes it again. `element.click()` from code runs every listener first, so the
// test never saw it. Learn: a user's event gets a microtask checkpoint after each listener, a script's dispatch doesn't;
// the fix is the closing listener knowing which taps are the menu's own (or the toggle stopping the tap).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { loopSite, loopSpec } from './eventloop'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** Ben's listener's first lines: any tap closes an open menu. */
export const CLOSE_ANY = `document.addEventListener('click', () => {
  if (menu.hidden) return`

const SLOTS = `// Today's pickup times: the page asks once, then keeps them (Jonas). Once kept, the promise is already resolved.
const SLOTS = ['7:00', '7:30', '8:00', '8:30']
let kept = null

export function loadSlots() {
  kept ??= Promise.resolve(SLOTS)
  return kept
}
`

const APP = `// The pickup time (Jonas): a menu of today's times opens under the button.
// Jonas's test: toggle.click(), then the menu is open. It passes.
import { loadSlots } from './slots.js'

const toggle = document.querySelector('#pickup')
const menu = document.querySelector('#slots')
const chosen = document.querySelector('#chosen')

toggle.addEventListener('click', async () => {
  const slots = await loadSlots()
  menu.replaceChildren(...slots.map(slotButton))
  menu.hidden = false
  console.log('Menu opened')
})

function slotButton(slot) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'slot'
  button.textContent = slot
  button.addEventListener('click', () => {
    chosen.textContent = \`Pickup at \${slot}\`
    menu.hidden = true
  })
  return button
}

// Close the menu with a tap anywhere else on the page (Ben)
${CLOSE_ANY}
  menu.hidden = true
  console.log('Menu closed')
})
`

const MAIN = [
  '<section class="box" aria-labelledby="pickup-heading">',
  '  <h2 id="pickup-heading">Pickup</h2>',
  '  <p class="note">Your order is ready from 7:00 tomorrow.</p>',
  '  <button class="action" id="pickup" type="button" aria-controls="slots">Pickup time</button>',
  '  <div id="slots" class="slots" role="group" aria-label="Today\'s pickup times" hidden></div>',
  '  <p id="chosen" class="chosen" role="status">No time chosen yet</p>',
  '</section>'
]

export const MENU_STYLE = `
.slots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #eadfd0;
  border-radius: 8px;
  background: #fff;
}

.slots[hidden] {
  display: none;
}

.slot {
  border: 1px solid #c98a4b;
  border-radius: 6px;
  padding: 4px 10px;
  background: #fffaf3;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.chosen {
  margin-top: 10px;
}
`

export const pickupMenu: WebScenario = {
  id: 'web-22-pickup-menu',
  track: 'web',
  kind: 'scenario',
  title: 'The menu that won\'t open',
  difficulty: 2,
  minutes: 7,
  teaches: 'event dispatch',
  story: [
    'Jonas built a menu of pickup times under the Pickup time button; it opens once the times are loaded (`await loadSlots()`, kept after the first time). Ben added a listener on the document that closes the menu when you tap anywhere else. Jonas\'s test calls `toggle.click()` and finds the menu open. On her phone, Lena taps Pickup time and nothing happens.',
    'Predict what Lena\'s tap does. Then fix `app.js` so her tap opens the menu, a time can be picked, and a tap elsewhere still closes it. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'tap',
      form: 'one',
      prompt: 'Jonas\'s test calls `toggle.click()` and the menu stays open. Lena taps Pickup time on her phone. What happens?',
      options: [
        { id: 'opens', text: 'The menu opens, as in the test.', fact: { painted: 'menu' } },
        { id: 'closes', text: 'It opens and closes within her tap: after each listener of a real tap the browser runs the microtasks, so the menu opens before the tap reaches the document\'s listener, which closes it.', fact: { says: 'Menu closed' } },
        { id: 'late', text: 'Nothing at all: the `await` comes too late, the tap is over before the times are there.' },
        { id: 'next', text: 'It opens, and closes only at her next tap.' }
      ],
      answer: 'closes',
      rule: 'A customer\'s tap runs the microtasks after each listener, before the next one; `element.click()` from code runs every listener first, so a test that clicks from code can miss what a real tap does.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([{ selector: '#slots', name: 'menu' }, { selector: '#chosen', name: 'chosen', text: true }], [{ click: '#pickup' }]),
    probes: [
      { id: 'open', steps: [{ click: '#pickup' }, { painted: 'menu' }] },
      { id: 'still', steps: [{ visible: '#slots' }] },
      { id: 'chosen', steps: [{ click: '#slots .slot:nth-child(3)' }, { text: '#chosen' }] },
      { id: 'picked', steps: [{ visible: '#slots' }] },
      { id: 'elsewhere', steps: [{ click: '#pickup' }, { click: '#pickup-heading' }, { visible: '#slots' }] }
    ]
  },
  setup: () => ({
    files: loopSite({ title: 'Pickup', main: MAIN }, MENU_STYLE, { 'app.js': APP, 'slots.js': SLOTS }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Lena\'s tap does', 1),
    probesGoal('menu', 'Lena\'s tap opens the menu, a time can be picked (which closes it), and a tap elsewhere still closes it', { open: { atLeast: 1 }, still: 'visible', chosen: 'Pickup at 8:00', picked: 'display: none', elsewhere: 'display: none' }, { clean: true })
  ],
  hints: [
    'Open the Event loop panel at Lena\'s tap: which listeners run, and where do "Menu opened" and "Menu closed" come? The Console has them too.',
    'A real tap runs the microtasks after each listener. The `await` in the toggle\'s listener ends in such a microtask, so the menu is open before the same tap bubbles up to the document, where Ben\'s listener sees an open menu and closes it. Ben\'s listener has to leave alone the tap that opened it.',
    'On line 29, let Ben\'s listener take the event and ignore the toggle\'s taps: `document.addEventListener(\'click\', (event) => {` and `if (menu.hidden || toggle.contains(event.target)) return`. Save, then Reload.'
  ],
  debrief: {
    title: 'A real tap checks in between listeners',
    paragraphs: [
      'When the browser dispatches an event itself (a tap, a key, a message), it calls each listener with nothing else of yours on the stack, and after each one it runs the microtasks. The toggle\'s listener stopped at `await loadSlots()`; the promise was already resolved, so the rest of it ran right after that listener: the menu opened. Then the same tap bubbled up to the document, and Ben\'s listener closed what was now open.',
      '`toggle.click()` in Jonas\'s test dispatches the event from his code: the test is still on the stack, so both listeners run first, the closing one finding the menu still shut, and the microtasks come after the whole click. Same code, other order. Tests that click from code (`click()`, `dispatchEvent`) can pass where a real tap fails, and the other way round.',
      'The fix makes the closing listener know which taps are not "elsewhere": `toggle.contains(event.target)` (or the menu\'s own taps too, with `event.composedPath()`), or the toggle stops its tap with `event.stopPropagation()` before the `await`. Registering the closing listener only once the menu is open doesn\'t help: added while the tap is still on its way up, it runs for that very tap.'
    ]
  },
  solution: [
    { predict: 'closes' },
    { save: 'app.js', replace: [CLOSE_ANY, 'document.addEventListener(\'click\', (event) => {\n  if (menu.hidden || toggle.contains(event.target)) return'] },
    'reload'
  ]
}
