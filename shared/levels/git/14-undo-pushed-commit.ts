// Undo & recovery 6.4: a pushed commit that Jonas already pulled; undo it with `git revert` and push.
// The approved sample text of the chapter preview (undo-preview.html); the hash in the last hint is the real one.
import { branchExists, commitsOf, remoteBranchHead, repo, resolve, shortId } from '../../git'
import type { Tree } from '../../git'
import type { Scenario } from '../types'
import { text } from './bakery'
import { treeOf } from './checks'

const prices = (sourdough: string, croissant: string, cinnamonRoll: string) => text(
  '// Prices shown on the menu page. Keep two decimals:',
  '// the till prints exactly what is listed here. (Maya)',
  'export const prices = {',
  `  sourdough: ${sourdough},`,
  `  croissant: ${croissant},`,
  `  cinnamonRoll: ${cinnamonRoll}`,
  '}'
)
const PRICES = prices('4.80', '1.90', '2.50')
const PRICES_ROUNDED = prices('5', '2', '3')
const HOURS = text(
  '<!-- Opening hours, as on the sign at the door. Changes go through Maya. -->',
  '<h2>Opening hours</h2>',
  '<p>Monday to Saturday, 7:00 to 18:00</p>'
)
const HOURS_SUNDAY = HOURS + '<p>Sunday, 8:00 to 12:00</p>\n'
const BAD_MESSAGE = 'Round prices to whole euros'

const setup = () => repo()
  .file('index.html', '<!doctype html>\n<title>Corner Bakery</title>\n<h1>Corner Bakery</h1>\n<script type="module" src="menu.js"></script>')
  .file('menu.js', '// Renders the menu page from prices.js.\nimport { prices } from \'./prices.js\'\n\nexport const rows = Object.entries(prices).map(([name, price]) => `${name}: ${price.toFixed(2)} EUR`)')
  .file('prices.js', PRICES)
  .file('hours.html', HOURS)
  .commit('Start the bakery website', { author: 'Maya' })
  .file('prices.js', PRICES_ROUNDED)
  .commit(BAD_MESSAGE)
  .file('hours.html', HOURS_SUNDAY)
  .commit('Add the Sunday opening hours', { author: 'Maya' })
  .origin()
  .build()

const START = setup()
const BAD = commitsOf(START, 'main').find(commit => commit.message === BAD_MESSAGE)!.id
const TIP = commitsOf(START, 'main')[0]!.id

/** The prices are back to two decimals and Maya's Sunday hours are still there. */
const undone = (tree: Tree | null) => tree?.['prices.js'] === PRICES && tree['hours.html'] === HOURS_SUNDAY

export const undoPushedCommit: Scenario = {
  id: 'git-14-undo-pushed-commit',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Undo a pushed commit',
  story: [
    `Yesterday you pushed "${BAD_MESSAGE}" to main. This morning Maya calls: the site now sells a croissant for 2 euros instead of 1.90. Jonas already pulled main and works on top of it, so rewriting history is off the table.`,
    'Undo that commit with a new commit that reverses it, then push.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'reverted',
      label: `A new commit on main undoes "${BAD_MESSAGE}"`,
      check: ({ state }) => branchExists(state, 'main') && resolve(state, 'main') !== TIP && undone(treeOf(state, 'main'))
    },
    { id: 'history', label: 'The original commit is still in the history', check: ({ state }) => commitsOf(state, 'main').some(commit => commit.id === BAD) },
    {
      id: 'pushed',
      label: 'origin/main has your fix',
      check: ({ state }) => {
        const tip = remoteBranchHead(state, 'main')
        return !!tip && tip !== TIP && undone(state.origin!.commits[tip]!.tree)
      }
    }
  ],
  hints: [
    'Find the commit first: `git log --oneline`. You want a command that adds a commit, not one that removes it.',
    '`git revert <hash>` writes the exact opposite of that commit as a new commit.',
    `\`git revert ${shortId(BAD)}\`, then \`git push\`.`
  ],
  debrief: {
    title: 'Revert, not reset, once it\'s shared',
    paragraphs: [
      '`reset` moves your branch back as if the commit never happened. That\'s fine for commits only you have. Once Jonas has pulled it, his history and yours would no longer match, and his next push brings the commit right back.',
      '`revert` leaves history alone and adds the undo on top. Everyone pulls it like any other commit, and the log tells the story: what went wrong, and that it was fixed.'
    ]
  },
  solution: [
    'git log --oneline',
    `git revert ${shortId(BAD)}`,
    'git push'
  ]
}
