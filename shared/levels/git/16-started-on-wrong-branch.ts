// Branching 2.2: half a contact form written on main, nothing committed yet. `git switch -c` takes the uncommitted
// work along to a new branch, where it gets committed; main never moves. The approved sample text of the chapter
// preview (.impeccable/mocks/previews/branching-preview.html).
import { branchExists, currentBranch, isWorkingTreeClean, resolve } from '../../git'
import type { GitState } from '../../git'
import type { GitScenario } from './types'
import { CONTACT_FORM, bakerySite } from './bakery'
import { once, treeOf } from './checks'

const BRANCH = 'feature/contact-form'

const setup = () => bakerySite()
  .file('contact.html', CONTACT_FORM)
  .build()

const start = once(setup)
const MAIN = () => resolve(start(), 'main')!

/** The newest commit on the branch adds contact.html: its parent has none. */
function addsContactForm(state: GitState): boolean {
  const tip = treeOf(state, BRANCH)
  const parent = treeOf(state, `${BRANCH}~1`)
  return !!tip?.['contact.html'] && !!parent && parent['contact.html'] === undefined
}

export const startedOnWrongBranch: GitScenario = {
  id: 'git-16-started-on-wrong-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Started on the wrong branch',
  story: [
    'You opened the bakery website to add a contact form and wrote half of it in `contact.html`. Then you noticed the prompt says `(main)`. Nothing is committed yet, but main goes live every evening, so the form can\'t land there.',
    `Move your unfinished work to a new branch \`${BRANCH}\` and commit it there. main stays exactly as it is.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'on-branch', label: `You are on ${BRANCH}`, check: ({ state }) => currentBranch(state) === BRANCH },
    { id: 'committed', label: 'Its newest commit adds contact.html', check: ({ state }) => addsContactForm(state) },
    // only counts once the branch exists: at the start main is untouched anyway
    { id: 'main-unchanged', label: 'main is unchanged', check: ({ state }) => branchExists(state, BRANCH) && resolve(state, 'main') === MAIN() },
    { id: 'clean', label: 'Working tree clean', check: ({ state }) => isWorkingTreeClean(state) }
  ],
  hints: [
    'Uncommitted changes don\'t belong to a branch yet. They stay in your files when you create and switch to a new branch.',
    '`git switch -c <name>` creates a branch where you are and moves you onto it, your changes included.',
    `\`git switch -c ${BRANCH}\`, \`git add contact.html\`, \`git commit -m "Add contact form"\`.`
  ],
  debrief: {
    title: 'Your work isn\'t on a branch until you commit it',
    paragraphs: [
      'Changes you haven\'t committed live in your files and the staging area, not in main. A branch only gets them with a commit. That\'s why `switch -c` fixes this: the new branch starts on the same commit and your files stay as they are.',
      'Git only refuses a switch when it would overwrite your changes. And if you had already committed on main? Create the branch first, then move main back with `git reset`, as in Undo & recovery.'
    ]
  },
  solution: [
    `git switch -c ${BRANCH}`,
    'git add contact.html',
    'git commit -m "Add contact form"'
  ]
}
