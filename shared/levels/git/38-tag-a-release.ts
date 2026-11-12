// Workflows 8.4: version 1.4.0 went live from main's commit "Add online orders"; Jonas has pushed one more commit since,
// so the tag goes on HEAD~1 (or the id), not on HEAD. Annotated, with the message from the story, then pushed by name
// (a plain `git push` sends no tags). A lightweight tag, or a tag on the newest commit, does not count. Maya's v1.3.0
// from the last release is in the setup, so `git tag` and `git log` show how it looks.
import { remoteTagOf, resolve, tagOf } from '../../git'
import type { GitState } from '../../git'
import type { Scenario } from '../types'
import { bakerySite, text } from './bakery'

const TAG = 'v1.4.0'
const MESSAGE = 'Version 1.4.0: online orders'
const RELEASED = 'Add online orders'

const setup = () => bakerySite()
  .file('hours.html', text('<!-- Opening hours. Maya changes them in winter; ask her first. -->', '<h2>Opening hours</h2>', '<p>Monday to Saturday, 7:00-18:00</p>'))
  .commit('Add the opening hours page', { author: 'Jonas' })
  .tag('v1.3.0', { message: 'Version 1.3.0: opening hours', author: 'Maya' })
  .file('order.html', text('<!-- Online orders, picked up at the shop. Payment at the till for now. -->', '<h2>Order bread</h2>', '<form id="order"></form>'))
  .commit(RELEASED)
  .file('christmas.html', text('<!-- Christmas menu, for 1.5. Prices still to come from Maya. -->', '<h2>Christmas menu</h2>'))
  .commit('Start the Christmas menu page', { author: 'Jonas' })
  .origin()
  .build()

/** The commit that went live. */
const LIVE = resolve(setup(), 'HEAD~1')!

function tagged(state: GitState): boolean {
  const tag = tagOf(state, TAG)
  return tag?.commit === LIVE && tag.annotation?.message === MESSAGE
}

export const tagARelease: Scenario = {
  id: 'git-38-tag-a-release',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 5,
  title: 'Tag a release',
  story: [
    `This morning version 1.4.0 of the website went live: main's commit "${RELEASED}". Jonas has pushed a commit since, which isn't part of it. The team, and Ben's deploy script, find every release by its tag, like \`v1.3.0\` before it.`,
    `Tag the release: an annotated tag \`${TAG}\` on the commit "${RELEASED}", with the message "${MESSAGE}". Then put the tag on origin, so everyone has it.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'tagged', label: `${TAG} is an annotated tag on "${RELEASED}", with its message`, check: ({ state }) => tagged(state) },
    {
      id: 'pushed',
      label: `origin has your tag ${TAG}`,
      check: ({ state }) => tagged(state) && remoteTagOf(state, TAG)?.annotation?.id === tagOf(state, TAG)!.annotation!.id
    }
  ],
  hints: [
    `\`git log --oneline\` shows the commit "${RELEASED}", one below the newest, and v1.3.0 on an older one. A tag can go on any commit: name it after the tag.`,
    '`git tag -a <name> -m <message> <commit>` makes an annotated tag: it stores the message, who tagged and when. Tags don\'t travel with a plain `git push`; push the tag by its name.',
    `\`git tag -a ${TAG} -m "${MESSAGE}" HEAD~1\`, then \`git push origin ${TAG}\`.`
  ],
  debrief: {
    title: 'A name that never moves',
    paragraphs: [
      `A tag is a fixed name for one commit. A branch moves on with every commit, a tag never does, so \`${TAG}\` will always mean exactly what went live this morning.`,
      '`-a` made an annotated tag: an object of its own with the message, the tagger and the date, which is what releases should get (`git tag -n` shows the messages). A plain `git tag v1.4.0` is a lightweight tag, just the name: fine as a private bookmark.',
      `\`git push\` sends branches, not tags: push one with \`git push origin ${TAG}\`, or all of yours with \`git push --tags\`. The numbers follow semantic versioning, MAJOR.MINOR.PATCH: 1.4.1 for a fix, 1.5.0 for new features, 2.0.0 when something breaks for the people who use it.`
    ]
  },
  solution: [
    'git log --oneline',
    `git tag -a ${TAG} -m "${MESSAGE}" HEAD~1`,
    `git push origin ${TAG}`
  ]
}
