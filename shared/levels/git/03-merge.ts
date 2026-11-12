// Merging 3.1: merge a finished feature branch into main (a fast-forward).
import { currentBranch, isAncestor, repo } from '../../git'
import type { Scenario } from '../types'

export const merge: Scenario = {
  id: 'git-03-merge',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Merge a finished branch',
  story: [
    'Your about page for the community garden site is done: two commits on feature/about-page, reviewed and approved. Nobody has touched main since you branched off.',
    'Bring the feature into main. Right now you are still on the feature branch.'
  ].join('\n\n'),
  setup: () => repo()
    .file('README.md', '# Community garden\n\nPlots, opening hours and the tool shed rota.')
    .file('src/home.ts', 'export const links = [\'Plots\', \'Hours\']')
    .commit('Add the home page')
    .switch('feature/about-page', { create: true })
    .file('src/about.ts', 'export const about = \'Run by neighbours since 2019.\'')
    .commit('Add the about page')
    .file('src/home.ts', 'export const links = [\'Plots\', \'Hours\', \'About\']')
    .commit('Link the about page from home')
    .build(),
  goals: [
    { id: 'on-main', label: 'You are on main', check: ({ state }) => currentBranch(state) === 'main' },
    { id: 'merged', label: 'main contains feature/about-page', check: ({ state }) => isAncestor(state, 'feature/about-page', 'main') }
  ],
  hints: [
    'You merge into the branch you are on. Which branch should receive the feature?',
    'Switch to the receiving branch, then merge the other one into it. Because main has not moved since you branched, git can simply move main forward: a fast-forward.',
    'Run `git switch main`, then `git merge feature/about-page`.'
  ],
  debrief: {
    title: 'Fast-forward',
    paragraphs: [
      '`git merge` always brings another branch into the one you are on, which is why you switched to main first.',
      'main had no commits of its own since feature/about-page started, so the feature already contained all of main. Git did not need a new commit: it moved the main label forward to the feature tip. That is a fast-forward.',
      'When both branches have new commits, git creates a merge commit with two parents instead: that is next. And when both changed the same lines, you get a conflict.'
    ]
  },
  solution: [
    'git switch main',
    'git merge feature/about-page'
  ]
}
