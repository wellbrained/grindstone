// The practice tasks of chapter 3 (Merging), listed in the chapter right after the scenario they train
// (docs/features/levels.md). "Keep their version of a conflicted file" is the approved sample of the chapter preview.
import { currentBranch, isAncestor, operationInProgress, resolve } from '../../../git'
import type { GitState } from '../../../git'
import { INDEX, MENU, STYLE, bakerySite, text } from '../bakery'
import { conflictFullyResolved, isMergeOf, practice, ran, treeOf } from '../checks'

// 3.1 Merge a finished branch

const PRICE_FIX = 'fix/croissant-price'
const noFfSetup = () => bakerySite()
  .switch(PRICE_FIX, { create: true })
  .file('menu.html', MENU.replace('Croissant, 1.90', 'Croissant, 2.00'))
  .commit('Raise the croissant price to 2.00', { author: 'Maya' })
  .switch('main')
  .build()
const NO_FF_MAIN = resolve(noFfSetup(), 'main')!
const NO_FF_FIX = resolve(noFfSetup(), PRICE_FIX)!

export const mergeNoFf = practice({
  id: 'git-practice-merge-no-ff',
  practises: 'git-03-merge',
  title: 'Merge with a merge commit anyway',
  task: `Maya's \`${PRICE_FIX}\` is done and main hasn't moved since. Merge it into main with a merge commit anyway, so the history shows it was a branch.`,
  setup: noFfSetup,
  goals: [{
    id: 'merge-commit',
    label: `main ends in a merge commit of ${PRICE_FIX}`,
    check: ({ state }) => isMergeOf(state, 'main', NO_FF_MAIN, NO_FF_FIX)
  }],
  hints: [`\`git merge --no-ff ${PRICE_FIX}\``],
  why: '`--no-ff` makes a merge commit even when git could just move main forward, so the branch stays visible in the history.',
  solution: [`git merge --no-ff ${PRICE_FIX}`]
})

// 3.2 Both sides moved on

const NEWSLETTER = 'feature/newsletter'
const ffOnlySetup = () => bakerySite()
  .switch(NEWSLETTER, { create: true })
  .file('newsletter.html', text('<!-- Newsletter sign-up: one email a month with the seasonal bakes. (Jonas) -->', '<form action="thanks.html">', '  <label>Email <input name="email" type="email" required></label>', '</form>'))
  .commit('Add the newsletter sign-up form', { author: 'Jonas' })
  .switch('main')
  .build()
const FF_NEWSLETTER = resolve(ffOnlySetup(), NEWSLETTER)!

export const mergeFfOnly = practice({
  id: 'git-practice-merge-ff-only',
  practises: 'git-20-both-sides-moved-on',
  title: 'Merge only if it\'s a fast-forward',
  task: `Merge Jonas's \`${NEWSLETTER}\` into main, but only as a fast-forward: if main had moved on, git should stop instead of making a merge commit.`,
  setup: ffOnlySetup,
  goals: [
    { id: 'merged', label: `main moved forward to ${NEWSLETTER}`, check: ({ state }) => resolve(state, 'main') === FF_NEWSLETTER },
    { id: 'ff-only', label: 'You merged with `--ff-only`', check: ({ history }) => ran(history, 'merge', args => args.includes('--ff-only')) }
  ],
  hints: [`\`git merge --ff-only ${NEWSLETTER}\``],
  why: 'With `--ff-only`, git either moves main forward or stops with "Not possible to fast-forward", so it never makes a merge commit you didn\'t want.',
  solution: [`git merge --ff-only ${NEWSLETTER}`]
})

// 3.3 Merge conflict (the approved sample)

const PRICES = 'feature/prices'
const prices = (croissant: string, roll: string) => text(
  '{',
  '  "_comment": "Prices in euros. Maya sets them every Monday; the menu reads them from here.",',
  '  "sourdough": 4.80,',
  `  "croissant": ${croissant},`,
  `  "cinnamonRoll": ${roll}`,
  '}'
)
const PRICES_MAYA = prices('2.10', '2.70')
const theirsSetup = () => bakerySite()
  .file('prices.json', prices('1.90', '2.50'))
  .commit('Keep the prices in prices.json', { author: 'Jonas' })
  .switch(PRICES, { create: true })
  .file('prices.json', PRICES_MAYA)
  .commit('Set this week\'s prices', { author: 'Maya' })
  .switch('main')
  .file('prices.json', prices('2.00', '2.60'))
  .commit('Update the pastry prices from last week\'s list', { author: 'Jonas' })
  .merge(PRICES, { conflicts: true })
  .build()
const THEIRS_MAIN = resolve(theirsSetup(), 'main')!
const THEIRS_PRICES = resolve(theirsSetup(), PRICES)!

export const keepTheirVersion = practice({
  id: 'git-practice-keep-their-version',
  practises: 'git-04-merge-conflict',
  title: 'Keep their version of a conflicted file',
  task: `Merging \`${PRICES}\` into main stopped on a conflict in \`prices.json\`. Maya's version on \`${PRICES}\` is the right one. Take it as it is and finish the merge.`,
  setup: theirsSetup,
  goals: [{
    id: 'theirs',
    label: `The merge is committed and prices.json matches ${PRICES}`,
    check: ({ state }) => isMergeOf(state, 'main', THEIRS_MAIN, THEIRS_PRICES) && conflictFullyResolved(state, 'main')
      && treeOf(state, 'main')?.['prices.json'] === PRICES_MAYA
  }],
  hints: ['`git checkout --theirs prices.json`, then `git add` and `git commit`.'],
  why: 'In a merge, "ours" is the branch you\'re on and "theirs" is the one you merge in.',
  solution: ['git checkout --theirs prices.json', 'git add prices.json', 'git commit']
})

// 3.4 Back out of a merge

const SUMMER = 'feature/summer-menu'
const listSetup = () => bakerySite()
  .switch(SUMMER, { create: true })
  .file('index.html', INDEX.replace('Fresh bread every morning', 'Ice-cold lemonade and fresh bread every morning'))
  .file('menu.html', MENU.replace('Cinnamon roll, 2.50', 'Strawberry tart, 3.90'))
  .file('style.css', STYLE.replace('#fdf8f0', '#fff7e0'))
  .commit('Start the summer menu')
  .switch('main')
  .file('menu.html', MENU.replace('Cinnamon roll, 2.50', 'Cinnamon roll, 2.60'))
  .file('style.css', STYLE.replace('#fdf8f0', '#fbf3e6'))
  .commit('Raise the cinnamon roll price, warmer background', { author: 'Maya' })
  .merge(SUMMER, { conflicts: true })
  .build()

export const listConflicts = practice({
  id: 'git-practice-list-conflicts',
  practises: 'git-21-back-out-of-a-merge',
  title: 'List the files with conflicts',
  task: `Your merge of \`${SUMMER}\` into main just stopped. Before you open anything, list which files have conflicts.`,
  setup: listSetup,
  goals: [{ id: 'listed', label: 'You listed the files with `git status`', check: ({ history }) => ran(history, 'status') }],
  hints: ['`git status`: the files under "Unmerged paths" have conflicts.'],
  why: 'During a merge, `git status` lists conflicted files under "Unmerged paths" (`UU` with `-s`); the ones under "Changes to be committed" merged cleanly.',
  solution: ['git status']
})

// 3.5 Catch up with main

const GIFT = 'feature/gift-boxes'
const mainInSetup = () => bakerySite()
  .switch(GIFT, { create: true })
  .file('gift-boxes.html', text('<!-- Gift boxes: Maya packs them to order, so they need a day\'s notice. -->', '<h2>Gift boxes</h2>', '<p>Six pastries of your choice in a box with a ribbon, 14.00</p>'))
  .commit('Add the gift box page')
  .switch('main')
  .file('index.html', `${INDEX}<p>Closed on Mondays.</p>\n`)
  .commit('Say we are closed on Mondays', { author: 'Maya' })
  .switch(GIFT)
  .build()
const IN_MAIN = resolve(mainInSetup(), 'main')!
const IN_GIFT = resolve(mainInSetup(), GIFT)!

const mainMergedIn = (state: GitState) => currentBranch(state) === GIFT && isMergeOf(state, GIFT, IN_GIFT, IN_MAIN) && operationInProgress(state) === null

export const mergeMainIn = practice({
  id: 'git-practice-merge-main-in',
  practises: 'git-22-catch-up-with-main',
  title: 'Merge main into your branch',
  task: `Since you started \`${GIFT}\`, Maya added "Closed on Mondays" on main. Merge main into your branch, so you test with the latest site, and stay on your branch.`,
  setup: mainInSetup,
  goals: [
    { id: 'merged', label: `You are on ${GIFT}, and it ends in a merge commit of main`, check: ({ state }) => mainMergedIn(state) },
    // true at the start, so it only counts once main is in your branch
    { id: 'main-unchanged', label: 'main is unchanged', check: ({ state }) => isAncestor(state, IN_MAIN, GIFT) && resolve(state, 'main') === IN_MAIN }
  ],
  hints: ['On your branch, `git merge main`.'],
  why: '`git merge` always merges into the branch you\'re on: main\'s new commits come to you, and main stays where it is.',
  solution: ['git merge main']
})
