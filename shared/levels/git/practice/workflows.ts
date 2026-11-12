// The practice tasks of chapter 8 (Workflows), listed in the chapter right after the scenario they train
// (docs/features/levels.md). They use the Corner Bakery website like the scenarios.
import { branchExists, commitsOf, currentBranch, isWorkingTreeClean, remoteBranchHead, resolve, stashEntries, tagOf, teammateMerge, trackingBranchHead } from '../../../git'
import type { GitState } from '../../../git'
import type { CommandRecord, PracticeTask } from '../../types'
import { INDEX, MENU, bakerySite, text } from '../bakery'
import { gitInvocations } from '../checks'

// 8.1 The pull request flow

const NEWSLETTER = 'feature/newsletter-form'
const mergedSetup = () => bakerySite()
  .origin()
  .switch(NEWSLETTER, { create: true })
  .file('newsletter.html', text('<!-- Newsletter sign-up. Maya sends one email a month, with the new bakes. -->', '<form id="newsletter">', '  <label>Email <input name="email" type="email" required></label>', '  <button>Sign up</button>', '</form>'))
  .commit('Add the newsletter sign-up form')
  .push()
  .switch('main')
  // Jonas merged the pull request on origin and deleted the branch there; you haven't pulled since
  .update(state => teammateMerge(state, { author: 'Jonas', branch: NEWSLETTER, message: `Merge pull request #9 from ${NEWSLETTER}`, deleteBranch: true })!)
  .build()

export const cleanUpAfterMerge: PracticeTask = {
  id: 'git-practice-clean-up-after-merge',
  track: 'git',
  kind: 'practice',
  practises: 'git-35-pull-request-flow',
  difficulty: 1,
  minutes: 1,
  title: 'Clean up after a merged pull request',
  task: `Jonas merged your pull request for \`${NEWSLETTER}\` on origin and deleted the branch there. You're on main: bring it up to date, then delete \`${NEWSLETTER}\` and its \`origin/\` copy.`,
  setup: mergedSetup,
  goals: [
    { id: 'pulled', label: 'Your main has the merge from origin', check: ({ state }) => resolve(state, 'main') === remoteBranchHead(state, 'main') },
    { id: 'deleted', label: `Your ${NEWSLETTER} is deleted`, check: ({ state }) => !branchExists(state, NEWSLETTER) },
    { id: 'pruned', label: `origin/${NEWSLETTER} is gone too`, check: ({ state }) => trackingBranchHead(state, NEWSLETTER) === null }
  ],
  hints: [`\`git pull\`, \`git branch -d ${NEWSLETTER}\`, \`git fetch --prune\``],
  why: 'Once main has the merge, `-d` knows the branch is safe to delete; `--prune` drops the `origin/` copy of a branch that is gone on origin.',
  solution: ['git pull', `git branch -d ${NEWSLETTER}`, 'git fetch --prune']
}

// 8.2 Hotfix in the middle of a feature

const CATERING = 'feature/catering'
const HOTFIX = 'hotfix/menu-typo'
const CATERING_LINES = ['<!-- Catering for offices: Maya needs two days\' notice. -->', '<h2>Catering</h2>']
const CATERING_WIP = text(...CATERING_LINES, '<p>Sandwich platters for 10 to 40 people, delivered before 9:00.</p>')
const cateringSetup = () => bakerySite()
  .origin()
  .switch(CATERING, { create: true })
  .file('catering.html', text(...CATERING_LINES))
  .commit('Start the catering page')
  .file('catering.html', CATERING_WIP)
  .build()
const CATERING_MAIN = resolve(cateringSetup(), 'main')!

export const stashForHotfix: PracticeTask = {
  id: 'git-practice-stash-for-hotfix',
  track: 'git',
  kind: 'practice',
  practises: 'git-36-hotfix-mid-feature',
  difficulty: 1,
  minutes: 0.5,
  title: 'Put your work aside for a hotfix',
  task: `Maya needs a quick fix on the live site, and you're on \`${CATERING}\` with unfinished changes. Stash them, then start a branch \`${HOTFIX}\` from main and switch to it.`,
  setup: cateringSetup,
  goals: [
    {
      id: 'stashed',
      label: 'Your unfinished catering text is in the stash',
      check: ({ state }) => stashEntries(state).length === 1 && stashEntries(state)[0]!.workdir['catering.html'] === CATERING_WIP
    },
    {
      id: 'hotfix',
      label: `You're on ${HOTFIX}, which starts from main, with a clean working tree`,
      check: ({ state }) => currentBranch(state) === HOTFIX && resolve(state, HOTFIX) === CATERING_MAIN && isWorkingTreeClean(state)
    }
  ],
  hints: [`\`git stash\`, then \`git switch -c ${HOTFIX} main\``],
  why: 'The stash keeps your changes safe off any branch, and the second name in `git switch -c` is the start point, so the hotfix starts from main, not from your feature.',
  solution: ['git stash', `git switch -c ${HOTFIX} main`]
}

// 8.3 Bring a fix to the release branch

const PICK_RELEASE = 'release/1.4'
const TYPO_FIX = 'Fix the typo in the opening hours'
const HOURS = (word: string) => text('<!-- Opening hours. Maya changes them in winter; ask her first. -->', `<h2>${word} hours</h2>`, '<p>Monday to Saturday, 7:00-18:00</p>')
const pickSetup = () => bakerySite()
  .file('hours.html', HOURS('Openning'))
  .commit('Add the opening hours page', { author: 'Jonas' })
  .branch(PICK_RELEASE)
  .file('christmas.html', text('<!-- Christmas menu, not for 1.4. -->', '<h2>Christmas menu</h2>'))
  .commit('Add the Christmas menu page', { author: 'Maya' })
  .file('hours.html', HOURS('Opening'))
  .commit(TYPO_FIX, { author: 'Ben' })
  .switch(PICK_RELEASE)
  .build()
const PICK_TIP = resolve(pickSetup(), PICK_RELEASE)!
const PICK_FIX = resolve(pickSetup(), 'main')!

/** release/1.4's newest commit is a copy of Ben's fix, right on top of what the release had. */
function pickedFix(state: GitState): string | null {
  const [tip] = commitsOf(state, PICK_RELEASE)
  if (!tip || tip.id === PICK_FIX || tip.parents.length !== 1 || tip.parents[0] !== PICK_TIP || tip.author.name !== 'Ben') return null
  return tip.tree['hours.html'] === HOURS('Opening') && tip.tree['christmas.html'] === undefined ? tip.message : null
}

export const cherryPickCommit: PracticeTask = {
  id: 'git-practice-cherry-pick-commit',
  track: 'git',
  kind: 'practice',
  practises: 'git-37-fix-the-release-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Cherry-pick one commit',
  task: `You're on \`${PICK_RELEASE}\`. main's newest commit, "${TYPO_FIX}", belongs in the release too: copy just that commit onto it, without the Christmas page below it.`,
  setup: pickSetup,
  goals: [{ id: 'picked', label: `${PICK_RELEASE} has a copy of the typo fix on top, and nothing else from main`, check: ({ state }) => pickedFix(state) !== null }],
  hints: ['`git cherry-pick main`'],
  why: '`git cherry-pick` takes any revision: `main` is main\'s newest commit, and only its own change is copied, as a new commit on your branch.',
  solution: ['git cherry-pick main']
}

export const cherryPickRecordOrigin: PracticeTask = {
  id: 'git-practice-cherry-pick-x',
  track: 'git',
  kind: 'practice',
  practises: 'git-37-fix-the-release-branch',
  difficulty: 1,
  minutes: 0.5,
  title: 'Note where a pick came from',
  task: `You're on \`${PICK_RELEASE}\`. Copy main's newest commit, "${TYPO_FIX}", onto it so that its message also says which commit it was copied from.`,
  setup: pickSetup,
  goals: [{
    id: 'recorded',
    label: 'The copy\'s message ends with "(cherry picked from commit …)" and the original\'s id',
    check: ({ state }) => pickedFix(state) === `${TYPO_FIX}\n\n(cherry picked from commit ${PICK_FIX})`
  }],
  hints: ['`git cherry-pick -x main`'],
  why: '`-x` appends the full id of the original commit to the message, so anyone reading the release branch can find where the fix came from.',
  solution: ['git cherry-pick -x main']
}

// 8.4 Tag a release

const tagSetup = () => bakerySite()
  .tag('v1.4.0', { message: 'Version 1.4.0: online orders', author: 'Maya' })
  .file('menu.html', MENU.replace('</ul>', '  <li>Gift box, 15.00</li>\n</ul>'))
  .commit('Add the gift box to the menu', { author: 'Jonas' })
  .file('index.html', `${INDEX}<p>New: gift boxes for every occasion.</p>\n`)
  .commit('Announce the gift boxes on the home page')
  .origin()
  .build()
const TAG_HEAD = resolve(tagSetup(), 'HEAD')!

export const annotatedTag: PracticeTask = {
  id: 'git-practice-annotated-tag',
  track: 'git',
  kind: 'practice',
  practises: 'git-38-tag-a-release',
  difficulty: 1,
  minutes: 0.5,
  title: 'Tag the current commit',
  task: 'Version 1.5.0 is the commit you\'re on. Put an annotated tag `v1.5.0` on it, with the message "Version 1.5.0".',
  setup: tagSetup,
  goals: [{
    id: 'tagged',
    label: 'v1.5.0 is an annotated tag on HEAD, with the message "Version 1.5.0"',
    check: ({ state }) => tagOf(state, 'v1.5.0')?.commit === TAG_HEAD && tagOf(state, 'v1.5.0')?.annotation?.message === 'Version 1.5.0'
  }],
  hints: ['`git tag -a v1.5.0 -m "Version 1.5.0"`'],
  why: 'Without a commit, `git tag` tags HEAD; `-a` (or just `-m`) makes it annotated, with a message, the tagger and the date.',
  solution: ['git tag -a v1.5.0 -m "Version 1.5.0"']
}

/** A `git tag` that lists: no name to create, or `-l` / `--list` / `-n`. */
const listsTags = (history: CommandRecord[]) => gitInvocations(history).some(({ args, exitCode }) => exitCode === 0 && args[0] === 'tag'
  && (args.slice(1).every(arg => arg.startsWith('-') && !['-a', '-d', '-m', '-f'].includes(arg)) || args.some(arg => arg === '-l' || arg === '--list' || arg === '-n')))

const listSetup = () => bakerySite()
  .tag('v1.3.0', { message: 'Version 1.3.0: opening hours', author: 'Maya' })
  .file('order.html', text('<!-- Online orders, picked up at the shop. -->', '<h2>Order bread</h2>'))
  .commit('Add online orders')
  .tag('v1.4.0', { message: 'Version 1.4.0: online orders', author: 'Maya' })
  .origin()
  .build()

export const listTags: PracticeTask = {
  id: 'git-practice-list-tags',
  track: 'git',
  kind: 'practice',
  practises: 'git-38-tag-a-release',
  difficulty: 1,
  minutes: 0.5,
  title: 'List your tags',
  task: 'Which versions has the team tagged so far? List the tags.',
  setup: listSetup,
  goals: [{ id: 'listed', label: 'You listed the tags', check: ({ history }) => listsTags(history) }],
  hints: ['`git tag` (`git tag -n` adds each tag\'s message)'],
  why: '`git tag` without a name lists the tags; `-l "v1.*"` filters them and `-n` shows the first line of each message.',
  solution: ['git tag']
}

// 8.5 A release branch, GitFlow style

const flowSetup = () => bakerySite()
  .switch('develop', { create: true })
  .file('gift-cards.html', text('<!-- Gift cards, sold at the till. (Jonas) -->', '<h2>Gift cards</h2>'))
  .commit('Add the gift card page', { author: 'Jonas' })
  .switch('main')
  .origin()
  .build()
const FLOW_DEVELOP = resolve(flowSetup(), 'develop')!

export const releaseFromDevelop: PracticeTask = {
  id: 'git-practice-release-from-develop',
  track: 'git',
  kind: 'practice',
  practises: 'git-39-gitflow-release',
  difficulty: 1,
  minutes: 0.5,
  title: 'Start a release branch from develop',
  task: 'You\'re on main. Start a branch `release/1.6` from develop, the GitFlow way, and switch to it.',
  setup: flowSetup,
  goals: [{
    id: 'started',
    label: 'You\'re on release/1.6, which starts where develop is',
    check: ({ state }) => currentBranch(state) === 'release/1.6' && resolve(state, 'release/1.6') === FLOW_DEVELOP
  }],
  hints: ['`git switch -c release/1.6 develop`'],
  why: 'The second name is the start point: the branch starts where develop is, whichever branch you\'re on.',
  solution: ['git switch -c release/1.6 develop']
}
