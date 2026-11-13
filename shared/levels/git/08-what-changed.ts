// Basics 1.3: look at what changed (status, diff, diff --staged) before you commit, and commit only one of two jobs.
import { commitsOf, headCommit, repo } from '../../git'
import type { GitScenario } from './types'
import { ran } from './checks'

const INDEX = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>Corner Bakery</title>',
  '  <link rel="stylesheet" href="style.css">',
  '</head>',
  '<body>',
  '  <h1>Corner Bakery</h1>',
  '  <p>Fresh bread every morning.</p>',
  '  <script type="module" src="src/hours.js"></script>',
  '</body>',
  '</html>'
].join('\n')

const STYLE = [
  'body {',
  '  font-family: Georgia, serif;',
  '  color: #3b2a1a;',
  '  background: #fff8ef;',
  '}'
].join('\n')

const CONTACT_NEW = [
  '<h2>Visit us</h2>',
  '<p>Market Street 12</p>',
  '<p>Open Tuesday to Sunday, 7:00 to 15:00</p>'
].join('\n')

const HOURS_NEW = [
  '// Opening hours, shown on the home page and the contact page.',
  '// Sundays from April on, agreed with Maya.',
  'export const openingHours = {',
  '  days: \'Tuesday to Sunday\',',
  '  from: \'7:00\',',
  '  to: \'15:00\'',
  '}'
].join('\n')

const withNewline = (text: string) => `${text}\n`

const setup = () => repo()
  .file('index.html', INDEX)
  .file('style.css', STYLE)
  .file('contact.html', CONTACT_NEW.replace('Sunday, 7:00 to 15:00', 'Saturday, 7:00 to 14:00'))
  .file('src/hours.js', HOURS_NEW.replace('// Sundays from April on, agreed with Maya.\n', '').replace('Sunday', 'Saturday').replace('15:00', '14:00'))
  .commit('Show the opening hours', { author: 'Maya' })
  // before lunch: the new hours in src/hours.js are staged already...
  .file('src/hours.js', HOURS_NEW)
  .stage('src/hours.js')
  // ...the same change on the contact page is not, and the dark theme is half done
  .file('contact.html', CONTACT_NEW)
  .file('index.html', INDEX.replace('  <h1>Corner Bakery</h1>', '  <!-- WIP dark theme: the toggle does nothing yet -->\n  <button id="theme-toggle" type="button">Dark mode</button>\n  <h1>Corner Bakery</h1>'))
  .file('style.css', `${STYLE}\n\n/* Dark theme, work in progress: colours not final */\n.dark body {\n  color: #f3e9dc;\n  background: #1f1a16;\n}`)
  .build()

export const whatChanged: GitScenario = {
  id: 'git-08-what-changed',
  track: 'git',
  kind: 'scenario',
  difficulty: 1,
  minutes: 4,
  title: 'What changed?',
  story: [
    'Back from lunch. Before the break you worked on two things for the bakery website: new opening hours, which Maya wants online this afternoon, and a dark theme that is far from ready. Some of it is staged, some is not, and you no longer remember which change sits in which file.',
    'Put every opening-hours change into one commit and leave the dark theme out. Look before you commit: check which files changed, and read the changes themselves, both the ones you have staged and the ones you have not.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'hours',
      label: 'The newest commit has the new opening hours in src/hours.js and contact.html',
      check: ({ state }) => {
        const tree = headCommit(state)?.tree
        return tree?.['src/hours.js'] === withNewline(HOURS_NEW) && tree['contact.html'] === withNewline(CONTACT_NEW)
      }
    },
    {
      id: 'no-theme',
      label: 'Nothing of the dark theme is in a commit',
      check: ({ state }) => commitsOf(state, 'HEAD').every(commit => commit.tree['index.html'] === withNewline(INDEX) && commit.tree['style.css'] === withNewline(STYLE))
    },
    {
      id: 'looked',
      label: 'You looked at both the unstaged and the staged changes',
      check: ({ history }) => ran(history, 'diff', args => !args.includes('--staged') && !args.includes('--cached'))
        && ran(history, 'diff', args => args.includes('--staged') || args.includes('--cached'))
    }
  ],
  hints: [
    'Start with `git status`: it shows which files are staged and which are not, but not what changed inside them. That is what `git diff` is for.',
    '`git diff` compares your files with the staging area, `git diff --staged` compares the staging area with the last commit. Every opening-hours change belongs in the commit; the dark theme stays out.',
    'Run `git diff` and `git diff --staged`: src/hours.js is staged, contact.html has the same new hours unstaged, index.html and style.css are the dark theme. Then `git add contact.html` and `git commit -m "Open on Sundays until 15:00"`.'
  ],
  debrief: {
    title: 'Look first, then commit',
    paragraphs: [
      '`git status` tells you which files changed and whether they are staged. `git diff` and `git diff --staged` show the lines themselves, which is the only way to know what is really in a file name like index.html.',
      'Your changes live in three places: the last commit, the staging area and your files. `git diff` compares your files with the staging area; `git diff --staged` compares the staging area with the last commit, which is exactly what `git commit` will save.',
      'A quick `git diff --staged` before every commit catches the debug line, the half-done experiment and the file you forgot, before your teammates see them.'
    ]
  },
  solution: [
    'git status',
    'git diff',
    'git diff --staged',
    'git add contact.html',
    'git commit -m "Open on Sundays until 15:00"'
  ]
}
