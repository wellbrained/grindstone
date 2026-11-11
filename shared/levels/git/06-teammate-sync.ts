// Level 6: keep a feature branch in sync while a teammate pushes to main.
//
// Flow (the plan in docs/adr/0001-plan.md): feature/login has your 2 commits and is not on origin yet.
// You are asked to share it. Right before your FIRST `git push`, Anna pushes 2 commits to origin/main, one
// changing the same line of src/login.ts. Your push of the new branch still succeeds, and the checklist then
// shows the branch is behind main. To fix it you fetch, rebase onto origin/main, resolve the conflict and update
// the remote branch. Because origin already has the old feature/login, the rewritten branch can only go up with a
// force push, so a plain `git push` is rejected: that is the moment `--force-with-lease` is for.
//
// Why not "the branch was pushed in an earlier session" (origin already has it in the setup)? Then nothing in
// the level makes you push before Anna does, so a `beforeCommand: 'git push'` trigger would fire after you had
// already synced with a still-quiet main. Firing before your first push guarantees the order: you share, main
// moves, you catch up. Every path to the goals therefore needs exactly one force push of a rewritten branch.
import { hasMergeCommits, isAncestor, remoteBranchHead, repo, resolve, teammateCommit } from '../../git'
import type { GitState } from '../../git'
import type { Level } from '../types'
import { conflictFullyResolved, gitInvocations, isBareForcePush, isLeasePush } from './checks'

const BRANCH = 'feature/login'

const LOGIN_BEFORE = 'export function login(user: string) {\n  return true\n}\n'
const LOGIN_YOURS = 'export function login(user: string) {\n  return user.trim().length > 0\n}\n'
const LOGIN_ANNA = 'export function login(user: string) {\n  return !isLocked(user)\n}\n'

/** origin's real main (not your possibly stale origin/main), when your repository knows that commit. */
const latestMain = (state: GitState) => {
  const tip = remoteBranchHead(state, 'main')
  return tip && resolve(state, tip) ? tip : null
}

export const teammateSync: Level = {
  id: 'git-06-teammate-sync',
  track: 'git',
  title: 'Teammate sync',
  story: [
    'You finished the login check on feature/login: two commits, not pushed yet. Push the branch to origin so Anna can review it.',
    'Team rule: a feature branch sits on top of the latest main, with no merge commits. If main moves while you work, you rebase your branch onto it and update the remote branch. Anna is busy on main today.'
  ].join('\n\n'),
  setup: () => repo()
    .file('README.md', '# Team portal')
    .file('src/login.ts', LOGIN_BEFORE)
    .commit('Add a login stub', { author: 'Anna' })
    .origin()
    .switch(BRANCH, { create: true })
    .file('src/login.ts', LOGIN_YOURS)
    .commit('Validate the user name')
    .file('src/login-form.ts', 'export const fields = [\'user\', \'password\']')
    .commit('Add the login form')
    .build(),
  teammates: [
    {
      id: 'anna-pushes-main',
      author: 'Anna',
      trigger: { beforeCommand: 'git push' },
      apply: (state) => {
        const locked = teammateCommit(state, { author: 'Anna', message: 'Block locked accounts', files: { 'src/login.ts': LOGIN_ANNA } })
        return teammateCommit(locked, { author: 'Anna', message: 'Explain the login flow', files: { 'README.md': '# Team portal\n\nLogin: src/login.ts checks the user.\n' } })
      },
      notice: 'Anna pushed 2 commits to main. One of them changes src/login.ts, the file you changed too.'
    }
  ],
  goals: [
    {
      id: 'pushed',
      label: 'origin has feature/login, matching your local branch',
      check: ({ state }) => !!remoteBranchHead(state, BRANCH) && remoteBranchHead(state, BRANCH) === resolve(state, BRANCH)
    },
    {
      id: 'up-to-date',
      label: 'feature/login contains the latest main from origin',
      check: ({ state }) => {
        const main = latestMain(state)
        return !!main && isAncestor(state, main, BRANCH)
      }
    },
    {
      id: 'linear',
      label: 'No merge commits on feature/login since main',
      check: ({ state }) => {
        const main = latestMain(state) ?? 'origin/main'
        return !hasMergeCommits(state, `${main}..${BRANCH}`)
      }
    },
    { id: 'resolved', label: 'Conflict resolved: no markers, no rebase in progress', check: ({ state }) => conflictFullyResolved(state, BRANCH) },
    {
      id: 'lease',
      label: 'Rewritten branch pushed with --force-with-lease (never a bare --force)',
      check: ({ history }) => {
        const pushes = gitInvocations(history)
        return pushes.some(push => isLeasePush(push.args) && push.exitCode === 0) && !pushes.some(push => isBareForcePush(push.args))
      }
    }
  ],
  hints: [
    'After Anna\'s push, your branch is behind origin/main. Your repository does not even know her commits yet: get them first, then put your work on top.',
    'Fetch, then rebase onto origin/main. Rebase stops at the commit that touches src/login.ts: keep both checks, `git add` the file and continue. The rebase rewrote your commits, so a plain push is rejected; `--force-with-lease` overwrites the remote branch only if nobody else pushed to it since you last looked.',
    'Run `git push -u origin feature/login`, `git fetch`, `git rebase origin/main`, then write the resolved file (`edit src/login.ts`, or the three `echo` lines with `>` and `>>` that give `return user.trim().length > 0 && !isLocked(user)`), `git add src/login.ts`, `git rebase --continue` and `git push --force-with-lease`.'
  ],
  debrief: {
    title: 'Rebased, leased, linear',
    paragraphs: [
      '`git fetch` brought Anna\'s commits into origin/main without touching your branch. `git rebase origin/main` then replayed your two commits on top of them, and stopped once to let you combine her locked-account check with your user name check.',
      'For a feature branch, rebase beats merging main in: reviewers see only your two commits on top of current main, and the final merge into main stays clean. Merging main into the branch would work too, but it adds a merge commit to the feature for every catch-up.',
      'Rebasing gives your commits new ids, so origin\'s feature/login is no longer an ancestor of yours and a plain push is rejected. `--force` would overwrite the remote branch no matter what. `--force-with-lease` overwrites it only if it still points where your origin/feature/login says it does, so a commit a reviewer pushed in the meantime is never lost silently.'
    ]
  },
  solution: [
    'git push -u origin feature/login',
    'git fetch',
    'git rebase origin/main',
    'echo "export function login(user: string) {" > src/login.ts && echo "  return user.trim().length > 0 && !isLocked(user)" >> src/login.ts && echo "}" >> src/login.ts',
    'git add src/login.ts',
    'git rebase --continue',
    'git push --force-with-lease'
  ]
}
