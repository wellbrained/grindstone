// The event loop 5.4: the toast that pops. Jonas's "is in your basket" toast should fade in (opacity 0 → 1 over 300 ms),
// but it just appears. It is added with opacity 0 and gets `visible` on the next line, in the same task: the browser
// works out its style only once, already visible, so a transition has nothing to start from. Learn: a transition runs
// between two styles the browser computed; give it a frame in between (a double requestAnimationFrame) or force the style
// once (read a size); a single requestAnimationFrame or a 0 ms timer still comes before the first style.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { TOAST_STYLE, loopSite, loopSpec } from './eventloop'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** The toast added and made visible on the next line (the fix waits for a frame in between). */
export const SHOW_AT_ONCE = `  area.append(element)
  element.classList.add('visible')
`

const APP = `// "… is in your basket": a toast that fades in when you tap Add, and out again after three seconds (Jonas).
const area = document.querySelector('#toasts')

function toast(text) {
  const element = document.createElement('p')
  element.className = 'toast'
  element.textContent = text
${SHOW_AT_ONCE}  setTimeout(() => element.classList.remove('visible'), 3000)
  setTimeout(() => element.remove(), 3400)
}

for (const button of document.querySelectorAll('.add')) {
  button.addEventListener('click', () => toast(\`\${button.dataset.name} is in your basket\`))
}
`

const product = (name: string, price: string) => `  <li class="product"><span class="photo" aria-hidden="true"></span><span><span class="name">${name}</span><span class="price">${price} €</span></span><button class="add" type="button" data-name="${name}">Add</button></li>`

const MAIN = [
  '<section class="box" aria-labelledby="menu-heading">',
  '  <h2 id="menu-heading">Today\'s menu</h2>',
  '  <ul class="products" aria-label="Today\'s menu">',
  product('Butter croissant', '2.40'),
  product('Pain au chocolat', '2.80'),
  product('Cinnamon bun', '3.40'),
  '  </ul>',
  '</section>',
  '<div id="toasts" class="toasts" aria-live="polite"></div>'
]

export const IN_BASKET = 'Butter croissant is in your basket'

export const toastPops: WebScenario = {
  id: 'web-24-toast',
  track: 'web',
  kind: 'scenario',
  title: 'The toast that pops',
  difficulty: 2,
  minutes: 6,
  teaches: 'transition',
  story: [
    'When Lena taps Add, a toast says what went into her basket. Jonas gave it a fade: `opacity: 0`, and with the class `visible`, `opacity: 1` over 300 ms (`transition: opacity 300ms`). It fades out after three seconds, but it never fades in: it just pops up.',
    'Predict what Lena sees. Then fix `app.js` so the toast fades in (the stylesheet is fine). Save, then Reload: the Event loop panel shows each frame and the transitions that start in it.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'fade',
      form: 'one',
      prompt: 'Lena taps Add on the croissant. The toast is added with `opacity: 0` and, on the next line, gets `visible` (`opacity: 1`, a 300 ms transition). What does she see?',
      options: [
        { id: 'fades', text: 'It fades in over 300 ms.', fact: { animated: 'p.toast.visible opacity' } },
        { id: 'pops', text: 'It appears at once: the browser never worked out its style at opacity 0, so the transition has nothing to start from.', fact: { painted: `toast: ${IN_BASKET}` } },
        { id: 'hidden', text: 'It stays invisible: the transition never starts, so the opacity stays 0.' },
        { id: 'late', text: 'It fades in one frame later.' }
      ],
      answer: 'pops',
      rule: 'A transition runs only between two styles the browser has computed; an element added and changed in the same task gets only one, so let a frame (or a forced style) come in between.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    // the last toast's text on the panel; every toast's opacity for the fade (a decoy beside the toast can't stand in)
    web: loopSpec([{ selector: '#toasts > .toast:last-child', name: 'toast', text: true }, { selector: '#toasts > .toast', name: 'toasts', opacity: true, all: true }], [{ click: '.add[data-name="Butter croissant"]' }]),
    probes: [
      // the toast Lena sees fades in: its first frame shows it not there yet, a later one half there, one whole at least
      // 96 ms after the first; and so does every other toast that appears with it
      { id: 'fade', steps: [{ click: '.add[data-name="Butter croissant"]' }, { faded: 'toasts' }] },
      { id: 'text', steps: [{ text: '#toasts > .toast:last-child' }] },
      // and it still fades out after three seconds
      { id: 'out', steps: [{ wait: 2000 }, { wait: 1200 }, { animated: '.toast', property: 'opacity' }] }
    ]
  },
  setup: () => ({
    files: loopSite({ title: 'Menu', main: MAIN }, TOAST_STYLE, { 'app.js': APP }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Lena sees', 1),
    probesGoal('fade', 'The toast fades in when Lena taps Add, says what she added, and still fades out', { fade: { atLeast: 1 }, text: IN_BASKET, out: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'Open the Event loop panel at Lena\'s tap: the frame after it paints the toast, but starts no transition. The one three seconds later does (the fade-out). What is different?',
    'A transition needs a style before and a style after. The toast\'s first style is worked out at the frame, when it already has `visible`. Let the browser work out its style once without `visible` first: wait for a frame to be painted, then add the class.',
    'On line 9, add the class two frames later: `requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add(\'visible\')))`. Save, then Reload.'
  ],
  debrief: {
    title: 'A transition needs a before',
    paragraphs: [
      'A CSS transition starts when the browser, working out styles, finds that a property changed since the last time it worked them out. The toast was added and given `visible` in the same task, and the browser only works out styles at a frame (or when code asks for one), so the first style it ever had was already `opacity: 1`: no before, no transition. Three seconds later the class goes, from a style that was painted, and the fade-out works.',
      'Two frames do it: the first `requestAnimationFrame` callback runs before the frame that paints the toast at `opacity: 0`, the second before the next one, and the class added there changes a computed style. Reading a size (`element.offsetWidth`) before adding the class forces the style at once, at the cost of a forced layout; `getComputedStyle(element).opacity` forces only the style (no layout: the opacity doesn\'t depend on it), which is all a transition needs. A single `requestAnimationFrame` is the classic miss: its callback runs before that frame works out its styles, so it is still the same first style. `setTimeout(…, 0)` usually comes even earlier.',
      'For something that should animate as it appears, a CSS animation (`@keyframes` from opacity 0) needs no before at all, and neither does `element.animate()`.'
    ]
  },
  solution: [
    { predict: 'pops' },
    { save: 'app.js', replace: [SHOW_AT_ONCE, '  area.append(element)\n  requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add(\'visible\')))\n'] },
    'reload'
  ]
}
