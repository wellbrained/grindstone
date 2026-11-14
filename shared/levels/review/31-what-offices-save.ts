// Steer the assistant 7.1: offices get 10 % off from 10 items, and Maya wants them to see what they save. Sous's line
// puts `String(full - total)` on the page: 24.00 − 21.60 is 2.3999999999999986 in floating point. Named a bug, Sous
// formats it like the total. Named security, Sous escapes the number (careful-looking, still unrounded); named
// unclear, it explains the line in a comment. `total === full` looks risky and is exact (no discount gives the total
// back unchanged): flag it and Sous "fixes" it to `total < full`, which hides the saving exactly when there is one.
import { SUMMARY } from '../debugging/bakery'
import { ORDER_PAGE, SUMMARY_APP, shopFiles, withEdits } from './shop'
import { steerScenario } from './steer'
import type { PullRequest } from './types'

const SUMMARY_JS = `// The basket summary: the total under the products.
import { basketTotal, itemCount } from './cart.js'
import { discountedTotal } from './discount.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

export function renderSummary() {
  const total = discountedTotal(basketTotal(), itemCount())
  totalText.textContent = formatPrice(total)
}
`

const DISCOUNT = `// Discounts on the whole basket. Prices are euros.
// Office orders: from 10 items, 10 % off the whole basket, rounded to the cent (Maya).
export const BULK_FROM = 10
export const BULK_DISCOUNT = 10 // percent

export function discountedTotal(total, count) {
  if (count < BULK_FROM) return total
  return Math.round(total * (1 - BULK_DISCOUNT / 100) * 100) / 100
}
`

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'discount.js': DISCOUNT }, { main: SUMMARY })

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['<p>Total <strong id="order-total"></strong> €</p>\n', '<p>Total <strong id="order-total"></strong> €</p>\n      <p class="note" id="saving" hidden>Offices save <strong id="saved"></strong> €</p>\n']
  },
  {
    path: 'summary.js',
    replace: [SUMMARY_JS, `// The basket summary: the total under the products, and what the office discount saves.
import { basketTotal, itemCount } from './cart.js'
import { discountedTotal } from './discount.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')
const savingLine = document.querySelector('#saving')
const savedText = document.querySelector('#saved')

export function renderSummary() {
  const full = basketTotal()
  const total = discountedTotal(full, itemCount())
  totalText.textContent = formatPrice(total)
  savingLine.hidden = total === full
  savedText.textContent = String(full - total)
}
`]
  }
])

const pr: PullRequest = {
  number: 111,
  title: 'Show offices what they save',
  branch: 'sous/office-saving',
  description: [
    'Offices see what the 10 % discount saves them, in a line under the total. Only `summary.js` and the page change.'
  ],
  claims: [
    'The line hides itself on orders without the discount',
    'The total works as before'
  ],
  base,
  head
}

const SAVED_LINE = '  savedText.textContent = String(full - total)\n'
const ESCAPE = `

// text that goes into the page, escaped first
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => \`&#\${char.charCodeAt(0)};\`)
}
`
const FORMATTED = { path: 'summary.js', replace: ['String(full - total)', 'formatPrice(full - total)'] } as const

export const whatOfficesSave = steerScenario({
  id: 'ai-31-what-offices-save',
  track: 'ai',
  kind: 'scenario',
  title: 'What offices save',
  difficulty: 1,
  minutes: 5,
  teaches: 'bug, not security',
  story: [
    'Offices get 10 % off from 10 items, and Maya wants them to see it: “Under the total, show what they save, in euros like the total.” She asked Sous.',
    'This time you don\'t only review: you steer. When you request changes, Sous answers with a new commit that does what your comments say, and only that, by their lines and their kind. Then you review again, until it\'s right and you approve it (by round 3).'
  ].join('\n\n'),
  pr,
  steer: {
    rounds: 3,
    start: ['raw-saving'],
    problems: [
      {
        id: 'raw-saving',
        at: { path: 'summary.js', text: 'String(full - total)' },
        categories: ['bug'],
        title: '`String(full - total)` shows the saving unrounded: 2.3999999999999986 €',
        explanation: '24.00 − 21.60 is 2.3999999999999986 in floating point, and `String` writes it out as it is. The total goes through `formatPrice`; the saving needs it too.',
        fix: { edits: [FORMATTED], reply: 'Good catch: the saving goes through `formatPrice` now, like the total, so ten croissants save 2.40 €.' },
        misread: [
          {
            as: ['security'],
            edits: [{ path: 'summary.js', replace: [`${SAVED_LINE}}\n`, `  savedText.textContent = escapeHtml(String(full - total))\n}${ESCAPE}`] }],
            becomes: ['escaped-saving'],
            reply: 'You\'re right to be careful with what goes into the page: the saving is escaped now (`escapeHtml`) before it is shown.'
          },
          {
            as: ['unclear'],
            edits: [{ path: 'summary.js', replace: [SAVED_LINE, `  // what the office discount saves: the full price minus the discounted total, in euros\n${SAVED_LINE}`] }],
            becomes: ['explained-saving'],
            reply: 'I added a comment that says what the line works out.'
          }
        ]
      },
      {
        id: 'escaped-saving',
        at: { path: 'summary.js', text: 'escapeHtml(String(full - total))' },
        also: [{ path: 'summary.js', text: ESCAPE.slice(2, -1) }],
        categories: ['bug', 'scope'],
        title: 'the saving is escaped, and still unrounded: 2.3999999999999986 €',
        explanation: 'A number has nothing to escape, and `textContent` never reads HTML anyway: `escapeHtml` changes nothing but the size of the diff. The saving still needs `formatPrice`.',
        fix: {
          edits: [{ path: 'summary.js', replace: ['escapeHtml(String(full - total))', 'formatPrice(full - total)'] }, { path: 'summary.js', replace: [ESCAPE.slice(0, -1), ''] }],
          reply: 'Escaping wasn\'t it, sorry: the saving goes through `formatPrice` now, and `escapeHtml` is gone again.'
        }
      },
      {
        id: 'explained-saving',
        at: { path: 'summary.js', text: 'String(full - total)' },
        categories: ['bug'],
        title: 'the saving is explained in a comment, and still unrounded: 2.3999999999999986 €',
        explanation: 'The comment is right about what the line works out; the line still writes the number out unrounded. It needs `formatPrice`.',
        fix: { edits: [FORMATTED], reply: 'Got it, it was the number, not the line: it goes through `formatPrice` now.' }
      },
      {
        id: 'inverted-saving',
        at: { path: 'summary.js', text: 'savingLine.hidden = total < full' },
        says: [0],
        breaks: [0],
        categories: ['bug', 'false-claim'],
        title: '`total < full` hides the saving exactly when there is one',
        explanation: 'With the discount the total is less than the full price, so the line hides; without it, it shows “Offices save 0.00 €”. `total === full` was right.',
        fix: { edits: [{ path: 'summary.js', replace: ['savingLine.hidden = total < full', 'savingLine.hidden = total === full'] }], reply: 'Put `total === full` back: the line shows when there is a saving again.' }
      }
    ],
    tempting: [
      {
        id: 'exact-check',
        at: { path: 'summary.js', text: 'savingLine.hidden = total === full' },
        why: '`discountedTotal` gives the very same number back when there is no discount, so `===` is exact here: the line hides for orders under 10 items.',
        overreach: {
          edits: [{ path: 'summary.js', replace: ['savingLine.hidden = total === full', 'savingLine.hidden = total < full'] }],
          becomes: ['inverted-saving'],
          reply: 'Comparing money with `===` is risky, so the line checks `total < full` now.'
        }
      },
      { id: 'hides-claim', at: { claim: 0 }, why: 'it does: without the discount `discountedTotal` gives the total back unchanged, so `total === full` hides the line.' }
    ]
  },
  run: { page: ORDER_PAGE, open: 'summary.js' },
  hints: [
    'In this chapter Sous fixes what your comment\'s kind says. Run the PR, add ten croissants and read the saving: what kind of problem is that?',
    '`String(full - total)` writes the number out as JavaScript works it out, 2.3999999999999986: the code does the wrong thing, a bug. Nothing comes from outside the shop (so not security), and explaining the line wouldn\'t round it (so not unclear).',
    'Comment on `summary.js:15` as a bug, Request changes, then read Sous\'s commit: once the saving goes through `formatPrice`, Approve.'
  ],
  debrief: {
    title: 'Sous does what your comment says it is',
    paragraphs: [
      '`String(full - total)` shows the number as JavaScript has it: 24.00 − 21.60 is 2.3999999999999986 in floating point. The fix is the one the total already uses, `formatPrice`, and a bug comment on that line asks for exactly that: the code does the wrong thing, make it do the right one.',
      'The kind you pick is the instruction. Call it security and Sous escapes the number: careful-looking, more code, and the saving still reads 2.3999999999999986 €. Call it unclear and Sous explains the line in a comment: clearer, still wrong. Flag `total === full`, which is right, and Sous “fixes” it to `total < full`, which hides the saving exactly when there is one. Each answer is plausible; only one is the fix.',
      'How to steer: say what kind of problem it is, on the line that has it. Then read the commit like a new pull request, and run it again: did it change what you asked, and only that? Approve only what you would have approved in round 1.'
    ]
  },
  solution: [
    { comment: 'summary.js', lines: [15, 15], category: 'bug', text: 'This shows 2.3999999999999986 € for ten croissants: format it with formatPrice like the total.' },
    { submit: 'request-changes', summary: 'The saving needs formatPrice.' },
    { submit: 'approve', summary: 'The saving reads 2.40 € now.' }
  ]
})
