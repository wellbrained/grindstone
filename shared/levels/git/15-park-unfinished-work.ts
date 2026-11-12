// Undo & recovery 6.5: halfway through a feature, an urgent fix on main. `git switch main` refuses (your changes to
// src/products.js would be overwritten), so you stash, fix and commit on main, switch back and pop.
import { currentBranch, repo, resolve, stashEntries } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { changedIn } from './checks'

const text = (...lines: string[]) => `${lines.join('\n')}\n`
const BRANCH = 'feature/gift-cards'

const hours = (saturday: string) => text(
  '// Opening hours shown in the shop header. Maya changes them, nobody else.',
  `export const saturday = '${saturday}'`
)
const PRODUCTS = [
  '// What the shop sells. Prices in euros, updated by Maya every Monday.',
  'export const products = [',
  '  { name: \'Sourdough loaf\', price: 4.8 },',
  '  { name: \'Croissant\', price: 1.9 },'
]
const PRODUCTS_GIFT = [...PRODUCTS, '  { name: \'Gift card 25 EUR\', price: 25, giftCard: true },']
const PRODUCTS_WIP = text(...PRODUCTS_GIFT, '  { name: \'Gift card 50 EUR\', price: 50, giftCard: true }', ']')
const CART = [
  '// The shopping cart: items and their total.',
  'export const cart = []',
  '',
  'export const total = () => cart.reduce((sum, item) => sum + item.price, 0)'
]
const CART_WIP = text(...CART, '', '// Gift cards go out by email: no shipping. TODO: ask Maya about a minimum order', 'export const needsShipping = () => cart.some(item => !item.giftCard)')

const setup = () => repo()
  .file('README.md', '# Corner Bakery shop\n\nOrder bread and cakes online, pick them up or get them delivered.')
  .file('src/hours.js', hours('8:00-18:00'))
  .file('src/products.js', text(...PRODUCTS, ']'))
  .file('src/cart.js', text(...CART))
  .commit('Set up the online shop', { author: 'Maya' })
  .switch(BRANCH, { create: true })
  .file('src/products.js', text(...PRODUCTS_GIFT, ']'))
  .commit('Add a 25 euro gift card')
  // unfinished: one change staged, one not
  .file('src/products.js', PRODUCTS_WIP)
  .stage('src/products.js')
  .file('src/cart.js', CART_WIP)
  .build()

const MAIN = resolve(setup(), 'main')!
const FEATURE = resolve(setup(), BRANCH)!

const mainTree = (state: GitState) => {
  const tip = state.repo?.branches.main
  return tip ? state.repo!.commits[tip]!.tree : {}
}

/** main has one new commit on top of where it started, changing only src/hours.js to the new Saturday hours. */
function hoursFixed(state: GitState): boolean {
  const tip = state.repo?.branches.main
  const hoursFile = mainTree(state)['src/hours.js'] ?? ''
  return !!tip && state.repo!.commits[tip]!.parents[0] === MAIN && hoursFile.includes('8:00-14:00') && !hoursFile.includes('18:00')
    && JSON.stringify(changedIn(state, 'main')) === JSON.stringify(['src/hours.js'])
}

export const parkUnfinishedWork: Scenario = {
  id: 'git-15-park-unfinished-work',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 6,
  title: 'Park unfinished work',
  story: [
    `You are halfway through gift cards for the bakery shop on \`${BRANCH}\`: one change staged, one not, nothing committed. Then Maya calls: the shop header says Saturday until 18:00, but from this week the shop closes at 14:00. That fix has to go on main right now.`,
    `Put your unfinished work aside, change Saturday in \`src/hours.js\` to \`8:00-14:00\` on main and commit just that. Then go back to \`${BRANCH}\` and pick up your work where you left it, with nothing left in the stash.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'fixed', label: 'main has a new commit that changes only src/hours.js, to 8:00-14:00', check: ({ state }) => hoursFixed(state) },
    // the next two only count once the fix is on main: at the start you are on your branch with an empty stash already
    {
      id: 'back',
      label: `Back on ${BRANCH} with your unfinished work in your files, not in a commit`,
      check: ({ state }) => hoursFixed(state) && currentBranch(state) === BRANCH && resolve(state, BRANCH) === FEATURE
        && state.workdir['src/products.js'] === PRODUCTS_WIP && state.workdir['src/cart.js'] === CART_WIP
    },
    { id: 'stash-empty', label: 'Nothing left in the stash', check: ({ state }) => hoursFixed(state) && stashEntries(state).length === 0 }
  ],
  hints: [
    '`git switch main` refuses: your changes would be overwritten. You don\'t want to commit half-done work, so put it aside instead.',
    '`git stash` saves your staged and unstaged changes and leaves a clean working tree; `git stash list` shows what is parked. Back on your branch, `git stash pop` brings the newest entry back and removes it from the list.',
    `Run \`git stash\` and \`git switch main\`, change 18:00 to 14:00 in src/hours.js (\`edit src/hours.js\`), then \`git commit -am "Close at 14:00 on Saturdays"\`, \`git switch ${BRANCH}\` and \`git stash pop\`.`
  ],
  debrief: {
    title: 'The stash is a shelf for half-done work',
    paragraphs: [
      '`git stash` takes your uncommitted changes, staged and unstaged, puts them on a shelf and leaves your files as they are in the last commit. Now you can switch branches, fix something, even stash again: `git stash list` shows every entry, the newest as `stash@{0}`.',
      '`git stash pop` puts the newest entry back into your files and takes it off the shelf. `git stash apply` puts it back but keeps it there, and `git stash drop` throws an entry away. After `pop`, what was staged comes back unstaged: stage it again when you commit.',
      'New files git does not track yet stay where they are, unless you use `git stash -u`. And the stash is local: it never goes to origin, so don\'t leave work there for days.'
    ]
  },
  solution: [
    'git switch main',
    'git stash',
    'git stash list',
    'git switch main',
    'echo "// Opening hours shown in the shop header. Maya changes them, nobody else." > src/hours.js && echo "export const saturday = \'8:00-14:00\'" >> src/hours.js',
    'git commit -am "Close at 14:00 on Saturdays"',
    `git switch ${BRANCH}`,
    'git stash pop'
  ]
}
