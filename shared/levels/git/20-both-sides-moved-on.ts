// Merging 3.2: main got two commits (Jonas, Maya) while you finished feature/weekly-specials, in files you didn't
// touch. No fast-forward this time: `git merge` makes a merge commit with two parents, which you read in
// `git log --graph`.
import { isAncestor, resolve } from '../../git'
import type { GitScenario } from './types'
import { INDEX, MENU, STYLE, bakerySite, text } from './bakery'
import { isMergeOf, once, ranAfter } from './checks'

const BRANCH = 'feature/weekly-specials'

const SPECIALS = text(
  '<!-- Weekly specials: Maya picks three on Sunday evening, they run Tuesday to Saturday. -->',
  '<h2>This week\'s specials</h2>',
  '<ul>',
  '  <li>Plum cake, 3.20</li>',
  '  <li>Pumpkin seed rolls, 0.90</li>',
  '  <li>Hazelnut croissant, 2.40</li>',
  '</ul>'
)

const setup = () => bakerySite()
  .switch(BRANCH, { create: true })
  .file('specials.html', SPECIALS)
  .commit('Add the weekly specials page')
  .file('menu.html', `${MENU}<p><a href="specials.html">This week's specials</a></p>\n`)
  .commit('Link the specials from the menu')
  .switch('main')
  .file('index.html', `${INDEX}<p>Call us: 030 555 0123</p>\n`)
  .commit('Add the shop\'s phone number', { author: 'Jonas' })
  .file('style.css', `${STYLE}h1, h2 {\n  font-family: Georgia, serif;\n}\n`)
  .commit('Use the shop sign\'s serif for headings', { author: 'Maya' })
  .switch(BRANCH)
  .build()

const start = once(setup)
const MAIN = () => resolve(start(), 'main')!
const FEATURE = () => resolve(start(), BRANCH)!

export const bothSidesMovedOn: GitScenario = {
  id: 'git-20-both-sides-moved-on',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Both sides moved on',
  story: [
    `Your weekly specials page for the bakery website is done: two commits on \`${BRANCH}\`, and you're still on that branch. While you worked, Jonas added the shop's phone number and Maya changed the heading font, both straight on main and in files you didn't touch.`,
    `Merge your branch into main. Since main has moved on too, git can't simply move it forward: it makes a merge commit. Then look at the result with \`git log --graph\`.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'merged', label: `main contains ${BRANCH}`, check: ({ state }) => isAncestor(state, FEATURE(), 'main') },
    {
      id: 'merge-commit',
      label: 'main ends in a merge commit whose parents are Maya\'s commit and yours',
      check: ({ state }) => isMergeOf(state, 'main', MAIN(), FEATURE())
    },
    {
      id: 'looked',
      label: 'You looked at the merge with `git log --graph`',
      check: ({ state, history }) => isMergeOf(state, 'main', MAIN(), FEATURE()) && ranAfter(history, 'log', 'merge', args => args.includes('--graph'))
    }
  ],
  hints: [
    'You merge into the branch you\'re on, so start from main. This time main has commits your branch doesn\'t have.',
    'Git compares both tips with the commit where they split, takes the changes of both sides and records them in a new commit with two parents. `git log --graph` draws both lines of work and where they meet.',
    `Run \`git switch main\`, \`git merge ${BRANCH}\`, then \`git log --graph --oneline\`.`
  ],
  debrief: {
    title: 'Two parents, one history',
    paragraphs: [
      'Both branches had new commits since they split, so a fast-forward was impossible: moving main to your tip would have dropped Jonas\'s and Maya\'s work. Git did a three-way merge instead. It compared both tips with the commit where they split, the merge base, and took the changes of both sides.',
      `Nobody had changed the same lines, so git needed no help. It recorded the result in a merge commit with two parents: the first is where main was, the second is the tip of your branch. Its message, "Merge branch '${BRANCH}'", says what came in.`,
      'In `git log --graph` the two lines of work run side by side and join at the merge commit. Your commits are still there as they were: a merge adds one commit and rewrites nothing, which is why it is safe on a branch other people use.'
    ]
  },
  solution: [
    'git switch main',
    `git merge ${BRANCH}`,
    'git log --graph --oneline'
  ]
}
