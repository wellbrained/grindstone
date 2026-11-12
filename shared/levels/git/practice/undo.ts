// The practice tasks of chapter 6 (Undo & recovery), listed in the chapter right after the scenario they train
// (docs/features/levels.md). "Revert the commit before last" is the approved sample of the chapter preview.
import { commitsOf, headCommit, isWorkingTreeClean, repo, resolve, stashEntries } from '../../../git'
import type { GitState } from '../../../git'
import type { PracticeTask } from '../../types'

const text = (...lines: string[]) => `${lines.join('\n')}\n`
const headFile = (state: GitState, path: string) => headCommit(state)?.tree[path]
const stagedFile = (state: GitState, path: string) => state.repo?.index[path]
const subjectAt = (state: GitState, rev: string) => {
  const id = resolve(state, rev)
  return id ? state.repo!.commits[id]!.message : null
}

const HABITS = '// The habits you tick off each day. Ben keeps the list short on purpose: three is plenty.\nexport const habits = [\'water\', \'walk\', \'read\']'

// 6.1 Fix the last commit

const REMINDERS_CSS = text('/* The reminder bell next to each habit; dimmed until the reminder is due. */', '.reminder {', '  opacity: 0.6;', '}')

export const amendNoEdit: PracticeTask = {
  id: 'git-practice-amend-no-edit',
  track: 'git',
  kind: 'practice',
  practises: 'git-11-fix-last-commit',
  difficulty: 1,
  minutes: 0.5,
  title: 'Add a forgotten file to the last commit',
  task: 'You committed "Add reminder settings" but forgot the new `src/reminders.css`. Put it into that commit and keep the message.',
  setup: () => repo()
    .file('src/habits.js', HABITS)
    .commit('Start the habit tracker', { author: 'Ben' })
    .file('src/reminders.js', '// When to remind you, per habit, in local time. The bell styles are in src/reminders.css.\nexport const reminders = { water: \'10:00\', walk: \'18:30\' }')
    .commit('Add reminder settings')
    .file('src/reminders.css', REMINDERS_CSS)
    .build(),
  goals: [
    {
      id: 'amended',
      label: 'The last commit, still "Add reminder settings", now holds src/reminders.css too',
      check: ({ state }) => subjectAt(state, 'HEAD') === 'Add reminder settings' && subjectAt(state, 'HEAD~1') === 'Start the habit tracker'
        && headFile(state, 'src/reminders.css') === REMINDERS_CSS && headFile(state, 'src/reminders.js') !== undefined
    },
    { id: 'clean', label: 'Working tree clean', check: ({ state }) => isWorkingTreeClean(state) }
  ],
  hints: ['`git add` the file, then `git commit --amend --no-edit`: same message, new content.'],
  why: '`--amend` swaps the last commit for a new one with everything staged; `--no-edit` keeps its message.',
  solution: ['git add src/reminders.css', 'git commit --amend --no-edit']
}

// 6.2 Throw away a change

const APP = '// Habit tracker: the habits you tick off each day.\nconst habits = [\'water\', \'walk\', \'read\']\nconsole.log(habits.join(\', \'))'
const APP_NEW = text('// Habit tracker: the habits you tick off each day.', 'const habits = [\'water\', \'walk\', \'read\', \'stretch\']', 'console.log(habits.join(\', \'))')
const STYLE = 'body {\n  font-family: system-ui, sans-serif;\n}'
const STYLE_NEW = text('body {', '  font-family: system-ui, sans-serif;', '  /* trying a darker background, not sure yet */', '  background: #1d2430;', '}')

export const unstageFile: PracticeTask = {
  id: 'git-practice-unstage-file',
  track: 'git',
  kind: 'practice',
  practises: 'git-12-throw-away-change',
  difficulty: 1,
  minutes: 0.5,
  title: 'Unstage one file',
  task: 'You staged `app.js` and `style.css`, but only `app.js` belongs in the next commit. Unstage `style.css` and keep its changes in the file.',
  setup: () => repo()
    .file('app.js', APP)
    .file('style.css', STYLE)
    .commit('Start the habit tracker')
    .file('app.js', APP_NEW)
    .file('style.css', STYLE_NEW)
    .stage()
    .build(),
  goals: [
    {
      id: 'unstaged',
      label: 'style.css is no longer staged, its changes are still in the file',
      check: ({ state }) => stagedFile(state, 'style.css') === headFile(state, 'style.css') && state.workdir['style.css'] === STYLE_NEW
    },
    { id: 'app', label: 'app.js is still staged', check: ({ state }) => stagedFile(state, 'app.js') === APP_NEW }
  ],
  hints: ['`git restore --staged <file>`'],
  why: '`--staged` only changes the staging area: your edits in style.css stay where they are.',
  solution: ['git restore --staged style.css']
}

const BEDS = '// Raised beds, numbered from the gate.\nexport const beds = 6'
const BEDS_BROKEN = text('// Raised beds, numbered from the gate.', 'export const beds = 6', 'export const bedNames = beds.map(n => `Bed ${n}`) // beds is a number, this throws')
const ROTA = '// Who waters when, Monday to Sunday.\nexport const rota = [\'Anna\', \'Ben\']'
const ROTA_NEW = text('// Who waters when, Monday to Sunday. Chris joins in May.', 'export const rota = [\'Anna\', \'Ben\', \'Chris\']')

export const discardFile: PracticeTask = {
  id: 'git-practice-discard-file',
  track: 'git',
  kind: 'practice',
  practises: 'git-12-throw-away-change',
  difficulty: 1,
  minutes: 0.5,
  title: 'Discard your changes in one file',
  task: 'Your edit to `src/beds.js` broke the garden club planner. Throw it away and get the committed version back; keep your changes to `src/watering.js`.',
  setup: () => repo()
    .file('src/beds.js', BEDS)
    .file('src/watering.js', ROTA)
    .commit('Start the planner', { author: 'Anna' })
    .file('src/beds.js', BEDS_BROKEN)
    .file('src/watering.js', ROTA_NEW)
    .build(),
  goals: [
    { id: 'discarded', label: 'src/beds.js is back to the committed version', check: ({ state }) => state.workdir['src/beds.js'] === headFile(state, 'src/beds.js') },
    { id: 'kept', label: 'Your changes to src/watering.js are still there', check: ({ state }) => state.workdir['src/watering.js'] === ROTA_NEW }
  ],
  hints: ['`git restore <file>`'],
  why: '`git restore` copies the last saved version over your file. Changes that were never committed are gone for good, so look at `git diff` first.',
  solution: ['git restore src/beds.js']
}

// 6.3 Undo a local commit

const GOALS_JS = '// Weekly goals: on how many days a week you aim to keep each habit.\nexport const weeklyGoals = { water: 7, walk: 5, read: 4 }'

export const resetSoft: PracticeTask = {
  id: 'git-practice-reset-soft',
  track: 'git',
  kind: 'practice',
  practises: 'git-13-undo-local-commit',
  difficulty: 1,
  minutes: 0.5,
  title: 'Undo the last commit, keep its changes staged',
  task: 'The last commit, "Add weekly goals", went in too early and is not pushed. Undo it, but keep its changes staged.',
  setup: () => repo()
    .file('src/habits.js', HABITS)
    .commit('Start the habit tracker', { author: 'Ben' })
    .file('src/goals.js', GOALS_JS)
    .commit('Add weekly goals')
    .build(),
  goals: [
    { id: 'undone', label: 'main is back on "Start the habit tracker"', check: ({ state }) => subjectAt(state, 'main') === 'Start the habit tracker' },
    {
      id: 'staged',
      label: 'src/goals.js is staged, ready for the next commit',
      check: ({ state }) => stagedFile(state, 'src/goals.js') === `${GOALS_JS}\n` && headFile(state, 'src/goals.js') === undefined
    }
  ],
  hints: ['`git reset --soft HEAD~1`'],
  why: '`--soft` only moves the branch: the undone commit\'s changes stay staged, ready for a better commit.',
  solution: ['git reset --soft HEAD~1']
}

export const resetHard: PracticeTask = {
  id: 'git-practice-reset-hard',
  track: 'git',
  kind: 'practice',
  practises: 'git-13-undo-local-commit',
  difficulty: 1,
  minutes: 0.5,
  title: 'Drop the last two commits completely',
  task: 'The two newest commits on main, a map of the raised beds, were a dead end and are not pushed. Remove them and their changes completely; `git status` is clean, so no uncommitted work gets lost.',
  setup: () => repo()
    .file('README.md', '# Garden club planner')
    .commit('Start the planner', { author: 'Anna' })
    .file('src/beds.js', BEDS)
    .commit('Add the raised beds', { author: 'Anna' })
    .file('src/map.js', '// A map of the beds, drawn as a grid of characters.\nexport const map = [\'[1][2][3]\', \'[4][5][6]\']')
    .commit('Try a map of the beds')
    .file('src/map.js', '// A map of the beds, drawn as a grid of characters, coloured by season.\nexport const map = [\'[1][2][3]\', \'[4][5][6]\']\nexport const season = \'spring\'')
    .file('style.css', '/* map colours per season */\n.spring { color: #5a8f29; }')
    .commit('Colour the map by season')
    .build(),
  goals: [
    { id: 'dropped', label: 'main is back on "Add the raised beds"', check: ({ state }) => subjectAt(state, 'main') === 'Add the raised beds' && commitsOf(state, 'main').length === 2 },
    { id: 'files', label: 'Your files match that commit: no map left over', check: ({ state }) => isWorkingTreeClean(state) && state.workdir['src/map.js'] === undefined }
  ],
  hints: ['`git reset --hard HEAD~2`. Careful: `--hard` also throws away uncommitted changes, for good.'],
  why: '`--hard` makes the branch, the staging area and your files match `HEAD~2`. Only run it on a clean `git status`: uncommitted work is gone for good.',
  solution: ['git reset --hard HEAD~2']
}

// 6.4 Undo a pushed commit (the approved sample)

const HOURS_BLOCK = ['  <h2>Opening hours</h2>', '  <p>Monday to Saturday, 7:00 to 18:00</p>']
const index = (hidden: boolean) => text(
  '<!doctype html>',
  '<title>Corner Bakery</title>',
  '<h1>Corner Bakery</h1>',
  '<section id="hours">',
  ...(hidden ? ['  <!--', ...HOURS_BLOCK, '  -->'] : HOURS_BLOCK),
  '</section>'
)
const CONTACT = text('<!-- Contact page. Cake orders: at least two days ahead, says Maya. -->', '<h2>Contact</h2>', '<p>Call us on 0123 456 789.</p>')
const CONTACT_FORM = CONTACT + '<p><a href="cake-order.html">Order a cake online</a></p>\n'

export const revertBeforeLast: PracticeTask = {
  id: 'git-practice-revert-before-last',
  track: 'git',
  kind: 'practice',
  practises: 'git-14-undo-pushed-commit',
  difficulty: 1,
  minutes: 0.5,
  title: 'Revert the commit before last',
  task: 'The commit before the newest one, "Hide the opening hours", was a mistake. It\'s already pushed. Undo it with a new commit.',
  setup: () => repo()
    .file('index.html', index(false))
    .file('contact.html', CONTACT)
    .commit('Start the bakery website', { author: 'Maya' })
    .file('index.html', index(true))
    .commit('Hide the opening hours')
    .file('contact.html', CONTACT_FORM)
    .commit('Link the cake order form', { author: 'Maya' })
    .origin()
    .build(),
  goals: [{
    id: 'reverted',
    label: 'A new commit undoes "Hide the opening hours"',
    check: ({ state }) => subjectAt(state, 'HEAD~1') === 'Link the cake order form'
      && headFile(state, 'index.html') === index(false) && headFile(state, 'contact.html') === CONTACT_FORM
  }],
  hints: ['`git revert HEAD~1`'],
  why: '`HEAD~1` names a commit by its distance from HEAD, so you don\'t need its hash.',
  solution: ['git revert HEAD~1']
}

// 6.5 Park unfinished work

const STREAKS = '// Streaks: how many days in a row you kept each habit. Not wired up yet.\nexport const streaks = {}'
const HABITS_NEW = text('// The habits you tick off each day. Ben keeps the list short on purpose: three is plenty.', 'export const habits = [\'water\', \'walk\', \'read\']', 'export { streaks } from \'./streaks.js\'')

export const stashUntracked: PracticeTask = {
  id: 'git-practice-stash-untracked',
  track: 'git',
  kind: 'practice',
  practises: 'git-15-park-unfinished-work',
  difficulty: 1,
  minutes: 0.5,
  title: 'Stash including new files',
  task: 'You changed `src/habits.js` and started a new file, `src/streaks.js`. Put both in the stash, so the working tree is clean.',
  setup: () => repo()
    .file('src/habits.js', HABITS)
    .commit('Start the habit tracker', { author: 'Ben' })
    .file('src/habits.js', HABITS_NEW)
    .file('src/streaks.js', STREAKS)
    .build(),
  goals: [{
    id: 'stashed',
    label: 'Both files are in the stash, and the working tree is clean',
    check: ({ state }) => {
      const entry = stashEntries(state)[0]
      return isWorkingTreeClean(state) && entry?.untracked['src/streaks.js'] !== undefined && entry.workdir['src/habits.js'] === HABITS_NEW
    }
  }],
  hints: ['`git stash -u` (or `--include-untracked`) takes untracked files along.'],
  why: 'Plain `git stash` leaves untracked files behind; `-u` takes them too, so your working tree is really clean.',
  solution: ['git stash -u']
}
