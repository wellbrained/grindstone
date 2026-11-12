// Level 2: work on a feature branch and leave main alone.
import { currentBranch, resolve } from '../../git'
import type { Scenario } from '../types'
import { bakerySite } from './bakery'
import { once, treeOf } from './checks'

const BRANCH = 'feature/welcome-line'

// One line on purpose: a single `echo` can rewrite it.
const setup = () => bakerySite()
  .file('welcome.html', '<p>Welcome to Corner Bakery.</p>\n')
  .commit('Add the welcome line', { author: 'Jonas' })
  .build()

/** Where main points at the start (setups are deterministic, so this is the same id every time). */
const start = once(setup)
const mainAtStart = () => start().repo!.branches.main!

export const branch: Scenario = {
  id: 'git-02-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Start a branch',
  story: [
    'The bakery website greets visitors with a plain "Welcome to Corner Bakery." in `welcome.html`. Maya would like to try something friendlier, but main goes live every evening, so experiments do not go there.',
    `Start a branch called ${BRANCH}, change the line in welcome.html and commit it on that branch. main must stay exactly as it is.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'on-branch', label: `You are on ${BRANCH}`, check: ({ state }) => currentBranch(state) === BRANCH },
    {
      id: 'committed',
      label: `${BRANCH} has a commit that changes a file`,
      check: ({ state }) => {
        const tip = treeOf(state, BRANCH)
        const base = treeOf(state, mainAtStart())
        return !!tip && !!base && JSON.stringify(tip) !== JSON.stringify(base)
      }
    },
    { id: 'main-unchanged', label: 'main is unchanged', check: ({ state }) => resolve(state, 'main') === mainAtStart() }
  ],
  hints: [
    'Create the branch first, then make the change. Whatever you commit lands on the branch you are on.',
    'A branch is a movable label on a commit. `git switch -c <name>` creates one where you are and moves you onto it; new commits then move only that label.',
    `Run \`git switch -c ${BRANCH}\`, then \`echo "<p>Welcome in, the ovens are warm!</p>" > welcome.html\`, then \`git commit -am "Make the welcome line friendlier"\`.`
  ],
  debrief: {
    title: 'A safe place to experiment',
    paragraphs: [
      `A branch is only a name pointing at a commit. \`git switch -c ${BRANCH}\` created that name on the commit main points at and made it your current branch.`,
      'When you committed, git moved the current branch to the new commit. main did not move, because you were not on it. That is the whole trick: branches are cheap labels, so making one costs nothing.',
      'If the experiment fails, switch back to main and delete the branch. If it works, you merge it: that is the Merging chapter.'
    ]
  },
  solution: [
    `git switch -c ${BRANCH}`,
    'echo "<p>Welcome in, the ovens are warm!</p>" > welcome.html',
    'git commit -am "Make the welcome line friendlier"'
  ]
}
