// The practice tasks of chapter 1 (Basics): one short task each, listed in the chapter right after the scenario they
// train (docs/features/levels.md, "Practice tasks"). The first one is the approved sample of ADR 0006.
import { ignoreMatcher, isWorkingTreeClean, repo, resolve } from '../../../git'
import type { GitState } from '../../../git'
import { INDEX, MENU, STYLE, bakerySite } from '../bakery'
import { changedIn, committedFile, hasFlag, practice, ran, sameList, stagedFile } from '../checks'

/** Arguments of a git command without its flags, e.g. ['diff', 'src/cart.js'] for `git diff -- src/cart.js`. */
const pathsOf = (args: string[]) => args.slice(1).filter(arg => !arg.startsWith('-')).map(arg => arg.replace(/^\.\//, ''))

export const stageOneFile = practice({
  id: 'git-practice-stage-one-file',
  practises: 'git-01-first-commit',
  title: 'Stage only app.js',
  task: 'Both `app.js` and `style.css` changed. Stage `app.js`, leave `style.css` unstaged.',
  setup: () => repo()
    .file('app.js', '// Habit tracker: the habits you tick off each day.\nconst habits = [\'water\', \'walk\', \'read\']\nconsole.log(habits.join(\', \'))')
    .file('style.css', '/* One colour per habit row, set by app.js */\nbody {\n  font-family: system-ui, sans-serif;\n}')
    .commit('Start the habit tracker')
    .file('app.js', '// Habit tracker: the habits you tick off each day.\nconst habits = [\'water\', \'walk\', \'read\', \'stretch\']\nconsole.log(habits.join(\', \'))')
    .file('style.css', '/* One colour per habit row, set by app.js */\nbody {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}')
    .build(),
  goals: [{
    id: 'staged',
    label: 'app.js is staged, style.css is not',
    check: ({ state }) => stagedFile(state, 'app.js') === state.workdir['app.js'] && stagedFile(state, 'app.js') !== committedFile(state, 'app.js')
      && stagedFile(state, 'style.css') === committedFile(state, 'style.css')
  }],
  hints: ['`git add <file>`'],
  why: '`git add` stages only the files you name, so the next commit holds exactly the change you mean.',
  solution: ['git add app.js']
})

export const commitAll = practice({
  id: 'git-practice-commit-all',
  practises: 'git-01-first-commit',
  title: 'Commit tracked changes in one go',
  task: '`index.html` and `style.css` changed, and git already tracks both. Commit them with one command, without `git add`.',
  setup: () => repo()
    .file('index.html', '<h1>Habit tracker</h1>\n<ul id="habits"></ul>')
    .file('style.css', 'h1 {\n  color: #234;\n}')
    .commit('Add the page')
    .file('index.html', '<h1>Habit tracker</h1>\n<p>One tick a day.</p>\n<ul id="habits"></ul>')
    .file('style.css', 'h1 {\n  color: #234;\n  margin-bottom: 0;\n}')
    .build(),
  goals: [
    {
      id: 'committed',
      label: 'A new commit holds the changes to index.html and style.css',
      check: ({ state }) => resolve(state, 'HEAD~1') !== null && sameList(changedIn(state, 'HEAD'), ['index.html', 'style.css'])
    },
    {
      id: 'one-go',
      label: 'Done with `git commit -a`, no separate `git add`',
      check: ({ history }) => ran(history, 'commit', args => hasFlag(args, 'a', '--all')) && !ran(history, 'add')
    }
  ],
  hints: ['`git commit -a` stages every tracked file that changed; `-am "message"` adds the message in the same go.'],
  why: '`-a` stages the changes of files git already tracks, so a small fix is one command. New files still need `git add`.',
  solution: ['git commit -am "Add a tagline under the title"']
})

export const diffStaged = practice({
  id: 'git-practice-diff-staged',
  practises: 'git-07-stage-together',
  title: 'Show what will be committed',
  task: 'Part of your work is staged. Show exactly what the next commit will contain, line by line.',
  setup: () => repo()
    .file('src/cart.js', '// The shopping cart.\nexport const cart = []')
    .file('src/checkout.js', '// The checkout button.\nexport const label = \'Buy\'')
    .commit('Add cart and checkout')
    .file('src/cart.js', '// The shopping cart. Emptied after every order.\nexport const cart = []\nexport const clear = () => cart.splice(0)')
    .stage('src/cart.js')
    .file('src/checkout.js', '// The checkout button.\nexport const label = \'Order now\'')
    .build(),
  goals: [{
    id: 'shown',
    label: 'You showed the staged changes',
    check: ({ history }) => ran(history, 'diff', args => args.includes('--staged') || args.includes('--cached'))
  }],
  hints: ['`git diff` shows what is not staged yet. `git diff --staged` compares the staging area with the last commit.'],
  why: '`git diff --staged` is the last look before `git commit`: exactly these lines go in.',
  solution: ['git diff --staged']
})

export const diffFile = practice({
  id: 'git-practice-diff-file',
  practises: 'git-08-what-changed',
  title: 'Show the changes in one file',
  task: 'Three files changed. Show the unstaged changes of `src/cart.js`, and only those.',
  setup: () => repo()
    .file('README.md', '# Corner Bakery shop')
    .file('src/cart.js', '// The shopping cart.\nexport const cart = []')
    .file('src/prices.js', '// Prices in euros.\nexport const croissant = 1.9')
    .commit('Start the shop')
    .file('README.md', '# Corner Bakery shop\n\nOrders close at 18:00 for the next morning.')
    .file('src/cart.js', '// The shopping cart. At most 20 items per order.\nexport const cart = []\nexport const MAX_ITEMS = 20')
    .file('src/prices.js', '// Prices in euros.\nexport const croissant = 2.1')
    .build(),
  goals: [{
    id: 'shown',
    label: 'You showed the changes of src/cart.js alone',
    check: ({ history }) => ran(history, 'diff', args => !args.includes('--staged') && !args.includes('--cached')
      && sameList(pathsOf(args), ['src/cart.js']))
  }],
  hints: ['Like `git add`, `git diff` takes file names: `git diff <file>`.'],
  why: 'With a file name, `git diff` shows just that file, which helps when one change hides among many.',
  solution: ['git diff src/cart.js']
})

const LOG_COUNTS = ['-3', '-n3', '--max-count=3']

export const logOneline = practice({
  id: 'git-practice-log-oneline',
  practises: 'git-09-read-history',
  title: 'Last three commits, one line each',
  task: 'Show only the three newest commits, one line each.',
  setup: () => bakerySite()
    .file('index.html', `${INDEX}<footer>Open Tuesday to Saturday 7:00-18:00</footer>\n`)
    .commit('Show the opening hours in the footer', { author: 'Jonas' })
    .file('menu.html', MENU.replace('4.80', '5.00'))
    .commit('Raise the sourdough price', { author: 'Maya' })
    .file('menu.html', MENU.replace('4.80', '5.00').replace('</ul>', '  <li>Sunday brunch rolls, 0.80</li>\n</ul>'))
    .commit('Add the Sunday brunch rolls', { author: 'Ben' })
    .file('style.css', `${STYLE}ul {\n  padding-left: 1rem;\n}\n`)
    .commit('Tidy the menu list on phones', { author: 'Jonas' })
    .build(),
  goals: [{
    id: 'shown',
    label: 'You showed the three newest commits, one line each',
    check: ({ history }) => ran(history, 'log', (args) => {
      const count = LOG_COUNTS.some(flag => args.includes(flag)) || args.some((arg, i) => (arg === '-n' || arg === '--max-count') && args[i + 1] === '3')
      return args.includes('--oneline') && count
    })
  }],
  hints: ['`git log --oneline` gives one line per commit; `-<n>` limits it to the newest n.'],
  why: '`git log --oneline -3` is a quick "what happened lately?" before you start work.',
  solution: ['git log --oneline -3']
})

/** The newest commit's .gitignore as a matcher; one that ignores nothing when there is none. */
const committedIgnore = (state: GitState) => ignoreMatcher({ '.gitignore': committedFile(state, '.gitignore') ?? '' })

export const ignoreLogs = practice({
  id: 'git-practice-ignore-logs',
  practises: 'git-10-ignore-build-files',
  title: 'Ignore every log file',
  task: 'Two log files showed up: `debug.log` and `logs/server.log`. Add one line to `.gitignore` so git ignores every `.log` file, then commit it.',
  setup: () => repo()
    .file('.gitignore', 'dist/')
    .file('src/server.js', '// Writes a line to logs/server.log for every order.\nexport const LOG_FILE = \'logs/server.log\'')
    .commit('Start the order server')
    .file('debug.log', 'order 1042: cart empty after reload')
    .file('logs/server.log', '09:01 server started on port 3000')
    .build(),
  goals: [
    {
      id: 'ignored',
      label: 'The committed .gitignore ignores every .log file',
      check: ({ state }) => ['debug.log', 'logs/server.log', 'tools/build.log'].every(committedIgnore(state))
    },
    { id: 'kept', label: 'It still ignores dist/', check: ({ state }) => committedIgnore(state)('dist/app.js') },
    { id: 'clean', label: 'Working tree clean', check: ({ state }) => isWorkingTreeClean(state) }
  ],
  hints: ['`echo "*.log" >> .gitignore` adds a line (a single `>` would replace the whole file). Then `git commit -am "..."`.'],
  why: '`*.log` matches the name in every folder, so one line covers log files wherever they show up.',
  solution: ['echo "*.log" >> .gitignore', 'git commit -am "Ignore log files"']
})
