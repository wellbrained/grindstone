// Workflows 8.3: `release/1.4` was cut from main before Maya's Christmas pages and Jonas's order form fix. Only the fix
// may go onto the release: `git cherry-pick <id>` copies it as a new commit (same message and author, a new id), then
// `git push`. Merging main into the release brings the Christmas pages along and fails; so does picking the wrong
// commit. The last hint names the fix's real id (checked by the level tests).
import { commitsOf, remoteBranchHead, resolve } from '../../git'
import type { GitState } from '../../git'
import type { GitScenario } from './types'
import { INDEX, bakerySite, text } from './bakery'
import { sameTree, treeOf } from './checks'

const RELEASE = 'release/1.4'
const FIX = 'Allow up to 12 loaves per order'

const orderForm = (max: number) => text(
  '<!-- Online orders, picked up at the shop. Maya bakes at most 12 loaves per order. -->',
  '<h2>Order bread</h2>',
  '<form id="order">',
  '  <label>Name <input name="name" required></label>',
  `  <label>Loaves <input name="count" type="number" min="1" max="${max}" value="1"></label>`,
  '  <button>Order</button>',
  '</form>'
)

const CHRISTMAS = text(
  '<!-- Christmas menu. Not for 1.4: Maya is still deciding on the stollen prices. -->',
  '<h2>Christmas menu</h2>',
  '<ul>',
  '  <li>Stollen, price to come</li>',
  '</ul>'
)

const setup = () => bakerySite()
  .file('order.html', orderForm(1))
  .commit('Add the order form')
  .branch(RELEASE)
  .file('christmas.html', CHRISTMAS)
  .commit('Add the Christmas menu page', { author: 'Maya' })
  .file('order.html', orderForm(12))
  .commit(FIX, { author: 'Jonas' })
  .file('index.html', `${INDEX}<p><a href="christmas.html">Our Christmas menu</a></p>\n`)
  .commit('Link the Christmas menu from the home page', { author: 'Maya' })
  .origin()
  .build()

const START = setup()
const RELEASE_TIP = resolve(START, RELEASE)!
/** Jonas's fix on main, the commit to pick. */
const RELEASE_FIX = resolve(START, 'main~1')!
/** What release/1.4 should hold afterwards: what it had, plus the fixed order form. */
const EXPECTED = { ...treeOf(START, RELEASE)!, 'order.html': orderForm(12) }

/** The release branch's newest commit is a copy of Jonas's fix, right on top of what the release had. */
function picked(state: GitState): boolean {
  const [tip] = commitsOf(state, RELEASE)
  return !!tip && tip.id !== RELEASE_FIX && tip.parents.length === 1 && tip.parents[0] === RELEASE_TIP
    && tip.message.split('\n')[0] === FIX && tip.author.name === 'Jonas'
}

export const fixTheReleaseBranch: GitScenario = {
  id: 'git-37-fix-the-release-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Bring a fix to the release branch',
  story: [
    `Version 1.4 of the website is on the test server, built from \`${RELEASE}\`, and goes live on Friday. Since the release branch was cut, main got Maya's Christmas pages, which aren't ready yet, and a fix from Jonas: the order form only let customers order one loaf.`,
    `Bring just Jonas's fix, "${FIX}", onto \`${RELEASE}\`, and push the release branch so the test server picks it up. main stays as it is.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'picked', label: `${RELEASE} has Jonas's fix as a new commit on top`, check: ({ state }) => picked(state) },
    // only counts once the release moved: at the start it has nothing from main anyway
    {
      id: 'nothing-else',
      label: 'Nothing else from main came along: no Christmas pages',
      check: ({ state }) => resolve(state, RELEASE) !== RELEASE_TIP && sameTree(treeOf(state, RELEASE), EXPECTED)
    },
    {
      id: 'pushed',
      label: `origin's ${RELEASE} has it too`,
      check: ({ state }) => resolve(state, RELEASE) !== RELEASE_TIP && remoteBranchHead(state, RELEASE) === resolve(state, RELEASE)
    }
  ],
  hints: [
    `\`git log --oneline main\` shows Jonas's commit and its id. Merging main into \`${RELEASE}\` would bring the Christmas pages along.`,
    '`git cherry-pick <commit>` applies the change of one commit on top of the branch you\'re on, as a new commit with the same message and author.',
    `\`git switch ${RELEASE}\`, \`git cherry-pick ${RELEASE_FIX.slice(0, 7)}\`, \`git push\`.`
  ],
  debrief: {
    title: 'One commit, copied where it\'s needed',
    paragraphs: [
      `A release branch only takes fixes. \`git cherry-pick\` copied the change of Jonas's commit onto \`${RELEASE}\` as a new commit: same message, same author, a new id, because it has a different parent.`,
      'The fix now exists twice, on main and on the release branch. That\'s fine: when the release is merged back, git sees the same change on both sides and nothing conflicts. Many teams pick with `-x`, which adds "(cherry picked from commit …)" to the message, so you can always find the original.',
      'Fix on main first, then pick onto the release, not the other way round: main must have every fix, or the next release brings the bug back.'
    ]
  },
  solution: [
    `git switch ${RELEASE}`,
    `git cherry-pick ${RELEASE_FIX.slice(0, 7)}`,
    'git push'
  ]
}
