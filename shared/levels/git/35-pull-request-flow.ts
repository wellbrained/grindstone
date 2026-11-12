// Workflows 8.1: the whole pull request round trip. Your main is one commit behind (Jonas pushed this morning), so the
// branch has to start from a fresh main. Once your branch is on origin with your commit (a `when` trigger), Jonas
// approves and Maya merges it on origin with a merge commit and deletes the branch there, like the buttons of a pull
// request. Then: back to main, pull, `git branch -d` (it works because main now has the merge), `git fetch --prune`.
// A branch from the stale main gets merged too, but fails the "on top of Jonas's" goal. The cleanup goals only count
// once your commit is in main, so nothing ticks at the start (the branch doesn't exist yet then).
import { branchExists, commitsOf, remoteBranchHead, remoteCommitsOf, resolve, teammateCommit, teammateMerge, trackingBranchHead } from '../../git'
import type { Commit, GitState } from '../../git'
import type { Scenario } from '../types'
import { MENU, bakerySite } from './bakery'

const BRANCH = 'feature/sunday-hours'
const MESSAGE = 'Add the Sunday opening hours'
const LINE = '<p>Sundays: 8:00-12:00</p>'
const MERGE = `Merge pull request #12 from ${BRANCH}`

const setup = () => teammatePushed(bakerySite().origin().build())

/** Jonas pushed the autumn bake to main after your last pull. */
const teammatePushed = (state: GitState) => teammateCommit(state, {
  author: 'Jonas',
  message: 'Add the pumpkin loaf to the menu',
  files: { 'menu.html': MENU.replace('</ul>', '  <li>Pumpkin loaf, 4.20 (autumn only)</li>\n</ul>') }
})

/** Jonas's commit: what a fresh main starts from. */
const JONAS = remoteBranchHead(setup(), 'main')!

const mergePullRequest = (state: GitState) =>
  teammateMerge(state, { author: 'Maya', branch: BRANCH, message: MERGE, deleteBranch: true })

/** Your commit with the Sunday hours, on origin's main. */
const yoursOnOrigin = (state: GitState): Commit | undefined =>
  remoteCommitsOf(state, 'main').find(commit => commit.author.name === state.user.name && /Sunday/.test(commit.tree['index.html'] ?? ''))

/** Your commit is in your local main (you pulled after the merge). */
const inLocalMain = (state: GitState) => {
  const yours = yoursOnOrigin(state)
  return !!yours && commitsOf(state, 'main').some(commit => commit.id === yours.id)
}

export const pullRequestFlow: Scenario = {
  id: 'git-35-pull-request-flow',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 6,
  title: 'The pull request flow',
  story: [
    `Maya opens the shop on Sundays from next week. Add the line \`${LINE}\` to the end of index.html, the way your team ships every change: a branch \`${BRANCH}\` from an up-to-date main, one commit, pushed to origin for review. Heads-up: Jonas pushed to main this morning, and your main doesn't have it yet.`,
    `Once your branch is on origin, Jonas reviews it and Maya merges it. Then clean up after yourself: your main up to date with the merge, \`${BRANCH}\` deleted, and its \`origin/\` copy gone too.`
  ].join('\n\n'),
  setup,
  teammates: [
    {
      id: 'maya-merges',
      author: 'Maya',
      trigger: { when: state => mergePullRequest(state) !== null },
      apply: state => mergePullRequest(state) ?? state,
      notice: `Jonas approved your pull request, and Maya merged it into main on origin. She deleted ${BRANCH} there, too.`
    }
  ],
  goals: [
    {
      id: 'merged',
      label: 'origin\'s main has your Sunday hours, on top of Jonas\'s commit',
      check: ({ state }) => yoursOnOrigin(state)?.parents[0] === JONAS
    },
    {
      id: 'pulled',
      label: 'Your main is up to date with origin\'s main',
      check: ({ state }) => inLocalMain(state) && resolve(state, 'main') === remoteBranchHead(state, 'main')
    },
    { id: 'deleted', label: `Your ${BRANCH} is deleted`, check: ({ state }) => inLocalMain(state) && !branchExists(state, BRANCH) },
    { id: 'pruned', label: `origin/${BRANCH} is gone from your repository`, check: ({ state }) => inLocalMain(state) && trackingBranchHead(state, BRANCH) === null }
  ],
  hints: [
    'Start on main with `git pull`, so your branch begins at Jonas\'s commit. Then branch, commit and push with `-u`.',
    `After Maya's merge, the work lives in origin's main: \`git pull\` brings it into yours. \`git branch -d\` deletes your branch because main now contains it, and \`git fetch --prune\` drops \`origin/${BRANCH}\`, which is gone on origin.`,
    `\`git pull\`, \`git switch -c ${BRANCH}\`, \`echo "${LINE}" >> index.html\`, \`git commit -am "${MESSAGE}"\`, \`git push -u origin ${BRANCH}\`. After the merge: \`git switch main\`, \`git pull\`, \`git branch -d ${BRANCH}\`, \`git fetch --prune\`.`
  ],
  debrief: {
    title: 'Branch, push, merge on origin, tidy up',
    paragraphs: [
      'A pull request is a branch on origin plus a conversation about it. Starting from a fresh main keeps the diff small and means nobody has to untangle Jonas\'s change from yours in review.',
      'The merge happened on origin, not on your machine: your main only saw it after `git pull`. Because the merge commit contains your branch, `git branch -d` knew it was safe to delete. Some teams squash pull requests into one new commit instead; then your commits aren\'t in main, `-d` refuses, and once you\'ve checked the pull request is merged, `-D` is right.',
      `Deleting the branch on origin doesn't touch your copy of it: \`origin/${BRANCH}\` stays until \`git fetch --prune\` cleans it up. Do this after every merged pull request and \`git branch -a\` stays short.`
    ]
  },
  solution: [
    'git pull',
    `git switch -c ${BRANCH}`,
    `echo "${LINE}" >> index.html`,
    `git commit -am "${MESSAGE}"`,
    `git push -u origin ${BRANCH}`,
    'git switch main',
    'git pull',
    `git branch -d ${BRANCH}`,
    'git fetch --prune'
  ]
}
