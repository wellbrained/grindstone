// Level 2: work on a feature branch and leave main alone.
import { currentBranch, repo, resolve } from '../../git'
import type { Scenario } from '../types'
import { treeOf } from './checks'

const setup = () => repo()
  .file('README.md', '# Welcome app\n\nGreets every visitor.')
  .file('src/greeting.ts', 'export const greeting = \'Hello\'')
  .commit('Add a greeting')
  .build()

/** Where main points at the start (setups are deterministic, so this is the same id every time). */
let startMain: string | undefined
const mainAtStart = () => startMain ??= setup().repo!.branches.main!

export const branch: Scenario = {
  id: 'git-02-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Start a branch',
  story: [
    'The welcome app greets visitors with a plain "Hello". You want to try a friendlier greeting, but main is what the team ships, so experiments do not go there.',
    'Start a branch called feature/greeting, change the greeting in src/greeting.ts and commit it on that branch. main must stay exactly as it is.'
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'on-branch', label: 'You are on feature/greeting', check: ({ state }) => currentBranch(state) === 'feature/greeting' },
    {
      id: 'committed',
      label: 'feature/greeting has a commit that changes a file',
      check: ({ state }) => {
        const tip = treeOf(state, 'feature/greeting')
        const base = treeOf(state, mainAtStart())
        return !!tip && !!base && JSON.stringify(tip) !== JSON.stringify(base)
      }
    },
    { id: 'main-unchanged', label: 'main is unchanged', check: ({ state }) => resolve(state, 'main') === mainAtStart() }
  ],
  hints: [
    'Create the branch first, then make the change. Whatever you commit lands on the branch you are on.',
    'A branch is a movable label on a commit. `git switch -c <name>` creates one where you are and moves you onto it; new commits then move only that label.',
    'Run `git switch -c feature/greeting`, then `echo "export const greeting = \'Hello, friend!\'" > src/greeting.ts`, then `git commit -am "Make the greeting friendlier"`.'
  ],
  debrief: {
    title: 'A safe place to experiment',
    paragraphs: [
      'A branch is only a name pointing at a commit. `git switch -c feature/greeting` created that name on the commit main points at and made it your current branch.',
      'When you committed, git moved the current branch to the new commit. main did not move, because you were not on it. That is the whole trick: branches are cheap labels, so making one costs nothing.',
      'If the experiment fails, switch back to main and delete the branch. If it works, you merge it: that is the Merging chapter.'
    ]
  },
  solution: [
    'git switch -c feature/greeting',
    'echo "export const greeting = \'Hello, friend!\'" > src/greeting.ts',
    'git commit -am "Make the greeting friendlier"'
  ]
}
