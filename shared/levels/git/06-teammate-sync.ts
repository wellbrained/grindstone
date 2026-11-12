// Level 6: keep a feature branch in sync while a teammate pushes to main.
//
// Flow (the plan in docs/adr/0001-plan.md): feature/find-us has your 2 commits and is not on origin yet.
// You are asked to share it. Right before your FIRST `git push`, Jonas pushes 2 commits to origin/main, one
// changing the same line of visit.html. Your push of the new branch still succeeds, and the checklist then
// shows the branch is behind main. To fix it you fetch, rebase onto origin/main, resolve the conflict and update
// the remote branch. Because origin already has the old feature/find-us, the rewritten branch can only go up with a
// force push, so a plain `git push` is rejected: that is the moment `--force-with-lease` is for.
//
// Why not "the branch was pushed in an earlier session" (origin already has it in the setup)? Then nothing in
// the level makes you push before Jonas does, so a `beforeCommand: 'git push'` trigger would fire after you had
// already synced with a still-quiet main. Firing before your first push guarantees the order: you share, main
// moves, you catch up. Every path to the goals therefore needs exactly one force push of a rewritten branch.
import { hasMergeCommits, isAncestor, remoteBranchHead, resolve, teammateCommit } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { MENU, bakerySite, text } from './bakery'
import { conflictFullyResolved, gitInvocations, isBareForcePush, isLeasePush } from './checks'

const BRANCH = 'feature/find-us'

const visit = (address: string) => text('<h2>Find us</h2>', address, '<p>Order ahead by phone: 030 555 0123.</p>')
const VISIT_BEFORE = visit('<p>Corner Street 12.</p>')
const VISIT_YOURS = visit('<p>Corner Street 12, five minutes from the station.</p>')
const VISIT_JONAS = visit('<p>Corner Street 12. Closed on Mondays.</p>')

/** origin's real main (not your possibly stale origin/main), when your repository knows that commit. */
const latestMain = (state: GitState) => {
  const tip = remoteBranchHead(state, 'main')
  return tip && resolve(state, tip) ? tip : null
}

export const teammateSync: Scenario = {
  id: 'git-06-teammate-sync',
  track: 'git',
  kind: 'scenario',
  difficulty: 3,
  minutes: 8,
  title: 'Teammate sync',
  story: [
    'You finished the walking directions on feature/find-us: two commits, not pushed yet. Push the branch to origin so Maya can review it.',
    'Team rule: a feature branch sits on top of the latest main, with no merge commits. If main moves while you work, you rebase your branch onto it and update the remote branch. Jonas is busy on main today.'
  ].join('\n\n'),
  setup: () => bakerySite()
    .file('visit.html', VISIT_BEFORE)
    .commit('Add the visit page', { author: 'Jonas' })
    .origin()
    .switch(BRANCH, { create: true })
    .file('visit.html', VISIT_YOURS)
    .commit('Say how to walk from the station')
    .file('map.html', '<a href="https://maps.example.com/corner-bakery">Open the map</a>\n')
    .commit('Add the map link')
    .build(),
  teammates: [
    {
      id: 'jonas-pushes-main',
      author: 'Jonas',
      trigger: { beforeCommand: 'git push' },
      apply: (state) => {
        const closed = teammateCommit(state, { author: 'Jonas', message: 'Say that we are closed on Mondays', files: { 'visit.html': VISIT_JONAS } })
        return teammateCommit(closed, { author: 'Jonas', message: 'Link the visit page from the menu', files: { 'menu.html': `${MENU}<p><a href="visit.html">Find the shop</a></p>\n` } })
      },
      notice: 'Jonas pushed 2 commits to main. One of them changes visit.html, the file you changed too.'
    }
  ],
  goals: [
    {
      id: 'pushed',
      label: 'origin has feature/find-us, matching your local branch',
      check: ({ state }) => !!remoteBranchHead(state, BRANCH) && remoteBranchHead(state, BRANCH) === resolve(state, BRANCH)
    },
    {
      id: 'up-to-date',
      label: 'feature/find-us contains the latest main from origin',
      check: ({ state }) => {
        const main = latestMain(state)
        return !!main && isAncestor(state, main, BRANCH)
      }
    },
    {
      id: 'linear',
      label: 'No merge commits on feature/find-us since main',
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
    'After Jonas\'s push, your branch is behind origin/main. Your repository does not even know his commits yet: get them first, then put your work on top.',
    'Fetch, then rebase onto origin/main. Rebase stops at the commit that touches visit.html: keep both changes, `git add` the file and continue. The rebase rewrote your commits, so a plain push is rejected; `--force-with-lease` overwrites the remote branch only if nobody else pushed to it since you last looked.',
    'Run `git push -u origin feature/find-us`, `git fetch`, `git rebase origin/main`, then write the resolved file (`edit visit.html`, or the three `echo` lines with `>` and `>>` that give `<p>Corner Street 12, five minutes from the station. Closed on Mondays.</p>`), `git add visit.html`, `git rebase --continue` and `git push --force-with-lease`.'
  ],
  debrief: {
    title: 'Rebased, leased, linear',
    paragraphs: [
      '`git fetch` brought Jonas\'s commits into origin/main without touching your branch. `git rebase origin/main` then replayed your two commits on top of them, and stopped once to let you combine his Monday note with your walking directions.',
      'For a feature branch, rebase beats merging main in: reviewers see only your two commits on top of current main, and the final merge into main stays clean. Merging main into the branch would work too, but it adds a merge commit to the feature for every catch-up.',
      'Rebasing gives your commits new ids, so origin\'s feature/find-us is no longer an ancestor of yours and a plain push is rejected. `--force` would overwrite the remote branch no matter what. `--force-with-lease` overwrites it only if it still points where your origin/feature/find-us says it does, so a commit a reviewer pushed in the meantime is never lost silently.'
    ]
  },
  solution: [
    'git push -u origin feature/find-us',
    'git fetch',
    'git rebase origin/main',
    'echo "<h2>Find us</h2>" > visit.html && echo "<p>Corner Street 12, five minutes from the station. Closed on Mondays.</p>" >> visit.html && echo "<p>Order ahead by phone: 030 555 0123.</p>" >> visit.html',
    'git add visit.html',
    'git rebase --continue',
    'git push --force-with-lease'
  ]
}
