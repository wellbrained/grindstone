// Accessibility 6.4: the error nobody hears. The receipt page checks the email address before it sends the receipt.
// When it has no domain, Jonas's code adds a red line under the field. Tomás types `tomas@`, presses Enter on Send
// receipt, and hears nothing: the new line is in no live region, and focus didn't move. Learn: a screen reader hears a
// change only in a live region that was on the page (and shown) before the change (aria-live, role="status", role="alert"),
// or when focus moves to it; a region added or made live together with its text is silent (Chrome's one exception: a
// role="alert" that appears).
import { probesGoal } from '../debugging/checks'
import { a11ySite, a11ySpec } from './accessibility'
import { predictedGoal } from './checks'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

export const EMAIL_ERROR = 'Enter a whole email address, like tomas@example.com'

/** The field's line in index.html (a fix adds the error's place after it). */
export const EMAIL_FIELD = '        <input id="email" type="email" autocomplete="email">\n'

/** Send receipt's listener as Jonas wrote it: a new error line each time (the fix fills one that is always there). */
export const SEND = `document.querySelector('#send').addEventListener('click', () => {
  document.querySelector('#email-error')?.remove()
  status.textContent = ''
  if (!looksLikeEmail(field.value.trim())) {
    const error = document.createElement('p')
    error.id = 'email-error'
    error.className = 'error'
    error.textContent = '${EMAIL_ERROR}'
    field.after(error)
    return
  }
  status.textContent = \`Your receipt goes to \${field.value.trim()}.\`
})
`

/** The same listener filling an error line that was on the page from the start. */
export const SEND_INTO = `const error = document.querySelector('#email-error')

document.querySelector('#send').addEventListener('click', () => {
  error.textContent = ''
  status.textContent = ''
  if (!looksLikeEmail(field.value.trim())) {
    error.textContent = '${EMAIL_ERROR}'
    return
  }
  status.textContent = \`Your receipt goes to \${field.value.trim()}.\`
})
`

const APP = `// The receipt (Jonas): an email address, checked before the receipt goes out.
const field = document.querySelector('#email')
const status = document.querySelector('#status')

/** Something before an @, and a dot after it. */
function looksLikeEmail(text) {
  return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(text)
}

${SEND}`

const MAIN = [
  '<section class="box" aria-labelledby="receipt-heading">',
  '  <h2 id="receipt-heading">Your receipt</h2>',
  '  <p>Order 1043 · 2 Butter croissants · 4.80 €</p>',
  '  <div class="field">',
  '    <label for="email">Email for your receipt</label>',
  '    <input id="email" type="email" autocomplete="email">',
  '  </div>',
  '  <button id="send" class="action" type="button">Send receipt</button>',
  '  <p id="status" class="status"></p>',
  '</section>'
]

const CSS = `
.field {
  display: grid;
  gap: 4px;
  margin: 10px 0;
}

.field input {
  max-width: 320px;
  border: 1px solid #c9b8a3;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}

.error {
  margin: 0;
  color: #a1260d;
  font-size: 13px;
  font-weight: 600;
}
`

export const silentError: WebScenario = {
  id: 'web-29-silent-error',
  track: 'web',
  kind: 'scenario',
  title: 'The error nobody hears',
  difficulty: 2,
  minutes: 7,
  teaches: 'live region',
  story: [
    'After his order, Tomás asks for the receipt by email. He types `tomas@`, tabs to Send receipt and presses Enter. Jonas\'s check finds no domain and puts a red line under the field. Tomás waits, hears nothing, presses Enter again, and still nothing: as far as he can tell, the receipt is on its way.',
    'Predict what his reader says. Then fix the page so Tomás hears what is wrong when the address is, while it still shows under the field and a whole address still goes through. Save, then Reload: the Accessibility panel\'s reader shows what was said, and what made it speak.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'hears',
      form: 'one',
      prompt: 'Tomás types `tomas@`, tabs to Send receipt and presses Enter. The red line “Enter a whole email address…” appears under the field (a new `<p>`, focus stays on the button). What does his screen reader say?',
      options: [
        { id: 'polite', text: 'The error, once he stops: a new line of text is read out.', fact: { heard: `polite: ${EMAIL_ERROR}` } },
        { id: 'alert', text: 'The error at once: red text is read like an alert.', fact: { heard: `assertive: ${EMAIL_ERROR}` } },
        { id: 'nothing', text: 'Nothing: the line is in no live region, and focus didn\'t move to it.' },
        { id: 'field', text: 'It goes back to the field and reads it with the error.', fact: { heard: `focus: Email for your receipt, textbox, tomas@, ${EMAIL_ERROR}` } }
      ],
      answer: 'nothing',
      rule: 'A reader hears a change only in a live region that was on the page before it (aria-live, role="status", role="alert"), or where focus goes; new text anywhere else is silent.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([{ type: '#email', value: 'tomas@' }, { tabTo: '#send' }, { keyboard: 'Enter' }]),
    probes: [
      // his first Enter (the scene's) was heard, not only a later one; typing or a re-check while he types doesn't count
      { id: 'first', steps: [{ heard: 'Enter a whole email address', after: 'Enter', scene: true }] },
      // Tomás tries again: he hears it after this Enter too, and it shows under the field
      { id: 'wrong', steps: [{ type: '#email', value: 'tomas@' }, { tabTo: '#send' }, { keyboard: 'Enter' }, { heard: 'Enter a whole email address', after: 'Enter' }] },
      { id: 'shown', steps: [{ visible: '#email-error' }] },
      { id: 'says', steps: [{ text: '#email-error' }] },
      // a whole address goes through, and no error is said
      { id: 'right', steps: [{ type: '#email', value: 'tomas@example.com' }, { focusOn: '#send' }, { keyboard: 'Enter' }, { heard: 'Enter a whole email address' }] },
      { id: 'sent', steps: [{ text: '#status' }] }
    ]
  },
  setup: () => ({
    files: a11ySite({ title: 'Receipt', main: MAIN }, CSS, { 'app.js': APP }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Tomás hears', 1),
    probesGoal('heard', 'Tomás hears the error, it still shows under the field, and a whole address still goes through without it', { first: { atLeast: 1 }, wrong: { atLeast: 1 }, shown: 'visible', says: EMAIL_ERROR, right: 0, sent: 'Your receipt goes to tomas@example.com.' }, { clean: true })
  ],
  hints: [
    'The Accessibility panel\'s reader says "Send receipt, button" and then nothing, though the tree has the new line. A screen reader doesn\'t watch the page for new text: what makes it speak?',
    'A live region speaks when its content changes: `role="alert"` (at once), `role="status"` or `aria-live="polite"` (when the reader is done). It has to be on the page before the change: one added with its text, or made live in the same moment, says nothing. Put an empty one where the error goes, and write the error into it.',
    'In `index.html`, after line 22 add `<p id="email-error" class="error" role="alert"></p>`; in `app.js` fill that one instead of making a new one: `error.textContent = \'\'` first, then the error text when the address is wrong. Save, then Reload.'
  ],
  debrief: {
    title: 'Live regions are there first',
    paragraphs: [
      'A screen reader reads where focus is, and what it is asked to read; it doesn\'t watch the page. Jonas\'s red line appeared away from focus, in no live region, so Tomás heard nothing. A live region is the page asking: `role="alert"` (or `aria-live="assertive"`) interrupts, `role="status"` (or `aria-live="polite"`) waits until the reader is done.',
      'The region has to exist, live and shown, before its text changes: the browser announces changes to a region it already knows, so a region added together with its text, or `aria-live` set in the same moment as the text, says nothing (Chrome makes one exception: a `role="alert"` that appears is read, but don\'t count on that everywhere). Keep an empty region in the markup and write into it; clearing it first lets the same message be said again.',
      'Moving focus is the other way: put focus on the field, with `aria-invalid="true"` and `aria-describedby` pointing at the error, and the reader reads the field, "invalid" and the error. Use it when the person has to act there; a live region when they only need to know.'
    ]
  },
  solution: [
    { predict: 'nothing' },
    { save: 'index.html', replace: [EMAIL_FIELD, `${EMAIL_FIELD}        <p id="email-error" class="error" role="alert"></p>\n`] },
    { save: 'app.js', replace: [SEND, SEND_INTO] },
    'reload'
  ]
}
