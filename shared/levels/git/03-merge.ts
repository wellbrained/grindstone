// Merging 3.1: merge a finished feature branch into main (a fast-forward).
import { currentBranch, isAncestor } from '../../git'
import type { GitScenario } from './types'
import { INDEX, bakerySite, text } from './bakery'

const BRANCH = 'feature/about-page'

const ABOUT = text(
  '<!-- About page. Maya wrote the text; the photo of the shop follows. -->',
  '<h2>About us</h2>',
  '<p>Maya opened Corner Bakery in 2019. Everything is baked here, every morning.</p>'
)

export const merge: GitScenario = {
  id: 'git-03-merge',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Merge a finished branch',
  story: [
    `Your about page for the bakery website is done: two commits on ${BRANCH}, reviewed and approved by Maya. Nobody has touched main since you branched off.`,
    'Bring the feature into main. Right now you are still on the feature branch.'
  ].join('\n\n'),
  setup: () => bakerySite()
    .switch(BRANCH, { create: true })
    .file('about.html', ABOUT)
    .commit('Add the about page')
    .file('index.html', `${INDEX}<p><a href="about.html">About us</a></p>\n`)
    .commit('Link the about page from the home page')
    .build(),
  goals: [
    { id: 'on-main', label: 'You are on main', check: ({ state }) => currentBranch(state) === 'main' },
    { id: 'merged', label: `main contains ${BRANCH}`, check: ({ state }) => isAncestor(state, BRANCH, 'main') }
  ],
  hints: [
    'You merge into the branch you are on. Which branch should receive the feature?',
    'Switch to the receiving branch, then merge the other one into it. Because main has not moved since you branched, git can simply move main forward: a fast-forward.',
    `Run \`git switch main\`, then \`git merge ${BRANCH}\`.`
  ],
  debrief: {
    title: 'Fast-forward',
    paragraphs: [
      '`git merge` always brings another branch into the one you are on, which is why you switched to main first.',
      `main had no commits of its own since ${BRANCH} started, so the feature already contained all of main. Git did not need a new commit: it moved the main label forward to the feature tip. That is a fast-forward.`,
      'When both branches have new commits, git creates a merge commit with two parents instead: that is next. And when both changed the same lines, you get a conflict.'
    ]
  },
  solution: [
    'git switch main',
    `git merge ${BRANCH}`
  ]
}
