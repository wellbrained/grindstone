// The practice tasks of chapter 2 (Branching), listed in the chapter right after the scenario they train
// (docs/features/levels.md). "Go back to the previous branch" is the approved sample of the chapter preview.
import { branchExists, currentBranch, resolve } from '../../../git'
import type { PracticeTask } from '../../types'
import { CONTACT_FORM, MENU, bakerySite, text } from '../bakery'
import { hasFlag, ran } from '../checks'

/** Flags that only change how `git branch` lists (no name given). */
const LIST_FLAGS = ['--list', '-a', '--all', '-r', '--remotes']
const lists = (args: string[]) => args.slice(1).every(arg => LIST_FLAGS.includes(arg))

// 2.1 Start a branch

export const listBranches: PracticeTask = {
  id: 'git-practice-list-branches',
  track: 'git',
  kind: 'practice',
  practises: 'git-02-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'List your branches',
  task: 'Which branches does the bakery website have, and which one are you on? List your local branches.',
  setup: () => bakerySite()
    .branch('fix/menu-typo')
    .switch('feature/contact-form', { create: true })
    .file('contact.html', CONTACT_FORM)
    .commit('Add contact form')
    .build(),
  goals: [{
    id: 'shown',
    label: 'You listed your local branches',
    check: ({ history }) => ran(history, 'branch', args => lists(args) && !hasFlag(args, 'r', '--remotes'))
  }],
  hints: ['`git branch` without a name lists your branches.'],
  why: 'Without a name, `git branch` lists your branches and marks the one you are on with `*`.',
  solution: ['git branch']
}

// 2.2 Started on the wrong branch (the approved sample)

const CONTACT = 'feature/contact-form'

export const switchBack: PracticeTask = {
  id: 'git-practice-switch-back',
  track: 'git',
  kind: 'practice',
  practises: 'git-16-started-on-wrong-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Go back to the previous branch',
  task: `You just switched from \`${CONTACT}\` to main to check something. Go back to the branch you were on, without typing its name.`,
  setup: () => bakerySite()
    .switch(CONTACT, { create: true })
    .file('contact.html', CONTACT_FORM)
    .commit('Add contact form')
    .switch('main')
    .build(),
  goals: [
    { id: 'back', label: `You are on ${CONTACT}`, check: ({ state }) => currentBranch(state) === CONTACT },
    {
      id: 'dash',
      label: 'You went back with `-`, not by its name',
      check: ({ history }) => ran(history, 'switch', args => args[1] === '-') || ran(history, 'checkout', args => args[1] === '-')
    }
  ],
  hints: ['`git switch -`'],
  why: '`-` means "the branch I was on before", like `cd -` in the shell.',
  solution: ['git switch -']
}

// 2.3 Pick up a teammate's branch

export const listRemoteBranches: PracticeTask = {
  id: 'git-practice-remote-branches',
  track: 'git',
  kind: 'practice',
  practises: 'git-17-pick-up-teammate-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Show the branches on origin',
  task: 'You just fetched. Which branches are on origin? Show them, not only your local ones.',
  setup: () => bakerySite()
    .origin()
    .teammate('Jonas', 'Add the newsletter sign-up form', { 'newsletter.html': '<!-- Newsletter sign-up, one email a month. (Jonas) -->\n<form action="thanks.html"></form>' }, { branch: 'feature/newsletter' })
    .teammate('Maya', 'Fix the croissant price', { 'menu.html': MENU.replace('1.90', '2.00') }, { branch: 'fix/prices' })
    .fetch()
    .build(),
  goals: [{
    id: 'shown',
    label: 'You listed the origin/* branches',
    check: ({ history }) => ran(history, 'branch', args => lists(args) && (hasFlag(args, 'r', '--remotes') || hasFlag(args, 'a', '--all')))
  }],
  hints: ['`git branch -r` lists the branches on origin as of your last fetch; `git branch -a` lists yours too.'],
  why: '`git branch` alone only shows local branches; origin\'s show up as `origin/<name>` with `-r` or `-a`.',
  solution: ['git branch -r']
}

// 2.4 Clean up old branches

const CAKE_ORDER = text('<!-- Cake orders: at least two days ahead, says Maya. -->', '<h2>Order a cake</h2>', '<form id="cake-order"></form>')

export const renameBranch: PracticeTask = {
  id: 'git-practice-rename-branch',
  track: 'git',
  kind: 'practice',
  practises: 'git-18-clean-up-branches',
  difficulty: 1,
  minutes: 0.5,
  title: 'Rename the current branch',
  task: 'You are on `feature/cake-oder`. Fix the typo: rename it to `feature/cake-order`.',
  setup: () => bakerySite()
    .switch('feature/cake-oder', { create: true })
    .file('cake-order.html', CAKE_ORDER)
    .commit('Start the cake order form')
    .build(),
  goals: [{
    id: 'renamed',
    label: 'You are on feature/cake-order with the same commit, and feature/cake-oder is gone',
    check: ({ state }) => currentBranch(state) === 'feature/cake-order' && !branchExists(state, 'feature/cake-oder')
      && state.repo!.commits[resolve(state, 'feature/cake-order')!]!.message === 'Start the cake order form'
  }],
  hints: ['`git branch -m <new-name>` renames the branch you are on.'],
  why: 'With one name, `git branch -m` renames the current branch: you stay on it, and its commits stay as they are.',
  solution: ['git branch -m feature/cake-order']
}

const MENU_FIXED = MENU.replace('Cinnamon roll', 'Cinnamon roll (Saturdays only)')

export const deleteMergedBranch: PracticeTask = {
  id: 'git-practice-delete-merged-branch',
  track: 'git',
  kind: 'practice',
  practises: 'git-18-clean-up-branches',
  difficulty: 1,
  minutes: 0.5,
  title: 'Delete a merged branch',
  task: 'Your fix on `fix/menu-note` is merged into main, and you are still on that branch. Delete it.',
  setup: () => bakerySite()
    .switch('fix/menu-note', { create: true })
    .file('menu.html', MENU_FIXED)
    .commit('Say the cinnamon rolls are Saturdays only')
    .switch('main')
    .merge('fix/menu-note')
    .switch('fix/menu-note')
    .build(),
  goals: [{
    id: 'deleted',
    label: 'fix/menu-note is deleted, and main still has the fix',
    check: ({ state }) => !branchExists(state, 'fix/menu-note') && state.repo!.commits[resolve(state, 'main')!]!.tree['menu.html'] === MENU_FIXED
  }],
  hints: ['You can\'t delete the branch you are on: `git switch main`, then `git branch -d fix/menu-note`.'],
  why: '`-d` only deletes a branch whose commits are merged, so nothing gets lost; `-D` would delete it anyway.',
  solution: ['git switch main', 'git branch -d fix/menu-note']
}

// 2.5 Look at an old version

export const branchFromCommit: PracticeTask = {
  id: 'git-practice-branch-from-commit',
  track: 'git',
  kind: 'practice',
  practises: 'git-19-look-at-old-version',
  difficulty: 1,
  minutes: 0.5,
  title: 'Start a branch from an older commit',
  task: 'The newest commit on main, "Start the summer menu", isn\'t live yet, but a price on the live site is wrong. Start a branch `fix/prices` at the commit before it and switch to it.',
  setup: () => bakerySite()
    .file('menu.html', MENU.replace('2.50', '2.60'))
    .commit('Raise the cinnamon roll price', { author: 'Maya' })
    .file('summer.html', text('<!-- Summer menu: goes live on 1 June, not before. (Maya) -->', '<h2>Summer bakes</h2>', '<ul><li>Strawberry tart, 3.90</li></ul>'))
    .commit('Start the summer menu')
    .build(),
  goals: [{
    id: 'branch',
    label: 'You are on fix/prices, at "Raise the cinnamon roll price"',
    check: ({ state }) => currentBranch(state) === 'fix/prices' && resolve(state, 'fix/prices') === resolve(state, 'main~1')
  }],
  hints: ['`git switch -c fix/prices HEAD~1`: the last argument is where the new branch starts.'],
  why: 'A start point after the name puts the new branch on any commit (an id, a branch, `HEAD~1`) instead of where you are.',
  solution: ['git switch -c fix/prices HEAD~1']
}
