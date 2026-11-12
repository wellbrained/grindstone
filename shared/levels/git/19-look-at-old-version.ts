// Branching 2.5: what did the menu page look like before Jonas's redesign? `git switch --detach <id>` (or
// `git checkout <id>`) shows that version without moving a branch; `git switch -c old-menu` then keeps it on a branch.
// Looking in a detached HEAD changes nothing that lasts, so the "looked" goal reads the history (like `git diff` in 1.3).
import { branchExists, commitsOf, currentBranch, resolve, shortId } from '../../git'
import type { GitState } from '../../git'
import type { CommandRecord, Scenario } from '../types'
import { INDEX, MENU, STYLE, bakerySite, text } from './bakery'
import { gitInvocations, hasFlag } from './checks'

const BRANCH = 'old-menu'
const REDESIGN = 'Redesign the menu page'

const MENU_BREAKFAST = MENU.replace('</ul>', '  <li>Saturday breakfast box: two rolls, jam and a coffee, 9.50</li>\n</ul>')
const MENU_CARDS = text(
  '<!-- Menu page, redesigned: one card per bake, photos come later. (Jonas) -->',
  '<h2>Our bakes</h2>',
  '<div class="cards">',
  '  <article class="card"><h3>Sourdough loaf</h3><p>4.80</p></article>',
  '  <article class="card"><h3>Croissant</h3><p>1.90</p></article>',
  '  <article class="card"><h3>Cinnamon roll</h3><p>2.50</p></article>',
  '</div>'
)
const STYLE_CARDS = STYLE + text('', '/* Menu cards: two per row on phones, four on wide screens. (Jonas) */', '.cards {', '  display: grid;', '  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));', '}')
const INDEX_SUNDAY = INDEX.replace('from 7:00.', 'from 7:00, on Sundays from 8:00.')

const setup = () => bakerySite()
  .file('menu.html', MENU_BREAKFAST)
  .commit('Add the Saturday breakfast box', { author: 'Maya' })
  .file('menu.html', MENU_CARDS)
  .file('style.css', STYLE_CARDS)
  .commit(REDESIGN, { author: 'Jonas' })
  .file('index.html', INDEX_SUNDAY)
  .commit('Open on Sundays', { author: 'Maya' })
  .build()

const MAIN = resolve(setup(), 'main')!
/** The last commit before the redesign. */
const BEFORE_REDESIGN = (() => {
  const history = commitsOf(setup(), 'main')
  return history[history.findIndex(commit => commit.message === REDESIGN) + 1]!.id
})()

/**
 * A successful `git switch --detach <rev>`, or a `git checkout <rev>` that named neither a branch nor a file (so it
 * detached HEAD). A relative rev such as HEAD~2 may no longer resolve now, so it is not resolved again.
 */
function detached(state: GitState, history: CommandRecord[]): boolean {
  return gitInvocations(history).some(({ args, exitCode }) => {
    if (exitCode !== 0) return false
    if (args[0] === 'switch') return hasFlag(args, 'd', '--detach')
    const rev = args[1]
    return args[0] === 'checkout' && args.length === 2 && !!rev && !rev.startsWith('-') && !branchExists(state, rev)
      && state.workdir[rev] === undefined && state.repo?.index[rev] === undefined
  })
}

export const lookAtOldVersion: Scenario = {
  id: 'git-19-look-at-old-version',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Look at an old version',
  story: [
    'Last week Jonas redesigned the menu page. Since then two regulars asked Maya where the Saturday breakfast box went: it didn\'t make it into the new design. Maya wants to see the old page again and keep it around while she and Jonas sort it out.',
    `Find the last commit before "${REDESIGN}" and look at the website as it was then, without moving any branch. Then keep that version on a new branch \`${BRANCH}\` and stay on it. main stays as it is.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'looked', label: 'You looked at the old version with a detached HEAD', check: ({ state, history }) => detached(state, history) },
    {
      id: 'branch',
      label: `You are on ${BRANCH}, at the last commit before the redesign`,
      check: ({ state }) => currentBranch(state) === BRANCH && resolve(state, BRANCH) === BEFORE_REDESIGN
    },
    // only counts once old-menu exists: at the start main is untouched anyway
    { id: 'main-unchanged', label: 'main is unchanged', check: ({ state }) => branchExists(state, BRANCH) && resolve(state, 'main') === MAIN }
  ],
  hints: [
    `\`git log --oneline\` lists the commits with their ids, newest first. You want the one right below "${REDESIGN}".`,
    '`git switch --detach <id>` (or `git checkout <id>`) puts you on that commit without a branch: a detached HEAD. Your files show that version, and no branch moves. `git switch -c <name>` then starts a branch right where you are.',
    `\`git switch --detach ${shortId(BEFORE_REDESIGN)}\`, \`cat menu.html\`, then \`git switch -c ${BRANCH}\`.`
  ],
  debrief: {
    title: 'A detached HEAD is for looking around',
    paragraphs: [
      'HEAD is where you are. Normally it points at a branch, and new commits move that branch. `git switch --detach <id>` points HEAD straight at a commit instead: your files show that version and no branch moves. That\'s a detached HEAD, and the prompt shows it.',
      'It\'s made for looking around. Commits you make there belong to no branch, though: switch away and only their id finds them (git warns you). `git switch -c old-menu` is the way out: it puts a branch where you are, and HEAD is attached again.',
      'If you already know the commit, `git switch -c old-menu <id>` does it in one step. `git switch main` takes you back to the redesign.'
    ]
  },
  solution: [
    'git log --oneline',
    `git switch --detach ${shortId(BEFORE_REDESIGN)}`,
    'cat menu.html',
    `git switch -c ${BRANCH}`
  ]
}
