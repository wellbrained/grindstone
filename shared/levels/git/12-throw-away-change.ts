// Undo & recovery 6.2: before a commit, throw away a broken experiment (`git restore`) and unstage a draft (`git restore --staged`).
import { headCommit, repo } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'

const text = (...lines: string[]) => `${lines.join('\n')}\n`

const MENU = text(
  '<!-- The weekly menu. Maya updates it every Monday morning. -->',
  '<h2>This week</h2>',
  '<ul class="menu">',
  '  <li>Sourdough loaf</li>',
  '  <li>Croissant</li>',
  '  <li>Cinnamon roll</li>',
  '</ul>'
)
const MENU_EXPERIMENT = text(
  '<!-- The weekly menu. Maya updates it every Monday morning. -->',
  '<h2>This week</h2>',
  '<!-- trying a three-column grid: on phones the list runs off the screen -->',
  '<div class="menu-grid">',
  '  <div>Sourdough loaf</div>',
  '  <div>Croissant',
  '  <div>Cinnamon roll</div>',
  '</ul>'
)
const HOURS = text(
  '<!-- Opening hours, as on the sign at the door. Changes go through Maya. -->',
  '<h2>Opening hours</h2>',
  '<p>Monday to Saturday, 7:00 to 18:00</p>'
)
const HOURS_SUNDAY = HOURS + '<p>Sunday, 8:00 to 12:00</p>\n'
const PRICES = text(
  '// Prices shown on the menu page, in euros.',
  'export const prices = {',
  '  sourdough: 4.80,',
  '  croissant: 1.90,',
  '  birthdayCake: 28.00',
  '}'
)
const PRICES_DRAFT = text(
  '// Prices shown on the menu page, in euros.',
  '// DRAFT: new cake prices, waiting for Maya to confirm. Do not commit yet.',
  'export const prices = {',
  '  sourdough: 4.80,',
  '  croissant: 1.90,',
  '  birthdayCake: 32.00',
  '}'
)

const setup = () => repo()
  .file('index.html', '<!doctype html>\n<title>Corner Bakery</title>\n<h1>Corner Bakery</h1>\n<p>Fresh bread every morning from 7:00.</p>')
  .file('menu.html', MENU)
  .file('hours.html', HOURS)
  .file('prices.js', PRICES)
  .commit('Start the bakery website', { author: 'Maya' })
  .file('hours.html', HOURS_SUNDAY)
  .file('prices.js', PRICES_DRAFT)
  .stage('hours.html', 'prices.js')
  .file('menu.html', MENU_EXPERIMENT)
  .build()

const staged = (state: GitState, path: string) => state.repo?.index[path]
const committed = (state: GitState, path: string) => headCommit(state)?.tree[path]

export const throwAwayChange: Scenario = {
  id: 'git-12-throw-away-change',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Throw away a change',
  story: [
    'Maya asked you to put the new Sunday hours on the bakery website, and they are staged in `hours.html`. But `git add .` also staged your draft of `prices.js`, with cake prices Maya has not confirmed yet. And `menu.html` still holds a grid layout you tried: it broke the page, and you don\'t want it any more.',
    'Before you commit: throw away the experiment in `menu.html`, take `prices.js` out of the staging area but keep your draft in the file, and leave `hours.html` staged.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'menu',
      label: 'menu.html is back to the last committed version',
      check: ({ state }) => state.workdir['menu.html'] === MENU && staged(state, 'menu.html') === MENU
    },
    {
      id: 'prices',
      label: 'prices.js is no longer staged, and your draft is still in the file',
      check: ({ state }) => staged(state, 'prices.js') === committed(state, 'prices.js') && state.workdir['prices.js'] === PRICES_DRAFT
    },
    { id: 'hours', label: 'hours.html is still staged', check: ({ state }) => staged(state, 'hours.html') === HOURS_SUNDAY && committed(state, 'hours.html') === HOURS }
  ],
  hints: [
    '`git status` tells you how to undo each kind of change: look at the lines in brackets under each heading.',
    '`git restore <file>` throws away the unstaged changes in a file: it copies the staged version back over it. `git restore --staged <file>` only takes a file out of the staging area; your edits stay in the file.',
    'Run `git restore menu.html`, then `git restore --staged prices.js`.'
  ],
  debrief: {
    title: 'Two directions of restore',
    paragraphs: [
      '`git restore <file>` copies the staged version (the last commit, if nothing is staged) over the file in your working tree. The grid experiment is gone, and since it was never committed, git has no copy to bring back: look at `git diff` before you restore.',
      '`git restore --staged <file>` goes one step up: it puts the last commit\'s version back into the staging area and leaves your file alone. Your draft prices are safe, they are just not part of the next commit any more.',
      'You may also meet the older spellings: `git checkout -- <file>` for the first, `git reset <file>` for the second. `restore` does the same and says what it does.'
    ]
  },
  solution: [
    'git status',
    'git restore menu.html',
    'git restore --staged prices.js'
  ]
}
