// Claims vs. code 2.4: issue #142 says the counter shows 2 for three items (it counts basket lines, one per product).
// Sous "fixes" it by making the counter say what it counts, "2 products": another symptom (the customer's confusion),
// not the one the issue describes, so "Fixes #142" is false. On the way it writes "1 products" for one item, a plain
// bug. The basket itself is untouched, as the description says (a tempting claim).
import { reviewGoals } from './checks'
import { DESCRIPTION_PATH, claimAt } from './diff'
import { BASKET_CART, ORDER_PAGE, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

// main: the counter counts lines (products), which is what the issue is about
const CART = BASKET_CART.replace('badge.textContent = String(itemCount())', 'badge.textContent = String(cart.lines.length)')

const base = shopFiles({ 'cart.js': CART })

const head = withEdits(base, [
  { path: 'cart.js', replace: ['  badge.textContent = String(cart.lines.length)\n', '  const count = cart.lines.length\n  badge.textContent = `${count} products`\n'] }
])

const pr: PullRequest = {
  number: 143,
  title: 'Make the basket counter say what it counts',
  branch: 'sous/fix-142',
  description: [
    'The counter showed a bare number, and the customer took it for the number of items. It now says what it counts, “2 products”, so nobody taps Add again to make the number go up.'
  ],
  claims: [
    'Fixes #142',
    'The counter says what it counts',
    'The basket itself is unchanged'
  ],
  fixes: {
    number: 142,
    title: 'The basket counter shows 2 for three items',
    author: 'Anna',
    body: [
      'A customer called this morning: she added two croissants and a sourdough loaf, and the counter in the header said 2. She thought the second croissant hadn\'t gone in, tapped Add again and ended up with three croissants.',
      'Two croissants and a loaf are three things. The counter should say 3.'
    ]
  },
  base,
  head
}

export const linkedIssue: ReviewScenario = {
  id: 'ai-09-linked-issue',
  track: 'ai',
  kind: 'scenario',
  title: 'Fixes #142',
  difficulty: 2,
  minutes: 5,
  teaches: 'linked issue',
  story: [
    'Anna opened issue #142 after a customer called about the basket counter. Sous picked it up and opened a pull request that says it fixes it; the issue is shown with the pull request.',
    'Review it with the issue in mind: does the change do what the issue asks for? This one has two problems.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'other-symptom',
      path: 'cart.js',
      lines: [19, 19],
      also: [claimAt(pr, 0), { path: DESCRIPTION_PATH, lines: [1, 1] }],
      categories: ['false-claim'],
      title: 'it still counts products: three items say “2 products”, and #142 asks for 3',
      explanation: 'Issue #142 is about the number: two croissants and a loaf are three items, and `cart.lines.length` counts two lines. The pull request keeps that count and adds a word to it, so the customer from the issue would now see “2 products”. That explains the bug instead of fixing it; `itemCount()` counts the items.'
    },
    {
      id: 'one-products',
      path: 'cart.js',
      lines: [20, 20],
      categories: ['bug'],
      title: 'one item says “1 products”',
      explanation: 'The text always ends in “products”, so the first Add of every order shows “1 products”. It needs the singular for 1.'
    }
  ],
  tempting: [
    { ...claimAt(pr, 2), why: 'it is: only `renderBadge` changed, and `addToCart` puts things in the basket exactly as before.' },
    { ...claimAt(pr, 1), why: 'it does say what it counts, products. What it counts is the problem, and that is another claim.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'cart.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'Read issue #142 first: what does Anna say the counter should show? Then check that the pull request makes it show that. And try the smallest basket too.',
    'With two croissants and a sourdough loaf, what is `cart.lines.length`? And what does the counter say after one Add? Run the PR and do what the issue describes.',
    '`cart.js:19` still counts lines (products), so three items say “2 products” where the issue wants 3: “Fixes #142” (line 2 of the description) is a false claim. `cart.js:20` writes “1 products” for one item: a bug. Comment on each, then Request changes.'
  ],
  debrief: {
    title: 'The issue says what fixed looks like',
    paragraphs: [
      'Issue #142 is about a number: three things in the basket, and the counter says 2, because `cart.lines.length` counts products, not items. The pull request keeps that count and adds a word to it. The customer from the issue would now see “2 products” and still not see her three things. That doesn\'t fix #142; it explains it away.',
      'And the new text has no singular: the first Add of every order says “1 products”. A small bug, but one every customer sees.',
      'How you would have caught it: open the linked issue before the diff, and do exactly what it describes in the running PR, two croissants and a loaf. “Fixes #142” is the claim you can check most directly, because the issue says what fixed looks like. Here the fix is `itemCount()`, one line away.'
    ]
  },
  solution: [
    { comment: DESCRIPTION_PATH, lines: claimAt(pr, 0).lines, category: 'false-claim', text: 'Three items still say 2 (“2 products”): #142 asks for 3.' },
    { comment: 'cart.js', lines: [20, 20], category: 'bug', text: 'One item says “1 products”.' },
    { submit: 'request-changes', summary: 'This doesn\'t fix #142: the counter still counts products.' }
  ]
}
