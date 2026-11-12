// Merging 3.5: before the pull request, main got two commits, one changing the same line of index.html as yours.
// You merge main into feature/order-pickup and settle the conflict there; main itself must not move.
import { isAncestor, resolve } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { INDEX, STYLE, bakerySite, text } from './bakery'
import { conflictFullyResolved, isMergeOf, treeOf } from './checks'

const BRANCH = 'feature/order-pickup'

const ORDER = text(
  '<!-- Pickup orders: Maya bakes them fresh, so they need to be in by 18:00 the day before. -->',
  '<h2>Order for pickup</h2>',
  '<form id="pickup">',
  '  <label>Name <input name="name" required></label>',
  '  <label>Pickup day <input name="day" type="date" required></label>',
  '  <label>Your order <textarea name="items" required></textarea></label>',
  '  <button>Send order</button>',
  '</form>'
)

const HOURS_LINE = '<p>Fresh bread every morning from 7:00. <a href="menu.html">See the menu</a></p>'
const withLine = (line: string) => INDEX.replace(HOURS_LINE, line)
const YOUR_LINE = '<p>Fresh bread every morning from 7:00. <a href="menu.html">See the menu</a> <a href="order.html">Order for pickup</a></p>'
const MAYA_LINE = '<p>Fresh bread every morning from 6:30. <a href="menu.html">See the menu</a></p>'
const RESOLVED_LINE = '<p>Fresh bread every morning from 6:30. <a href="menu.html">See the menu</a> <a href="order.html">Order for pickup</a></p>'

const setup = () => bakerySite()
  .switch(BRANCH, { create: true })
  .file('order.html', ORDER)
  .commit('Add the pickup order form')
  .file('index.html', withLine(YOUR_LINE))
  .commit('Link the order form from the home page')
  .switch('main')
  .file('style.css', `${STYLE}/* Links in the brown of the shop sign's lettering. (Jonas) */\na {\n  color: #8b4513;\n}\n`)
  .commit('Colour the links like the shop sign', { author: 'Jonas' })
  .file('index.html', withLine(MAYA_LINE))
  .commit('Open at 6:30 from next week', { author: 'Maya' })
  .switch(BRANCH)
  .build()

const MAIN = resolve(setup(), 'main')!
const FEATURE = resolve(setup(), BRANCH)!

/** Your branch ends in a merge commit of main (yours first, main second). */
const mergedMainIn = (state: GitState) => isMergeOf(state, BRANCH, FEATURE, MAIN)

export const catchUpWithMain: Scenario = {
  id: 'git-22-catch-up-with-main',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 6,
  title: 'Catch up with main',
  story: [
    `Your pickup order form for the bakery website is ready on \`${BRANCH}\`, and you're about to open a pull request so Jonas can review it. Since you started, main got two commits: Jonas coloured the links, and Maya moved the opening time on the home page to 6:30, on the same line of \`index.html\` where you added your link.`,
    `Settle that on your branch, not on main: merge main into \`${BRANCH}\` and resolve the conflict there, keeping Maya's 6:30 and your link. Leave main as it is; your work gets there through the pull request.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'merged', label: `${BRANCH} has everything that is on main`, check: ({ state }) => isAncestor(state, MAIN, BRANCH) },
    {
      id: 'resolved',
      label: 'The conflict is settled in a merge commit on your branch, no markers left',
      check: ({ state }) => mergedMainIn(state) && conflictFullyResolved(state, BRANCH)
    },
    {
      id: 'both',
      label: 'index.html has Maya\'s 6:30 and your order link',
      check: ({ state }) => {
        const index = treeOf(state, BRANCH)?.['index.html'] ?? ''
        return mergedMainIn(state) && index.includes(RESOLVED_LINE) && !index.includes('7:00')
      }
    },
    // true at the start, so it only counts once main is in your branch
    {
      id: 'main-unchanged',
      label: 'main is unchanged',
      check: ({ state }) => isAncestor(state, MAIN, BRANCH) && resolve(state, 'main') === MAIN
    }
  ],
  hints: [
    `\`git merge\` brings another branch into the one you're on. Stay on \`${BRANCH}\` and merge main from there.`,
    'Git wrote both versions of the line into index.html, between <<<<<<<, ======= and >>>>>>> markers. Make it one line with 6:30 and your link, with no markers left, then `git add` the file and commit to finish the merge.',
    `Run \`git merge main\`, change the conflicted block in index.html to \`${RESOLVED_LINE}\` (\`edit index.html\`), then \`git add index.html\` and \`git commit --no-edit\`.`
  ],
  debrief: {
    title: 'Settle conflicts on your own branch',
    paragraphs: [
      'Merging main into your branch brought Jonas\'s and Maya\'s commits to you. Where they collided with your work, you settled it on your own branch: a mistake there only affects you, and you can check the site before anyone reviews it.',
      'Now the pull request has nothing left to fight about. Your branch already contains main, so merging it into main goes through without a conflict, and main never has a half-resolved state.',
      'Some teams rebase their branch onto main instead (chapter 4). Merging main in keeps your commits as they are and adds one merge commit, which is the safe choice once someone else has your branch too.'
    ]
  },
  solution: [
    'git merge main',
    [
      'echo "<!doctype html>" > index.html',
      'echo "<title>Corner Bakery</title>" >> index.html',
      'echo \'<link rel="stylesheet" href="style.css">\' >> index.html',
      'echo "<h1>Corner Bakery</h1>" >> index.html',
      `echo '${RESOLVED_LINE}' >> index.html`
    ].join(' && '),
    'git add index.html',
    'git commit --no-edit'
  ]
}
