// Rewriting history 4.4 (the approved sample of the chapter preview): three commits ("Add gift card product page",
// "wip", "fix typo") become one, "Add gift cards to the shop", with `git rebase -i main`: reword the first, fixup the
// other two, then write the message. The todo list and the message open in the editor; the solution saves them with
// `{ save }` steps (docs/features/levels.md). Main has not moved, so the rebase only rewrites your own commits.
import { commitsOf, isAncestor, operationInProgress, resolve, shortId } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { bakerySite, text } from './bakery'
import { sameTree, treeOf } from './checks'

const BRANCH = 'feature/gift-cards'
const MESSAGE = 'Add gift cards to the shop'

const giftCards = (...form: string[]) => text(
  '<!-- Gift cards: Maya sells the same amounts at the till, so keep them in line with the printed cards. -->',
  '<h2>Gift cards</h2>',
  '<p>Give someone their favourite bread. Our gift cards are valid for a year.</p>',
  ...form
)
const form = (button: string) => [
  '<form id="gift-card">',
  '  <label>Amount <select name="amount"><option>10.00</option><option>25.00</option></select></label>',
  '  <label>For <input name="for" required></label>',
  `  <button>${button}</button>`,
  '</form>'
]

const setup = () => bakerySite()
  .switch(BRANCH, { create: true })
  .file('gift-cards.html', giftCards())
  .commit('Add gift card product page')
  .file('gift-cards.html', giftCards(...form('Add to bakset')))
  .commit('wip')
  .file('gift-cards.html', giftCards(...form('Add to basket')))
  .commit('fix typo')
  .build()

const START = setup()
const TIP_TREE = treeOf(START, BRANCH)
const [FIX, WIP, PAGE] = commitsOf(START, BRANCH).map(commit => shortId(commit.id))
const MAIN = resolve(START, 'main')!

/** Your commits on top of main, once no rebase is in progress (until then the branch has not moved). */
const yourCommits = (state: GitState) =>
  operationInProgress(state) === null && isAncestor(state, MAIN, BRANCH) ? commitsOf(state, `main..${BRANCH}`) : []
const onlyOne = (state: GitState) => yourCommits(state).length === 1

export const tidyUpBeforeReview: Scenario = {
  id: 'git-25-tidy-up-before-review',
  track: 'git',
  kind: 'scenario',
  difficulty: 3,
  minutes: 7,
  title: 'Tidy up before review',
  story: [
    `Your gift card feature on \`${BRANCH}\` works, but its history tells the story of your afternoon: a real commit, then "wip", then "fix typo". Maya reviews every commit on its own, so give her one clean commit instead of three.`,
    `Squash the three into one commit called \`${MESSAGE}\`. Nothing is pushed yet, so rewriting is safe.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'one-commit', label: `\`${BRANCH}\` has exactly one commit on top of main`, check: ({ state }) => onlyOne(state) },
    { id: 'message', label: `It's called "${MESSAGE}"`, check: ({ state }) => onlyOne(state) && yourCommits(state)[0]!.message === MESSAGE },
    // the files never change in this level, so it only counts once there is one commit
    {
      id: 'changes',
      label: 'It has all the changes of the three old commits',
      check: ({ state }) => onlyOne(state) && sameTree(yourCommits(state)[0]!.tree, TIP_TREE)
    }
  ],
  hints: [
    '`git rebase -i main` lists your commits on top of main. You tell git what to do with each one by changing the word in front.',
    'Change the first `pick` to `reword` and the other two to `fixup`: they melt into the first commit and drop their messages. After Start rebase, git asks you for the new message.',
    `After \`git rebase -i main\`, make the list \`reword ${PAGE} …\`, \`fixup ${WIP} …\`, \`fixup ${FIX} …\` and Start rebase. Replace the message with \`${MESSAGE}\` and Save message.`
  ],
  debrief: {
    title: 'History is for the reader',
    paragraphs: [
      'While you work, small messy commits are fine; they\'re your safety net. Before others read them, tidy up: one commit per idea, each with a message that says why. Interactive rebase is the tool for that: reorder, merge, rename or drop commits.',
      'It creates new commits, so the same rule as rebase applies: only on commits nobody else has. If it\'s already pushed to your own branch, follow up with `git push --force-with-lease`, as in 4.3.'
    ]
  },
  solution: [
    'git rebase -i main',
    { save: `reword ${PAGE} Add gift card product page\nfixup ${WIP} wip\nfixup ${FIX} fix typo\n` },
    { save: `${MESSAGE}\n` }
  ]
}
