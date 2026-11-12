// Workflows 8.2: you're mid-feature with uncommitted work (gift-cards.html, which main doesn't have, so `git switch`
// refuses) when a bug on the live site needs a fix now. Stash (or commit) the work, branch `hotfix/christmas-eve` from
// main, fix, merge into main and push, go back, pop, and merge main into the feature (it is pushed and Jonas pulled
// it, so a rebase doesn't count: the old tip must stay in the branch). The hotfix branch is checked in HEAD's reflog,
// so deleting it after the merge is fine. "Back" only counts once the fix is on origin, so nothing ticks at the start.
import { currentBranch, isAncestor, remoteCommitsOf, resolve } from '../../git'
import type { Commit, GitState } from '../../git'
import type { Scenario } from '../types'
import { bakerySite, text } from './bakery'
import { committedOn } from './checks'

const FEATURE = 'feature/gift-cards'
const HOTFIX = 'hotfix/christmas-eve'
const MESSAGE = 'Fix the Christmas Eve hours in the banner'
const FIXED_LINE = '<p class="banner">Open 7:00-12:00 on 24 December. Merry Christmas!</p>'

const BANNER = text('<p class="banner">Closed on 24 December. Merry Christmas!</p>')

const GIFT_LINES = [
  '<!-- Gift cards: Maya sells them at the till for now. Online payment comes later (Jonas). -->',
  '<h2>Gift cards</h2>',
  '<p>Give someone fresh bread for a month.</p>'
]
const GIFT = text(...GIFT_LINES)
/** Your unfinished work: the amounts, not committed yet. */
const GIFT_WIP = text(
  ...GIFT_LINES,
  '<ul class="amounts">',
  '  <li>10 euros</li>',
  '  <li>25 euros</li>',
  '  <!-- TODO: 50 euros too? Ask Maya about the card design first. -->',
  '</ul>'
)

const setup = () => bakerySite()
  .file('banner.html', BANNER)
  .commit('Add the Christmas banner', { author: 'Maya' })
  .origin()
  .switch(FEATURE, { create: true })
  .file('gift-cards.html', GIFT)
  .commit('Start the gift card page')
  .push()
  .file('gift-cards.html', GIFT_WIP)
  .build()

const MAIN = resolve(setup(), 'main')!
const FEATURE_TIP = resolve(setup(), FEATURE)!

const isFixed = (commit: Commit) => /Open 7:00-12:00 on 24 December/.test(commit.tree['banner.html'] ?? '')

/** The commit on origin's main that fixed the banner (its parent still had the wrong line). */
function fixOnOrigin(state: GitState): Commit | undefined {
  const commits = remoteCommitsOf(state, 'main')
  return commits.find((commit) => {
    const parent = commits.find(other => other.id === commit.parents[0])
    return isFixed(commit) && !!parent && !isFixed(parent)
  })
}

/** origin's main has the fix and nothing of the gift cards. */
function shipped(state: GitState): boolean {
  const [tip] = remoteCommitsOf(state, 'main')
  return !!tip && isFixed(tip) && tip.tree['gift-cards.html'] === undefined
}

export const hotfixMidFeature: Scenario = {
  id: 'git-36-hotfix-mid-feature',
  track: 'git',
  kind: 'scenario',
  difficulty: 3,
  minutes: 7,
  title: 'Hotfix in the middle of a feature',
  story: [
    `You're halfway through Maya's gift card page on \`${FEATURE}\`: the list of amounts in gift-cards.html isn't committed yet. Then Maya calls. The Christmas banner on the live site says the shop is closed on 24 December, but she's open 7:00-12:00 that morning, her busiest of the year.`,
    `Fix it the way your team handles urgent fixes: a branch \`${HOTFIX}\` from main, with the line in banner.html changed to \`${FIXED_LINE}\`, merged into main and pushed. None of the gift card work may go live with it.`,
    `Then get back to \`${FEATURE}\` with your unfinished amounts just as you left them, and bring the fix into that branch too, without rewriting it: Jonas already pulled it for review.`
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'hotfix',
      label: `The fix is committed on ${HOTFIX}, which starts from main`,
      check: ({ state }) => {
        const fix = fixOnOrigin(state)
        return !!fix && fix.parents[0] === MAIN && committedOn(state, fix.id, HOTFIX)
      }
    },
    { id: 'shipped', label: 'origin\'s main has the fixed banner, and none of your gift card work', check: ({ state }) => shipped(state) },
    // only counts once the fix is out: at the start you're on the branch with your work anyway
    {
      id: 'back',
      label: `You're back on ${FEATURE}, with your unfinished amounts in gift-cards.html`,
      check: ({ state }) => shipped(state) && currentBranch(state) === FEATURE && state.workdir['gift-cards.html'] === GIFT_WIP
    },
    {
      id: 'merged',
      label: `${FEATURE} has the fix too, and still has the commit Jonas pulled`,
      check: ({ state }) => {
        const fix = fixOnOrigin(state)
        return !!fix && isAncestor(state, fix.id, FEATURE) && isAncestor(state, FEATURE_TIP, FEATURE)
      }
    }
  ],
  hints: [
    '`git switch` refuses while your gift card changes aren\'t committed, because switching would throw them away. `git stash` puts them aside; `git stash pop` brings them back later.',
    `\`git switch -c ${HOTFIX} main\` starts the fix from main, not from your feature. After the commit, merge the hotfix into main and push. Back on your branch, \`git merge main\` brings the fix in with a merge commit, so nothing Jonas pulled changes.`,
    `\`git stash\`, \`git switch -c ${HOTFIX} main\`, \`echo '${FIXED_LINE}' > banner.html\`, \`git commit -am "${MESSAGE}"\`, \`git switch main\`, \`git merge ${HOTFIX}\`, \`git push\`, \`git switch ${FEATURE}\`, \`git stash pop\`, \`git merge main\`.`
  ],
  debrief: {
    title: 'A hotfix starts from what\'s live',
    paragraphs: [
      'The fix had to start from main, the version customers see, not from your half-built feature. That\'s why the hotfix branch came from main and only the banner went live. `git stash` kept your unfinished amounts safe while you were away.',
      `\`git merge main\` brought the fix into \`${FEATURE}\` as a merge commit, so the branch Jonas pulled only grew. A rebase would have worked on your machine too, but it rewrites commits other people already have.`,
      'A "WIP" commit instead of the stash works as well, and is the safer choice when the interruption might last days: a stash is easy to forget, a commit on your branch isn\'t. Tidy it up with `git rebase -i` before anyone else builds on it.'
    ]
  },
  solution: [
    'git stash',
    `git switch -c ${HOTFIX} main`,
    `echo '${FIXED_LINE}' > banner.html`,
    `git commit -am "${MESSAGE}"`,
    'git switch main',
    `git merge ${HOTFIX}`,
    'git push',
    `git switch ${FEATURE}`,
    'git stash pop',
    'git merge main'
  ]
}
