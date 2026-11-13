// Rewriting history 4.2: you rebase feature/autumn-menu onto main and the second of your three commits clashes with
// Maya's Sunday hours on the same line of index.html. Git stops at that commit; you resolve, add and continue, and
// the third commit is replayed after it (commit by commit, unlike a merge).
import { commitsOf, currentBranch, hasMergeCommits, isAncestor, resolve } from '../../git'
import type { GitState } from '../../git'
import type { GitScenario } from './types'
import { INDEX, STYLE, bakerySite, text } from './bakery'
import { conflictFullyResolved, once, sameList, treeOf } from './checks'

const BRANCH = 'feature/autumn-menu'
const YOUR_COMMITS = ['Add pumpkin bread to the autumn menu', 'Link the autumn menu from the home page', 'Add the autumn menu page']

const autumn = (...items: string[]) => text(
  '<!-- Autumn specials, September to November. Maya bakes them on Fridays and Saturdays only. -->',
  '<h2>Autumn specials</h2>',
  '<ul>',
  ...items.map(item => `  <li>${item}</li>`),
  '</ul>'
)

const HOURS_LINE = '<p>Fresh bread every morning from 7:00. <a href="menu.html">See the menu</a></p>'
const withLine = (line: string) => INDEX.replace(HOURS_LINE, line)
const YOUR_LINE = '<p>Fresh bread every morning from 7:00. <a href="menu.html">See the menu</a> <a href="autumn.html">Autumn specials</a></p>'
const MAYA_LINE = '<p>Fresh bread every morning from 7:00, on Sundays from 8:00. <a href="menu.html">See the menu</a></p>'
const RESOLVED_LINE = '<p>Fresh bread every morning from 7:00, on Sundays from 8:00. <a href="menu.html">See the menu</a> <a href="autumn.html">Autumn specials</a></p>'

const setup = () => bakerySite()
  .switch(BRANCH, { create: true })
  .file('autumn.html', autumn('Apple cake, 3.20', 'Plum crumble, 3.40'))
  .commit('Add the autumn menu page')
  .file('index.html', withLine(YOUR_LINE))
  .commit('Link the autumn menu from the home page')
  .file('autumn.html', autumn('Apple cake, 3.20', 'Plum crumble, 3.40', 'Pumpkin bread, 4.50'))
  .commit('Add pumpkin bread to the autumn menu')
  .switch('main')
  .file('style.css', `${STYLE}/* Prices line up on the right, like on the board in the shop. (Jonas) */\nli {\n  display: flex;\n  justify-content: space-between;\n}\n`)
  .commit('Line up the prices on the right', { author: 'Jonas' })
  .file('index.html', withLine(MAYA_LINE))
  .commit('Open on Sundays from 8:00', { author: 'Maya' })
  .switch(BRANCH)
  .build()

const start = once(setup)
const MAIN = () => resolve(start(), 'main')!

/** Main's newest commit is part of your branch (the rebase got past it). */
const onMain = (state: GitState) => isAncestor(state, MAIN(), BRANCH)

export const conflictDuringRebase: GitScenario = {
  id: 'git-23-conflict-during-a-rebase',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 6,
  title: 'Conflict during a rebase',
  story: [
    `Your autumn menu for the bakery website is ready on \`${BRANCH}\`: three commits. Jonas reviews a branch once it sits on top of the latest main. Since you started, Maya added Sunday opening hours to the home page, on the same line of \`index.html\` where your second commit adds the link to the autumn menu.`,
    'Rebase your branch onto main. When git stops at the commit that clashes, keep both: Maya\'s Sunday hours and your link. Then let git carry on with the rest of your commits.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'on-top',
      label: `${BRANCH} has your three commits on top of main, no merge commits`,
      check: ({ state }) => onMain(state) && !hasMergeCommits(state, `main..${BRANCH}`)
        && sameList(commitsOf(state, `main..${BRANCH}`).map(commit => commit.message), YOUR_COMMITS)
    },
    // true before you start (nothing in progress), so it only counts once main is in your branch
    {
      id: 'resolved',
      label: `You are back on ${BRANCH}: no rebase in progress, no conflict markers`,
      check: ({ state }) => onMain(state) && currentBranch(state) === BRANCH && conflictFullyResolved(state, BRANCH)
    },
    {
      id: 'both',
      label: 'index.html has Maya\'s Sunday hours and your autumn link',
      check: ({ state }) => (treeOf(state, BRANCH)?.['index.html'] ?? '').includes(RESOLVED_LINE)
    }
  ],
  hints: [
    '`git rebase main` replays your commits one at a time. It stops at the one that changes the same line as Maya; `git status` shows you which file.',
    'In a rebase, `HEAD` in the conflict markers is main plus the commits replayed so far, and the other side is your commit. Write the line with both changes and no markers, `git add` the file and run `git rebase --continue`: git then replays the rest of your commits.',
    `Run \`git rebase main\`, change the conflicted block in index.html to \`${RESOLVED_LINE}\` (\`edit index.html\`), then \`git add index.html\` and \`git rebase --continue\`.`
  ],
  debrief: {
    title: 'One commit at a time',
    paragraphs: [
      'A rebase replays your commits one by one. The first went on cleanly, the second clashed with Maya\'s line, so git stopped right there: the first already on top of main, the third still waiting. After `--continue`, git replayed the third on its own.',
      'That\'s the difference to a merge. A merge brings everything together at once and you settle all conflicts in one go; a rebase asks you per commit, so each of your commits makes sense on its own on top of main. With several clashing commits you may stop several times.',
      'Mind the sides: during a rebase, `HEAD` ("ours") is main with your commits replayed so far, and the incoming change ("theirs") is your own commit. And if you get lost halfway, `git rebase --abort` puts everything back as it was.'
    ]
  },
  solution: [
    'git rebase main',
    [
      'echo "<!doctype html>" > index.html',
      'echo "<title>Corner Bakery</title>" >> index.html',
      'echo \'<link rel="stylesheet" href="style.css">\' >> index.html',
      'echo "<h1>Corner Bakery</h1>" >> index.html',
      `echo '${RESOLVED_LINE}' >> index.html`
    ].join(' && '),
    'git add index.html',
    'git rebase --continue'
  ]
}
