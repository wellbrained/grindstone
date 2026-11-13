// Basics 1.4: read the history with git log, find the commit that changed something and put a branch on the one before.
import { commitsOf, repo, resolve, shortId } from '../../git'
import type { GitState } from '../../git'
import type { GitScenario } from './types'
import { ran } from './checks'

const shipping = (limit: number) => [
  '// Free shipping in the online shop. Agreed with the shop team: orders from 50 euros ship for free.',
  `export const FREE_SHIPPING_FROM = ${limit}`,
  '',
  'export function shippingCost(total) {',
  '  return total >= FREE_SHIPPING_FROM ? 0 : 4.9',
  '}'
].join('\n')

const setup = () => repo()
  .file('README.md', '# Corner Bakery shop\n\nOrder bread and cakes online, pick them up or get them delivered.')
  .file('src/cart.js', '// The shopping cart: items and their total.\nexport const cart = []\n\nexport const total = () => cart.reduce((sum, item) => sum + item.price, 0)')
  .commit('Set up the online shop')
  .file('src/products.js', '// What the shop sells. Prices in euros, updated by Maya every Monday.\nexport const products = [\n  { name: \'Sourdough loaf\', price: 4.8 },\n  { name: \'Croissant\', price: 1.9 }\n]')
  .commit('Add the product list', { author: 'Maya' })
  .file('src/format.js', '// Prices always show two decimals: 4.80, not 4.8.\nexport const euros = value => `${value.toFixed(2)} EUR`')
  .commit('Show prices with two decimals', { author: 'Ben' })
  .file('src/shipping.js', shipping(50))
  .commit('Add free shipping from 50 euros', { author: 'Maya' })
  .file('src/shipping.js', shipping(30))
  .commit('Lower the free shipping limit to 30', { author: 'Chris' })
  .file('src/checkout.js', '// The checkout button at the end of the cart.\nexport const checkoutLabel = \'Order now\'')
  .commit('Fix the label on the checkout button', { author: 'Ben' })
  .file('src/newsletter.js', '// Sign-up form under the product list. No tracking, just an email address.\nexport const newsletterTitle = \'Fresh from the oven, once a week\'')
  .commit('Add a newsletter sign-up', { author: 'Maya' })
  .build()

/** The commit right before the limit changed (setups are deterministic, so this id is the same every time). */
const commitBefore = (state: GitState) => commitsOf(state, 'main').find(commit => commit.message === 'Add free shipping from 50 euros')!.id
const BEFORE_CHANGE = commitBefore(setup())

export const readHistory: GitScenario = {
  id: 'git-09-read-history',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Read the history',
  story: [
    'Customers of the bakery\'s online shop get free shipping from 30 euros, but the shop agreed on 50. Ben wants to try the shop the way it was before the limit changed, without touching main.',
    'Find the commit that lowered the free shipping limit in the history, and create a branch called `before-shipping-change` on the commit right before it.'
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'read', label: 'You read the history with `git log`', check: ({ history }) => ran(history, 'log') },
    {
      id: 'branch',
      label: 'before-shipping-change points at the commit right before the limit changed',
      check: ({ state }) => resolve(state, 'before-shipping-change') === BEFORE_CHANGE
    }
  ],
  hints: [
    '`git log --oneline` lists one commit per line: its short id and its message. The messages tell you which commit changed the limit.',
    'The newest commit comes first, so the commit right before a change is the line below it. `git branch <name> <commit>` puts a new branch on any commit, named by its short id.',
    'Run `git log --oneline`, find "Lower the free shipping limit to 30", take the id on the line below it ("Add free shipping from 50 euros") and run `git branch before-shipping-change <that id>`.'
  ],
  debrief: {
    title: 'History is a list you can read',
    paragraphs: [
      '`git log` shows the commits of your branch, newest first: who made each one, when, and why. `--oneline` squeezes each commit into its short id and its subject, which is usually all you need to find your way.',
      'Every commit has an id, and the first seven characters are enough to name it. `git branch before-shipping-change <id>` put a branch on an old commit without moving main or touching your files.',
      'Good messages pay off right here: "Lower the free shipping limit to 30" told you where to look in seconds. Write yours so a teammate searching the log finds them just as fast.'
    ]
  },
  solution: [
    'git log --oneline',
    `git branch before-shipping-change ${shortId(BEFORE_CHANGE)}`
  ]
}
