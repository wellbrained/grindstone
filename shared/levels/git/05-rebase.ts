// Rewriting history 4.1 (v0.1's "Rebase", retitled): replay a feature branch on top of main with rebase, keeping history linear.
import { commitsOf, currentBranch, hasMergeCommits, isAncestor, operationInProgress, repo } from '../../git'
import type { Scenario } from '../types'
import { sameList } from './checks'

const YOUR_COMMITS = ['Highlight matches', 'Add a search box']

export const rebase: Scenario = {
  id: 'git-05-rebase',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Put your branch on top of main',
  story: [
    'You are building search for the recipe app on feature/search. Meanwhile Chris landed two commits on main, a new layout and an updated README.',
    'The team keeps history linear: no merge commits on feature branches. Move your two commits on top of the current main.'
  ].join('\n\n'),
  setup: () => repo()
    .file('README.md', '# Recipe box')
    .file('src/app.ts', 'export const title = \'Recipe box\'')
    .commit('Start the recipe app')
    .switch('feature/search', { create: true })
    .file('src/search.ts', 'export function search(query: string) {\n  return query.trim()\n}')
    .commit('Add a search box')
    .file('src/search.ts', 'export function search(query: string) {\n  return `<mark>${query.trim()}</mark>`\n}')
    .commit('Highlight matches')
    .switch('main')
    .file('src/layout.ts', 'export const columns = 2')
    .commit('Add a two-column layout', { author: 'Chris' })
    .file('README.md', '# Recipe box\n\nRun pnpm dev to start.')
    .commit('Explain how to start the app', { author: 'Chris' })
    .switch('feature/search')
    .build(),
  goals: [
    { id: 'contains-main', label: 'feature/search contains everything on main', check: ({ state }) => isAncestor(state, 'main', 'feature/search') },
    {
      id: 'linear',
      label: 'Only your two commits on top of main, no merge commits',
      check: ({ state }) => !hasMergeCommits(state, 'main..feature/search')
        && sameList(commitsOf(state, 'main..feature/search').map(commit => commit.message), YOUR_COMMITS)
    },
    { id: 'on-branch', label: 'You are on feature/search, no rebase in progress', check: ({ state }) => currentBranch(state) === 'feature/search' && !operationInProgress(state) }
  ],
  hints: [
    'You do not need to switch branches. The question is which commit your branch should start from.',
    'Rebase takes the commits that are only on your branch and replays them, one by one, on top of another branch. Your branch then starts at the tip of main, as if you had begun today.',
    'Run `git rebase main` while on feature/search. Check the result with `git log --oneline --graph --all`.'
  ],
  debrief: {
    title: 'Same work, new base',
    paragraphs: [
      '`git rebase main` found your two commits (the ones on feature/search but not on main), set the branch to main\'s tip and replayed each commit there.',
      'Replayed commits are new commits: same changes and messages, but a different parent, so they get new ids. Your old commits still exist for a while, but no branch points at them anymore.',
      'A merge would also have brought main in, at the price of a merge commit in the middle of your feature. Rebasing keeps the story straight: first everything on main, then your feature on top.'
    ]
  },
  solution: [
    'git rebase main'
  ]
}
