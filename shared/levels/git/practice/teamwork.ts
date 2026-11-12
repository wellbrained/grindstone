// The practice tasks of chapter 5 (Teamwork & remotes), listed in the chapter right after the scenario they train
// (docs/features/levels.md).
import { branchExists, commitsOf, currentBranch, hasMergeCommits, remoteBranchHead, resolve, trackingBranchHead, upstreamOf } from '../../../git'
import type { PracticeTask } from '../../types'
import { INDEX, MENU, STYLE, bakerySite, text } from '../bakery'
import { logsOnlyOn, ran } from '../checks'

// 5.1 Push your first branch

const ALLERGENS = 'fix/allergen-note'
const allergenSetup = () => bakerySite()
  .origin()
  .switch(ALLERGENS, { create: true })
  .file('menu.html', MENU.replace('</ul>', '</ul>\n<p>All our bakes may contain nuts and sesame. Ask us about allergens.</p>'))
  .commit('Add the allergen note to the menu')
  .build()

export const pushWithUpstream: PracticeTask = {
  id: 'git-practice-push-with-upstream',
  track: 'git',
  kind: 'practice',
  practises: 'git-26-push-your-first-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Push a new branch and set its upstream',
  task: `Your branch \`${ALLERGENS}\` exists only on your machine. Push it to origin so that it tracks origin's copy, and a plain \`git push\` works from now on.`,
  setup: allergenSetup,
  goals: [
    {
      id: 'pushed',
      label: `origin has ${ALLERGENS}, with your commit`,
      check: ({ state }) => !!remoteBranchHead(state, ALLERGENS) && remoteBranchHead(state, ALLERGENS) === resolve(state, ALLERGENS)
    },
    { id: 'upstream', label: `${ALLERGENS} tracks origin/${ALLERGENS}`, check: ({ state }) => upstreamOf(state, ALLERGENS) === `origin/${ALLERGENS}` }
  ],
  hints: [`\`git push -u origin ${ALLERGENS}\``],
  why: '`-u` creates the branch on origin and remembers it as the upstream, so from now on `git push`, `git pull` and `git status` know which branch to use.',
  solution: [`git push -u origin ${ALLERGENS}`]
}

// 5.2 Get your teammates' work

const fetchSetup = () => bakerySite()
  .origin()
  .file('style.css', `${STYLE}a {\n  color: #a0522d;\n}\n`)
  .commit('Colour the links like the shop sign')
  .teammate('Maya', 'Add the pumpkin bread to the menu', { 'menu.html': MENU.replace('</ul>', '  <li>Pumpkin bread, 3.90 (October only)</li>\n</ul>') })
  .build()
const FETCH_MINE = resolve(fetchSetup(), 'main')!
const FETCH_MAYA = remoteBranchHead(fetchSetup(), 'main')!

export const fetchOnly: PracticeTask = {
  id: 'git-practice-fetch-only',
  track: 'git',
  kind: 'practice',
  practises: 'git-27-get-your-teammates-work',
  difficulty: 1,
  minutes: 0.5,
  title: 'Fetch without touching your branch',
  task: 'Maya just pushed to main, and you have a commit on main that isn\'t pushed yet. Download her commit so you can look at it first, without changing your main.',
  setup: fetchSetup,
  goals: [{
    id: 'fetched',
    label: 'origin/main has Maya\'s commit, your main is still your own commit',
    check: ({ state }) => trackingBranchHead(state, 'main') === FETCH_MAYA && resolve(state, 'main') === FETCH_MINE
  }],
  hints: ['`git fetch`'],
  why: '`git fetch` only moves `origin/*`, your copies of origin\'s branches; your own branches, files and staging area stay exactly as they are.',
  solution: ['git fetch']
}

// 5.3 Your push was rejected

const REBASE_MINE = 'Say we bake without palm oil'
const rebaseSetup = () => bakerySite()
  .origin()
  .file('index.html', `${INDEX}<p>We bake without palm oil, since 2019.</p>\n`)
  .commit(REBASE_MINE)
  .teammate('Jonas', 'Make the footer text smaller', { 'style.css': `${STYLE}footer {\n  font-size: 0.875rem;\n}\n` })
  .build()
const REBASE_JONAS = remoteBranchHead(rebaseSetup(), 'main')!

export const pullRebase: PracticeTask = {
  id: 'git-practice-pull-rebase',
  track: 'git',
  kind: 'practice',
  practises: 'git-28-your-push-was-rejected',
  difficulty: 1,
  minutes: 0.5,
  title: 'Pull with rebase',
  task: 'Jonas pushed to main, and your commit on main isn\'t pushed yet. Bring his commit into your main and put yours on top of it, without a merge commit.',
  setup: rebaseSetup,
  goals: [{
    id: 'on-top',
    label: 'Your commit sits right on top of Jonas\'s, no merge commit',
    check: ({ state }) => {
      const [tip] = commitsOf(state, 'main')
      return !!tip && tip.message === REBASE_MINE && tip.parents[0] === REBASE_JONAS && !hasMergeCommits(state, 'main')
    }
  }],
  hints: ['`git pull --rebase`'],
  why: '`git pull --rebase` fetches, then replays your unpushed commits on top of what came in, so there is no merge commit and the history stays one line.',
  solution: ['git pull --rebase']
}

// 5.4 Ahead and behind

const unpushedSetup = () => bakerySite()
  .origin()
  .file('menu.html', MENU.replace('Croissant, 1.90', 'Croissant, 2.00'))
  .commit('Raise the croissant price to 2.00')
  .file('index.html', `${INDEX}<p>Card payment from 5 euros.</p>\n`)
  .commit('Say we take cards from 5 euros')
  .build()

export const unpushedCommits: PracticeTask = {
  id: 'git-practice-unpushed-commits',
  track: 'git',
  kind: 'practice',
  practises: 'git-29-ahead-and-behind',
  difficulty: 1,
  minutes: 0.5,
  title: 'See what you haven\'t pushed yet',
  task: 'Before you push main, list exactly the commits a push would send: the ones on main that origin/main doesn\'t have.',
  setup: unpushedSetup,
  goals: [{
    id: 'listed',
    label: 'You listed only the commits on main that origin/main doesn\'t have',
    check: ({ history }) => ran(history, 'log', args => logsOnlyOn(args, ['main', 'HEAD'], ['origin/main']))
  }],
  hints: ['`git log --oneline origin/main..main`'],
  why: '`origin/main..main` means "on main, but not on origin/main": exactly what `git push` would send, as of your last fetch.',
  solution: ['git log --oneline origin/main..main']
}

// 5.5 Teammate sync

const GONE = 'feature/allergy-labels'
const pruneSetup = () => bakerySite()
  .origin()
  .switch(GONE, { create: true })
  .file('labels.html', text('<!-- Allergy labels for the counter. Printed every Monday with the new prices. (Ben) -->', '<h2>Allergy labels</h2>', '<p>Gluten, nuts, sesame, milk, egg</p>'))
  .commit('Add allergy labels for the counter')
  .push()
  .switch('main')
  // Jonas merged the branch on origin (a fast-forward) and deleted it there; you pulled main since
  .update(state => ({ ...state, origin: { ...state.origin!, branches: { main: state.origin!.branches[GONE]! } } }))
  .run('git pull')
  .build()

export const pruneGoneBranches: PracticeTask = {
  id: 'git-practice-prune-gone-branches',
  track: 'git',
  kind: 'practice',
  practises: 'git-06-teammate-sync',
  difficulty: 1,
  minutes: 0.5,
  title: 'Clean up branches that are gone on origin',
  task: `Jonas merged your \`${GONE}\` and deleted it on origin, and you've pulled main since. \`git branch -a\` still lists \`origin/${GONE}\`: drop that stale copy, then delete your local \`${GONE}\`.`,
  setup: pruneSetup,
  goals: [
    { id: 'pruned', label: `origin/${GONE} is gone from your repository`, check: ({ state }) => trackingBranchHead(state, GONE) === null },
    { id: 'deleted', label: `Your local ${GONE} is deleted`, check: ({ state }) => !branchExists(state, GONE) && currentBranch(state) === 'main' }
  ],
  hints: [`\`git fetch --prune\`, then \`git branch -d ${GONE}\``],
  why: 'A plain fetch never removes `origin/*` copies; `--prune` drops the ones whose branch is gone on origin. Your local branch is yours, so you delete it yourself.',
  solution: ['git fetch --prune', `git branch -d ${GONE}`]
}
