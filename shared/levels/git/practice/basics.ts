// The practice tasks of chapter 1 (Basics): one short task each, listed in the chapter right after the scenario they
// train (docs/features/levels.md, "Practice tasks"). The first one is the approved sample of ADR 0006.
import { headCommit, ignoreMatcher, isWorkingTreeClean, repo, resolve } from '../../../git'
import type { GitState } from '../../../git'
import type { PracticeTask } from '../../types'
import { changedIn, hasFlag, ran } from '../checks'

const headFile = (state: GitState, path: string) => headCommit(state)?.tree[path]
const stagedFile = (state: GitState, path: string) => state.repo?.index[path]

/** Arguments of a git command without its flags, e.g. ['diff', 'src/cart.js'] for `git diff -- src/cart.js`. */
const pathsOf = (args: string[]) => args.slice(1).filter(arg => !arg.startsWith('-')).map(arg => arg.replace(/^\.\//, ''))

export const stageOneFile: PracticeTask = {
  id: 'git-practice-stage-one-file',
  track: 'git',
  kind: 'practice',
  practises: 'git-01-first-commit',
  difficulty: 1,
  minutes: 0.5,
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
    check: ({ state }) => stagedFile(state, 'app.js') === state.workdir['app.js'] && stagedFile(state, 'app.js') !== headFile(state, 'app.js')
      && stagedFile(state, 'style.css') === headFile(state, 'style.css')
  }],
  hints: ['`git add <file>`'],
  why: '`git add` stages only the files you name, so the next commit holds exactly the change you mean.',
  solution: ['git add app.js']
}

export const commitAll: PracticeTask = {
  id: 'git-practice-commit-all',
  track: 'git',
  kind: 'practice',
  practises: 'git-01-first-commit',
  difficulty: 1,
  minutes: 0.5,
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
      check: ({ state }) => resolve(state, 'HEAD~1') !== null && JSON.stringify(changedIn(state, 'HEAD')) === JSON.stringify(['index.html', 'style.css'])
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
}

export const diffStaged: PracticeTask = {
  id: 'git-practice-diff-staged',
  track: 'git',
  kind: 'practice',
  practises: 'git-07-stage-together',
  difficulty: 1,
  minutes: 0.5,
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
}

export const diffFile: PracticeTask = {
  id: 'git-practice-diff-file',
  track: 'git',
  kind: 'practice',
  practises: 'git-08-what-changed',
  difficulty: 1,
  minutes: 0.5,
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
      && JSON.stringify(pathsOf(args)) === JSON.stringify(['src/cart.js']))
  }],
  hints: ['Like `git add`, `git diff` takes file names: `git diff <file>`.'],
  why: 'With a file name, `git diff` shows just that file, which helps when one change hides among many.',
  solution: ['git diff src/cart.js']
}

const LOG_COUNTS = ['-3', '-n3', '--max-count=3']

export const logOneline: PracticeTask = {
  id: 'git-practice-log-oneline',
  track: 'git',
  kind: 'practice',
  practises: 'git-09-read-history',
  difficulty: 1,
  minutes: 0.5,
  title: 'Last three commits, one line each',
  task: 'Show only the three newest commits, one line each.',
  setup: () => repo()
    .file('README.md', '# Garden club planner')
    .commit('Start the planner')
    .file('src/beds.js', '// Raised beds, numbered from the gate.\nexport const beds = 6')
    .commit('Add the raised beds', { author: 'Anna' })
    .file('src/watering.js', '// Who waters when, Monday to Sunday.\nexport const rota = []')
    .commit('Add a watering rota', { author: 'Ben' })
    .file('src/seeds.js', '// Seed swap list for the spring meeting.\nexport const seeds = [\'beans\', \'kale\']')
    .commit('Add the seed swap list', { author: 'Chris' })
    .file('src/beds.js', '// Raised beds, numbered from the gate.\nexport const beds = 8')
    .commit('Two more raised beds', { author: 'Anna' })
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
}

/** The newest commit's .gitignore as a matcher; one that ignores nothing when there is none. */
const committedIgnore = (state: GitState) => ignoreMatcher({ '.gitignore': headFile(state, '.gitignore') ?? '' })

export const ignoreLogs: PracticeTask = {
  id: 'git-practice-ignore-logs',
  track: 'git',
  kind: 'practice',
  practises: 'git-10-ignore-build-files',
  difficulty: 1,
  minutes: 0.5,
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
}
