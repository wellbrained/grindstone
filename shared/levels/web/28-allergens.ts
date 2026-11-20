// Accessibility 6.3: open or closed? The croissant's page has an Allergens button that shows the list under it. Jonas's
// button toggles the list's `hidden` and says nothing about it: Tomás presses Enter, the list opens below, and his
// reader stays silent. He can't tell whether anything happened, or whether the list is open now. Learn: a button that
// shows and hides something says so with aria-expanded (true when open, false when closed, kept in step), or is a native
// <summary> of a <details>; a changed label, aria-pressed or an attribute on the list don't.
import { probesGoal } from '../debugging/checks'
import { a11ySite, a11ySpec } from './accessibility'
import { predictedGoal } from './checks'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** The toggle's markup and its listener's one line (the fix adds aria-expanded to both). */
export const TOGGLE_BUTTON = '  <button id="allergens-toggle" class="toggle" type="button">Allergens</button>'
export const TOGGLE_LINE = '  list.hidden = !list.hidden\n'

const APP = `// The product page (Jonas): Allergens shows or hides the list under it.
const toggle = document.querySelector('#allergens-toggle')
const list = document.querySelector('#allergens-list')

toggle.addEventListener('click', () => {
${TOGGLE_LINE}})
`

export const ALLERGEN_LIST = [
  '  <ul id="allergens-list" class="allergens" hidden>',
  '    <li>Wheat (gluten)</li>',
  '    <li>Milk (butter)</li>',
  '    <li>Egg</li>',
  '  </ul>'
]

const MAIN = [
  '<section class="box" aria-labelledby="product-heading">',
  '  <h2 id="product-heading">Butter croissant</h2>',
  '  <p>Laminated by hand with French butter, baked every morning at five.</p>',
  '  <p class="price">2.40 €</p>',
  TOGGLE_BUTTON,
  ...ALLERGEN_LIST,
  '</section>'
]

const CSS = `
.toggle {
  display: block;
  margin-top: 10px;
  border: 1px solid #c9b8a3;
  border-radius: 6px;
  padding: 6px 12px;
  background: #fff;
  color: #2a2118;
  font: inherit;
  cursor: pointer;
}

.toggle:focus-visible {
  outline: 2px solid #c98a4b;
  outline-offset: 2px;
}

.allergens {
  margin: 8px 0 0;
  padding-left: 20px;
}
`

export const allergensOpen: WebScenario = {
  id: 'web-28-allergens',
  track: 'web',
  kind: 'scenario',
  title: 'Open or closed?',
  difficulty: 2,
  minutes: 6,
  teaches: 'aria-expanded',
  story: [
    'Tomás checks the allergens before he orders. On the croissant\'s page, Jonas\'s Allergens button shows the list under it and hides it again. Tomás presses Enter on it and waits: his reader says nothing more. Did it open? Is it open now?',
    'Predict what his reader says. Then fix the page so the button tells him whether the list is open, before and after each press, and the list still opens and closes for everyone. Save, then Reload: the Accessibility panel shows the button\'s states in the tree, and what the reader says when you press Enter or Space on it.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'reads',
      form: 'one',
      prompt: 'Tomás tabs to Allergens (a `<button>` whose click toggles the list\'s `hidden`) and presses Enter. The list opens below it. What does his screen reader say on the button, and then?',
      options: [
        { id: 'states', text: '“Allergens, button, collapsed”, then “expanded”.', fact: { heard: 'focus: Allergens, button, collapsed' } },
        { id: 'plain', text: '“Allergens, button”, then nothing: the button never says whether the list is open.', fact: { heard: 'focus: Allergens, button' } },
        { id: 'expanded', text: '“Allergens, button”, then “expanded”: the reader sees the list appear.', fact: { heard: 'state: expanded' } },
        { id: 'list', text: '“Allergens, button”, then it reads the new list out.' }
      ],
      answer: 'plain',
      rule: 'A reader knows that a button opens something only from aria-expanded (or a native <details>): set it, and keep it in step with what is shown.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([{ tabTo: '#allergens-toggle' }, { keyboard: 'Enter' }]),
    probes: [
      // after Tomás's Enter: open, and it says so
      { id: 'open', steps: [{ state: '#allergens-toggle', of: 'expanded' }] },
      { id: 'shown', steps: [{ visible: '#allergens-list' }] },
      // Enter again: closed (the list out of the tree, hidden from everyone), and the reader says it
      { id: 'close', steps: [{ focusOn: '#allergens-toggle' }, { keyboard: 'Enter' }, { heard: 'collapsed' }] },
      { id: 'closed', steps: [{ state: '#allergens-toggle', of: 'expanded' }] },
      { id: 'gone', steps: [{ role: '#allergens-list' }] },
      { id: 'unseen', steps: [{ visible: '#allergens-list' }] },
      // a click opens it, Space closes it again
      { id: 'mouse', steps: [{ click: '#allergens-toggle' }, { state: '#allergens-toggle', of: 'expanded' }] },
      { id: 'space', steps: [{ keyboard: 'Space' }, { heard: 'collapsed' }] }
    ]
  },
  setup: () => ({
    files: a11ySite({ title: 'Butter croissant', main: MAIN }, CSS, { 'app.js': APP }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Tomás hears', 1),
    probesGoal('state', 'Allergens says whether the list is open, the reader says when it opens and closes, and the list still opens and closes', { open: 'true', shown: 'visible', close: { atLeast: 1 }, closed: 'false', gone: 'hidden', unseen: { not: 'visible' }, mouse: 'true', space: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'Look at Allergens in the Accessibility panel\'s tree, closed and open: `button "Allergens"` both times. Nothing on the button changes when the list opens, so a reader has nothing to say.',
    'A button that shows and hides something carries `aria-expanded`: `"false"` while closed, `"true"` while open. Set it in the markup, and change it wherever the list is shown or hidden.',
    'Add `aria-expanded="false"` to the button on line 21 of `index.html`, and after line 6 of `app.js` add `toggle.setAttribute(\'aria-expanded\', String(!list.hidden))`. Save, then Reload.'
  ],
  debrief: {
    title: 'Say what the button opened',
    paragraphs: [
      'A screen reader reads the tree, not the screen. Jonas\'s button changed what was shown under it, and nothing about itself, so Tomás heard "Allergens, button" and then silence. `aria-expanded` is the state that says "this controls something that is open now (true) or closed (false)": the reader says "collapsed" when he gets there and "expanded" the moment he presses it.',
      'It has to stay true to what is shown: `aria-expanded="false"` written once in the markup and never changed is worse than none, it says closed while the list is open. Change it in the one place the list is shown or hidden. A `<details>` element with a `<summary>` does all of it natively: a button that says expanded or collapsed, no script at all.',
      'Near misses: a label that changes ("Show allergens" / "Hide allergens") is read as a new name, not a state; `aria-pressed` is for an on/off toggle such as "Vegan only", not for showing something; `aria-expanded` on the list itself is on the wrong element. `aria-controls` may point at the list too, but few readers use it.'
    ]
  },
  solution: [
    { predict: 'plain' },
    { save: 'index.html', replace: [TOGGLE_BUTTON, '  <button id="allergens-toggle" class="toggle" type="button" aria-expanded="false">Allergens</button>'] },
    { save: 'app.js', replace: [TOGGLE_LINE, `${TOGGLE_LINE}  toggle.setAttribute('aria-expanded', String(!list.hidden))\n`] },
    'reload'
  ]
}
