// Read the diff 1.1: Maya wants at most 12 of each product per order, and the Add button off at 12. Sous's canAddMore
// compares with `MAX_PER_PRODUCT - 1`, so Add turns off at 11. The guard in addToCart (`>=` before adding) looks like
// the same mistake and is right: the tempting false alarm the debrief explains.
import { APP } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const base = shopFiles({ 'app.js': APP })

const head = withEdits(base, [
  {
    path: 'cart.js',
    replace: ['export const cart = { lines: [] }\n', `export const cart = { lines: [] }

// Office orders emptied the tray before 8:00: at most 12 of each product per order (Maya).
export const MAX_PER_PRODUCT = 12
`]
  },
  {
    path: 'cart.js',
    replace: ['  const line = lineOf(product.id)\n  if (line) line.quantity += 1', '  const line = lineOf(product.id)\n  if (line && line.quantity >= MAX_PER_PRODUCT) return\n  if (line) line.quantity += 1']
  },
  {
    path: 'cart.js',
    replace: ['  renderBadge()\n}\n', `  renderBadge()
}

// false once the line holds the most one order may have
export function canAddMore(id) {
  const line = lineOf(id)
  return !line || line.quantity < MAX_PER_PRODUCT - 1
}
`]
  },
  { path: 'style.css', replace: ['.add:focus-visible,', '.add:disabled {\n  background: #b8ad9f;\n  cursor: not-allowed;\n}\n\n.add:focus-visible,'] },
  { path: 'app.js', replace: ['import { addToCart, cart, renderBadge } from \'./cart.js\'', 'import { addToCart, canAddMore, cart, renderBadge } from \'./cart.js\''] },
  {
    path: 'app.js',
    replace: ['  item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))', `  const add = item.querySelector('.add')
  add.addEventListener('click', () => {
    addToCart(product)
    add.disabled = !canAddMore(product.id)
  })`]
  }
])

const pr: PullRequest = {
  number: 41,
  title: 'Limit each product to 12 per order',
  branch: 'sous/limit-per-product',
  description: [
    'Adds the per-product limit Maya asked for. `addToCart` ignores an Add past the limit, and the Add button turns off once a product reaches it, so customers see why nothing happens.'
  ],
  claims: [
    'At most 12 of each product per order',
    'The Add button turns off at 12',
    'Orders under the limit work as before'
  ],
  base,
  head
}

export const twelveCroissants: ReviewScenario = {
  id: 'ai-01-twelve-croissants',
  track: 'ai',
  kind: 'scenario',
  title: 'At most twelve croissants',
  difficulty: 1,
  minutes: 4,
  teaches: 'off-by-one',
  story: [
    'Office orders of forty croissants have been emptying the tray before 8:00. Maya asked Sous, the shop\'s coding assistant: “Customers can add at most 12 of each product to one order. Turn the Add button off at 12.”',
    'Sous opened a pull request. Review it like a teammate\'s: click a line number in the diff to comment, pick what kind of problem it is, then Approve or Request changes. Run the PR on the right to try it in the shop.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'one-early',
    path: 'cart.js',
    lines: [37, 37],
    also: [paragraphAt(pr, 0), claimAt(pr, 1)],
    categories: ['bug', 'false-claim'],
    title: '`canAddMore` turns Add off at 11, one early',
    explanation: 'With 11 in the basket, `11 < MAX_PER_PRODUCT - 1` is `11 < 11`, false: Add turns off and the 12th never goes in. `line.quantity < MAX_PER_PRODUCT` is the check Maya asked for.'
  }],
  tempting: [
    { path: 'cart.js', lines: [28, 28], why: 'it runs before adding, so `>= MAX_PER_PRODUCT` means “already 12, stop”, and only a 13th is refused.' },
    { path: 'app.js', lines: [16, 20], why: 'this line turns Add off whenever `canAddMore` says no. Whether that happens at 12 is up to `canAddMore`.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'cart.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Keep the description open while you read: it says Add turns off at 12. Find the line that decides when Add turns off, and try it with 11 croissants in the basket.',
    'app.js turns Add off when `canAddMore` returns false. Work `canAddMore` out for a line with 11 croissants: is `11 < MAX_PER_PRODUCT - 1` true? Or run the PR and click Add on the croissant twelve times.',
    '`cart.js:37` (`line.quantity < MAX_PER_PRODUCT - 1`) is false from 11 on, so the 12th croissant can never be added. Comment on that line as a bug, then Request changes.'
  ],
  debrief: {
    title: 'Off by one, right at the edge you were told about',
    paragraphs: [
      '`MAX_PER_PRODUCT - 1` is the classic off-by-one: with 11 croissants in the basket, `11 < 11` is false, so Add turns off and the 12th never goes in. Maya asked for 12; customers get 11. The description even says “turns off at 12”, which is why “false claim” fits as well as “bug”.',
      'The guard in `addToCart` looks like the same mistake and isn\'t: it runs before adding, so `>= 12` means “already 12, stop”, and the 13th is refused. Two comparisons against the same number can be right in different ways. Work each one out with the number from the description.',
      'How you would have caught it: read the diff with the description in mind, then try the edge, 11 in the basket, then 12, on paper or by running the PR and clicking Add twelve times. Assistants get the middle right and the edges wrong.'
    ]
  },
  solution: [
    { comment: 'cart.js', lines: [37, 37], category: 'bug', text: 'With 11 in the basket this is 11 < 11: Add turns off one early. Should be `< MAX_PER_PRODUCT`.' },
    { submit: 'request-changes', summary: 'The 12th croissant can never be added.' }
  ]
}
