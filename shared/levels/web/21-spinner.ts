// The event loop 5.1: the spinner that never spins. Jonas shows a spinner while Place order builds the receipt (about
// 900 ms of work on Lena's old tablet), then hides it and thanks her, all in the tap's one task. The browser paints only
// between tasks, and by then the spinner is hidden again: Lena sees a frozen page, then the thank-you. Learn: a change is
// on screen only once a frame is painted after it; to show something before long work, let a frame go by first
// (requestAnimationFrame, then a task), since a 0 ms timer runs before the next frame and a frame's callbacks run before
// it paints.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { SPINNER_STYLE, TABLET, loopSite, loopSpec } from './eventloop'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** The listener's first lines: the spinner shown (and the last order's thanks taken away), then (in the fix) a frame waited for before the work. */
export const SPINNER_SHOWN = `document.querySelector('#place').addEventListener('click', () => {
  spinner.hidden = false
  status.textContent = ''
  console.log('Spinner shown')
`

/** Waits until a frame has been painted (requestAnimationFrame, then a task after that frame). */
export const AFTER_A_FRAME = 'await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))'

const APP = `// The order page (Jonas): Place order shows a spinner while it builds the receipt, then thanks the customer.
import { formatPrice } from './money.js'
import { busy } from './tablet.js'

const BASKET = [
  { name: 'Butter croissant', price: 2.4, quantity: 2 },
  { name: 'Rye loaf', price: 5, quantity: 1 }
]
const spinner = document.querySelector('#spinner')
const status = document.querySelector('#status')

/** Prices, VAT and the pickup slot: about 900 ms of work on Lena's old tablet. */
function buildReceipt(basket) {
  busy(900)
  const total = basket.reduce((sum, line) => sum + line.price * line.quantity, 0)
  return { number: 1042, total }
}

${SPINNER_SHOWN}  const receipt = buildReceipt(BASKET)
  spinner.hidden = true
  status.textContent = \`Thank you! Order \${receipt.number}: \${formatPrice(receipt.total)} €\`
  console.log('Receipt ready')
})
`

const MAIN = [
  '<section class="box" aria-labelledby="basket-heading">',
  '  <h2 id="basket-heading">Your basket</h2>',
  '  <ul class="list" aria-label="Your basket">',
  '    <li>2 × Butter croissant · 4.80 €</li>',
  '    <li>1 × Rye loaf · 5.00 €</li>',
  '  </ul>',
  '  <button class="action" id="place" type="button">Place order</button>',
  '  <p id="spinner" class="spinner" role="status" hidden>Placing your order…</p>',
  '  <p id="status" class="status" role="status"></p>',
  '</section>'
]

export const THANKS = 'Thank you! Order 1042: 9.80 €'

export const spinnerNeverSpins: WebScenario = {
  id: 'web-21-spinner',
  track: 'web',
  kind: 'scenario',
  title: 'The spinner that never spins',
  difficulty: 1,
  minutes: 6,
  teaches: 'long task',
  story: [
    'Lena orders on her old tablet. Place order builds the receipt (prices, VAT, the pickup slot), which takes the tablet almost a second, so Jonas shows a spinner meanwhile: “Placing your order…”. Lena taps, the page freezes, then the thank-you appears. She never saw a spinner, and tapped twice.',
    'Predict what the screen shows. Then fix `app.js` so the spinner is on screen while the receipt is built. Save, then Reload: the Event loop panel shows every task and every painted frame.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'screen',
      form: 'one',
      prompt: 'Lena taps Place order. The listener shows the spinner, builds the receipt (about 900 ms of work), hides the spinner and shows the thank-you, all in one go. What does the screen show?',
      options: [
        { id: 'spinner', text: 'The spinner for about 900 ms, then the thank-you.', fact: { painted: 'spinner' } },
        { id: 'never', text: 'No spinner at all: the page freezes, then shows the thank-you. The browser paints only after the task, when the spinner is hidden again.', fact: { painted: `status: ${THANKS}` } },
        { id: 'turns', text: 'The spinner turns throughout the work: its CSS animation runs apart from the page\'s code.' },
        { id: 'late', text: 'The thank-you, then the spinner for one frame.' }
      ],
      answer: 'never',
      rule: 'The browser renders only between tasks: what a task shows and hides again before it ends is never painted, however long the task takes.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([{ selector: '#spinner', name: 'spinner' }, { selector: '#status', name: 'status', text: true }], [{ click: '#place' }]),
    probes: [
      // no spinner before the tap
      { id: 'idle', steps: [{ visible: '#spinner' }] },
      // a frame shows the spinner right after Lena's tap (within 40 ms: before the work, not after it)
      { id: 'spun', steps: [{ click: '#place' }, { wait: 1000 }, { painted: 'spinner', within: 40 }] },
      { id: 'thanks', steps: [{ text: '#status' }] },
      // and the receipt still takes its time: no thank-you on screen before about 880 ms after the tap
      { id: 'took', steps: [{ when: 'status: Thank you' }] },
      // and it is gone once she is thanked
      { id: 'after', steps: [{ visible: '#spinner' }] }
    ]
  },
  setup: () => ({
    files: loopSite({ title: 'Your basket', main: MAIN }, SPINNER_STYLE, { 'app.js': APP, 'tablet.js': TABLET }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the screen shows', 1),
    probesGoal('spinner', 'Lena sees the spinner as soon as she taps, while her order is placed, then the thank-you, and no spinner before or after', { idle: 'display: none', spun: { atLeast: 1 }, thanks: THANKS, took: { atLeast: 880 }, after: 'display: none' }, { clean: true })
  ],
  hints: [
    'Open the Event loop panel: find the task of Lena\'s tap, then the frames after it. What does each frame paint?',
    'The browser paints between tasks, never in the middle of one. The spinner has to be shown, then a frame painted, and only then the work. A `setTimeout(…, 0)` is not enough: it runs before the next frame.',
    'Make the listener `async` and, after `console.log(\'Spinner shown\')` on line 22, wait for a painted frame: `await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))`. Save, then Reload.'
  ],
  debrief: {
    title: 'Nothing is painted in the middle of a task',
    paragraphs: [
      'The browser runs one task at a time: Lena\'s tap is a task, and the listener runs to its end, receipt and all. Only between tasks may it update the rendering (at most once a frame, every 16 ms on a 60 Hz screen): run the requestAnimationFrame callbacks, work out styles and layout, paint. By the time the tap\'s task was over, the spinner was hidden again, so no frame ever had it. Its CSS animation can\'t help a spinner no frame ever showed.',
      'To show something before long work, give the browser a frame first. `requestAnimationFrame(() => setTimeout(resolve))` waits for the next frame\'s callbacks and then for a task after that frame, so the frame with the spinner is painted before the work starts. A double `requestAnimationFrame` works too. `setTimeout(…, 0)` alone usually runs before the next frame (it doesn\'t wait for one), `await Promise.resolve()` doesn\'t even leave the task, and a single `requestAnimationFrame` runs the work in that frame\'s callbacks, before it paints.',
      'The spinner now shows, but the page\'s code still runs for 900 ms in one task: a tap waits until it ends, and so does anything the page\'s code draws (Chrome may keep turning a spinner that is already painted, and scrolling, apart from the page\'s code). The real cure for long work is less of it in one go: chunks with a break in between (5.5), or a worker.'
    ]
  },
  solution: [
    { predict: 'never' },
    { save: 'app.js', replace: [SPINNER_SHOWN, SPINNER_SHOWN.replace('() => {', 'async () => {') + `  ${AFTER_A_FRAME}\n`] },
    'reload'
  ]
}
