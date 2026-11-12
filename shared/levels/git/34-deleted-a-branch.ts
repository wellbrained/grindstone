// Disasters 7.5: an hour ago `git branch -D feature/loyalty-card` deleted two unmerged, unpushed commits; since then you
// committed a price fix on main. The story quotes git's "Deleted branch ... (was <id>)" line (the id is the deterministic
// one, checked by the level tests); HEAD's reflog has the commits too. Resetting main onto them does not count: the main
// goal only counts once the branch is back, so nothing ticks at the start.
import { resolve } from '../../git'
import type { Scenario } from '../types'
import { MENU, bakerySite, text } from './bakery'

const BRANCH = 'feature/loyalty-card'
const NEWEST = 'Show the stamps on the loyalty card'

const CARD_LINES = [
  '<!-- Loyalty card: Maya\'s idea, a free loaf for every ten. Stamps are counted at the till for now. -->',
  '<h2>Your loyalty card</h2>',
  '<p>Buy ten loaves, the eleventh is on us.</p>'
]
const CARD = text(...CARD_LINES)
const CARD_STAMPS = text(...CARD_LINES, '<ol class="stamps" aria-label="Stamps so far"></ol>')
const PRICE_FIX = MENU.replace('Croissant, 1.90', 'Croissant, 1.95')

const setup = () => bakerySite()
  .origin()
  .switch(BRANCH, { create: true })
  .file('loyalty.html', CARD)
  .commit('Add the loyalty card page')
  .file('loyalty.html', CARD_STAMPS)
  .commit(NEWEST)
  .switch('main')
  .run(`git branch -D ${BRANCH}`)
  .file('menu.html', PRICE_FIX)
  .commit('Fix the croissant price on the menu')
  .build()

/** The deleted branch's tip: your newest loyalty card commit. */
const TIP = Object.values(setup().repo!.commits).find(commit => commit.message === NEWEST)!.id
const MAIN = resolve(setup(), 'main')!

export const deletedABranch: Scenario = {
  id: 'git-34-deleted-a-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Deleted a branch with unmerged work',
  story: [
    `An hour ago you tidied up your branches and deleted \`${BRANCH}\` with \`git branch -D\`, sure it was merged. It wasn't: your two commits for Maya's loyalty card page were never merged or pushed. git even told you, "Deleted branch ${BRANCH} (was ${TIP.slice(0, 7)}).", but you only noticed now. Since then you've fixed the croissant price on main.`,
    `Bring \`${BRANCH}\` back with both commits. Use the id git printed, or find the commit in \`git reflog\`. Leave main as it is.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'restored', label: `${BRANCH} is back, with both of your commits`, check: ({ state }) => resolve(state, BRANCH) === TIP },
    {
      id: 'main-unchanged',
      label: 'main is unchanged: your price fix, none of the loyalty card commits',
      check: ({ state }) => resolve(state, BRANCH) === TIP && resolve(state, 'main') === MAIN
    }
  ],
  hints: [
    'Deleting a branch only deletes the name. The commits are still in your repository, and the id git printed when it deleted the branch points at the newer one.',
    '`git branch <name> <commit>` creates a branch on any commit, without switching to it. If you don\'t have the id, `git reflog` lists the commits you made on the branch: the newest is the line right below "checkout: moving from feature/loyalty-card to main".',
    `\`git branch ${BRANCH} ${TIP.slice(0, 7)}\` (or \`git reflog\`, then \`git branch ${BRANCH} HEAD@{2}\`).`
  ],
  debrief: {
    title: 'A deleted branch is a lost name, not lost commits',
    paragraphs: [
      `\`git branch -D\` removed the name \`${BRANCH}\`; your two commits stayed. \`git branch ${BRANCH} <id>\` put a new name on the newer one, and its parent came back with it.`,
      `The id is in the "Deleted branch ... (was ...)" line, and HEAD's reflog has it too, because you made those commits there. The branch's own reflog is deleted with the branch, so \`${BRANCH}@{1}\` doesn't work any more.`,
      'That\'s why `-d` refuses unmerged branches: read its message before you reach for `-D`. And push work you care about, even when it isn\'t finished: a branch on origin survives whatever happens to your local one.'
    ]
  },
  solution: [
    'git reflog',
    `git branch ${BRANCH} HEAD@{2}`
  ]
}
