// Steer the assistant's practice tasks (ADR 0008, chapter 7): one small pull request with one problem, two rounds.
// Write the one comment that gets the right fix, Request changes, then read Sous's commit and approve it. A misleading
// kind gets Sous's plausible wrong fix in round 2, the last one: Reset and steer again. Each one trains its scenario's
// kind: a bug (not a missing test), a test that checks nothing (not a bug), an invented API (not a bug), a hole (not a
// bug), an extra (not a bug).
import { steerPractice } from '../steer'
import type { ReviewPracticeTask } from '../types'

const TASK = 'Steer Sous to the right fix with one review: comment, Request changes, then approve its commit.'

// 7.1: `total > FREE_FROM` charges an order of exactly 20 €. A bug gets `>=`; a missing test gets a test that pins the
// mistake (an order of 20 € pays delivery).
const DELIVERY_BASE = `// Delivery costs 3.50 € on every order.
export function deliveryFee(total) {
  return 3.5
}
`
const DELIVERY_HEAD = `// Delivery: free from 20 €, else 3.50 € (Maya).
export const FREE_FROM = 20

export function deliveryFee(total) {
  return total > FREE_FROM ? 0 : 3.5
}
`
const PINNING_TEST = `import { deliveryFee } from './delivery.js'

test('an order of 20 € pays delivery', () => {
  expect(deliveryFee(20)).toBe(3.5)
})
`

export const fixedNotPinned: ReviewPracticeTask = steerPractice({
  id: 'ai-practice-fixed-not-pinned',
  track: 'ai',
  kind: 'practice',
  practises: 'ai-31-what-offices-save',
  title: 'Fixed, not pinned',
  difficulty: 1,
  minutes: 1,
  task: TASK,
  pr: {
    number: 116,
    title: 'Free delivery from 20 €',
    branch: 'sous/free-delivery',
    description: ['Orders from 20 € deliver free, as Maya asked.'],
    claims: ['Free delivery from 20 €', 'Smaller orders still pay 3.50 €'],
    base: { 'delivery.js': DELIVERY_BASE },
    head: { 'delivery.js': DELIVERY_HEAD }
  },
  steer: {
    rounds: 2,
    start: ['twenty-pays'],
    problems: [
      {
        id: 'twenty-pays',
        at: { path: 'delivery.js', text: 'total > FREE_FROM' },
        says: [0],
        breaks: [0],
        categories: ['bug', 'false-claim'],
        title: '`total > FREE_FROM`: an order of exactly 20 € pays delivery',
        explanation: '“From 20 €” includes 20 €, so the check is `>=`.',
        fix: { edits: [{ path: 'delivery.js', replace: ['total > FREE_FROM', 'total >= FREE_FROM'] }], reply: 'From 20 € includes 20 €: it\'s `>=` now.' },
        misread: [{
          as: ['missing-test'],
          edits: [{ path: 'delivery.test.js', replace: ['', PINNING_TEST] }],
          becomes: ['twenty-pays', 'pinned'],
          reply: 'Added a test for the edge: an order of 20 € and its delivery fee. It passes.'
        }]
      },
      {
        id: 'pinned',
        at: { path: 'delivery.test.js', text: 'expect(deliveryFee(20)).toBe(3.5)' },
        categories: ['missing-test'],
        title: 'the new test pins the mistake: it expects an order of 20 € to pay delivery',
        explanation: 'A test written from what the code does checks the bug, not what Maya asked for. It should expect 0.',
        fix: { edits: [{ path: 'delivery.test.js', replace: ['test(\'an order of 20 € pays delivery\'', 'test(\'an order of 20 € delivers free\''] }, { path: 'delivery.test.js', replace: ['toBe(3.5)', 'toBe(0)'] }], reply: 'The test expects free delivery at 20 € now.' }
      }
    ],
    tempting: [{ id: 'small-claim', at: { claim: 1 }, why: 'they do: under 20 € the fee is 3.50 €.' }]
  },
  hints: ['`total > FREE_FROM` charges an order of exactly 20 €: the code does the wrong thing, a bug. A missing-test comment gets you a test of what the code does now.'],
  why: 'A bug comment asks for the code to change; a missing-test comment asks for a test, and Sous writes one that agrees with the code, mistake and all.',
  solution: [
    { comment: 'delivery.js', lines: [5, 5], category: 'bug', text: 'From 20 € includes 20 €: this needs >=.' },
    { submit: 'request-changes' },
    { submit: 'approve' }
  ]
})

// 7.2: a test of formatPrice with `toBeTruthy()`, which any text passes. A missing test gets `toBe('2.40')`; a bug
// gets formatPrice changed (it was right): it rounds first and loses the zero.
const MONEY_TEST = `// Tests for money.js.
import { formatPrice } from './money.js'

test('prices show two decimals', () => {
  expect(formatPrice(2.4)).toBeTruthy()
})
`
const MONEY = `// Turns amounts into text for the page. Amounts are euros as plain numbers (2.4 is 2.40).
export function formatPrice(amount) {
  return amount.toFixed(2)
}
`

export const aRealCheck: ReviewPracticeTask = steerPractice({
  id: 'ai-practice-a-real-check',
  track: 'ai',
  kind: 'practice',
  practises: 'ai-32-afternoon-deal',
  title: 'A real check',
  difficulty: 1,
  minutes: 1,
  task: TASK,
  pr: {
    number: 117,
    title: 'Test formatPrice',
    branch: 'sous/test-format-price',
    description: ['Adds a test for `formatPrice`, which had none.'],
    claims: ['Checks that 2.4 shows as 2.40', 'Only adds a test: no code changes'],
    base: { 'money.js': MONEY },
    head: { 'money.js': MONEY, 'money.test.js': MONEY_TEST }
  },
  steer: {
    rounds: 2,
    start: ['truthy'],
    problems: [
      {
        id: 'truthy',
        at: { path: 'money.test.js', text: 'toBeTruthy()' },
        breaks: [0],
        categories: ['missing-test', 'false-claim'],
        title: '`toBeTruthy()` passes for any text: the test doesn\'t check two decimals',
        explanation: '"2.4", "2.40" and "NaN" are all truthy. The test needs the text itself: `toBe(\'2.40\')`.',
        fix: { edits: [{ path: 'money.test.js', replace: ['toBeTruthy()', 'toBe(\'2.40\')'] }], reply: 'The test checks the text itself now: `toBe(\'2.40\')`.' },
        misread: [{
          as: ['bug'],
          edits: [{ path: 'money.js', replace: ['  return amount.toFixed(2)', '  return String(Math.round(amount * 100) / 100)'] }],
          becomes: ['truthy', 'lost-zero'],
          reply: 'Fixed `formatPrice`: it rounds to the cent before it turns the amount into text.'
        }]
      },
      {
        id: 'lost-zero',
        at: { path: 'money.js', text: 'String(Math.round(amount * 100) / 100)' },
        breaks: [1],
        categories: ['bug', 'false-claim'],
        title: '`formatPrice` lost its second decimal: 2.4 shows as 2.4',
        explanation: '`toFixed(2)` was right; `String` of a rounded number drops the trailing zero.',
        fix: { edits: [{ path: 'money.js', replace: ['String(Math.round(amount * 100) / 100)', 'amount.toFixed(2)'] }], reply: 'Put `toFixed(2)` back.' }
      }
    ],
    tempting: [{ id: 'only-test', at: { claim: 1 }, why: 'it does: only money.test.js is new.' }]
  },
  hints: ['`toBeTruthy()` passes for any text: the code is right and the test checks nothing that matters, a missing test. A bug comment sends Sous to change code that works.'],
  why: 'What is wrong is the test, not the code: a missing-test comment asks for a check that would fail on a wrong price.',
  solution: [
    { comment: 'money.test.js', lines: [5, 5], category: 'missing-test', text: 'Any text is truthy: check toBe(\'2.40\').' },
    { submit: 'request-changes' },
    { submit: 'approve' }
  ]
})

// 7.3: `cart.lines.sumBy(…)` doesn't exist. An invented API gets `reduce`; a bug gets an optional call with a fallback,
// so the counter always says 0.
const COUNT_BASE = `// The counter in the header: how many items are in the basket.
import { cart } from './cart.js'

export function itemCount() {
  return cart.lines.length
}
`
const SUM_BY = 'cart.lines.sumBy(line => line.quantity)'
const OPTIONAL = 'cart.lines.sumBy?.(line => line.quantity) ?? 0'
const REDUCE = 'cart.lines.reduce((sum, line) => sum + line.quantity, 0)'

export const notAFallback: ReviewPracticeTask = steerPractice({
  id: 'ai-practice-not-a-fallback',
  track: 'ai',
  kind: 'practice',
  practises: 'ai-33-undo-last-add',
  title: 'Not a fallback',
  difficulty: 1,
  minutes: 1,
  task: TASK,
  pr: {
    number: 118,
    title: 'Count items, not lines',
    branch: 'sous/count-items',
    description: ['The counter showed 1 for three croissants. It adds up the quantities now.'],
    claims: ['Three croissants show as 3', 'Only count.js changes'],
    base: { 'count.js': COUNT_BASE },
    head: { 'count.js': COUNT_BASE.replace('cart.lines.length', SUM_BY) }
  },
  steer: {
    rounds: 2,
    start: ['sum-by'],
    problems: [
      {
        id: 'sum-by',
        at: { path: 'count.js', text: SUM_BY },
        says: [0],
        breaks: [0],
        categories: ['invented-api', 'false-claim'],
        title: 'arrays have no `sumBy`: the counter throws',
        explanation: '`sumBy` is lodash\'s, not an array method: `cart.lines.sumBy is not a function`. Adding up is `reduce`.',
        fix: { edits: [{ path: 'count.js', replace: [SUM_BY, REDUCE] }], reply: 'Arrays have no `sumBy`: it adds up with `reduce` now.' },
        misread: [{
          as: ['bug'],
          edits: [{ path: 'count.js', replace: [SUM_BY, OPTIONAL] }],
          becomes: ['always-zero'],
          reply: 'Fixed the error: `sumBy` is called only when it is there, else the count is 0.'
        }]
      },
      {
        id: 'always-zero',
        at: { path: 'count.js', text: OPTIONAL },
        says: [0],
        breaks: [0],
        categories: ['invented-api', 'bug', 'false-claim'],
        title: '`sumBy` is still not there, so the counter always says 0',
        explanation: 'The optional call never runs, and the fallback hides it: no error, and a wrong count. Adding up is `reduce`.',
        fix: { edits: [{ path: 'count.js', replace: [OPTIONAL, REDUCE] }], reply: 'Used `reduce`, which arrays have.' }
      }
    ],
    tempting: [{ id: 'one-file', at: { claim: 1 }, why: 'it does: count.js is the only file in the diff.' }]
  },
  hints: ['Arrays have no `sumBy`: that is an invented API, fixed by the real one. A bug comment gets the error out of sight, and the count stays wrong.'],
  why: 'Naming an invented API sends Sous to the real one; naming a bug sends it after the error, which it can hide.',
  solution: [
    { comment: 'count.js', lines: [5, 5], category: 'invented-api', text: 'Arrays have no sumBy: use reduce.' },
    { submit: 'request-changes' },
    { submit: 'approve' }
  ]
})

// 7.4: the customer's note put in with `innerHTML`. Security gets `textContent`; a bug gets a filter for `<script>`,
// which an `img` with `onerror` walks past.
const NOTE_BASE = `// Shows the customer's pickup note back to them, as the server stored it.
export function showNote(order) {
  document.querySelector('#note').textContent = order.note
}
`
const AS_HTML = 'document.querySelector(\'#note\').innerHTML = order.note.replaceAll(\'\\n\', \'<br>\')'
const FILTERED = 'document.querySelector(\'#note\').innerHTML = order.note.replace(/<script[\\s\\S]*?<\\/script>/gi, \'\').replaceAll(\'\\n\', \'<br>\')'
const AS_TEXT = 'const note = document.querySelector(\'#note\')\n  note.textContent = order.note\n  note.style.whiteSpace = \'pre-line\''

export const notAFilter: ReviewPracticeTask = steerPractice({
  id: 'ai-practice-not-a-filter',
  track: 'ai',
  kind: 'practice',
  practises: 'ai-34-order-by-email',
  title: 'Not a filter',
  difficulty: 2,
  minutes: 1,
  task: TASK,
  pr: {
    number: 119,
    title: 'Keep the line breaks in the note',
    branch: 'sous/note-line-breaks',
    description: ['A note like “Sliced, please” and “No seeds” on two lines showed as one. Line breaks show now.'],
    claims: ['Line breaks in the note show as line breaks', 'Safe: the note is only the customer\'s own text'],
    base: { 'note.js': NOTE_BASE },
    head: { 'note.js': NOTE_BASE.replace('// Shows the customer\'s pickup note back to them, as the server stored it.', '// Shows the customer\'s pickup note back to them, as the server stored it, line breaks and all.').replace('document.querySelector(\'#note\').textContent = order.note', AS_HTML) }
  },
  steer: {
    rounds: 2,
    start: ['note-html'],
    problems: [
      {
        id: 'note-html',
        at: { path: 'note.js', text: AS_HTML },
        breaks: [1],
        categories: ['security', 'false-claim'],
        title: 'the note goes in as HTML: whatever a customer types runs on the page',
        explanation: 'Text from outside put in with `innerHTML` is markup: an `img` with an `onerror` runs its script. Line breaks don\'t need HTML: `textContent` and `white-space: pre-line`.',
        fix: { edits: [{ path: 'note.js', replace: [AS_HTML, AS_TEXT] }], reply: 'The note goes in as text now, and `white-space: pre-line` keeps its line breaks.' },
        misread: [{
          as: ['bug'],
          edits: [{ path: 'note.js', replace: [AS_HTML, FILTERED] }],
          becomes: ['filtered'],
          reply: 'Fixed: script tags are taken out of the note before it is shown.'
        }]
      },
      {
        id: 'filtered',
        at: { path: 'note.js', text: FILTERED },
        breaks: [1],
        categories: ['security', 'false-claim'],
        title: 'a filter for `script` tags: an `img` with `onerror` still runs',
        explanation: 'A list of what to take out always misses something: markup runs from attributes too. The note has to go in as text.',
        fix: { edits: [{ path: 'note.js', replace: [FILTERED, AS_TEXT] }], reply: 'Dropped the filter: the note goes in as text, with `white-space: pre-line` for the line breaks.' }
      }
    ],
    tempting: [{ id: 'breaks-claim', at: { claim: 0 }, why: 'they do: every line break becomes a `br`.' }]
  },
  hints: ['A customer\'s note put in with `innerHTML` is something someone could misuse: security. Called a bug, Sous filters out what it thinks of, and the rest gets through.'],
  why: 'A hole is fixed by putting the text in as text; a bug comment gets a filter, and a filter always misses something.',
  solution: [
    { comment: 'note.js', lines: [3, 3], category: 'security', text: 'The note is the customer\'s text: as HTML it can run script. Use textContent and pre-line.' },
    { submit: 'request-changes' },
    { submit: 'approve' }
  ]
})

// 7.5: a typo fix with the menu sorted on the side. Scope gets the sort taken out; a bug gets the sort "fixed" with
// `localeCompare`, and kept.
const PRODUCTS_BASE = `// Today's products. Maya updates this list every evening; prices are in euros.
export const products = [
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: 2.8 },
  { id: 'sourdough', name: 'Sourdogh loaf', price: 6.5 }
]
`
const SORTED = '].sort((a, b) => a.name < b.name ? -1 : 1)'
const LOCALE_SORTED = '].sort((a, b) => a.name.localeCompare(b.name))'

export const takeItOut: ReviewPracticeTask = steerPractice({
  id: 'ai-practice-take-it-out',
  track: 'ai',
  kind: 'practice',
  practises: 'ai-35-raise-free-delivery',
  title: 'Take it out',
  difficulty: 1,
  minutes: 1,
  task: TASK,
  pr: {
    number: 120,
    title: 'Fix the typo in Sourdough',
    branch: 'sous/sourdough-typo',
    description: ['Fixes “Sourdogh” in the menu.'],
    claims: ['Sourdough is spelled right', 'The menu keeps Maya\'s order'],
    base: { 'products.js': PRODUCTS_BASE },
    head: { 'products.js': PRODUCTS_BASE.replace('Sourdogh', 'Sourdough').replace(/\]\n$/, `${SORTED}\n`) }
  },
  steer: {
    rounds: 2,
    start: ['sorted'],
    problems: [
      {
        id: 'sorted',
        at: { path: 'products.js', text: SORTED },
        breaks: [1],
        categories: ['scope', 'false-claim'],
        title: 'the menu is sorted by name: nobody asked, and Maya\'s order is gone',
        explanation: 'Maya lists the products in the order she bakes them. A typo fix shouldn\'t change the order: the sort comes out.',
        fix: { edits: [{ path: 'products.js', replace: [SORTED, ']'] }], reply: 'Took the sort out: the menu keeps Maya\'s order.' },
        misread: [{
          as: ['bug'],
          edits: [{ path: 'products.js', replace: [SORTED, LOCALE_SORTED] }],
          becomes: ['sorted-kept'],
          reply: 'Fixed the sort: it uses `localeCompare` now, so names sort properly.'
        }]
      },
      {
        id: 'sorted-kept',
        at: { path: 'products.js', text: LOCALE_SORTED },
        breaks: [1],
        categories: ['scope', 'false-claim'],
        title: 'the sort is better, and still there: nobody asked for it',
        explanation: 'The problem was never how the menu is sorted, but that it is. The sort comes out.',
        fix: { edits: [{ path: 'products.js', replace: [LOCALE_SORTED, ']'] }], reply: 'Took the sort out altogether.' }
      }
    ],
    tempting: [
      { id: 'typo', at: { path: 'products.js', text: 'name: \'Sourdough loaf\'' }, why: 'that is the fix that was asked for.' },
      { id: 'spelled', at: { claim: 0 }, why: 'it is: “Sourdough loaf”.' }
    ]
  },
  hints: ['The sort is more than was asked: scope, which comes out. A bug comment on it asks Sous to sort better, and it stays.'],
  why: 'Scope asks for the extra to come out; a bug comment asks for it to be repaired, and it stays.',
  solution: [
    { comment: 'products.js', lines: [6, 6], category: 'scope', text: 'Nobody asked for a sort: keep Maya\'s order.' },
    { submit: 'request-changes' },
    { submit: 'approve' }
  ]
})
