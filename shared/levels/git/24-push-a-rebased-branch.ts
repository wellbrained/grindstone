// Rewriting history 4.3: your own feature/faq is already on origin; after rebasing it onto main a plain push is
// rejected (non-fast-forward), and `git push --force-with-lease` is the safe way to overwrite it. A bare --force in the
// history fails the lease goal (undo takes it back), and so does merging the old commits back in with `git pull`.
import { commitsOf, hasMergeCommits, isAncestor, remoteBranchHead, resolve } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { MENU, bakerySite, text } from './bakery'
import { gitInvocations, isBareForcePush, isLeasePush } from './checks'

const BRANCH = 'feature/faq'
const YOUR_COMMITS = ['Answer the gluten-free question', 'Add a FAQ page']

const faq = (...entries: string[]) => text(
  '<!-- Questions customers ask at the till most often. Maya checks the answers before they go live. -->',
  '<h2>Questions and answers</h2>',
  '<dl>',
  '  <dt>Can I order a cake for a birthday?</dt>',
  '  <dd>Yes, with two days\' notice. Ask Maya in the shop or call us.</dd>',
  ...entries,
  '</dl>'
)

const setup = () => bakerySite()
  .origin()
  .switch(BRANCH, { create: true })
  .file('faq.html', faq())
  .commit('Add a FAQ page')
  .file('faq.html', faq('  <dt>Do you have gluten-free bread?</dt>', '  <dd>On Saturdays: a buckwheat loaf, baked first thing in a clean oven.</dd>'))
  .commit('Answer the gluten-free question')
  .push()
  .switch('main')
  .file('menu.html', MENU.replace('Sourdough loaf, 4.80', 'Sourdough loaf, 4.90').replace('Croissant, 1.90', 'Croissant, 2.00'))
  .commit('Put this week\'s prices on the menu', { author: 'Maya' })
  .push('main')
  .switch(BRANCH)
  .build()

const MAIN = resolve(setup(), 'main')!

const onTopOfMain = (state: GitState) => isAncestor(state, MAIN, BRANCH)

export const pushRebasedBranch: Scenario = {
  id: 'git-24-push-a-rebased-branch',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Push a rebased branch',
  story: [
    `Yesterday you pushed \`${BRANCH}\` so Jonas could have a first look at the new FAQ page. Since then Maya put this week's prices on main. Team rule: before the pull request, your branch sits on top of the latest main.`,
    `Rebase \`${BRANCH}\` onto main and bring the branch on origin up to date. Nobody else commits to your branch, but update it the safe way: never with a plain \`--force\`.`
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'on-top',
      label: `${BRANCH} has your two commits on top of main, no merge commits`,
      check: ({ state }) => onTopOfMain(state) && !hasMergeCommits(state, `main..${BRANCH}`)
        && JSON.stringify(commitsOf(state, `main..${BRANCH}`).map(commit => commit.message)) === JSON.stringify(YOUR_COMMITS)
    },
    // true at the start (origin has the old branch), so it only counts once your branch is on top of main
    {
      id: 'pushed',
      label: `origin's ${BRANCH} is your rebased branch`,
      check: ({ state }) => onTopOfMain(state) && remoteBranchHead(state, BRANCH) === resolve(state, BRANCH)
    },
    {
      id: 'lease',
      label: 'Pushed with `--force-with-lease`, never a bare `--force`',
      check: ({ history }) => {
        const pushes = gitInvocations(history)
        return pushes.some(push => isLeasePush(push.args) && push.exitCode === 0) && !pushes.some(push => isBareForcePush(push.args))
      }
    }
  ],
  hints: [
    'First the rebase, as in 4.1. Then try a plain `git push` and read why git refuses.',
    'Rebasing gave your commits new ids, so the old ones on origin are no longer part of your branch: a normal push would throw them away, and git refuses. The branch is yours alone, so you may overwrite it, with the safe kind of force push.',
    '`git rebase main`, then `git push --force-with-lease`.'
  ],
  debrief: {
    title: 'Overwrite only what you\'ve seen',
    paragraphs: [
      `After the rebase, origin's ${BRANCH} still had your old commits, and your branch had new copies of them on top of Maya's prices. A plain push only ever adds commits, so git rejected it as non-fast-forward.`,
      `\`--force-with-lease\` overwrites the branch on origin only if it still points where your origin/${BRANCH} says it does. Had Jonas pushed a fix to your branch in the meantime, the push would fail instead of deleting his commit without a word.`,
      'A plain `--force` overwrites whatever is there, so leave it alone, and never rewrite a branch others build on, like main. And don\'t `git pull` after the rejection: it would merge your old commits back in, the same work twice.'
    ]
  },
  solution: [
    'git rebase main',
    'git push --force-with-lease'
  ]
}
