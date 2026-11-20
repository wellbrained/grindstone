// Accessibility 6.5: lost after the dialog. Lena changes her pickup time in Jonas's dialog (role="dialog",
// aria-modal="true"): it opens with focus on its first time, she picks 8:00 with Enter, and the dialog hides itself with
// focus still inside it. Focus falls back to the page, and her next Tab goes on from where 8:00 was, the end of the page,
// out to the browser's own controls; Tomás's reader says nothing at all. Learn: whoever hides the element that has focus
// puts focus somewhere sensible: when a dialog closes (a choice, Cancel, Escape), back on the button that opened it, as
// <dialog> with showModal() does by itself.
import { probesGoal } from '../debugging/checks'
import { a11ySite, a11ySpec } from './accessibility'
import { predictedGoal } from './checks'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** The dialog's close: it hides itself, and nothing more (the fix puts focus back on the opener). */
export const CLOSE = `function close() {
  dialog.hidden = true
}
`

export const OPEN = `function open() {
  dialog.hidden = false
  dialog.querySelector('.slot').focus()
}
`

const APP = `// The order page (Jonas): Add buttons for today's menu, and the pickup time, changed in a dialog.
const count = document.querySelector('#count')
let items = 3

for (const button of document.querySelectorAll('.add')) {
  button.addEventListener('click', () => {
    items += 1
    count.textContent = String(items)
  })
}

const dialog = document.querySelector('#pickup-dialog')
const opener = document.querySelector('#pickup-open')
const time = document.querySelector('#pickup-time')

${OPEN}
${CLOSE}
opener.addEventListener('click', open)
for (const slot of dialog.querySelectorAll('.slot')) {
  slot.addEventListener('click', () => {
    time.textContent = slot.dataset.time
    close()
  })
}
document.querySelector('#pickup-cancel').addEventListener('click', close)
dialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') close()
})
`

const product = (name: string, price: string) => `    <li class="product"><span class="photo" aria-hidden="true"></span><span><span class="name">${name}</span> <span class="price">${price} €</span></span><button class="add" type="button" aria-label="Add ${name}">Add</button></li>`

/** The dialog's first line (a fix makes it a <dialog>). */
export const DIALOG_DIV = '<div id="pickup-dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="pickup-title" hidden>'

const MAIN = [
  '<section class="box" aria-labelledby="menu-heading">',
  '  <h2 id="menu-heading">Today\'s menu</h2>',
  '  <ul class="products">',
  product('Butter croissant', '2.40'),
  product('Pain au chocolat', '2.80'),
  product('Rye loaf', '5.00'),
  '  </ul>',
  '</section>',
  '<section class="box" aria-labelledby="order-heading">',
  '  <h2 id="order-heading">Your order</h2>',
  '  <p><span id="count">3</span> items · pickup tomorrow at <span id="pickup-time">7:00</span></p>',
  '  <p><button id="pickup-open" class="action" type="button">Change pickup time</button></p>',
  '  <button id="checkout" class="action" type="button">Check out</button>',
  '</section>',
  DIALOG_DIV,
  '  <h2 id="pickup-title">Pickup time</h2>',
  '  <div class="slots">',
  '    <button class="slot" type="button" data-time="7:00">7:00</button>',
  '    <button class="slot" type="button" data-time="8:00">8:00</button>',
  '    <button class="slot" type="button" data-time="9:00">9:00</button>',
  '  </div>',
  '  <button id="pickup-cancel" class="step" type="button">Cancel</button>',
  '</div>'
]

const CSS = `
.dialog {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 16px;
  max-width: 360px;
  margin: 0 auto;
  border: 2px solid #2a2118;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fffaf3;
  color: #2a2118;
  box-shadow: 0 12px 40px rgb(42 33 24 / 35%);
}

.dialog[hidden] {
  display: none;
}

.dialog h2 {
  margin-top: 0;
}

.slots {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.slot {
  flex: 1;
  border: 1px solid #c9b8a3;
  border-radius: 6px;
  padding: 8px 0;
  background: #fff;
  color: #2a2118;
  font: inherit;
  cursor: pointer;
}

.slot:focus-visible,
.step:focus-visible {
  outline: 2px solid #c98a4b;
  outline-offset: 2px;
}
`

export const OUT_OF_PAGE = 'leave: Out of the page: the browser\'s own controls'

export const focusLost: WebScenario = {
  id: 'web-30-focus-lost',
  track: 'web',
  kind: 'scenario',
  title: 'Lost after the dialog',
  difficulty: 3,
  minutes: 8,
  teaches: 'focus',
  story: [
    'Lena (still on the keyboard) changes her pickup time: Change pickup time opens Jonas\'s dialog with focus on 7:00, she tabs to 8:00 and presses Enter. The dialog closes and the page says 8:00. Then she presses Tab to get to Check out, and ends up somewhere else entirely. Tomás, trying the same, hears nothing at all when the dialog closes.',
    'Predict where Lena\'s Tab goes. Then fix `app.js` so focus goes back to Change pickup time whenever the dialog closes (a time picked, Cancel or Escape), and the dialog still opens with focus on its first time. Save, then Reload: the Accessibility panel\'s reader follows focus, and its keys press Tab, Enter and Escape in the app.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'tab',
      form: 'one',
      prompt: 'Lena is on 8:00 in the dialog (the last thing on the page) and presses Enter. The dialog hides itself (`dialog.hidden = true`) and the page says 8:00. She presses Tab once. Where is she?',
      options: [
        { id: 'next', text: 'On Check out, the button after Change pickup time.', fact: { heard: 'focus: Check out, button' } },
        { id: 'opener', text: 'Back on Change pickup time.' },
        { id: 'top', text: 'At the top of the page, on the first Add button.', fact: { heard: 'focus: Add Butter croissant, button' } },
        { id: 'out', text: 'Out of the page: focus fell to the page itself when 8:00 disappeared, and Tab goes on from where 8:00 was, the end of the page, to the browser\'s own controls.', fact: { heard: OUT_OF_PAGE } }
      ],
      answer: 'out',
      rule: 'When the element with focus disappears, focus falls back to the page and the next Tab goes on from where it was; a dialog has to put focus back on the button that opened it.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([{ focusOn: '#pickup-open' }, { keyboard: 'Enter' }, { keyboard: 'Tab' }, { keyboard: 'Enter' }, { keyboard: 'Tab' }]),
    probes: [
      // the dialog still opens with focus on its first time
      { id: 'into', steps: [{ focusOn: '#pickup-open' }, { keyboard: 'Enter' }, { focused: '#pickup-dialog .slot' }] },
      // Escape closes it, back on Change pickup time; so does Cancel
      { id: 'escape', steps: [{ keyboard: 'Escape' }, { focused: '#pickup-open' }] },
      { id: 'cancel', steps: [{ keyboard: 'Enter' }, { tabTo: '#pickup-cancel' }, { keyboard: 'Enter' }, { focused: '#pickup-open' }] },
      // the mouse still picks a time
      { id: 'mouse', steps: [{ click: '#pickup-open' }, { click: '[data-time="8:00"]' }, { text: '#pickup-time' }] },
      // a time picked with the keyboard: shown, the dialog gone, focus back, and Tab goes on to Check out
      { id: 'picked', steps: [{ focusOn: '#pickup-open' }, { keyboard: 'Enter' }, { tabTo: '[data-time="9:00"]' }, { keyboard: 'Enter' }, { focused: '#pickup-open' }] },
      { id: 'time', steps: [{ text: '#pickup-time' }] },
      { id: 'closed', steps: [{ visible: '#pickup-dialog' }] },
      { id: 'next', steps: [{ keyboard: 'Tab' }, { focused: '#checkout' }] }
    ]
  },
  setup: () => ({
    files: a11ySite({ title: 'Order', main: MAIN }, CSS, { 'app.js': APP }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict where Tab goes', 1),
    probesGoal('back', 'Focus goes back to Change pickup time when the dialog closes (a time, Cancel or Escape), and the dialog still opens with focus inside and picks the time', { into: 1, escape: 1, cancel: 1, mouse: '8:00', picked: 1, time: '9:00', closed: 'display: none', next: 1 }, { clean: true })
  ],
  hints: [
    'Press Change pickup time, Tab to 8:00 and Enter with the Accessibility panel\'s keys: the reader says nothing when the dialog closes, and "Focus" in the panel says the page. Where was focus when the dialog was hidden?',
    'Hiding the element that has focus leaves focus nowhere (the page itself), and Tab goes on from where it was. Whoever hides it has to put focus somewhere useful: for a dialog, back on the button that opened it. Every way it closes goes through `close()`.',
    'In `close()`, after line 22 of `app.js` (`dialog.hidden = true`), add `opener.focus()`. Save, then Reload.'
  ],
  debrief: {
    title: 'Put focus back',
    paragraphs: [
      'Focus can only be on something that is there. When the dialog hid itself with 8:00 focused, focus fell back to the page itself, silently: Tomás\'s reader had nothing to say, and Lena\'s next Tab went on from where 8:00 had been. The dialog was the last thing on the page, so Tab went on to the browser\'s own controls; one more, and she would be at the top, tabbing through the whole menu again.',
      'The code that hides it decides where focus goes. For a dialog that is the button that opened it, on every way out: a choice, Cancel, Escape. `opener.focus()` in the one `close()` does it; so does remembering `document.activeElement` when it opens and focusing that again. A `<dialog>` opened with `showModal()` does all of it by itself: focus moves in, the rest of the page is inert (Tab goes round the dialog and the browser\'s own controls, never the page behind it), Escape closes it, and focus goes back to where it was.',
      'Jonas\'s `aria-modal="true"` tells a screen reader to ignore the page behind the dialog, but it keeps nobody\'s Tab inside: try Tab from Cancel in the panel, then once more, and Lena is on the page behind it. For that, use `showModal()`, or `inert` on the rest of the page while the dialog is open.'
    ]
  },
  solution: [
    { predict: 'out' },
    { save: 'app.js', replace: [CLOSE, 'function close() {\n  dialog.hidden = true\n  opener.focus()\n}\n'] },
    'reload'
  ]
}
