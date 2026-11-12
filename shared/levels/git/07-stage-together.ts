// Basics 1.2: two unrelated changes, two commits. The approved sample text of ADR 0006 (preview basics-preview.html).
import { headCommit, isWorkingTreeClean, repo, resolve } from '../../git'
import type { Scenario } from '../types'
import { changedIn } from './checks'

const README_TYPO = [
  '# Corner Bakery website',
  '',
  'Openning hours, the weekly menu and how to order a cake.',
  '',
  '## Work on it',
  '',
  'Open index.html in your browser; there is no build step. Questions about the content go to Maya.'
].join('\n')

const setup = () => repo()
  .file('README.md', README_TYPO)
  .file('index.html', [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <title>Corner Bakery</title>',
    '</head>',
    '<body>',
    '  <h1>Corner Bakery</h1>',
    '  <!-- TODO (Maya): link the price list once the prices are final -->',
    '  <p>Fresh bread every morning from 7:00.</p>',
    '</body>',
    '</html>'
  ].join('\n'))
  .commit('Start the bakery website', { author: 'Maya' })
  .file('README.md', README_TYPO.replace('Openning', 'Opening'))
  .file('prices.md', [
    '# Price list',
    '',
    '<!-- Draft: Maya still has to confirm the cake prices. Do not publish yet. -->',
    '',
    '| Item | Price (EUR) |',
    '| --- | --- |',
    '| Sourdough loaf | 4.80 |',
    '| Croissant | 1.90 |',
    '| Birthday cake | TODO |'
  ].join('\n'))
  .build()

export const stageTogether: Scenario = {
  id: 'git-07-stage-together',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 5,
  title: 'Stage only what belongs together',
  story: [
    'You fixed a typo in `README.md` and, while you were at it, started a price list in `prices.md`. Maya wants the typo fix to go out today, without the half-finished price list.',
    'Make two commits: first the typo fix on its own, then the price list.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'typo-commit',
      label: 'The newest-but-one commit changes only README.md',
      check: ({ state }) => resolve(state, 'HEAD~1') !== null && JSON.stringify(changedIn(state, 'HEAD~1')) === JSON.stringify(['README.md'])
    },
    {
      id: 'prices-commit',
      label: 'The newest commit adds prices.md',
      check: ({ state }) => {
        const parent = resolve(state, 'HEAD~1')
        return !!parent && headCommit(state)?.tree['prices.md'] !== undefined && state.repo!.commits[parent]!.tree['prices.md'] === undefined
      }
    },
    { id: 'clean', label: 'Working tree clean', check: ({ state }) => isWorkingTreeClean(state) }
  ],
  hints: [
    '`git status` shows two changed files. You do not have to commit them together.',
    '`git add` takes a file name. Stage one file, commit, then stage the other.',
    '`git add README.md`, `git commit -m "Fix typo in README"`, then `git add prices.md`, `git commit -m "Add price list"`.'
  ],
  debrief: {
    title: 'Small commits, chosen on purpose',
    paragraphs: [
      'The staging area is where you decide what goes into the next commit. Two unrelated changes in one commit mean you cannot ship, review or undo one without the other.',
      'One idea per commit makes history readable and lets your team pick exactly the fix they need.'
    ]
  },
  solution: [
    'git add README.md',
    'git commit -m "Fix typo in README"',
    'git add prices.md',
    'git commit -m "Add price list"'
  ]
}
