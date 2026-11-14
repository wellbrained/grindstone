// Invented APIs 4.3: "from the money helper". Maya wants the basket listed under the products, a line per product.
// Sous's new summary.js imports `formatEuro` from money.js, which only exports `formatPrice`: the browser finds that
// when it links the modules, before any runs, so the whole page stays empty with a SyntaxError. `Object.groupBy` (2024)
// and `replaceChildren` with several children look invented and are real (tempting).
import { orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const base = orderSite({})

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['aria-label="Today\'s products"></ul>\n', 'aria-label="Today\'s products"></ul>\n    <ul id="basket" class="list summary" aria-label="Your basket"></ul>\n']
  },
  {
    path: 'summary.js',
    replace: ['', `// The basket under the products: one line per product, how many and what they cost.
import { cart } from './cart.js'
import { formatEuro } from './money.js'

const basket = document.querySelector('#basket')

export function renderBasket() {
  const byName = Object.groupBy(cart.items, item => item.name)
  basket.replaceChildren(...Object.entries(byName).map(([name, items]) => {
    const line = document.createElement('li')
    line.textContent = \`\${items.length} × \${name}  \${formatEuro(items.length * items[0].price)}\`
    return line
  }))
}
`]
  },
  { path: 'app.js', replace: ['import { formatPrice } from \'./money.js\'\n', 'import { formatPrice } from \'./money.js\'\nimport { renderBasket } from \'./summary.js\'\n'] },
  {
    path: 'app.js',
    replace: ['  item.querySelector(\'.add\').addEventListener(\'click\', () => addToCart(product))\n', `  item.querySelector('.add').addEventListener('click', () => {
    addToCart(product)
    renderBasket()
  })
`]
  }
])

const pr: PullRequest = {
  number: 73,
  title: 'List the basket under the products',
  branch: 'sous/basket-list',
  description: [
    'Maya wants customers to see their basket under the products, a line per product.'
  ],
  claims: [
    'A line per product under the list: “2 × Butter croissant  4.80”',
    'Prices go through the money helper we already have, in `money.js`',
    'Groups with the browser\'s own `Object.groupBy`, no library',
    '`money.js` stays as it is'
  ],
  base,
  head
}

export const moneyHelper: ReviewScenario = {
  id: 'ai-18-money-helper',
  track: 'ai',
  kind: 'scenario',
  title: 'From the money helper',
  difficulty: 2,
  minutes: 4,
  teaches: 'invented import',
  story: [
    'Customers can\'t see what is in their basket, only how many items. Maya asked Sous to list it under the products: a line per product, how many and what they cost.',
    'Sous imports a helper from a file you know, and calls a browser API you may not. One of the two is real.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'no-format-euro',
    path: 'summary.js',
    lines: [3, 3],
    also: [{ path: 'summary.js', lines: [11, 11] }, claimAt(pr, 0), claimAt(pr, 1)],
    categories: ['invented-api', 'false-claim'],
    title: '`money.js` has no `formatEuro`: the modules don\'t link, and the page stays empty',
    explanation: '`money.js` exports `formatPrice` and nothing else. An import of a name a module doesn\'t export fails when the browser links the modules, before any of them runs, so no product shows and the Console says “does not provide an export named \'formatEuro\'”.'
  }],
  tempting: [
    { path: 'summary.js', lines: [8, 8], why: '`Object.groupBy` is real, in every browser since 2024: an object with a list of items per name, so `items.length` is how many.' },
    { path: 'summary.js', lines: [9, 9], why: '`replaceChildren` is real: it takes the old lines out and puts every new one in, and with none it empties the list.' },
    { path: 'app.js', lines: [17, 20], why: 'Add puts the product in, then the list is drawn again: right, once the list can be drawn at all.' },
    { ...claimAt(pr, 2), why: 'it does: `Object.groupBy` is built into every browser.' },
    { ...claimAt(pr, 3), why: 'it does: the pull request doesn\'t touch `money.js`. That is why `formatEuro` isn\'t in it.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'summary.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR. Where are the products? Look in the Console.',
    'The Console says `money.js` has no export named `formatEuro`. What does app.js import from `money.js`, a few lines up in the diff?',
    '`summary.js:3` imports `formatEuro`, which `money.js` never had (its helper is `formatPrice`), so no module of the page runs. Comment on it as an invented API, then Request changes.'
  ],
  debrief: {
    title: 'An import of a name that isn\'t there',
    paragraphs: [
      '`money.js` exports `formatPrice`, and nothing else; Sous imported `formatEuro`, a name that fits the file and was never in it. A missing export isn\'t found when the line runs but when the browser links the modules, before any of them runs: the whole page fails, products and all, with “The requested module \'money.js\' does not provide an export named \'formatEuro\'”.',
      '`Object.groupBy` is the tempting one: new (2024), and real in every current browser. `replaceChildren` with several children is real too. Once the import names `formatPrice`, the list works.',
      'How you would have caught it: check every import against the file it names (here app.js imports `formatPrice` from the same file, a few lines up); or run it, where an empty page and a SyntaxError say it at once. Assistants often import the name a helper should have, not the one it has.'
    ]
  },
  solution: [
    { comment: 'summary.js', lines: [3, 3], category: 'invented-api', text: 'money.js has no formatEuro (it exports formatPrice): the page doesn\'t load at all.' },
    { submit: 'request-changes', summary: 'An import of a name money.js doesn\'t export: nothing on the page runs.' }
  ]
}
