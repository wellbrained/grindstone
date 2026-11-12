// Teamwork 5.3: your commit on main isn't pushed yet. Right before your first `git push`, Ben pushes a commit to main
// (a `beforeCommand` trigger, so the push is always rejected with "fetch first", however long you take). `git pull
// --rebase` puts your commit on top of his, then the push is a fast-forward. A plain `git pull` gets the push through
// too, but with a merge commit, which the "on top" goal rules out; a `--force` push deletes Ben's commit from origin.
// Ben's commit is found by its message: its id depends on when the event fires.
import { commitsOf, hasMergeCommits, remoteBranchHead, remoteCommitsOf, resolve, teammateCommit } from '../../git'
import type { Commit, GitState } from '../../git'
import type { Scenario } from '../types'
import { INDEX, MENU, bakerySite } from './bakery'

const YOURS = 'Add the Christmas opening hours'
const BENS = 'Mark the vegan bakes on the menu'

const CHRISTMAS = `${INDEX}<p>Over Christmas: open 7:00-12:00 on 24 December, closed on the 25th and 26th.</p>\n`
const VEGAN = MENU
  .replace('<!-- Menu page. Prices change on Mondays; Maya sends them by email. -->', '<!-- Menu page. Prices change on Mondays; Maya sends them by email.\n     (V) = vegan; Ben checks every recipe with the suppliers. -->')
  .replace('Sourdough loaf, 4.80', 'Sourdough loaf (V), 4.80')

const setup = () => bakerySite()
  .origin()
  .file('index.html', CHRISTMAS)
  .commit(YOURS)
  .build()

const isBens = (commit: Commit) => commit.message === BENS && commit.author.name === 'Ben'

/** Your main ends in your commit, right on top of Ben's, with no merge commit. */
function onTopOfBen(state: GitState): boolean {
  const [tip, parent] = commitsOf(state, 'main')
  return !!tip && !!parent && tip.message === YOURS && tip.parents[0] === parent.id && isBens(parent) && !hasMergeCommits(state, 'main')
}

export const yourPushWasRejected: Scenario = {
  id: 'git-28-your-push-was-rejected',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Your push was rejected',
  story: [
    'You added the Christmas opening hours to the home page, straight on main: small changes like this go there on your team. It\'s committed, but not pushed yet. Push it, so Maya can send the link to her customers.',
    'Ben is working on main this morning too. Whatever he pushes must stay on origin, and main stays a straight line: no merge commits.'
  ].join('\n\n'),
  setup,
  teammates: [
    {
      id: 'ben-pushes-main',
      author: 'Ben',
      trigger: { beforeCommand: 'git push' },
      apply: state => teammateCommit(state, { author: 'Ben', message: BENS, files: { 'menu.html': VEGAN } }),
      notice: 'Ben pushed a commit to main a moment ago: he marked the vegan bakes on the menu.'
    }
  ],
  goals: [
    {
      id: 'pushed',
      label: 'origin\'s main has your Christmas hours commit',
      check: ({ state }) => remoteBranchHead(state, 'main') === resolve(state, 'main') && commitsOf(state, 'main').some(commit => commit.message === YOURS)
    },
    // only counts once your commit is on origin too, so it doesn't tick the moment Ben pushes
    {
      id: 'ben',
      label: 'Ben\'s commit is still on origin\'s main, below yours',
      check: ({ state }) => {
        const onOrigin = remoteCommitsOf(state, 'main')
        return onOrigin.some(isBens) && onOrigin.some(commit => commit.message === YOURS)
      }
    },
    { id: 'on-top', label: 'Your commit sits right on top of Ben\'s, no merge commit', check: ({ state }) => onTopOfBen(state) }
  ],
  hints: [
    'Try `git push`. When origin says no, read why: it has something your main doesn\'t.',
    'Origin\'s main has Ben\'s new commit, and pushing would throw it away. `git pull --rebase` fetches it and replays your unpushed commit on top of it, without a merge commit. After that a normal push works.',
    '`git push`, then `git pull --rebase` and `git push` again.'
  ],
  debrief: {
    title: 'Pull it in, put yours on top, push',
    paragraphs: [
      'Ben pushed a moment before you. Origin\'s main had his commit and yours didn\'t, so your push would have thrown it away: git rejected it ("fetch first") and changed nothing.',
      '`git pull --rebase` fetched Ben\'s commit and replayed yours on top of it, as if you had started after him. Your commit got a new id, which is fine because it had never left your machine. The push was then a plain fast-forward.',
      'A plain `git pull` would have got your push through too: it merges and adds a commit "Merge branch \'main\' of …". On a shared main those merge commits pile up and tell nobody anything, so for small unpushed commits rebase is the tidy way. And never `--force` here: it would delete Ben\'s commit from origin.'
    ]
  },
  solution: [
    'git push',
    'git pull --rebase',
    'git push'
  ]
}
