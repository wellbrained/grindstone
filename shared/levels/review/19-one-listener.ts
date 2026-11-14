// Invented APIs 4.4: one listener for the list. Jonas suggested event delegation; Sous moves the Add buttons' listeners
// onto the list and finds the clicked product with `event.path`, a property only old Chrome had (never a standard,
// removed in Chrome 109, 2023), so it is undefined in every browser now and the first Add throws. `event.target.matches`,
// `node.classList?.contains` and the removed per-button listener are right (tempting).
import { orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const base = orderSite({})

const head = withEdits(base, [
  { path: 'app.js', replace: ['  item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))\n', ''] },
  {
    path: 'app.js',
    replace: ['  list.append(item)\n}\n', `  list.append(item)
}

// one listener for the whole list instead of one per product (Jonas: "event delegation")
list.addEventListener('click', (event) => {
  if (!event.target.matches('.add')) return
  const item = event.path.find(node => node.classList?.contains('product'))
  addToCart(products.find(product => product.id === item.dataset.id))
})
`]
  }
])

const pr: PullRequest = {
  number: 74,
  title: 'One click listener for the product list',
  branch: 'sous/event-delegation',
  description: [
    'Jonas suggested event delegation: one listener on the list that handles every Add, instead of a listener per button.'
  ],
  claims: [
    'One click listener for the whole list instead of one per product',
    'Add works as before',
    'Works in every browser',
    '`cart.js` stays as it is'
  ],
  base,
  head
}

export const oneListener: ReviewScenario = {
  id: 'ai-19-one-listener',
  track: 'ai',
  kind: 'scenario',
  title: 'One listener for the list',
  difficulty: 2,
  minutes: 4,
  teaches: 'removed API',
  story: [
    'Jonas read about event delegation and asked Sous to use it on the order page: one click listener on the product list instead of one on every Add button.',
    'Assistants learned from years of old code, and some of what was common then is gone now. Run the PR and click the one thing the change is about.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'no-event-path',
    path: 'app.js',
    lines: [22, 22],
    also: [claimAt(pr, 1), claimAt(pr, 2)],
    categories: ['invented-api', 'false-claim'],
    title: '`event.path` is gone from every browser: the first Add throws, and nothing goes into the basket',
    explanation: '`event.path` was old Chrome\'s own, never a standard, and Chrome removed it in 2023; Firefox and Safari never had it. It is undefined, so `event.path.find` throws on every Add. `event.composedPath()` is the standard list, and `event.target.closest(\'.product\')` is enough here.'
  }],
  tempting: [
    { path: 'app.js', removed: [16, 16], why: 'taking the listener off every button is the point of the change: the one on the list handles Add instead.' },
    { path: 'app.js', lines: [21, 21], why: '`event.target` is what was clicked, and `matches(\'.add\')` is true only on an Add button, so a click anywhere else in the list is left alone.' },
    { path: 'app.js', lines: [23, 23], why: '`item.dataset.id` is the `data-id` the loop set on each product, so this finds the product that was clicked.' },
    { ...claimAt(pr, 0), why: 'it does: the loop no longer adds a listener, and the list has one.' },
    { ...claimAt(pr, 3), why: 'it does: only app.js changes.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'app.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR and click Add. Does the counter go up? Read the Console.',
    'The Console says it can\'t read `find` of undefined: `event.path` is undefined. Is `path` something events have?',
    '`app.js:22` uses `event.path`, which only old Chrome had and no browser has now (`event.composedPath()`, or `event.target.closest(\'.product\')`, is the real way). Comment on it as an invented API, then Request changes.'
  ],
  debrief: {
    title: 'An API that was removed',
    paragraphs: [
      '`event.path` was Chrome\'s own, never a standard: Firefox and Safari never had it, and Chrome deprecated it and removed it in 2023 (Chrome 109). Years of old answers still use it, and assistants learned from them. Today it is undefined in every browser, so the first Add throws “Cannot read properties of undefined (reading \'find\')”, and nothing goes into the basket.',
      'The standard ways are `event.composedPath()`, the same list of nodes, or here simply `event.target.closest(\'.product\')`. The rest of the change is right: `event.target.matches(\'.add\')` lets only Add through, and `node.classList?.contains` is careful because the path also holds the document and the window, which have no class list.',
      'How you would have caught it: run it and click the one thing the change is about. And when an API is new to you, look it up: MDN marks deprecated and non-standard features at the top of the page, with a table of the browsers that have them.'
    ]
  },
  solution: [
    { comment: 'app.js', lines: [22, 22], category: 'invented-api', text: 'event.path is gone from every browser: Add throws. event.target.closest(\'.product\') does it.' },
    { submit: 'request-changes', summary: 'event.path doesn\'t exist any more, so Add is broken.' }
  ]
}
