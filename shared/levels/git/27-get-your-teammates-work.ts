// Teamwork 5.2: Jonas and Maya pushed two commits to main after your last fetch. `git fetch` brings them into
// origin/main without touching your main; you look before you take them (`git status` says "behind by 2",
// `git log main..origin/main` lists them), then `git pull` fast-forwards main. The look is read from the history: it
// counts after a fetch and before the first pull or merge.
import { remoteBranchHead, resolve, trackingBranchHead } from '../../git'
import type { CommandRecord, Scenario } from '../types'
import { INDEX, MENU, bakerySite } from './bakery'
import { gitInvocations, logRevisions, once } from './checks'

const FOOTER = `${INDEX}<footer>Open Tuesday to Saturday 7:00-18:00, Sunday 8:00-12:00</footer>\n`
const BRUNCH = MENU.replace('</ul>', '  <li>Sunday brunch rolls, 0.80</li>\n</ul>')

const setup = () => bakerySite()
  .origin()
  .teammate('Jonas', 'Show the opening hours in the footer', { 'index.html': FOOTER })
  .teammate('Maya', 'Add the Sunday brunch rolls to the menu', { 'menu.html': BRUNCH })
  .build()

const start = once(setup)
const THEIRS = () => remoteBranchHead(start(), 'main')!

/** `git status`, or a `git log` that shows origin/main (`main..origin/main`, `origin/main`, `--all`). */
const looks = (args: string[]) => args[0] === 'status'
  || (args[0] === 'log' && (args.includes('--all') || logRevisions(args).include.includes('origin/main')))

/** You looked after a fetch and before the first pull or merge. */
function lookedFirst(history: CommandRecord[]): boolean {
  const calls = gitInvocations(history).filter(call => call.exitCode === 0)
  const fetched = calls.findIndex(call => call.args[0] === 'fetch')
  const taken = calls.findIndex(call => call.args[0] === 'pull' || call.args[0] === 'merge' || call.args[0] === 'rebase')
  return fetched !== -1 && calls.some((call, i) => i > fetched && (taken === -1 || i < taken) && looks(call.args))
}

export const getYourTeammatesWork: Scenario = {
  id: 'git-27-get-your-teammates-work',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 5,
  title: 'Get your teammates\' work',
  story: [
    'Good morning! Last night Jonas and Maya each pushed a commit to main. Your main is where you left it yesterday, and your repository doesn\'t know their commits yet.',
    'Get their work into your main, but look before you take: first download it without touching your main, check what came in and how far behind you are, and only then bring it into your main.'
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'fetched', label: 'origin/main has Jonas\'s and Maya\'s commits', check: ({ state }) => trackingBranchHead(state, 'main') === THEIRS() },
    {
      id: 'looked',
      label: 'After downloading their work, you checked what came in before bringing it into main',
      check: ({ history }) => lookedFirst(history)
    },
    { id: 'pulled', label: 'Your main has both of their commits', check: ({ state }) => resolve(state, 'main') === THEIRS() }
  ],
  hints: [
    'Your repository only learns what\'s on origin when it asks. `git fetch` asks, and changes nothing but origin/main, your copy of origin\'s main.',
    'After the fetch, `git status` compares main with origin/main. `main..origin/main` means "on origin/main, but not on main": the commits a pull would bring in.',
    '`git fetch`, `git status` (or `git log --oneline main..origin/main`), then `git pull`.'
  ],
  debrief: {
    title: 'Fetch to look, pull to take',
    paragraphs: [
      '`git fetch` downloaded Jonas\'s and Maya\'s commits and moved origin/main, your bookmark of origin\'s main. Your main, your files and your staging area stayed exactly as they were, so a fetch is always safe, even in the middle of work.',
      'Then you could look before taking anything: `git status` said main was behind origin/main by 2 commits, and `git log main..origin/main` named them.',
      '`git pull` is a fetch plus bringing origin/main into your branch. You had no commits of your own, so git simply moved main forward to Maya\'s commit: a fast-forward, no merge commit.'
    ]
  },
  solution: [
    'git fetch',
    'git status',
    'git log --oneline main..origin/main',
    'git pull'
  ]
}
