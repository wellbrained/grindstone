// Accessibility 6.2: Lena can't check out. Her wrist is in a splint, so she shops with the keyboard this week: Tab to
// move, Enter or Space to press. Jonas's Check out is a <div> styled like a button with a click listener: Tab skips it
// (a div is not in the Tab order), and Enter or Space on it would do nothing anyway. Learn: use a <button>; a role, a
// tabindex or a name alone makes no button: role="button" promises Enter and Space, tabindex="0" only gets you there,
// and the page then has to handle both keys itself.
import { probesGoal } from '../debugging/checks'
import { a11ySite, a11ySpec } from './accessibility'
import { predictedGoal } from './checks'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** Check out as Jonas built it: a div with a class (the fix makes it a button). */
export const CHECKOUT_DIV = '  <div id="checkout" class="checkout">Check out</div>'

/** The click listener on Check out (some non-fixes add key handling next to it). */
export const CHECKOUT_LISTENER = `document.querySelector('#checkout').addEventListener('click', () => {
  status.textContent = \`Thanks, Lena! Order \${order} is in.\`
  order += 1
})
`

const APP = `// The basket (Jonas): − and + change how many croissants; Check out places the order.
import { formatPrice } from './money.js'

const PRICE = 2.4
let quantity = 2
let order = 1043

const quantityText = document.querySelector('#quantity')
const total = document.querySelector('#total')
const status = document.querySelector('#status')

function show() {
  quantityText.textContent = String(quantity)
  total.textContent = formatPrice(quantity * PRICE)
}

document.querySelector('#less').addEventListener('click', () => {
  quantity = Math.max(quantity - 1, 1)
  show()
})
document.querySelector('#more').addEventListener('click', () => {
  quantity += 1
  show()
})

// Check out: styled like our buttons in style.css
${CHECKOUT_LISTENER}`

const MAIN = [
  '<section class="box" aria-labelledby="basket-heading">',
  '  <h2 id="basket-heading">Your basket</h2>',
  '  <p class="line">Butter croissant',
  '    <button id="less" class="step" type="button" aria-label="One Butter croissant less">−</button>',
  '    <span id="quantity" class="quantity">2</span>',
  '    <button id="more" class="step" type="button" aria-label="One Butter croissant more">+</button>',
  '  </p>',
  '  <p class="total">Total: <span id="total">4.80</span> €</p>',
  CHECKOUT_DIV,
  '  <p id="status" class="status" role="status"></p>',
  '</section>',
  '<p class="note"><a href="/allergens">Allergen information</a></p>'
]

const CSS = `
.quantity {
  display: inline-block;
  min-width: 1.5em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.checkout {
  display: inline-block;
  margin-top: 6px;
  border: 0;
  border-radius: 6px;
  padding: 8px 16px;
  background: #7a3e12;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.checkout:focus-visible {
  outline: 2px solid #c98a4b;
  outline-offset: 2px;
}
`

export const ORDER_IN = (n: number) => `Thanks, Lena! Order ${n} is in.`

export const checkoutKeyboard: WebScenario = {
  id: 'web-27-checkout',
  track: 'web',
  kind: 'scenario',
  title: 'Lena can\'t check out',
  difficulty: 2,
  minutes: 6,
  teaches: 'keyboard',
  story: [
    'Lena\'s wrist is in a splint this week, so she shops with the keyboard: Tab moves to the next control, Shift+Tab back, Enter or Space presses it. Two croissants are in her basket, and she can\'t check out: Tab never stops on Check out.',
    'Predict where Tab goes. Then fix the page (`index.html`, `app.js`) so Lena can check out with the keyboard, with Enter or with Space, and the mouse still works. Save, then Reload: the Accessibility panel\'s keys press Tab, Enter and Space in the app, and the reader says where focus is.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'next',
      form: 'one',
      prompt: 'Lena is on the basket\'s + button. Next comes Check out, a `<div>` with a click listener, then the Allergen information link. She presses Tab. Where does focus go?',
      options: [
        { id: 'checkout', text: 'To Check out.', fact: { heard: 'focus: Check out, button' } },
        { id: 'link', text: 'Past Check out, to the Allergen information link: a div is not in the Tab order.', fact: { heard: 'focus: Allergen information, link' } },
        { id: 'stays', text: 'Nowhere: it stays on +, the last control before the div.' },
        { id: 'top', text: 'Back to the − button at the top of the basket.', fact: { heard: 'focus: One Butter croissant less, button' } }
      ],
      answer: 'link',
      rule: 'Tab stops on links, form controls and elements with a tabindex; a div with a click listener is for the mouse only, and Enter or Space on it do nothing.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'index.html',
    web: a11ySpec([{ focusOn: '#more' }, { keyboard: 'Tab' }]),
    probes: [
      // Tab from + lands on Check out, which a reader calls a button named Check out
      { id: 'order', steps: [{ focusTop: true }, { tabTo: '#more' }, { keyboard: 'Tab' }, { focused: '#checkout' }] },
      // and back: Shift+Tab from the Allergen information link
      { id: 'back', steps: [{ focusOn: '.note a' }, { keyboard: 'Shift+Tab' }, { focused: '#checkout' }] },
      { id: 'role', steps: [{ role: '#checkout' }] },
      { id: 'name', steps: [{ name: '#checkout' }] },
      // Enter checks out, then Space does
      { id: 'enter', steps: [{ focusTop: true }, { tabTo: '#checkout' }, { keyboard: 'Enter' }, { text: '#status' }] },
      { id: 'space', steps: [{ keyboard: 'Space' }, { text: '#status' }] },
      // the mouse still works, and Tab stops nowhere else
      { id: 'mouse', steps: [{ click: '#checkout' }, { text: '#status' }] },
      { id: 'stops', steps: [{ tabStops: true }] }
    ]
  },
  setup: () => ({
    files: a11ySite({ title: 'Basket', main: MAIN }, CSS, { 'app.js': APP }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict where Tab goes', 1),
    probesGoal('keyboard', 'Lena reaches Check out with Tab right after + (and back with Shift+Tab), it is a button, and Enter, Space and a click each check out', { order: 1, back: 1, role: 'button', name: 'Check out', enter: ORDER_IN(1043), space: ORDER_IN(1044), mouse: ORDER_IN(1045), stops: 4 }, { clean: true })
  ],
  hints: [
    'Press Tab in the Accessibility panel from + and watch the reader: Check out never gets focus. In the tree, Check out isn\'t even a button. What is it in `index.html`?',
    'A `<div>` is not in the Tab order, has no role, and Enter or Space on it do nothing. A `<button>` has all three: Tab stops on it, the reader says "button", and the browser turns Enter and Space into a click (the listener in `app.js` stays as it is).',
    'On line 25 of `index.html`, make it a button: `<button id="checkout" class="checkout" type="button">Check out</button>`. Save, then Reload.'
  ],
  debrief: {
    title: 'Use a button',
    paragraphs: [
      'Tab visits links, form controls and elements with a `tabindex`, in page order. Jonas\'s Check out was a `<div>` with a click listener: no place in the Tab order, no role for a reader, and no keys. A mouse is the only way to click it.',
      'A `<button>` brings all of it: Tab stops on it, a reader says "Check out, button", and the browser clicks it on Enter and on Space, so the click listener you already have runs for the keyboard too. Rebuilding that on a div takes `role="button"`, `tabindex="0"` and a keydown handler for Enter and Space; leave out one and someone is stuck. `tabindex="0"` alone reaches it and then nothing happens; `role="button"` alone promises keys the browser doesn\'t add.',
      'A link (`<a href>`) is for going somewhere: Enter follows it, Space scrolls the page. And keep the order: a positive `tabindex` jumps the queue and sends Lena to Check out before anything else on the page.'
    ]
  },
  solution: [
    { predict: 'link' },
    { save: 'index.html', replace: [CHECKOUT_DIV, '  <button id="checkout" class="checkout" type="button">Check out</button>'] },
    'reload'
  ]
}
