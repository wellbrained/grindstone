// Level 1: turn a plain folder into a repository and make the first commit.
import { folder, headCommit, isWorkingTreeClean } from '../../git'
import type { Scenario } from '../types'

export const firstCommit: Scenario = {
  id: 'git-01-first-commit',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 3,
  title: 'First commit',
  story: [
    'You started a small habit tracker over the weekend: a README.md and an app.js, sitting in a plain folder. Nothing is saved in git yet, so one bad edit and the working version is gone.',
    'Turn the folder into a git repository and save both files in a first commit.'
  ].join('\n\n'),
  setup: () => folder()
    .file('README.md', '# Habit tracker\n\nTick off one habit a day.')
    .file('app.js', 'const habits = [\'water\', \'walk\', \'read\']\nconsole.log(habits.join(\', \'))')
    .build(),
  goals: [
    { id: 'initialised', label: 'The folder is a git repository', check: ({ state }) => state.repo !== null },
    {
      id: 'committed',
      label: 'README.md and app.js are committed',
      check: ({ state }) => {
        const tree = headCommit(state)?.tree
        return !!tree && tree['README.md'] !== undefined && tree['app.js'] !== undefined
      }
    },
    { id: 'clean', label: 'Working tree clean: nothing left to commit', check: ({ state }) => state.repo !== null && isWorkingTreeClean(state) }
  ],
  hints: [
    'Git only tracks a folder once it is a repository. Then you choose what goes into a commit before you make it.',
    'Three steps: create the repository, stage the files (the staging area is the list of what the next commit will contain), then commit with a message.',
    'Run `git init`, then `git add .`, then `git commit -m "First commit"`.'
  ],
  debrief: {
    title: 'Your project has a history',
    paragraphs: [
      '`git init` created a hidden .git folder: that is the repository. Your files stayed exactly where they were; git just started watching the folder.',
      '`git add` copies the current content of files into the staging area (the index). `git commit` turns everything staged into a commit: a snapshot of the whole project with your message, your name and a time.',
      'The two steps exist so you can decide what belongs together. Change five files, stage two, and commit just those as one clear step.'
    ]
  },
  solution: [
    'git init',
    'git add .',
    'git commit -m "First commit"'
  ]
}
