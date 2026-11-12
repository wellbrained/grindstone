// Branching 2.4: three old branches on the bakery website. `git branch -d` deletes the merged one, refuses the
// unmerged experiment (which `-D` then deletes), and `git branch -m` fixes a typo in a branch name. Merging the
// experiment to make `-d` work is the shortcut the main goal rules out.
import { branchExists, resolve } from '../../git'
import type { Scenario } from '../types'
import { STYLE, bakerySite, text } from './bakery'

const DONE = 'feature/opening-hours'
const EXPERIMENT = 'experiment/parallax'
const TYPO = 'feature/galery'
const FIXED = 'feature/gallery'

const HOURS = text(
  '<!-- Opening hours, as on the sign at the door. Changes go through Maya. -->',
  '<h2>Opening hours</h2>',
  '<p>Monday to Saturday, 7:00 to 18:00</p>',
  '<p>Sunday, 8:00 to 12:00</p>'
)
const PARALLAX = STYLE + text(
  '',
  '/* Experiment: the header photo scrolls slower than the page. Maya: "makes me seasick". */',
  'header {',
  '  background: url(img/bakery.jpg) fixed center / cover;',
  '  height: 60vh;',
  '}'
)
const GALLERY = text(
  '<!-- Photo gallery: this week\'s bakes. Maya sends the photos on Fridays. -->',
  '<h2>Fresh this week</h2>',
  '<div class="gallery"></div>'
)

const setup = () => bakerySite()
  .switch(DONE, { create: true })
  .file('hours.html', HOURS)
  .commit('Add the opening hours page')
  .switch('main')
  .run(`git merge --no-ff ${DONE} -m "Merge ${DONE}"`)
  .switch(EXPERIMENT, { create: true })
  .file('style.css', PARALLAX)
  .commit('Try a parallax header')
  .switch('main')
  .switch(TYPO, { create: true })
  .file('gallery.html', GALLERY)
  .commit('Start the photo gallery')
  .switch('main')
  .build()

const MAIN = resolve(setup(), 'main')!
const GALLERY_TIP = resolve(setup(), TYPO)!

export const cleanUpBranches: Scenario = {
  id: 'git-18-clean-up-branches',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 6,
  title: 'Clean up old branches',
  story: [
    `The bakery website has collected branches. \`${DONE}\` is merged into main and done. \`${EXPERIMENT}\` was a header effect Maya didn't like: never merged, and nobody needs it. And \`${TYPO}\` is the photo gallery you're still working on, with a typo in its name.`,
    `Delete the two old branches and rename \`${TYPO}\` to \`${FIXED}\`. Stay on main and don't merge anything: git will refuse one of the deletes at first, and that's worth reading.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'merged-gone', label: `${DONE} is deleted`, check: ({ state }) => !branchExists(state, DONE) },
    {
      id: 'experiment-gone',
      label: `${EXPERIMENT} is deleted, and none of it landed on main`,
      check: ({ state }) => !branchExists(state, EXPERIMENT) && resolve(state, 'main') === MAIN
    },
    {
      id: 'renamed',
      label: `${TYPO} is now ${FIXED}, with the same commit`,
      check: ({ state }) => !branchExists(state, TYPO) && resolve(state, FIXED) === GALLERY_TIP
    }
  ],
  hints: [
    '`git branch` lists your branches. Deleting and renaming are flags of the same command.',
    '`git branch -d <name>` deletes a branch, but only when its commits are merged. `-D` deletes it anyway. `git branch -m <old> <new>` renames a branch and keeps its commits.',
    `\`git branch -d ${DONE}\`, \`git branch -D ${EXPERIMENT}\`, \`git branch -m ${TYPO} ${FIXED}\`.`
  ],
  debrief: {
    title: 'Deleting a branch deletes a name',
    paragraphs: [
      `A branch is just a name for a commit. Deleting it removes the name; the commits stay as long as another branch still reaches them. That's what \`-d\` checks: \`${DONE}\` is merged into main, so deleting it lost nothing.`,
      `\`${EXPERIMENT}\` was never merged, so \`-d\` refused: its commit would be gone from every branch. \`-D\` deletes it anyway. Use it when you're sure, like here, and read the message when git stops you.`,
      `\`git branch -m <old> <new>\` renames a branch and keeps its commits; with only a new name it renames the branch you're on. A branch you already pushed keeps its old name on origin: renaming only changes your local name.`
    ]
  },
  solution: [
    'git branch',
    `git branch -d ${DONE}`,
    `git branch -d ${EXPERIMENT}`,
    `git branch -D ${EXPERIMENT}`,
    `git branch -m ${TYPO} ${FIXED}`
  ]
}
