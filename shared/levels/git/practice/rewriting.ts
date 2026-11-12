// The practice tasks of chapter 4 (Rewriting history), listed in the chapter right after the scenario they train
// (docs/features/levels.md). "Fix an old commit message" is the approved sample of the chapter preview.
import { commitsOf, currentBranch, hasMergeCommits, isAncestor, isWorkingTreeClean, operationInProgress, remoteBranchHead, resolve, shortId } from '../../../git'
import type { GitState } from '../../../git'
import type { PracticeTask } from '../../types'
import { INDEX, MENU, bakerySite, text } from '../bakery'
import { gitInvocations, isBareForcePush, isLeasePush, sameTree } from '../checks'

// 4.1 Put your branch on top of main

const OPENING = 'feature/holiday-hours'
const ontoSetup = () => bakerySite()
  .switch(OPENING, { create: true })
  .file('holidays.html', text('<!-- Holiday opening hours. Maya decides them in November for the whole season. -->', '<h2>Over the holidays</h2>', '<p>24 December: 7:00 to 12:00. Closed on the 25th and 26th.</p>'))
  .commit('Add the holiday opening hours')
  .switch('main')
  .file('menu.html', MENU.replace('Cinnamon roll, 2.50', 'Cinnamon roll, 2.60'))
  .commit('Raise the cinnamon roll price', { author: 'Maya' })
  .switch(OPENING)
  .build()
const ONTO_MAIN = resolve(ontoSetup(), 'main')!

export const rebaseOntoMain: PracticeTask = {
  id: 'git-practice-rebase-onto-main',
  track: 'git',
  kind: 'practice',
  practises: 'git-05-rebase',
  difficulty: 1,
  minutes: 0.5,
  title: 'Rebase your branch onto main',
  task: `Maya raised a price on main since you started \`${OPENING}\`. Put your branch on top of main, without a merge commit.`,
  setup: ontoSetup,
  goals: [{
    id: 'on-top',
    label: `${OPENING} sits on top of main, with your commit and no merge commit`,
    check: ({ state }) => currentBranch(state) === OPENING && operationInProgress(state) === null && isAncestor(state, ONTO_MAIN, OPENING)
      && !hasMergeCommits(state, `main..${OPENING}`) && commitsOf(state, `main..${OPENING}`).length === 1
  }],
  hints: ['On your branch, `git rebase main`.'],
  why: '`git rebase main` replays the commits that are only on your branch on top of main\'s newest commit, so the history stays one straight line.',
  solution: ['git rebase main']
}

// 4.2 Conflict during a rebase

const PRICES = 'feature/price-list'
const prices = (croissant: string) => text(
  '{',
  '  "_comment": "Prices in euros. Maya sets them every Monday; the menu reads them from here.",',
  '  "sourdough": 4.80,',
  `  "croissant": ${croissant}`,
  '}'
)
const abortSetup = () => bakerySite()
  .file('prices.json', prices('1.90'))
  .commit('Keep the prices in prices.json', { author: 'Jonas' })
  .switch(PRICES, { create: true })
  .file('prices.json', prices('2.00'))
  .commit('Round the croissant up to 2.00')
  .switch('main')
  .file('prices.json', prices('2.10'))
  .commit('Croissants cost 2.10 from Monday', { author: 'Maya' })
  .switch(PRICES)
  .rebase('main', { conflicts: true })
  .build()
const ABORT_TIP = abortSetup().repo!.branches[PRICES]!

export const abortRebase: PracticeTask = {
  id: 'git-practice-abort-rebase',
  track: 'git',
  kind: 'practice',
  practises: 'git-23-conflict-during-a-rebase',
  difficulty: 1,
  minutes: 0.5,
  title: 'Give up a rebase',
  task: `Your rebase of \`${PRICES}\` onto main stopped on a conflict in \`prices.json\`, and you'd rather ask Maya which price is right. Cancel the rebase, so your branch and your files are exactly as before.`,
  setup: abortSetup,
  goals: [{
    id: 'given-up',
    label: `No rebase in progress, and ${PRICES} is where it was, with a clean working tree`,
    check: ({ state }) => operationInProgress(state) === null && currentBranch(state) === PRICES && resolve(state, PRICES) === ABORT_TIP && isWorkingTreeClean(state)
  }],
  hints: ['`git rebase --abort`'],
  why: '`git rebase --abort` puts your branch, the staging area and your files back to how they were before `git rebase`, as if you never started.',
  solution: ['git rebase --abort']
}

// 4.3 Push a rebased branch

const CAKES = 'feature/cake-sizes'
const leaseSetup = () => bakerySite()
  .origin()
  .switch(CAKES, { create: true })
  .file('cakes.html', text('<!-- Cake sizes for orders. Prices per whole cake; Maya bakes them to order. -->', '<h2>Cakes</h2>', '<p>Small (6 slices) 18.00, large (12 slices) 32.00</p>'))
  .commit('List the cake sizes')
  .push()
  .switch('main')
  .file('index.html', `${INDEX}<p>Closed on Mondays.</p>\n`)
  .commit('Say we are closed on Mondays', { author: 'Maya' })
  .switch(CAKES)
  .rebase('main')
  .build()

const leasePushed = (history: { line: string, exitCode: number }[]) => {
  const pushes = gitInvocations(history)
  return pushes.some(push => isLeasePush(push.args) && push.exitCode === 0) && !pushes.some(push => isBareForcePush(push.args))
}

export const pushWithLease: PracticeTask = {
  id: 'git-practice-push-with-lease',
  track: 'git',
  kind: 'practice',
  practises: 'git-24-push-a-rebased-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Push your rewritten branch safely',
  task: `You just rebased \`${CAKES}\` onto main, and the old version of it is on origin. Update the branch on origin, the safe way.`,
  setup: leaseSetup,
  goals: [
    { id: 'pushed', label: `origin's ${CAKES} is your rebased branch`, check: ({ state }) => remoteBranchHead(state, CAKES) === resolve(state, CAKES) },
    { id: 'lease', label: 'You used `--force-with-lease`, not a bare `--force`', check: ({ history }) => leasePushed(history) }
  ],
  hints: ['`git push --force-with-lease`'],
  why: '`--force-with-lease` replaces the branch on origin only if nobody pushed to it since you last fetched, so you never wipe out a teammate\'s commit by accident.',
  solution: ['git push --force-with-lease']
}

// 4.4 Tidy up before review (the approved sample)

const NEWSLETTER = 'feature/newsletter'
const NEWSLETTER_FORM = text(
  '<!-- Newsletter sign-up: one email a month with the seasonal bakes. (Jonas) -->',
  '<form action="thanks.html">',
  '  <label>Email <input name="email" type="email" required></label>',
  '</form>'
)
const rewordSetup = () => bakerySite()
  .switch(NEWSLETTER, { create: true })
  .file('newsletter.html', NEWSLETTER_FORM)
  .commit('Add newsleter form')
  .file('index.html', `${INDEX}<p><a href="newsletter.html">Get our seasonal bakes by email</a></p>\n`)
  .commit('Link the newsletter from the home page')
  .build()
const [REWORD_NEWEST, REWORD_OLDER] = commitsOf(rewordSetup(), NEWSLETTER)

/** The commit before last says "Add newsletter form" now; both commits hold the same files as before, on the same base. */
function messageFixed(state: GitState): boolean {
  if (operationInProgress(state) !== null || currentBranch(state) !== NEWSLETTER) return false
  const [newest, older] = commitsOf(state, NEWSLETTER)
  return !!newest && !!older && older.message === 'Add newsletter form' && sameTree(older.tree, REWORD_OLDER!.tree)
    && older.parents[0] === REWORD_OLDER!.parents[0] && newest.message === REWORD_NEWEST!.message
    && sameTree(newest.tree, REWORD_NEWEST!.tree) && newest.parents[0] === older.id
}

export const rewordOldCommit: PracticeTask = {
  id: 'git-practice-reword-old-commit',
  track: 'git',
  kind: 'practice',
  practises: 'git-25-tidy-up-before-review',
  difficulty: 1,
  minutes: 1,
  title: 'Fix an old commit message',
  task: 'The commit before last says `Add newsleter form`. Fix the typo, keep everything else as it is.',
  setup: rewordSetup,
  goals: [{ id: 'fixed', label: 'The commit is called "Add newsletter form", the newest commit is unchanged', check: ({ state }) => messageFixed(state) }],
  hints: ['`git rebase -i HEAD~2`, change its `pick` to `reword`, then fix the message'],
  why: '`--amend` only reaches the newest commit; for older ones you need interactive rebase.',
  solution: [
    'git rebase -i HEAD~2',
    { save: `reword ${shortId(REWORD_OLDER!.id)} Add newsleter form\npick ${shortId(REWORD_NEWEST!.id)} Link the newsletter from the home page\n` },
    { save: 'Add newsletter form\n' }
  ]
}
