// Branching 2.3: Jonas pushed feature/newsletter to origin after your last fetch, so your repository doesn't know it
// yet. `git fetch` brings origin/feature/newsletter, `git switch feature/newsletter` creates the local branch from it
// (tracking it), and you continue with a commit and a plain `git push`.
import { commitsOf, currentBranch, isAncestor, remoteBranchHead, upstreamOf } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { INDEX, bakerySite, text } from './bakery'
import { once } from './checks'

const BRANCH = 'feature/newsletter'

const NEWSLETTER = text(
  '<!-- Newsletter sign-up: one email a month with the seasonal bakes. (Jonas)',
  '     After signing up, people land on thanks.html. TODO: that page doesn\'t exist yet. -->',
  '<h2>Fresh from the oven, once a month</h2>',
  '<form action="thanks.html">',
  '  <label>Email <input name="email" type="email" required></label>',
  '  <button>Sign up</button>',
  '</form>'
)
const INDEX_LINKED = INDEX + '<p><a href="newsletter.html">Get our monthly newsletter</a></p>\n'

const setup = () => bakerySite()
  .origin()
  .teammate('Jonas', 'Add the newsletter sign-up form', { 'newsletter.html': NEWSLETTER }, { branch: BRANCH })
  .teammate('Jonas', 'Link the newsletter from the home page', { 'index.html': INDEX_LINKED }, { branch: BRANCH })
  .build()

const start = once(setup)
const JONAS = () => remoteBranchHead(start(), BRANCH)!

/** The local branch has a commit on top of Jonas's work that adds thanks.html. */
function thanksAdded(state: GitState): boolean {
  const [tip] = commitsOf(state, BRANCH)
  return !!tip && tip.id !== JONAS() && isAncestor(state, JONAS(), BRANCH) && !!tip.tree['thanks.html']
}

export const pickUpTeammateBranch: Scenario = {
  id: 'git-17-pick-up-teammate-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Pick up a teammate\'s branch',
  story: [
    `Jonas started a newsletter sign-up for the bakery website and pushed it to origin as \`${BRANCH}\` this morning. He's at a baking fair until Friday, so you take it over.`,
    `Get his branch as your own \`${BRANCH}\` that tracks \`origin/${BRANCH}\`, and continue there: add \`thanks.html\`, the page people see after signing up (his TODO in newsletter.html). Commit it and push, so Jonas finds it on origin when he's back.`
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'tracking',
      label: `You are on ${BRANCH}, tracking origin/${BRANCH}`,
      check: ({ state }) => currentBranch(state) === BRANCH && upstreamOf(state, BRANCH) === `origin/${BRANCH}`
    },
    { id: 'jonas', label: 'It has Jonas\'s two commits', check: ({ state }) => isAncestor(state, JONAS(), BRANCH) },
    { id: 'thanks', label: 'Your commit on top of his adds thanks.html', check: ({ state }) => thanksAdded(state) },
    {
      id: 'pushed',
      label: `origin/${BRANCH} has your commit`,
      check: ({ state }) => {
        const tip = remoteBranchHead(state, BRANCH)
        return thanksAdded(state) && !!tip && !!state.origin!.commits[tip]!.tree['thanks.html']
      }
    }
  ],
  hints: [
    `Your repository only knows origin's branches as of your last fetch. \`git branch -a\` shows what it knows; \`git fetch\` asks origin what's new.`,
    `When only \`origin/${BRANCH}\` exists, \`git switch ${BRANCH}\` creates a local branch from it that tracks it. \`git switch -c\` would start a new branch where you are, without Jonas's commits.`,
    `\`git fetch\`, \`git switch ${BRANCH}\`, then \`echo "<h2>Thanks for signing up!</h2>" > thanks.html\`, \`git add thanks.html\`, \`git commit -m "Add the thank-you page"\` and \`git push\`.`
  ],
  debrief: {
    title: 'origin/feature/newsletter is a bookmark, feature/newsletter is yours',
    paragraphs: [
      'Your repository only learns about origin\'s branches when it fetches. Before `git fetch`, Jonas\'s branch didn\'t exist for it. After it, `git branch -a` lists `remotes/origin/feature/newsletter`: a read-only bookmark of where the branch is on origin.',
      '`git switch feature/newsletter` found no local branch with that name but an `origin/feature/newsletter`, so it created one on the same commit and set it to track it. That\'s why a plain `git push` knew where to go.',
      '`git switch -c feature/newsletter` would have started a new branch from main, without Jonas\'s commits, and origin would have rejected your push.'
    ]
  },
  solution: [
    'git branch -a',
    'git fetch',
    `git switch ${BRANCH}`,
    'echo "<h2>Thanks for signing up!</h2>" > thanks.html',
    'git add thanks.html',
    'git commit -m "Add the thank-you page"',
    'git push'
  ]
}
