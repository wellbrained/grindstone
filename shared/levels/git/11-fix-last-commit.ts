// Undo & recovery 6.1: a typo in the last commit's message and a forgotten file, not pushed yet: `git commit --amend`.
import { headCommit, isWorkingTreeClean, repo, resolve } from '../../git'
import type { Scenario } from '../types'

const STREAK_CSS = [
  '/* The streak badge next to each habit: how many days in a row you kept it up. */',
  '.streak {',
  '  font-weight: 600;',
  '  color: #c05a00;',
  '}',
  ''
].join('\n')

const setup = () => repo()
  .file('README.md', '# Habit tracker\n\nTick off your habits every day. Open index.html in your browser; there is no build step.')
  .file('index.html', '<h1>Habit tracker</h1>\n<ul id="habits"></ul>\n<script type="module" src="src/habits.js"></script>')
  .file('src/habits.js', '// The habits you tick off each day. Ben keeps the list short on purpose: three is plenty.\nexport const habits = [\'water\', \'walk\', \'read\']')
  .commit('Start the habit tracker', { author: 'Ben' })
  .file('src/today.js', '// Today\'s list: every habit with a tick box.\nimport { habits } from \'./habits.js\'\n\nexport const today = habits.map(name => ({ name, done: false }))')
  .commit('Show today\'s habits')
  .origin()
  .file('src/streak.js', [
    '// Counts the days in a row you ticked a habit, newest day last. The badge styles are in src/streak.css.',
    'export function streak(days) {',
    '  let count = 0',
    '  for (const done of days) count = done ? count + 1 : 0',
    '  return count',
    '}'
  ].join('\n'))
  .commit('Add strak counter')
  .file('src/streak.css', STREAK_CSS)
  .build()

export const fixLastCommit: Scenario = {
  id: 'git-11-fix-last-commit',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Fix the last commit',
  story: [
    'You just committed the streak counter for the habit tracker, and two things slipped through: the message says "Add strak counter", and `src/streak.css` is still lying next to it, untracked. You have not pushed yet.',
    'Fix that commit: it should be called "Add streak counter" and hold `src/streak.css` too. Keep it one commit, not two.'
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'message', label: 'The newest commit is called "Add streak counter"', check: ({ state }) => headCommit(state)?.message === 'Add streak counter' },
    {
      id: 'files',
      label: 'It holds src/streak.js and src/streak.css',
      check: ({ state }) => {
        const tree = headCommit(state)?.tree ?? {}
        return tree['src/streak.js'] !== undefined && tree['src/streak.css'] === STREAK_CSS
      }
    },
    {
      id: 'one-commit',
      label: 'Still one commit on top of origin/main',
      check: ({ state }) => resolve(state, 'HEAD~1') !== null && resolve(state, 'HEAD~1') === resolve(state, 'origin/main')
    },
    { id: 'clean', label: 'Working tree clean', check: ({ state }) => isWorkingTreeClean(state) }
  ],
  hints: [
    'The commit is not pushed, so you can still replace it. Stage the forgotten file first: whatever is staged goes into the replacement.',
    '`git commit --amend` swaps the last commit for a new one: it takes the old commit\'s changes plus everything staged, and `-m` gives it a new message.',
    'Run `git add src/streak.css`, then `git commit --amend -m "Add streak counter"`.'
  ],
  debrief: {
    title: 'Amend replaces the last commit',
    paragraphs: [
      '`git commit --amend` builds a new commit from the last one\'s changes plus whatever you staged, with the message you give it. The old commit drops out of your branch, and the new one gets a new id.',
      'That is why it is for commits nobody else has yet. Once a commit is pushed and a teammate pulled it, their history still has the old one; fix it with a new commit instead (or `git revert`, later in this chapter).',
      'Forgot a file but the message is fine? `git commit --amend --no-edit` keeps the message as it is.'
    ]
  },
  solution: [
    'git add src/streak.css',
    'git commit --amend -m "Add streak counter"'
  ]
}
