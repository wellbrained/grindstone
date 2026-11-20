// Accessibility's practice tasks (ADR 0009: prediction only, one question or a set of three, about 30 s each). Each has a
// small page whose run shows the answer once it is given (the Accessibility panel's reader and tree, the Console's
// lines); the files are read-only, nothing to fix. A practice task follows its scenario in the chapter's list (index.ts).
import { a11ySite, a11ySpec } from '../accessibility'
import { predictedGoal } from '../checks'
import { SHOP_PAGE } from '../site'
import type { PredictionOption, WebPracticeTask } from '../types'

/** A page with nothing to run: the question is about the markup. */
const NO_CODE = '// Nothing runs here: the question is about the markup in index.html.\n'

const STAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="none" stroke="currentColor" stroke-width="2"/></svg>'

const heardOption = (id: string, text: string, heard?: string): PredictionOption => ({ id, text, ...(heard ? { fact: { heard } } : {}) })

// --- 6.1: what does the reader say? (a set of three) ---------------------------------------------------------------------

export const readerSays: WebPracticeTask = {
  id: 'web-practice-reader-says',
  track: 'web',
  kind: 'practice',
  practises: 'web-26-every-button',
  title: 'What does the reader say?',
  difficulty: 1,
  minutes: 1,
  task: 'Lena tabs through three controls with a screen reader on. For each, say what it reads.',
  prediction: {
    questions: [
      {
        id: 'close',
        form: 'one',
        prompt: 'The basket\'s close button shows ✕ and has `aria-label="Close the basket"`. What does the reader say on it?',
        options: [
          heardOption('label', '“Close the basket, button”', 'focus: Close the basket, button'),
          heardOption('both', '“✕ Close the basket, button”', 'focus: ✕ Close the basket, button'),
          heardOption('symbol', '“✕, button”', 'focus: ✕, button')
        ],
        answer: 'label',
        rule: 'aria-label replaces what is in the button as its name: the ✕ isn\'t read.'
      },
      {
        id: 'search',
        form: 'one',
        prompt: 'The search field has `<label for="search">Find</label>` and `placeholder="Search the menu"`. What does the reader say?',
        options: [
          heardOption('label', '“Find, searchbox”', 'focus: Find, searchbox'),
          heardOption('placeholder', '“Search the menu, searchbox”', 'focus: Search the menu, searchbox'),
          heardOption('none', '“Searchbox”: the label is only text beside it.', 'focus: searchbox')
        ],
        answer: 'label',
        rule: 'A label names its field; a placeholder is used only when there is nothing else.'
      },
      {
        id: 'favourite',
        form: 'one',
        prompt: 'The favourite button holds only an icon (`aria-hidden`) and has `title="Save to favourites"`. What does the reader say?',
        options: [
          heardOption('title', '“Save to favourites, button”', 'focus: Save to favourites, button'),
          heardOption('button', '“Button”: a title is only a tooltip.', 'focus: button')
        ],
        answer: 'title',
        rule: 'With nothing else to go on, the title becomes the name; but only a mouse ever shows it, so give the button a real name.'
      }
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'index.html',
    web: a11ySpec([{ keyboard: 'Tab' }, { keyboard: 'Tab' }, { keyboard: 'Tab' }]),
    probes: []
  },
  setup: () => ({
    files: a11ySite({
      title: 'Three controls',
      main: [
        '<section class="box" aria-labelledby="test-heading">',
        '  <h2 id="test-heading">Three controls</h2>',
        '  <p><button id="close" class="add icon-button" type="button" aria-label="Close the basket">✕</button></p>',
        '  <p><label for="search">Find</label> <input id="search" type="search" placeholder="Search the menu"></p>',
        `  <p><button id="favourite" class="add icon-button" type="button" title="Save to favourites">${STAR_ICON}</button></p>`,
        '</section>'
      ]
    }, '', { 'app.js': NO_CODE }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['The name comes from the first of these that gives one: aria-labelledby, aria-label, a label (or alt), the content of a button or link, a placeholder, a title.'],
  why: 'aria-label wins over what is inside, a label over a placeholder, and a title is the last resort.',
  solution: [{ predict: 'label' }, { predict: 'label' }, { predict: 'title' }]
}

// --- 6.2: which keys click? (pick lines) ---------------------------------------------------------------------------------

const KEYS_APP = `// Jonas's key test: each control logs its clicks, with the last key pressed.
let lastKey = 'none'
document.addEventListener('keydown', (event) => {
  lastKey = event.key === ' ' ? 'Space' : event.key
})

for (const [id, name] of [['order', 'Order'], ['menu', 'Menu'], ['favourite', 'Favourite'], ['gift', 'Gift wrap']]) {
  document.querySelector(\`#\${id}\`).addEventListener('click', (event) => {
    if (id === 'menu') event.preventDefault()
    console.log(\`\${name} clicked (\${lastKey})\`)
  })
}
`

const clicked = (id: string, text: string, said: string): PredictionOption => ({ id, text, fact: { says: said } })

export const whichKeys: WebPracticeTask = {
  id: 'web-practice-which-keys',
  track: 'web',
  kind: 'practice',
  practises: 'web-27-checkout',
  title: 'Which keys click?',
  difficulty: 1,
  minutes: 1,
  task: 'Lena presses Enter, then Space, on each of four controls. Pick the presses that click.',
  prediction: {
    questions: [{
      id: 'keys',
      form: 'lines',
      prompt: 'On Jonas\'s key test page: an Order `<button>`, a Menu link (`<a href>`), a Favourite `<span role="button" tabindex="0">` with only a click listener, and a Gift wrap checkbox. Which presses click?',
      options: [
        clicked('order-enter', 'Enter on Order', 'Order clicked (Enter)'),
        clicked('order-space', 'Space on Order', 'Order clicked (Space)'),
        clicked('menu-enter', 'Enter on Menu', 'Menu clicked (Enter)'),
        clicked('menu-space', 'Space on Menu', 'Menu clicked (Space)'),
        clicked('favourite-enter', 'Enter on Favourite', 'Favourite clicked (Enter)'),
        clicked('favourite-space', 'Space on Favourite', 'Favourite clicked (Space)'),
        clicked('gift-enter', 'Enter on Gift wrap', 'Gift wrap clicked (Enter)'),
        clicked('gift-space', 'Space on Gift wrap', 'Gift wrap clicked (Space)')
      ],
      answer: ['order-enter', 'order-space', 'menu-enter', 'gift-space'],
      rule: 'A button clicks on Enter and on Space, a link on Enter only, a checkbox on Space only; role="button" adds no keys, the page has to handle them itself.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([
      { tabTo: '#order' }, { keyboard: 'Enter' }, { keyboard: 'Space' },
      { tabTo: '#menu' }, { keyboard: 'Enter' }, { keyboard: 'Space' },
      { tabTo: '#favourite' }, { keyboard: 'Enter' }, { keyboard: 'Space' },
      { tabTo: '#gift' }, { keyboard: 'Enter' }, { keyboard: 'Space' }
    ]),
    probes: []
  },
  setup: () => ({
    files: a11ySite({
      title: 'Key test',
      main: [
        '<section class="box" aria-labelledby="keys-heading">',
        '  <h2 id="keys-heading">Jonas\'s key test</h2>',
        '  <p><button id="order" class="action" type="button">Order</button></p>',
        '  <p><a id="menu" href="/menu">Menu</a></p>',
        '  <p><span id="favourite" class="action" role="button" tabindex="0">Favourite</span></p>',
        '  <p><input id="gift" type="checkbox"> <label for="gift">Gift wrap</label></p>',
        '</section>'
      ]
    }, '', { 'app.js': KEYS_APP }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Pick the presses that click', 1)],
  hints: ['The browser turns a key into a click only for what it knows: a button (Enter and Space), a link (Enter), a checkbox (Space). A role changes what a reader says, not what the keys do.'],
  why: 'Native controls bring their keys; role="button" on a span brings none.',
  solution: [{ predict: ['order-enter', 'order-space', 'menu-enter', 'gift-space'] }]
}

// --- 6.3: pressed, checked or expanded? (a set of three) -----------------------------------------------------------------

const STATE_APP = `// Three toggles (Jonas): Vegan only filters the menu, Gift wrap is for the order.
const vegan = document.querySelector('#vegan')
vegan.addEventListener('click', () => {
  vegan.setAttribute('aria-pressed', String(vegan.getAttribute('aria-pressed') !== 'true'))
})

const gift = document.querySelector('#gift')
function flip() {
  gift.setAttribute('aria-checked', String(gift.getAttribute('aria-checked') !== 'true'))
}
gift.addEventListener('click', flip)
gift.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    event.preventDefault()
    flip()
  }
})
`

export const whichState: WebPracticeTask = {
  id: 'web-practice-which-state',
  track: 'web',
  kind: 'practice',
  practises: 'web-28-allergens',
  title: 'Pressed, checked or expanded?',
  difficulty: 1,
  minutes: 1,
  task: 'Tomás presses three toggles. For each, say what his reader says as it changes.',
  prediction: {
    questions: [
      {
        id: 'vegan',
        form: 'one',
        prompt: 'Space on Vegan only, a `<button aria-pressed="false">` the page flips to `"true"`. What does the reader say?',
        options: [
          heardOption('pressed', '“Pressed”', 'state: pressed'),
          heardOption('checked', '“Checked”', 'state: checked'),
          heardOption('nothing', 'Nothing: the button\'s name didn\'t change.')
        ],
        answer: 'pressed',
        rule: 'aria-pressed makes a button a toggle: the reader says pressed or not pressed, and says it when it flips.'
      },
      {
        id: 'hours',
        form: 'one',
        prompt: 'Enter on Opening hours, the `<summary>` of a `<details>`, no ARIA at all. What does the reader say as it opens?',
        options: [
          heardOption('expanded', '“Expanded”', 'state: expanded'),
          heardOption('nothing', 'Nothing: there is no aria-expanded on it.'),
          heardOption('pressed', '“Pressed”')
        ],
        answer: 'expanded',
        rule: 'A <summary> is a button with the expanded state built in: no ARIA needed.'
      },
      {
        id: 'gift',
        form: 'one',
        prompt: 'Space on Gift wrap, a `<span tabindex="0" aria-checked="false">` (no role) the page flips to `"true"`. What does the reader say?',
        options: [
          heardOption('checked', '“Checked”', 'state: checked'),
          heardOption('on', '“On”', 'state: on'),
          heardOption('nothing', 'Nothing: aria-checked means something only on a role that has it.', 'focus: Gift wrap')
        ],
        answer: 'nothing',
        rule: 'aria-checked counts only on a role that has it (checkbox, radio, switch); on a span without one the reader has nothing to say.'
      }
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([
      { tabTo: '#vegan' }, { keyboard: 'Space' },
      { tabTo: '#hours summary' }, { keyboard: 'Enter' },
      { tabTo: '#gift' }, { keyboard: 'Space' }
    ]),
    probes: []
  },
  setup: () => ({
    files: a11ySite({
      title: 'Toggles',
      main: [
        '<section class="box" aria-labelledby="toggles-heading">',
        '  <h2 id="toggles-heading">Three toggles</h2>',
        '  <p><button id="vegan" class="action" type="button" aria-pressed="false">Vegan only</button></p>',
        '  <details id="hours"><summary>Opening hours</summary><p>Monday to Saturday, 7:00 to 18:00</p></details>',
        '  <p><span id="gift" class="action" tabindex="0" aria-checked="false">Gift wrap</span></p>',
        '</section>'
      ]
    }, '', { 'app.js': STATE_APP }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A reader says a state only for a role that has it: pressed for a toggle button, expanded for what opens something (a summary has it built in), checked for a checkbox or switch.'],
  why: 'States belong to roles: aria-pressed on a button, expanded on a summary, aria-checked only with role="checkbox" or "switch".',
  solution: [{ predict: 'pressed' }, { predict: 'expanded' }, { predict: 'nothing' }]
}

// --- 6.4: which ones are announced? (pick lines) -------------------------------------------------------------------------

const LIVE_APP = `// Five ways to show a message (Jonas tried them all). Each button shows one.
const on = (id, show) => document.querySelector(\`#run-\${id}\`).addEventListener('click', show)

// A: text into a role="status" that was on the page from the start
on('a', () => {
  document.querySelector('#a').textContent = 'A: 2 croissants in your basket'
})

// B: a new role="alert", added with its text
on('b', () => {
  const alert = document.createElement('p')
  alert.setAttribute('role', 'alert')
  alert.textContent = 'B: Payment failed'
  document.querySelector('#b-area').append(alert)
})

// C: a new aria-live="polite" paragraph, added with its text
on('c', () => {
  const note = document.createElement('p')
  note.setAttribute('aria-live', 'polite')
  note.textContent = 'C: Saved for later'
  document.querySelector('#c-area').append(note)
})

// D: aria-live set on an empty paragraph, and its text, in the same moment
on('d', () => {
  const note = document.querySelector('#d')
  note.setAttribute('aria-live', 'polite')
  note.textContent = 'D: Pickup at 8:00'
})

// E: an aria-live="polite" paragraph, hidden until now, shown with its text
on('e', () => {
  const note = document.querySelector('#e')
  note.hidden = false
  note.textContent = 'E: Receipt sent'
})
`

export const announced: WebPracticeTask = {
  id: 'web-practice-announced',
  track: 'web',
  kind: 'practice',
  practises: 'web-29-silent-error',
  title: 'Which ones are announced?',
  difficulty: 2,
  minutes: 1,
  task: 'Jonas shows five messages in five ways. Pick the ones Tomás\'s reader announces.',
  prediction: {
    questions: [{
      id: 'live',
      form: 'lines',
      prompt: 'Tomás presses A to E in turn (`app.js` has the five ways, focus stays on the buttons). Which messages does his reader announce?',
      options: [
        heardOption('a', 'A: text into a role="status" that was on the page from the start', 'polite: A: 2 croissants in your basket'),
        heardOption('b', 'B: a new role="alert", added with its text', 'assertive: B: Payment failed'),
        heardOption('c', 'C: a new aria-live="polite" paragraph, added with its text', 'polite: C: Saved for later'),
        heardOption('d', 'D: aria-live set on an empty paragraph, and its text, in the same moment', 'polite: D: Pickup at 8:00'),
        heardOption('e', 'E: an aria-live="polite" paragraph, itself hidden until now, shown with its text', 'polite: E: Receipt sent')
      ],
      answer: ['a', 'b'],
      rule: 'A live region announces a change only when it was on the page, live and shown, before the change; one added, made live or itself shown with its text is not reliably announced (a role="alert" that appears is Chrome\'s exception).'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([{ click: '#run-a' }, { click: '#run-b' }, { click: '#run-c' }, { click: '#run-d' }, { click: '#run-e' }]),
    probes: []
  },
  setup: () => ({
    files: a11ySite({
      title: 'Messages',
      main: [
        '<section class="box" aria-labelledby="live-heading">',
        '  <h2 id="live-heading">Five ways to show a message</h2>',
        '  <p><button id="run-a" class="action" type="button">A</button></p>',
        '  <p id="a" role="status"></p>',
        '  <p><button id="run-b" class="action" type="button">B</button></p>',
        '  <div id="b-area"></div>',
        '  <p><button id="run-c" class="action" type="button">C</button></p>',
        '  <div id="c-area"></div>',
        '  <p><button id="run-d" class="action" type="button">D</button></p>',
        '  <p id="d"></p>',
        '  <p><button id="run-e" class="action" type="button">E</button></p>',
        '  <p id="e" aria-live="polite" hidden></p>',
        '</section>'
      ]
    }, '', { 'app.js': LIVE_APP }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Pick the ones announced', 1)],
  hints: ['The browser tells a reader about changes inside a live region it already knows: one on the page and shown before the change. A role="alert" is read as it appears.'],
  why: 'Put the live region on the page first, then change its text; only an alert is read as it appears.',
  solution: [{ predict: ['a', 'b'] }]
}

// --- 6.5: where does Tab go? (order the lines) ---------------------------------------------------------------------------

const focusLine = (id: string, text: string, heard: string): PredictionOption => ({ id, text, fact: { heard } })

export const tabOrder: WebPracticeTask = {
  id: 'web-practice-tab-order',
  track: 'web',
  kind: 'practice',
  practises: 'web-30-focus-lost',
  title: 'Where does Tab go?',
  difficulty: 2,
  minutes: 1,
  task: 'Lena opens the page and presses Tab four times. Put the four stops in order.',
  prediction: {
    questions: [{
      id: 'order',
      form: 'order',
      prompt: 'In page order: a Skip to the menu link, a search field with `tabindex="2"`, a Newsletter button with `tabindex="1"`, the menu\'s heading with `tabindex="-1"`, Add croissant, and a disabled Order later. Put Lena\'s four Tab stops in order.',
      options: [
        focusLine('skip', 'Skip to the menu', 'focus: Skip to the menu, link'),
        focusLine('search', 'Search the menu', 'focus: Search the menu, searchbox'),
        focusLine('newsletter', 'Newsletter', 'focus: Newsletter, button'),
        focusLine('add', 'Add croissant', 'focus: Add croissant, button')
      ],
      answer: ['newsletter', 'search', 'skip', 'add'],
      rule: 'Tab visits positive tabindex values first, smallest first, then the rest in page order; tabindex="-1" and disabled controls get no Tab stop.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'index.html',
    web: a11ySpec([{ keyboard: 'Tab', times: 4 }]),
    probes: []
  },
  setup: () => ({
    files: a11ySite({
      title: 'Tab order',
      main: [
        '<p><a id="skip" href="#menu">Skip to the menu</a></p>',
        '<p><input id="search" type="search" tabindex="2" aria-label="Search the menu"></p>',
        '<p><button id="newsletter" class="action" type="button" tabindex="1">Newsletter</button></p>',
        '<section class="box" aria-labelledby="menu">',
        '  <h2 id="menu" tabindex="-1">Today\'s menu</h2>',
        '  <p><button id="add" class="action" type="button">Add croissant</button> <button class="action" type="button" disabled>Order later</button></p>',
        '</section>'
      ]
    }, '', { 'app.js': NO_CODE }),
    observed: null,
    picked: null
  }),
  goals: [predictedGoal('Put the stops in order', 1)],
  hints: ['A positive tabindex jumps the queue (the smallest first), everything else follows the page; -1 means "focusable by script, never by Tab".'],
  why: 'Positive tabindex values first, then page order: which is why a positive tabindex scrambles a page.',
  solution: [{ predict: ['newsletter', 'search', 'skip', 'add'] }]
}
