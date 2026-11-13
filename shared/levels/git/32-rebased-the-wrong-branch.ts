// Disasters 7.3: on main, after pulling Maya's and Jonas's commits, you typed `git rebase feature/allergen-labels`
// (meant: rebase the feature onto main). The setup really runs that rebase, so main holds copies of their commits on
// top of yours, and the reflog shows the rebase from start to finish with main's old position right below it
// (HEAD@{4}, also ORIG_HEAD). Reset main back there, then do the rebase you meant. Rebasing the feature without fixing
// main, or resetting to the line of the rebase start, does not count. `git reset --hard origin/main` works too here,
// because main matched origin before; the debrief says so.
import { commitsOf, isAncestor, resolve } from '../../git'
import type { GitState } from '../../git'
import type { GitScenario } from './types'
import { INDEX, MENU, STYLE, bakerySite, text } from './bakery'
import { once } from './checks'

const BRANCH = 'feature/allergen-labels'
const YOURS = ['Show allergens next to each bake', 'Add the allergen key page']
/** Where main was before the rebase, counted in the reflog at the start (checked by the level tests). */
const BEFORE_REBASE = 'HEAD@{4}'

const ALLERGEN_MENU = MENU
  .replace('Sourdough loaf, 4.80', 'Sourdough loaf, 4.80 <abbr title="gluten">G</abbr>')
  .replace('Croissant, 1.90', 'Croissant, 1.90 <abbr title="gluten, milk, egg">G M E</abbr>')
  .replace('Cinnamon roll, 2.50', 'Cinnamon roll, 2.50 <abbr title="gluten, milk, egg">G M E</abbr>')
const ALLERGEN_KEY = text(
  '<!-- What the letters on the menu mean. Ben checked them against the recipes; ask him before changing any. -->',
  '<h2>Allergens</h2>',
  '<dl>',
  '  <dt>G</dt><dd>Gluten</dd>',
  '  <dt>M</dt><dd>Milk</dd>',
  '  <dt>E</dt><dd>Egg</dd>',
  '</dl>'
)
const SATURDAY = INDEX.replace('every morning from 7:00.', 'every morning from 7:00, on Saturdays from 6:30.')
const FOOTER = `${STYLE}/* The address line at the bottom of every page. (Jonas) */\nfooter {\n  font-size: 0.875rem;\n}\n`

const setup = () => bakerySite()
  .origin()
  .switch(BRANCH, { create: true })
  .file('menu.html', ALLERGEN_MENU)
  .commit(YOURS[0]!)
  .file('allergens.html', ALLERGEN_KEY)
  .commit(YOURS[1]!)
  .switch('main')
  .teammate('Maya', 'Open at 6:30 on Saturdays', { 'index.html': SATURDAY })
  .teammate('Jonas', 'Style the address footer', { 'style.css': FOOTER })
  .run('git pull')
  .rebase(BRANCH)
  .build()

/** main before the mistake: Maya's and Jonas's commits, exactly as on origin. */
const start = once(setup)
const ORIGIN = () => resolve(start(), 'origin/main')!

/** Your two commits sit right on top of main, unchanged in content and order. */
function onTopOfMain(state: GitState): boolean {
  const messages = commitsOf(state, `main..${BRANCH}`).map(commit => commit.message).reverse()
  return resolve(state, 'main') === ORIGIN() && isAncestor(state, 'main', BRANCH) && messages.join('\n') === YOURS.join('\n')
}

export const rebasedTheWrongBranch: GitScenario = {
  id: 'git-32-rebased-the-wrong-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 3,
  minutes: 7,
  title: 'Rebased the wrong branch',
  story: [
    `Maya and Jonas pushed to main this morning, so you pulled, and wanted to put \`${BRANCH}\` on top of the new main before opening your pull request. But you were still on main when you typed \`git rebase ${BRANCH}\`, and git did exactly what you asked: it replayed Maya's and Jonas's new commits on top of your branch. Now main contains your two unreviewed commits, and \`git status\` says main and origin/main have diverged. Nothing is pushed.`,
    `Put main back exactly where it was before the rebase, then do the rebase you meant: \`${BRANCH}\` on top of main.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'main-back', label: 'main is back where it was before the rebase, the same as origin/main', check: ({ state }) => resolve(state, 'main') === ORIGIN() },
    { id: 'on-top', label: `${BRANCH} sits on top of main, with your two commits`, check: ({ state }) => onTopOfMain(state) }
  ],
  hints: [
    'Before you fix anything, look at where main has been. `git reflog` lists every move of HEAD; the rebase shows up as several lines, from `rebase (start)` to `rebase (finish)`.',
    'The line right below `rebase (start)` is where main was before the rebase. `git reset --hard HEAD@{n}`, with that line\'s number, takes main back there; after a rebase git also keeps that spot as `ORIG_HEAD`. Then switch to your branch and rebase it onto main.',
    `\`git reflog\`, \`git reset --hard ${BEFORE_REBASE}\` (or \`git reset --hard ORIG_HEAD\`), \`git switch ${BRANCH}\`, \`git rebase main\`.`
  ],
  debrief: {
    title: 'A rebase is just more moves in the reflog',
    paragraphs: [
      `\`git rebase <base>\` replays the commits of the branch you're on onto \`<base>\`. On main, \`git rebase ${BRANCH}\` copied Maya's and Jonas's commits on top of your branch: new ids, and a main nobody else has.`,
      `The reflog showed the whole rebase, from \`rebase (start)\` to \`rebase (finish)\`, and right below it the position main had before. \`git reset --hard ${BEFORE_REBASE}\` put main back there; \`ORIG_HEAD\` points at the same commit until your next reset, merge or rebase. Here \`git reset --hard origin/main\` would have worked too, because main matched origin. The reflog works even when nothing else remembers.`,
      `Read the reflog numbers fresh each time: every move adds a line on top, so \`${BEFORE_REBASE}\` means something else after your next switch. And look at \`git status\` before a rebase: \`git rebase main\` always rebases the branch you're on.`
    ]
  },
  solution: [
    'git status',
    'git reflog',
    `git reset --hard ${BEFORE_REBASE}`,
    `git switch ${BRANCH}`,
    'git rebase main'
  ]
}
