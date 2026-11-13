// Teamwork 5.4: after a fetch, `git status` says main and origin/main have diverged (2 and 1 different commits). You
// name both sides with log ranges before syncing (`origin/main..main` yours, `main..origin/main` Maya's), then sync.
// The looks are read from the history and count before the first pull, merge, rebase, reset or push (after that the
// ranges no longer show what they're about). Merging or rebasing both sync; a force push that drops Maya's commit
// does not.
import { commitsOf, remoteBranchHead, resolve, trackingBranchHead } from '../../git'
import type { GitState } from '../../git'
import type { GitScenario } from './types'
import { INDEX, MENU, STYLE, bakerySite } from './bakery'
import { logsOnlyOn, once, ranBefore } from './checks'

const YOURS = ['Add the rye loaf to the menu', 'Make the menu readable on phones']
const SYNC = ['pull', 'merge', 'rebase', 'reset', 'push']
const MAIN = ['main', 'HEAD']

const RYE = MENU.replace('</ul>', '  <li>Rye loaf, 4.20 (Thursdays only)</li>\n</ul>')
const PHONES = `${STYLE}/* Most customers check the menu on their phone on the way to the shop. */\nul {\n  padding-left: 1rem;\n  font-size: 1.125rem;\n}\n`
const SATURDAY = INDEX.replace('every morning from 7:00.', 'every morning from 7:00, on Saturdays from 6:30.')

const setup = () => bakerySite()
  .origin()
  .teammate('Maya', 'Open at 6:30 on Saturdays', { 'index.html': SATURDAY })
  .file('menu.html', RYE)
  .commit(YOURS[0]!)
  .file('style.css', PHONES)
  .commit(YOURS[1]!)
  .fetch()
  .build()

const start = once(setup)
const MAYA = () => trackingBranchHead(start(), 'main')!

/** origin's main is your main, with Maya's commit and both of yours. */
function synced(state: GitState): boolean {
  const messages = commitsOf(state, 'main').map(commit => commit.message)
  return remoteBranchHead(state, 'main') === resolve(state, 'main') && commitsOf(state, 'main').some(commit => commit.id === MAYA())
    && YOURS.every(message => messages.includes(message))
}

export const aheadAndBehind: GitScenario = {
  id: 'git-29-ahead-and-behind',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Ahead and behind',
  story: [
    'You fetched a minute ago, and git tells you: "Your branch and \'origin/main\' have diverged, and have 2 and 1 different commits each, respectively." So main has two commits origin/main doesn\'t, and origin/main has one that main doesn\'t.',
    'Before you sync, find out which is which: list the commits that are only on your main (yours, not pushed yet), then the one that is only on origin/main (new from the team). Then sync: get that commit into your main and push yours, so origin\'s main has all three.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'yours',
      label: 'Before syncing, you listed only your unpushed commits',
      check: ({ history }) => ranBefore(history, SYNC, args => logsOnlyOn(args, MAIN, ['origin/main']))
    },
    {
      id: 'theirs',
      label: 'Before syncing, you listed only the new commit from origin',
      check: ({ history }) => ranBefore(history, SYNC, args => logsOnlyOn(args, ['origin/main'], MAIN))
    },
    { id: 'synced', label: 'origin\'s main matches yours, with Maya\'s commit and both of yours', check: ({ state }) => synced(state) }
  ],
  hints: [
    '`git log` takes a range: `A..B` lists the commits on B that aren\'t on A.',
    'Your unpushed commits are on main but not on origin/main, so the range starts with origin/main. Turn it around for the commit you haven\'t pulled yet. To sync, pull first, then push.',
    '`git log --oneline origin/main..main`, `git log --oneline main..origin/main`, then `git pull --rebase` and `git push`.'
  ],
  debrief: {
    title: 'Two dots, two directions',
    paragraphs: [
      '`A..B` means: the commits you can reach from B but not from A. `origin/main..main` showed what main has and origin/main doesn\'t: your two unpushed commits, exactly what a push would send. Turned around, `main..origin/main` showed Maya\'s Saturday hours, the commit you hadn\'t pulled yet.',
      'That\'s the same 2 and 1 that `git status` counted, only with names. Both lists are as of your last fetch, so `git fetch` first when you want the latest.',
      'Origin had a commit you didn\'t, so you brought it in before pushing. With `git pull --rebase` your two commits now sit on top of Maya\'s; a plain `git pull` works too, with a merge commit. Afterwards both lists are empty: main and origin/main are the same.'
    ]
  },
  solution: [
    'git log --oneline origin/main..main',
    'git log --oneline main..origin/main',
    'git pull --rebase',
    'git push'
  ]
}
