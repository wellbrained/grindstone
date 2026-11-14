// Small review levels for the environment's tests: a pull request with three planted issues in two files (two on added
// lines, one on removed lines) and a tempting spot, and a verdict task whose pull request is fine.
import { reviewGoals } from '../../../../shared/levels/review/checks'
import { steerScenario } from '../../../../shared/levels/review/steer'
import type { ReviewPracticeTask, ReviewScenario } from '../../../../shared/levels/review/types'

const BASE_CART = [
  '// the basket',
  'export const cart = { lines: [] }',
  '',
  'export function addToCart(product) {',
  '  if (cart.lines.length >= 20) return',
  '  cart.lines.push(product)',
  '}',
  '',
  'export function count() {',
  '  return cart.lines.length',
  '}',
  ''
].join('\n')

const HEAD_CART = [
  '// the basket',
  'export const cart = { lines: [] }',
  'export const MAX = 12',
  '',
  'export function addToCart(product) {',
  '  if (cart.lines.length >= MAX) return',
  '  cart.lines.push(product)',
  '}',
  '',
  'export function canAdd() {',
  '  return cart.lines.length < MAX - 1',
  '}',
  ''
].join('\n')

const BASE_MONEY = 'export function formatPrice(amount) {\n  return amount.toFixed(2)\n}\n'
const HEAD_MONEY = 'export function formatPrice(amount) {\n  return amount.toFixed(1)\n}\n'

// cart.js rows: 0 same 1/1, 1 same 2/2, 2 add -/3 (MAX), 3 same 3/4, 4 same 4/5, 5 del 5/-, 6 add -/6 (>= MAX), 7 same 6/7,
// 8 same 7/8, 9 same 8/9, 10 del 9/- (count), 11 del 10/-, 12 add -/10 (canAdd), 13 add -/11 (MAX - 1), 14 same 11/12
// money.js rows: 0 same 1/1, 1 del 2/-, 2 add -/2 (toFixed(1)), 3 same 3/3

export const fixture: ReviewScenario = {
  id: 'ai-01-fixture',
  track: 'ai',
  kind: 'scenario',
  title: 'At most 12',
  difficulty: 1,
  minutes: 3,
  story: 'Anna asked Sous for a limit of 12 per basket.',
  teaches: 'off-by-one',
  pr: {
    number: 7,
    title: 'Limit the basket to 12',
    branch: 'sous/limit',
    description: ['Adds a limit of 12.'],
    claims: ['The basket holds at most 12 items.'],
    base: { 'cart.js': BASE_CART, 'money.js': BASE_MONEY },
    head: { 'cart.js': HEAD_CART, 'money.js': HEAD_MONEY }
  },
  issues: [
    { id: 'one-early', path: 'cart.js', lines: [11, 11], categories: ['bug', 'false-claim'], title: 'canAdd turns false at 11', explanation: 'One early.' },
    { id: 'count-gone', path: 'cart.js', removed: [9, 10], categories: ['bug', 'scope'], title: 'count() is gone', explanation: 'Its callers break.' },
    { id: 'one-decimal', path: 'money.js', lines: [2, 2], categories: ['bug'], title: 'prices with one decimal', explanation: '2.40 shows as 2.4.' }
  ],
  tempting: [{ path: 'cart.js', lines: [6, 6], why: 'At 12 the basket is full: `>=` stops the 13th.' }],
  verdict: 'request-changes',
  setup: () => ({ comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0 }),
  goals: reviewGoals({ issues: 3 }),
  hints: ['Count to 12.', 'Read `canAdd`.', 'Line 11 of cart.js stops at 11.'],
  debrief: { title: 'Off by one', paragraphs: ['`< MAX - 1` stops one early.'] },
  solution: [
    { comment: 'cart.js', lines: [11, 11], category: 'bug', text: 'Stops at 11.' },
    { comment: 'cart.js', removed: [9, 10], category: 'bug', text: 'count() is still used.' },
    { comment: 'money.js', lines: [2, 2], category: 'bug', text: 'Two decimals.' },
    { submit: 'request-changes' }
  ]
}

/** A verdict task whose pull request is fine: approve it, with a reason. */
export const fineFixture: ReviewPracticeTask = {
  id: 'ai-practice-fine-fixture',
  track: 'ai',
  kind: 'practice',
  practises: 'ai-01-fixture',
  title: 'Same loop, easier to read',
  difficulty: 1,
  minutes: 0.5,
  task: 'Approve it or request changes, with one line why.',
  pr: {
    number: 8,
    title: 'Tidy the loop',
    branch: 'sous/tidy',
    description: ['Same behaviour.'],
    claims: [],
    base: { 'loop.js': 'for (let i = 0; i <= items.length - 1; i++) total += items[i]\n' },
    head: { 'loop.js': 'for (let i = 0; i < items.length; i++) total += items[i]\n' }
  },
  issues: [],
  tempting: [{ path: 'loop.js', lines: [1, 1], why: 'Both stop at the last index.' }],
  verdict: 'approve',
  reason: true,
  setup: () => ({ comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0 }),
  goals: reviewGoals({ issues: 0, verdictTask: true }),
  hints: ['Which index does each loop end on?'],
  why: 'Both loops end on the last index.',
  solution: [{ submit: 'approve', summary: 'Same loop: both stop at the last item.' }]
}

// A pull request whose description makes claims (chapter 2, Claims vs. code). The description shows as numbered lines:
// the paragraphs (1, 2), then the claims (3 to 5). avg.js rows: 0 same 1/1, 1 del 2/-, 2 add -/2 (a comment), 3 add -/3
// (the division: NaN for an empty basket), 4 add -/4 (rounds to euros), 5 same 3/5.
const BASE_AVG = 'export function average(total, count) {\n  return 0\n}\n'
const HEAD_AVG = 'export function average(total, count) {\n  // an empty basket averages 0\n  const average = total / count\n  return Math.round(average)\n}\n'

export const claimFixture: ReviewScenario = {
  id: 'ai-02-claim-fixture',
  track: 'ai',
  kind: 'scenario',
  title: 'An average per item',
  difficulty: 1,
  minutes: 3,
  story: 'Jonas asked Sous for the average price per item.',
  teaches: 'empty case',
  pr: {
    number: 9,
    title: 'Show the average per item',
    branch: 'sous/average',
    description: ['Adds the average price per item.', 'Tested with an empty basket.'],
    claims: ['Shows the average under the total', 'Handles an empty basket', 'The total is unchanged'],
    base: { 'avg.js': BASE_AVG },
    head: { 'avg.js': HEAD_AVG }
  },
  issues: [
    { id: 'empty-nan', path: 'avg.js', lines: [3, 3], also: [{ path: 'description', lines: [4, 4] }], categories: ['false-claim'], title: '0 / 0 is NaN', explanation: 'An empty basket shows NaN.' },
    { id: 'whole-euros', path: 'avg.js', lines: [4, 4], categories: ['bug'], title: 'rounds to euros', explanation: '2.53 shows as 3.' }
  ],
  tempting: [{ path: 'description', lines: [5, 5], why: 'the total is worked out as before.' }],
  verdict: 'request-changes',
  setup: () => ({ comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0 }),
  goals: reviewGoals({ issues: 2 }),
  hints: ['Try an empty basket.', 'What is `0 / 0`?', 'The claim on line 4 of the description does not hold.'],
  debrief: { title: 'An empty basket', paragraphs: ['0 / 0 is NaN.'] },
  solution: [
    { comment: 'description', lines: [4, 4], category: 'false-claim', text: '0 / 0 is NaN.' },
    { comment: 'avg.js', lines: [4, 4], category: 'bug', text: 'Rounds to euros.' },
    { submit: 'request-changes' }
  ]
}

// A steer level (chapter 7): Sous's saving line shows `String(full - total)` (a bug: no rounding). A bug comment on it
// gets the right fix; a security comment makes Sous escape it instead (a new problem, `escaped`); an unclear one changes
// nothing. `total === full` looks risky and is fine: flag it and Sous "fixes" it to `total < full` (a new bug, `loose`).
// price.js rows (round 1): 0 same 1/1, 1 same 2/2, 2 del 3/-, 3 add -/3 (hidden), 4 add -/4 (text: the bug), 5 same 4/5,
// 6 same 5/6, 7 same 6/7.
const BASE_PRICE = [
  '// the saving under the total',
  'export function saving(full, total) {',
  '  return { hidden: true, text: \'\' }',
  '}',
  '',
  'export const LABEL = \'You save\'',
  'export const UNIT = \'€\'',
  ''
].join('\n')
const HEAD_PRICE = BASE_PRICE.replace('  return { hidden: true, text: \'\' }', '  const hidden = total === full\n  return { hidden, text: String(full - total) }')

export const steerFixture = steerScenario({
  id: 'ai-31-steer-fixture',
  track: 'ai',
  kind: 'scenario',
  title: 'You save',
  difficulty: 1,
  minutes: 4,
  story: 'Maya asked Sous to show what an office saves.',
  teaches: 'name the kind',
  pr: {
    number: 10,
    title: 'Show the saving',
    branch: 'sous/saving',
    description: ['Shows what the discount saves.'],
    claims: ['The saving hides when there is none'],
    base: { 'price.js': BASE_PRICE },
    head: { 'price.js': HEAD_PRICE }
  },
  steer: {
    rounds: 3,
    start: ['raw'],
    problems: [
      {
        id: 'raw',
        at: { path: 'price.js', text: 'String(full - total)' },
        categories: ['bug'],
        title: 'the saving is not rounded',
        explanation: '2.3999999999999986 €.',
        fix: { edits: [{ path: 'price.js', replace: ['String(full - total)', '(full - total).toFixed(2)'] }], reply: 'Rounded it to cents.' },
        misread: [{ as: ['security'], edits: [{ path: 'price.js', replace: ['String(full - total)', 'escape(String(full - total))'] }], becomes: ['escaped'], reply: 'Escaped it.' }]
      },
      {
        id: 'escaped',
        at: { path: 'price.js', text: 'escape(String(full - total))' },
        categories: ['bug', 'scope'],
        title: 'escaped, still not rounded',
        explanation: 'Escaping a number changes nothing.',
        fix: { edits: [{ path: 'price.js', replace: ['escape(String(full - total))', '(full - total).toFixed(2)'] }], reply: 'Rounded it, and took the escaping out.' }
      },
      {
        id: 'loose',
        at: { path: 'price.js', text: 'total < full' },
        categories: ['bug'],
        title: 'the saving hides when there is one',
        explanation: 'Inverted.',
        fix: { edits: [{ path: 'price.js', replace: ['total < full', 'total === full'] }], reply: 'Put the check back.' }
      }
    ],
    tempting: [{
      id: 'strict',
      at: { path: 'price.js', text: 'total === full' },
      why: 'no discount means the same number: nothing to show.',
      overreach: { edits: [{ path: 'price.js', replace: ['total === full', 'total < full'] }], becomes: ['loose'], reply: 'Compared them with < instead.' }
    }]
  },
  hints: ['Say what kind it is.', 'Run it with ten croissants.', '`price.js:4` is a bug.'],
  debrief: { title: 'Name the kind', paragraphs: ['Sous does what the category says.'] },
  solution: [
    { comment: 'price.js', lines: [4, 4], category: 'bug', text: 'Round it.' },
    { submit: 'request-changes' },
    { submit: 'approve' }
  ]
})
