// Read the diff 1.3: a free coffee comes with every order of 20 € or more, and Anna wants the note under the total. Sous
// sets `hidden` to the condition for showing it: the note shows on small baskets (an empty one too) and hides from 20 €.
import { SUMMARY } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { ORDER_PAGE, SUMMARY_APP, emptyReview, shopFiles, withEdits } from './shop'
import type { ReviewScenario } from './types'

const SUMMARY_JS = `// The basket summary: the total under the products.
import { basketTotal } from './cart.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')

export function renderSummary() {
  const total = basketTotal()
  totalText.textContent = formatPrice(total)
}
`

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS }, { main: SUMMARY })

const head = withEdits(base, [
  { path: 'summary.js', replace: ['// The basket summary: the total under the products.', '// The basket summary: the total under the products, and the free coffee note (Anna).'] },
  {
    path: 'summary.js',
    replace: ['const totalText = document.querySelector(\'#order-total\')\n', `// a free coffee with every order of 20 € or more
const FREE_COFFEE_FROM = 20

const totalText = document.querySelector('#order-total')
const coffee = document.querySelector('#coffee')
`]
  },
  { path: 'summary.js', replace: ['  totalText.textContent = formatPrice(total)\n', '  totalText.textContent = formatPrice(total)\n  coffee.hidden = total >= FREE_COFFEE_FROM\n'] }
])

export const freeCoffee: ReviewScenario = {
  id: 'ai-03-free-coffee',
  track: 'ai',
  kind: 'scenario',
  title: 'The free coffee note',
  difficulty: 1,
  minutes: 3,
  teaches: 'inverted condition',
  story: [
    'Every order of 20 € or more gets a free coffee at pickup. The page already has the note, “A free coffee comes with this order.”, hidden under the total. Anna asked Sous to show it when the order qualifies.',
    'The pull request is short: read every line of it, then send your review.'
  ].join('\n\n'),
  pr: {
    number: 44,
    title: 'Show the free coffee note from 20 €',
    branch: 'sous/free-coffee-note',
    description: [
      'Shows the free coffee note under the total for orders of 20 € or more, as Anna asked. The threshold is a named constant, so the shop can change it in one place.'
    ],
    claims: [
      'The note shows from 20.00 €',
      'Below 20 € it stays hidden'
    ],
    base,
    head
  },
  issues: [{
    id: 'inverted',
    path: 'summary.js',
    lines: [14, 14],
    categories: ['bug', 'false-claim'],
    title: 'the note hides from 20 € and shows below it',
    explanation: '`hidden` is true when the note should not show, so it needs the opposite condition: `coffee.hidden = total < FREE_COFFEE_FROM`. As written, an empty basket promises a free coffee and a 25 € order does not.'
  }],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'summary.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Read the new line in summary.js as a sentence, with the property\'s name in it. When is the note hidden?',
    '`coffee.hidden = total >= FREE_COFFEE_FROM` hides the note exactly when the order qualifies. Run the PR: what does the empty basket say under its total?',
    '`summary.js:14` sets `hidden` to the condition for showing the note. It should be `total < FREE_COFFEE_FROM`. Comment on it as a bug, then Request changes.'
  ],
  debrief: {
    title: 'A condition that is right, on the wrong property',
    paragraphs: [
      '`total >= FREE_COFFEE_FROM` is exactly the rule Anna gave, which is why the line looks right at a glance. But it is assigned to `hidden`: the note hides when the order qualifies and shows when it does not. The empty basket offers a free coffee the moment the page loads.',
      'Negations hide in names: `hidden`, `disabled`, `isEmpty`, `skip`. When a condition is assigned to one of them, read the line out loud: “the note is hidden when the total is at least 20”. That sentence is the bug.',
      'How you would have caught it: run the PR once. The note is there before you add anything, which no rule about 20 € can explain.'
    ]
  },
  solution: [
    { comment: 'summary.js', lines: [14, 14], category: 'bug', text: 'This hides the note from 20 €: `hidden` needs `total < FREE_COFFEE_FROM`.' },
    { submit: 'request-changes', summary: 'The note shows on the wrong orders.' }
  ]
}
