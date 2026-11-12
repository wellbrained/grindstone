// Teamwork 5.1: a new branch exists only on your machine. A plain `git push` is refused with git's "has no upstream
// branch" message; `git push -u origin <branch>` creates it on origin and sets the upstream, and `git status` then
// compares with it. Pushing without -u and setting the upstream later (`git branch -u`) is fine: the goals check the
// end state, and the status look only counts after the upstream is set.
import { remoteBranchHead, resolve, upstreamOf } from '../../git'
import type { GitState } from '../../git'
import type { CommandRecord, Scenario } from '../types'
import { bakerySite, text } from './bakery'
import { gitInvocations, hasFlag } from './checks'

const BRANCH = 'feature/stollen-orders'

const ORDERS = text(
  '<!-- Christmas stollen pre-orders. Maya bakes them in the first week of December,',
  '     so orders close on 30 November. Jonas reviews before it goes live. -->',
  '<h2>Order your Christmas stollen</h2>',
  '<form id="stollen-order">',
  '  <label>Name <input name="name" required></label>',
  '  <label>How many? <input name="count" type="number" min="1" max="6" value="1"></label>',
  '  <label>Pick-up day <input name="pickup" type="date" min="2026-12-07" max="2026-12-23"></label>',
  '  <button>Pre-order</button>',
  '</form>'
)

const setup = () => bakerySite()
  .origin()
  .switch(BRANCH, { create: true })
  .file('stollen.html', ORDERS)
  .commit('Add the stollen pre-order form')
  .build()

const pushed = (state: GitState) => !!remoteBranchHead(state, BRANCH) && remoteBranchHead(state, BRANCH) === resolve(state, BRANCH)
const tracking = (state: GitState) => upstreamOf(state, BRANCH) === `origin/${BRANCH}`

/** A `git status` after the last push or `git branch -u` that worked, so it showed the upstream that is set now. */
function checkedStatus(history: CommandRecord[]): boolean {
  const calls = gitInvocations(history).filter(call => call.exitCode === 0)
  const setsUpstream = (args: string[]) => args[0] === 'push'
    || (args[0] === 'branch' && (hasFlag(args, 'u') || args.some(arg => arg === '--set-upstream-to' || arg.startsWith('--set-upstream-to='))))
  const last = calls.findLastIndex(call => setsUpstream(call.args))
  return last !== -1 && calls.slice(last + 1).some(call => call.args[0] === 'status')
}

export const pushYourFirstBranch: Scenario = {
  id: 'git-26-push-your-first-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'Push your first branch',
  story: [
    `Maya wants customers to pre-order their Christmas stollen online. You built the order form on \`${BRANCH}\`: one commit, and so far it exists only on your machine. Jonas is waiting to review it.`,
    `Push the branch to origin, and set it up so that from now on a plain \`git push\` and \`git pull\` know where this branch belongs. Start with a plain \`git push\` and read what git tells you. When you're done, check with \`git status\`.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'pushed', label: `origin has ${BRANCH}, with your commit`, check: ({ state }) => pushed(state) },
    { id: 'upstream', label: `${BRANCH} tracks origin/${BRANCH}`, check: ({ state }) => tracking(state) },
    {
      id: 'checked',
      label: `\`git status\` says you're up to date with origin/${BRANCH}`,
      check: ({ state, history }) => pushed(state) && tracking(state) && checkedStatus(history)
    }
  ],
  hints: [
    'Try `git push` and read the whole answer: the branch isn\'t on origin yet, and git doesn\'t know where to push it.',
    `\`-u\` (long: \`--set-upstream\`) pushes the branch and remembers \`origin/${BRANCH}\` as its upstream: the branch on origin it pushes to, pulls from and compares with.`,
    `\`git push -u origin ${BRANCH}\`, then \`git status\`.`
  ],
  debrief: {
    title: 'Your branch knows where it belongs',
    paragraphs: [
      'A new branch lives only in your repository. A plain `git push` sends the branch to its upstream, and a new branch has none yet, so git stopped and showed you the command it needed.',
      `\`git push -u origin ${BRANCH}\` did two things: it created the branch on origin, and it set \`origin/${BRANCH}\` as the upstream. That's what "set up to track" means. From now on \`git push\` and \`git pull\` work without names, and \`git status\` tells you whether you're ahead or behind.`,
      `You need \`-u\` only once per branch. If you forget it, \`git branch -u origin/${BRANCH}\` sets the upstream later, once the branch is on origin.`
    ]
  },
  solution: [
    'git push',
    `git push -u origin ${BRANCH}`,
    'git status'
  ]
}
