// Disasters 7.2: last night's `git reset --hard HEAD~2` (meant: `git reset --hard`, to drop an uncommitted experiment)
// took two commits off feature/christmas-menu. The setup runs the reset through the builder, so the reflog holds the two
// commits and the reset. You look in `git reflog` (the goal is about the command: it changes nothing) and reset back to
// HEAD@{1}. A mixed reset brings the branch back without the files; HEAD@{2} only the first commit.
import { isWorkingTreeClean, resolve } from '../../git'
import type { GitScenario } from './types'
import { STYLE, bakerySite, text } from './bakery'
import { ran } from './checks'

const BRANCH = 'feature/christmas-menu'
const FIRST = 'Add the Christmas menu page'
const SECOND = 'Add stollen and mince pies to the Christmas menu'

const PAGE_LINES = [
  '<!-- Christmas menu: online from the first of December. Maya bakes the stollen from mid-November. -->',
  '<h2>Christmas at the Corner Bakery</h2>',
  '<ul>',
  '  <li>Gingerbread, 1.20 each</li>'
]
const PAGE = text(...PAGE_LINES, '</ul>')
const PAGE_WITH_ITEMS = text(
  ...PAGE_LINES,
  '  <li>Stollen, 12.50 (order two days ahead)</li>',
  '  <li>Mince pies, 2.10 each</li>',
  '</ul>'
)
const SNOWFLAKES = `${STYLE}/* experiment: falling snowflakes on the Christmas page. Too much? */\nbody {\n  background-image: url(img/snowflakes.svg);\n  animation: snow 6s linear infinite;\n}\n`

const setup = () => bakerySite()
  .origin()
  .switch(BRANCH, { create: true })
  .file('christmas.html', PAGE)
  .commit(FIRST)
  .file('christmas.html', PAGE_WITH_ITEMS)
  .commit(SECOND)
  .file('style.css', SNOWFLAKES)
  .run('git reset --hard HEAD~2')
  .build()

/** Your newest commit, one move back in the reflog. */
const LOST = resolve(setup(), 'HEAD@{1}')!

export const lostCommitsAfterReset: GitScenario = {
  id: 'git-31-lost-commits-after-reset',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Lost commits after a reset',
  story: [
    `Last night you finished two commits on \`${BRANCH}\`: "${FIRST}" and "${SECOND}". Then you wanted to throw away a snowflake experiment in style.css and typed \`git reset --hard HEAD~2\` instead of \`git reset --hard\`. This morning both commits are gone from \`git log\`, and christmas.html is gone from your disk. Nothing was pushed.`,
    `They aren't lost: git remembers every place HEAD has been. Look there, find the newer of the two commits, and put \`${BRANCH}\` back on it, with christmas.html back in your files. The snowflakes stay gone; they were never committed.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'looked', label: 'You looked up where HEAD has been', check: ({ history }) => ran(history, 'reflog') },
    { id: 'back', label: `${BRANCH} has both commits again`, check: ({ state }) => resolve(state, BRANCH) === LOST },
    {
      id: 'files',
      label: 'christmas.html is back on your disk, with nothing left to commit',
      check: ({ state }) => state.workdir['christmas.html'] === PAGE_WITH_ITEMS && isWorkingTreeClean(state)
    }
  ],
  hints: [
    '`git log` only shows commits a branch can still reach. `git reflog` lists every place HEAD has been, newest first, including the commits the reset left behind.',
    'In the reflog, `HEAD@{0}` is the reset itself. The line below it, `HEAD@{1}`, is where HEAD was right before: your newest commit. `git reset --hard` to that line moves the branch back and brings the files with it; you can name it `HEAD@{1}` or by the id at the start of the line.',
    `\`git reflog\`, then \`git reset --hard HEAD@{1}\` (or \`git reset --hard ${LOST.slice(0, 7)}\`).`
  ],
  debrief: {
    title: 'The reflog remembers where HEAD has been',
    paragraphs: [
      'Every time HEAD moves (a commit, a reset, a switch, a rebase), git adds a line to the reflog. A reset only moves a branch: the commits it leaves behind are still in your repository, and the reflog still points at them. `HEAD@{1}` means "where HEAD was one move ago", so `git reset --hard HEAD@{1}` undid the bad reset in one go.',
      'If you\'d rather not move your branch yet, `git branch rescue <id>` puts a new branch on the lost commit, and you can look at it first.',
      'Three limits. The reflog is local: it lives only on your machine, and a fresh clone starts with an empty one. Entries expire: by default git cleans up commits that nothing reaches after about 30 days. And uncommitted work is never in it: the snowflakes were never committed, so `--hard` threw them away for good. Commit early, even on a messy branch.'
    ]
  },
  solution: [
    'git log --oneline',
    'git reflog',
    'git reset --hard HEAD@{1}'
  ]
}
