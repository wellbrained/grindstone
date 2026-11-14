// Invented APIs 4.1: "Just added". Maya wants customers to see that their tap went in, and a way to take one back
// out. Sous writes the latest item under the list with `cart.items.last()`, a method arrays don't have: it throws as
// the page opens and on every Add (the counter, set on the line before, still counts). The − button's
// `findLastIndex` looks invented and is real (findLast's sibling, which `splice` needs): the tempting false alarm.
import { CART, orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const base = orderSite({ 'cart.js': CART })

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['aria-label="Today\'s products"></ul>\n', 'aria-label="Today\'s products"></ul>\n    <p class="note" id="just-added"></p>\n']
  },
  {
    path: 'cart.js',
    replace: ['const badge = document.querySelector(\'#cart-count\')\n', 'const badge = document.querySelector(\'#cart-count\')\nconst justAdded = document.querySelector(\'#just-added\')\n']
  },
  {
    path: 'cart.js',
    replace: ['  badge.textContent = String(cart.items.length)\n}', `  badge.textContent = String(cart.items.length)
  // "Just added: Butter croissant", so customers see their tap went in (Maya)
  const latest = cart.items.last()
  justAdded.textContent = latest ? \`Just added: \${latest.name}\` : ''
}`]
  },
  {
    path: 'cart.js',
    replace: ['  renderBadge()\n}\n', `  renderBadge()
}

// called by the − buttons (app.js): takes the latest one of this product back out
export function removeOne(product) {
  const index = cart.items.findLastIndex(item => item.id === product.id)
  if (index === -1) return
  cart.items.splice(index, 1)
  renderBadge()
}
`]
  },
  { path: 'app.js', replace: ['import { addToCart, cart, renderBadge } from \'./cart.js\'', 'import { addToCart, cart, removeOne, renderBadge } from \'./cart.js\''] },
  {
    path: 'app.js',
    replace: ['    <button class="add" type="button">Add</button>`\n  item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))\n', `    <span><button class="add" type="button">Add</button> <button class="action remove" type="button" aria-label="One \${product.name} less">−</button></span>\`
  item.querySelector('.add').addEventListener('click', () => addToCart(product))
  item.querySelector('.remove').addEventListener('click', () => removeOne(product))
`]
  }
])

const pr: PullRequest = {
  number: 71,
  title: 'Show what was just added, and a − button',
  branch: 'sous/just-added',
  description: [
    'Maya asked for two things: customers should see that their tap went in, and be able to take one back out.'
  ],
  claims: [
    '“Just added: Butter croissant” shows under the list after every Add',
    'A − button takes the latest one of a product back out',
    'No helper library: only methods arrays have built in',
    'The counter in the header counts as before'
  ],
  base,
  head
}

export const justAdded: ReviewScenario = {
  id: 'ai-16-just-added',
  track: 'ai',
  kind: 'scenario',
  title: 'Just added',
  difficulty: 1,
  minutes: 4,
  teaches: 'invented method',
  story: [
    'Customers tap Add and aren\'t sure it worked, so they tap again. Maya asked Sous for a line under the products that says what was just added, and a − button to take one back out.',
    'Sous writes code that reads well and calls things that sound right. This chapter is about the ones that aren\'t there. Run the PR with the Console open: an API that doesn\'t exist fails the first time it runs.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'no-last',
    path: 'cart.js',
    lines: [10, 10],
    also: [claimAt(pr, 0), claimAt(pr, 2)],
    categories: ['invented-api', 'false-claim'],
    title: 'arrays have no `last()`: it throws as the page opens and on every Add, and “Just added” never shows',
    explanation: 'JavaScript arrays have no `last` method, so `cart.items.last` is undefined and calling it throws “cart.items.last is not a function”. `cart.items.at(-1)` is the real way to the last item.'
  }],
  tempting: [
    { path: 'cart.js', lines: [22, 22], why: '`findLastIndex` is real, in every browser since 2022: like `findIndex`, from the end, so it finds the latest one of this product (and -1 when there is none).' },
    { path: 'cart.js', lines: [11, 11], why: 'this line is right: with an empty basket there is no latest item, and the note stays empty. It is the line above it that throws.' },
    { ...claimAt(pr, 1), why: 'it does: `findLastIndex` finds the latest one and `splice` takes it out, and the counter goes down. The error that follows is the Just added line\'s, in `renderBadge`.' },
    { ...claimAt(pr, 3), why: 'it does: the counter is set on the line before the one that throws, so it still counts every item.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'cart.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR and read the Console before you click anything. Then add a croissant: what does the counter say, and what shows under the list?',
    'The Console says `cart.items.last is not a function`. Which of these are real array methods: `last`, `findLastIndex`, `at`? The one that isn\'t is the one Sous made up.',
    '`cart.js:10` calls `cart.items.last()`, a method arrays don\'t have (`cart.items.at(-1)` is the real one). Comment on it as an invented API, then Request changes.'
  ],
  debrief: {
    title: 'Arrays have no last()',
    paragraphs: [
      '`cart.items.last()` reads like JavaScript, and in other languages and libraries it is (Ruby, C#, Lodash\'s `_.last`), but JavaScript arrays have no `last` method. `cart.items.last` is undefined, and calling it throws “cart.items.last is not a function”: as the page opens, and again on every Add. The counter still counts, because it is set on the line before; “Just added” never shows.',
      'The tempting one is the other way round: `findLastIndex` looks invented and is real, since 2022, with its sibling `findLast` (the item instead of its index; `splice` needs the index). The real way to the last item is `cart.items.at(-1)`.',
      'How you would have caught it: run the PR with the Console open. An invented method fails the first time it runs, so the Console names it for you. And when a method is new to you, look it up (MDN) before you flag it, or believe it.'
    ]
  },
  solution: [
    { comment: 'cart.js', lines: [10, 10], category: 'invented-api', text: 'Arrays have no last(): this throws on every Add. cart.items.at(-1) is the real one.' },
    { submit: 'request-changes', summary: 'cart.items.last() doesn\'t exist, so Just added never shows.' }
  ]
}
