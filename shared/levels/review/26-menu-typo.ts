// Scope and size 6.1: "Fix the typo in the menu". Maya asks for one word, “Pain au chocholat” spelled right. Sous fixes
// it, adds a test that keeps it fixed (right: a test belongs with its fix), and runs a formatter over the whole of
// products.js: every line changes, one product per five lines, so the one-word fix is buried in 36 added lines. And in
// the reformat a product went missing: eight went in, seven came out (the Kouign-amann). The reformat is scope (any of
// its lines finds it); the lost line is a bug, found on the removed line itself (a bug comment over the reformat around
// it isn't focused on it: ADR 0008, chapter 6).
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, emptyReview, shopFiles, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const PRODUCTS = `// Today's products, in the order Maya wants them on the page: the bread first. Prices are in euros.
export const products = [
  { id: 'sourdough', name: 'Sourdough loaf', price: 6.5 },
  { id: 'rye', name: 'Rye loaf', price: 5.2 },
  { id: 'baguette', name: 'Baguette', price: 2.2 },
  { id: 'croissant', name: 'Butter croissant', price: 2.4 },
  { id: 'pain-au-chocolat', name: 'Pain au chocholat', price: 2.8 },
  { id: 'kouign-amann', name: 'Kouign-amann', price: 3.6 },
  { id: 'cinnamon-bun', name: 'Cinnamon bun', price: 3.2 },
  { id: 'apple-tart', name: 'Apple tart', price: 4.2 }
]
`

/** The products as Sous's formatter writes them: one property per line, double quotes, trailing commas. */
const formatted = (products: readonly [id: string, name: string, price: number][]) => [
  '// Today\'s products, in the order Maya wants them on the page: the bread first. Prices are in euros.',
  'export const products = [',
  ...products.flatMap(([id, name, price]) => ['  {', `    id: "${id}",`, `    name: "${name}",`, `    price: ${price},`, '  },']),
  '];',
  ''
].join('\n')

const FORMATTED = formatted([
  ['sourdough', 'Sourdough loaf', 6.5],
  ['rye', 'Rye loaf', 5.2],
  ['baguette', 'Baguette', 2.2],
  ['croissant', 'Butter croissant', 2.4],
  ['pain-au-chocolat', 'Pain au chocolat', 2.8],
  ['cinnamon-bun', 'Cinnamon bun', 3.2],
  ['apple-tart', 'Apple tart', 4.2]
])

const TEST = `// The product names as the order page shows them (Sous).
import { products } from './products.js'

test('pain au chocolat is spelled right', () => {
  const names = products.map(product => product.name)
  expect(names).toContain('Pain au chocolat')
})
`

const base = shopFiles({ 'products.js': PRODUCTS })

const head = withEdits(base, [
  { path: 'products.js', replace: [PRODUCTS, FORMATTED] },
  { path: 'products.test.js', replace: ['', TEST] }
])

const pr: PullRequest = {
  number: 96,
  title: 'Fix the typo in pain au chocolat',
  branch: 'sous/menu-typo',
  description: [
    'Maya spotted a typo on the order page: “Pain au chocholat”. Fixed in products.js, with a test that keeps it fixed.',
    'While I was in products.js I ran the formatter over it: one property per line, double quotes and trailing commas, like the newer files.'
  ],
  claims: [
    '“Pain au chocolat” is spelled right on the order page',
    'A test checks the name',
    'Otherwise only formatting: no product or price changes'
  ],
  base,
  head
}

export const menuTypo: ReviewScenario = {
  id: 'ai-26-menu-typo',
  track: 'ai',
  kind: 'scenario',
  title: 'Fix the typo in the menu',
  difficulty: 2,
  minutes: 5,
  teaches: 'reformat',
  story: [
    'Maya noticed a typo on the order page: “Pain au chocholat”. She asked Sous to fix it before the morning rush.',
    'A one-word fix should be a one-line diff. Review what Sous sent, run it, and compare it with main.'
  ].join('\n\n'),
  pr,
  issues: [
    {
      id: 'reformat',
      path: 'products.js',
      lines: [3, 38],
      removed: [3, 7],
      also: [{ path: 'products.js', removed: [9, 11] }],
      categories: ['scope'],
      title: 'a whole-file reformat in a one-word fix: the fix is buried in 36 changed lines',
      explanation: 'Maya asked for one word. The formatter rewrote every line of products.js, so the fix sits somewhere in 36 added lines, and whatever else changed hides there with it. A reformat goes in a pull request of its own.'
    },
    {
      id: 'lost-product',
      path: 'products.js',
      removed: [8, 8],
      also: [claimAt(pr, 2)],
      categories: ['bug', 'false-claim'],
      title: 'the Kouign-amann is gone: eight products went into the reformat, seven came out',
      explanation: 'Retyped from top to bottom, the list lost a line: the Kouign-amann is among the removed lines and nowhere among the added ones, so the order page no longer sells it.'
    }
  ],
  tempting: [
    { path: 'products.test.js', lines: [4, 7], why: 'a test that proves the fix belongs with it: it fails on main (“Pain au chocholat”) and passes here.' },
    { ...paragraphAt(pr, 1), why: 'that\'s true: Sous says it ran the formatter. The sentence holds; the change it describes is the problem, so comment on the reformatted lines.' },
    { ...claimAt(pr, 0), why: 'it is: the order page says “Pain au chocolat” now.' },
    { ...claimAt(pr, 1), why: 'it does: products.test.js checks that the name is there.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'products.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 2 }),
  hints: [
    'How many lines should a one-word fix change? Look at the size of products.js in the diff, then run the PR and count the products on the page.',
    'When every line of a file changes, the one change that matters hides among them. Go through the removed lines and the added ones product by product: is every product still there?',
    'The reformat doesn\'t belong in a typo fix: comment on its lines as scope. And the removed line with `id: \'kouign-amann\'` has no added line: comment on it as a bug. Then Request changes.'
  ],
  debrief: {
    title: 'A one-word fix, buried in a whole file',
    paragraphs: [
      'Maya asked for one word, and the diff changed every line of products.js: Sous\'s formatter wrote each product over five lines with double quotes. The fix is in there, on one of 36 added lines, and nobody can review a change they can\'t find.',
      'Something else hid in it too: the Kouign-amann. Eight products went out, seven came back. Run the PR and the order page sells seven things; main sells eight. A reformat that touches everything is exactly where a lost line, or a changed price, slips through.',
      'How you would have caught it: compare the size of the diff with the size of the ask. One word should be one line; when it isn\'t, ask for the fix alone here and the reformat in a pull request of its own, where “nothing else changes” is easy to check. The test Sous added is fine: a test that proves the fix belongs with it.'
    ]
  },
  solution: [
    { comment: 'products.js', lines: [3, 7], category: 'scope', text: 'A typo fix shouldn\'t reformat the whole file: please send the fix alone, and the formatting in its own pull request.' },
    { comment: 'products.js', removed: [8, 8], category: 'bug', text: 'The Kouign-amann is gone: it is removed here and never added back.' },
    { submit: 'request-changes', summary: 'The fix is buried in a reformat, and the reformat lost a product.' }
  ]
}
