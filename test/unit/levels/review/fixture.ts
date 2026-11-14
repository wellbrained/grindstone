// Small review levels for the environment's tests: a pull request with three planted issues in two files (two on added
// lines, one on removed lines) and a tempting spot, and a verdict task whose pull request is fine.
import { reviewGoals } from '../../../../shared/levels/review/checks'
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
