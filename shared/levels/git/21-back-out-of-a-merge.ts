// Merging 3.4 (the approved sample of the chapter preview): you merged Jonas's feature/menu-filter into your
// feature/allergens and it stopped on a conflict in code you don't know. The level starts inside that merge (the
// setup runs it), so every goal starts unticked; `git merge --abort` brings branch, index and files back.
import { currentBranch, isWorkingTreeClean, operationInProgress, resolve } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { MENU, bakerySite, text } from './bakery'
import { once, treeHasConflictMarkers } from './checks'

const BRANCH = 'feature/allergens'
const THEIRS = 'feature/menu-filter'

const menuJs = (...body: string[]) => text(
  '// Which items menu.html shows, and how. The items themselves come from src/items.js. (Jonas)',
  'export function visibleItems(items, filter) {',
  ...body,
  '}'
)
const MENU_JS = menuJs(
  '  // TODO (Jonas): filter by category once the buttons are in',
  '  return items'
)
const MENU_JS_ALLERGENS = `import { withAllergens } from './allergens.js'\n\n${menuJs(
  '  // Allergens are shown next to each item, never filtered out.',
  '  return items.map(item => ({ ...item, label: withAllergens(item) }))'
)}`
const MENU_JS_FILTER = menuJs(
  '  // Filter by category; \'all\' shows everything. (Jonas)',
  '  return filter === \'all\' ? items : items.filter(item => item.category === filter)'
)
const ALLERGENS = text(
  '// Allergens per item, checked by Maya against every recipe. Update this when a recipe changes!',
  'const ALLERGENS = {',
  '  \'Sourdough loaf\': [\'gluten\'],',
  '  \'Croissant\': [\'gluten\', \'milk\', \'egg\'],',
  '  \'Cinnamon roll\': [\'gluten\', \'milk\']',
  '}',
  '',
  'export const withAllergens = item => `${item.name} (contains ${(ALLERGENS[item.name] ?? []).join(\', \')})`'
)
const FILTER_BUTTONS = '<nav id="categories"><button data-filter="all">All</button> <button data-filter="bread">Bread</button> <button data-filter="pastry">Pastry</button></nav>\n'

const setup = () => bakerySite()
  .file('src/menu.js', MENU_JS)
  .commit('Build the menu list from data', { author: 'Jonas' })
  .switch(THEIRS, { create: true })
  .file('menu.html', MENU.replace('<ul>', `${FILTER_BUTTONS}<ul>`))
  .commit('Add category buttons to the menu', { author: 'Jonas' })
  .file('src/menu.js', MENU_JS_FILTER)
  .commit('Filter the menu by category', { author: 'Jonas' })
  .switch('main')
  .switch(BRANCH, { create: true })
  .file('src/allergens.js', ALLERGENS)
  .commit('Add the allergen list')
  .file('src/menu.js', MENU_JS_ALLERGENS)
  .commit('Show allergens next to each item')
  .merge(THEIRS, { conflicts: true })
  .build()

const start = once(setup)
const TIP = () => resolve(start(), BRANCH)!

const noMerge = (state: GitState) => !!state.repo && operationInProgress(state) === null

export const backOutOfAMerge: Scenario = {
  id: 'git-21-back-out-of-a-merge',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Back out of a merge',
  story: [
    `You're adding allergen labels to the bakery menu on \`${BRANCH}\` and wanted Jonas's new menu filter first, so you ran \`git merge ${THEIRS}\`. Git stopped with a conflict in \`src/menu.js\`, in code Jonas rewrote completely and you haven't seen yet. He's in a meeting until three.`,
    'Don\'t guess at his code. Cancel the merge so your branch and your files are exactly as they were before, and merge together with him later.'
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'no-merge', label: 'No merge in progress', check: ({ state }) => noMerge(state) },
    // true during the merge too (nothing is committed yet), so it only counts once the merge is over
    {
      id: 'branch',
      label: `${BRANCH} is where it was before the merge`,
      check: ({ state }) => noMerge(state) && currentBranch(state) === BRANCH && resolve(state, BRANCH) === TIP()
    },
    {
      id: 'clean',
      label: 'Working tree clean, no conflict markers left',
      check: ({ state }) => noMerge(state) && isWorkingTreeClean(state) && !treeHasConflictMarkers(state.workdir)
    }
  ],
  hints: [
    '`git status` tells you you\'re in the middle of a merge, and how to get out of it.',
    'A merge that isn\'t committed yet can be cancelled completely, as if you never started it.',
    '`git merge --abort`.'
  ],
  debrief: {
    title: 'A merge isn\'t done until you commit it',
    paragraphs: [
      'During a conflict, git has merged what it could and waits for you with half-finished files. `git merge --abort` puts everything back as it was before `git merge`: your branch, your files and the staging area.',
      'Nothing is lost, and you can merge again any time. One habit makes this safe: commit or stash your own changes before you merge, so there\'s a clean state to go back to.'
    ]
  },
  solution: [
    'git status',
    'git merge --abort'
  ]
}
