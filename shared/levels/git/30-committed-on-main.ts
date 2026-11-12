// Disasters 7.1: two local commits on main that belong on a feature branch (the team changes main only through pull
// requests); nothing is pushed. A new branch keeps the commits, `reset --hard origin/main` takes main back, then you
// switch. A soft reset leaves the changes staged on main; resetting before the branch exists loses the commits (7.2
// shows how the reflog would bring them back).
import { currentBranch, isWorkingTreeClean, resolve } from '../../git'
import type { Scenario } from '../types'
import { INDEX, bakerySite, text } from './bakery'

const BRANCH = 'feature/cake-orders'

const CAKE_ORDER = text(
  '<!-- Cake orders. Maya needs two days\' notice for a whole cake; orders arrive by email for now. -->',
  '<h2>Order a cake</h2>',
  '<form id="cake-order">',
  '  <label>Cake <select name="cake"><option>Chocolate</option><option>Carrot</option><option>Cheesecake</option></select></label>',
  '  <label>Pick-up day <input name="day" type="date" required></label>',
  '  <button>Send order</button>',
  '</form>'
)
const LINKED = INDEX.replace('<a href="menu.html">See the menu</a>', '<a href="menu.html">See the menu</a> or <a href="cake-order.html">order a cake</a>.')

const setup = () => bakerySite()
  .origin()
  .file('cake-order.html', CAKE_ORDER)
  .commit('Add the cake order form')
  .file('index.html', LINKED)
  .commit('Link the cake order form from the home page')
  .build()

const TIP = resolve(setup(), 'main')!
const ORIGIN = resolve(setup(), 'origin/main')!

export const committedOnMain: Scenario = {
  id: 'git-30-committed-on-main',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Committed on main by mistake',
  story: [
    'You came in early and got straight to work on cake orders for the bakery website: two commits, "Add the cake order form" and "Link the cake order form from the home page". Only then did you notice `git status` saying "On branch main". The team changes main only through pull requests, but you haven\'t pushed yet, so nobody has these commits.',
    `Move both commits to a new branch \`${BRANCH}\`, put main back where origin/main is, and carry on on the new branch. Your working tree is clean, so moving main back can't throw anything away here; still, check that nothing is uncommitted first: the way back to origin's main throws away uncommitted work for good.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'branch', label: `${BRANCH} has both of your commits`, check: ({ state }) => resolve(state, BRANCH) === TIP },
    { id: 'main-back', label: 'main is back on origin/main, without your commits', check: ({ state }) => resolve(state, 'main') === ORIGIN },
    {
      id: 'on-branch',
      label: `You're on ${BRANCH}, with nothing left uncommitted`,
      check: ({ state }) => currentBranch(state) === BRANCH && isWorkingTreeClean(state)
    }
  ],
  hints: [
    'A branch is only a name for a commit. Create the new branch first, right where main is now: it keeps both commits, so moving main afterwards can\'t lose them.',
    '`git branch <name>` creates a branch without switching to it. `git reset --hard origin/main` then moves main back and makes your files match; `--soft` or the default would leave your changes behind on main.',
    `\`git branch ${BRANCH}\`, \`git reset --hard origin/main\`, then \`git switch ${BRANCH}\`.`
  ],
  debrief: {
    title: 'Name the commits first, then move main',
    paragraphs: [
      `Your commits were never really "on main": main is a name that pointed at them. \`git branch ${BRANCH}\` put a second name on the same commit, so when \`git reset --hard origin/main\` moved main back, the commits still had a branch holding on to them.`,
      'The order matters. Reset first, and no branch points at the commits any more: they vanish from `git log` and from the graph. The reflog still has them for a while (that\'s the next scenario), but it\'s easier not to need it.',
      '`--hard` was right here because it also puts your files back to origin/main; with `--soft` or the default, your changes would have stayed on main, staged or unstaged. And it was safe because `git status` was clean: `--hard` throws away uncommitted work for good.'
    ]
  },
  solution: [
    'git status',
    `git branch ${BRANCH}`,
    'git reset --hard origin/main',
    `git switch ${BRANCH}`
  ]
}
