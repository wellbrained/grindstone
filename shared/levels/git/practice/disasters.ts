// The practice tasks of chapter 7 (Disasters), listed in the chapter right after the scenario they train
// (docs/features/levels.md). They use the Corner Bakery website like the scenarios.
import { headCommit, isWorkingTreeClean, resolve } from '../../../git'
import type { PracticeTask } from '../../types'
import { INDEX, MENU, bakerySite, text } from '../bakery'

// 7.1 Committed on main by mistake

const GLUTEN_FREE = MENU.replace('</ul>', '  <li>Almond cake, 3.20 (gluten-free)</li>\n</ul>')
const glutenFree = () => bakerySite()
  .origin()
  .file('menu.html', GLUTEN_FREE)
  .commit('Mark the gluten-free bakes on the menu')
  .build()
const GLUTEN_FREE_TIP = resolve(glutenFree(), 'main')!
const GLUTEN_FREE_BASE = resolve(glutenFree(), 'origin/main')!

export const moveCommitToBranch: PracticeTask = {
  id: 'git-practice-move-commit-to-branch',
  track: 'git',
  kind: 'practice',
  practises: 'git-30-committed-on-main',
  difficulty: 1,
  minutes: 0.5,
  title: 'Move your last commit to a new branch',
  task: 'Your last commit on main, "Mark the gluten-free bakes on the menu", isn\'t pushed and belongs on its own branch. Move it to a new branch `feature/gluten-free` and put main back on origin/main; you can stay on main.',
  setup: glutenFree,
  goals: [
    { id: 'moved', label: 'feature/gluten-free has the commit', check: ({ state }) => resolve(state, 'feature/gluten-free') === GLUTEN_FREE_TIP },
    {
      id: 'main',
      label: 'main is back on origin/main, with nothing left staged or changed',
      check: ({ state }) => resolve(state, 'main') === GLUTEN_FREE_BASE && isWorkingTreeClean(state)
    }
  ],
  hints: ['`git branch feature/gluten-free` keeps the commit, then `git reset --hard HEAD~1` takes main back.'],
  why: 'The new branch holds on to the commit, so moving main back with `reset --hard` loses nothing.',
  solution: ['git branch feature/gluten-free', 'git reset --hard HEAD~1']
}

// 7.2 Lost commits after a reset

const DRINKS = text(
  '<!-- Hot drinks. Oat milk costs extra, Maya decided: 0.40. -->',
  '<h2>Hot drinks</h2>',
  '<ul>',
  '  <li>Filter coffee, 2.20</li>',
  '  <li>Hot chocolate, 2.80</li>',
  '</ul>'
)
const droppedDrinks = () => bakerySite()
  .file('drinks.html', DRINKS)
  .commit('Add the hot drinks page')
  .run('git reset --hard HEAD~1')
  .build()
const DRINKS_COMMIT = resolve(droppedDrinks(), 'HEAD@{1}')!

export const findLostCommit: PracticeTask = {
  id: 'git-practice-find-lost-commit',
  track: 'git',
  kind: 'practice',
  practises: 'git-31-lost-commits-after-reset',
  difficulty: 1,
  minutes: 0.5,
  title: 'Find a lost commit in the reflog',
  task: 'A minute ago, `git reset --hard HEAD~1` dropped your commit "Add the hot drinks page" from main. Find it in the reflog and put main back on it, with drinks.html back on your disk.',
  setup: droppedDrinks,
  goals: [
    {
      id: 'back',
      label: 'main has "Add the hot drinks page" again, and drinks.html is back',
      check: ({ state }) => resolve(state, 'main') === DRINKS_COMMIT && state.workdir['drinks.html'] === DRINKS && isWorkingTreeClean(state)
    }
  ],
  hints: ['`git reflog` shows the commit as `HEAD@{1}`, one move before the reset; `git reset --hard HEAD@{1}` goes back there.'],
  why: 'A reset only moved the name main; the commit was still there, and `HEAD@{1}` is where HEAD was one move ago.',
  solution: ['git reflog', 'git reset --hard HEAD@{1}']
}

// 7.3 Rebased the wrong branch

const BANNER = text(
  '<!-- Holiday banner: shown from 20 December. Maya writes the opening times, we only lay them out. -->',
  '<aside class="banner">Christmas Eve we close at 13:00.</aside>'
)
const CLOSED = INDEX.replace('</p>', '</p>\n<p>Closed on 25 and 26 December.</p>')
const rebasedBanner = () => bakerySite()
  .switch('feature/holiday-banner', { create: true })
  .file('banner.html', BANNER)
  .commit('Add the holiday opening hours banner')
  .switch('main')
  .file('index.html', CLOSED)
  .commit('Close on both Christmas days', { author: 'Maya' })
  .switch('feature/holiday-banner')
  .rebase('main')
  .build()
/** The branch before the rebase: still in the reflog, right below the rebase start. */
const BANNER_BEFORE = resolve(rebasedBanner(), 'HEAD@{3}')!

export const undoRebase: PracticeTask = {
  id: 'git-practice-undo-rebase',
  track: 'git',
  kind: 'practice',
  practises: 'git-32-rebased-the-wrong-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Undo the last rebase',
  task: 'You just rebased `feature/holiday-banner` onto main, and you\'d rather wait for Maya\'s review first. Put the branch back exactly where it was before the rebase.',
  setup: rebasedBanner,
  goals: [
    {
      id: 'undone',
      label: 'feature/holiday-banner is back on its commit from before the rebase',
      check: ({ state }) => resolve(state, 'feature/holiday-banner') === BANNER_BEFORE && isWorkingTreeClean(state)
    }
  ],
  hints: ['After a rebase, `ORIG_HEAD` is where your branch was before it: `git reset --hard ORIG_HEAD`. The reflog has it too, right below `rebase (start)`.'],
  why: 'The rebase made new copies of your commits; the old ones were still there, and `ORIG_HEAD` pointed at them.',
  solution: ['git reset --hard ORIG_HEAD']
}

// 7.4 Committed a secret

const SETTINGS = text('{', '  "editor.fontSize": 15,', '  "editor.wordWrap": "on"', '}')
const NEWSLETTER = text(
  '<!-- Newsletter signup: one email a month with the new bakes. Jonas sends it. -->',
  '<form id="newsletter"><input name="email" type="email" required> <button>Sign up</button></form>'
)

export const untrackFile: PracticeTask = {
  id: 'git-practice-untrack-file',
  track: 'git',
  kind: 'practice',
  practises: 'git-33-committed-a-secret',
  difficulty: 1,
  minutes: 0.5,
  title: 'Stop tracking a file but keep it',
  task: 'Your last commit took `.vscode/settings.json` along, your own editor settings. Stop tracking it and commit that, but keep the file on your disk.',
  setup: () => bakerySite()
    .file('newsletter.html', NEWSLETTER)
    .file('.vscode/settings.json', SETTINGS)
    .commit('Add the newsletter signup')
    .build(),
  goals: [
    {
      id: 'untracked',
      label: '.vscode/settings.json is not in the newest commit, but still on your disk',
      check: ({ state }) => {
        const tree = headCommit(state)?.tree ?? {}
        return tree['.vscode/settings.json'] === undefined && tree['newsletter.html'] === NEWSLETTER && state.workdir['.vscode/settings.json'] === SETTINGS
      }
    }
  ],
  hints: ['`git rm --cached .vscode/settings.json` untracks it and keeps it on your disk; then commit.'],
  why: '`--cached` only changes the staging area: the next commit leaves the file out, and your disk keeps it.',
  solution: ['git rm --cached .vscode/settings.json', 'git commit -m "Stop tracking my editor settings"']
}

const SUMMER = text(
  '<!-- Summer special: ice cream from the freezer by the door, June to August. -->',
  '<h2>Ice cream</h2>',
  '<p>Vanilla, strawberry and lemon sorbet, 1.80 a scoop.</p>'
)

export const removeFile: PracticeTask = {
  id: 'git-practice-remove-file',
  track: 'git',
  kind: 'practice',
  practises: 'git-33-committed-a-secret',
  difficulty: 1,
  minutes: 0.5,
  title: 'Delete a file with git rm',
  task: 'Summer is over: delete `summer.html` from the website and commit the deletion.',
  setup: () => bakerySite()
    .file('summer.html', SUMMER)
    .commit('Add the summer ice cream page', { author: 'Maya' })
    .build(),
  goals: [
    {
      id: 'deleted',
      label: 'summer.html is gone from your disk and from the newest commit',
      check: ({ state }) => state.workdir['summer.html'] === undefined && headCommit(state)?.tree['summer.html'] === undefined
        && headCommit(state)?.tree['index.html'] !== undefined && isWorkingTreeClean(state)
    }
  ],
  hints: ['`git rm summer.html` deletes the file and stages the deletion; then commit.'],
  why: '`git rm` is `rm` and `git add` of the deletion in one step, so the commit has something to record.',
  solution: ['git rm summer.html', 'git commit -m "Remove the summer ice cream page"']
}

// 7.5 Deleted a branch with unmerged work

const ROLL_PRICE = MENU.replace('Cinnamon roll, 2.50', 'Cinnamon roll, 2.60')
const deletedFix = () => bakerySite()
  .switch('fix/price-typo', { create: true })
  .file('menu.html', ROLL_PRICE)
  .commit('Fix the cinnamon roll price')
  .switch('main')
  .run('git branch -D fix/price-typo')
  .build()
/** The deleted branch's tip, as git printed it ("was <id>"): the commit HEAD left for main. */
const FIX_TIP = resolve(deletedFix(), 'HEAD@{1}')!

export const restoreBranch: PracticeTask = {
  id: 'git-practice-restore-branch',
  track: 'git',
  kind: 'practice',
  practises: 'git-34-deleted-a-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Restore a deleted branch',
  task: `You just deleted \`fix/price-typo\` with \`git branch -D\`, and git said "Deleted branch fix/price-typo (was ${FIX_TIP.slice(0, 7)})." It wasn't merged yet: bring the branch back.`,
  setup: deletedFix,
  goals: [{ id: 'restored', label: 'fix/price-typo is back on its commit', check: ({ state }) => resolve(state, 'fix/price-typo') === FIX_TIP }],
  hints: [`\`git branch fix/price-typo ${FIX_TIP.slice(0, 7)}\``],
  why: 'Deleting a branch deletes the name; the commit stays, and `git branch <name> <id>` names it again.',
  solution: [`git branch fix/price-typo ${FIX_TIP.slice(0, 7)}`]
}
