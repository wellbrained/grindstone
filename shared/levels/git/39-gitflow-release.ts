// Workflows 8.5: GitFlow. develop has two features since v1.4.0, and main is an ancestor of develop, so a plain merge of
// the release branch into main would fast-forward: the "merge commit" goal needs `--no-ff`. The version commit is found
// by its content (version.txt says 1.5.0, on top of develop) and checked in HEAD's reflog to be made on release/1.5, so
// deleting the release branch at the end (git flow's "finish") is fine. Nothing to push: Ben pushes after a last look.
import { commitAt, isAncestor, resolve, tagOf } from '../../git'
import type { Commit, GitState } from '../../git'
import type { Scenario } from '../types'
import { bakerySite, text } from './bakery'
import { committedOn, once } from './checks'

const RELEASE = 'release/1.5'
const TAG = 'v1.5.0'

const setup = () => bakerySite()
  .file('version.txt', '1.4.0')
  .commit('Set the version to 1.4.0', { author: 'Maya' })
  .tag('v1.4.0', { message: 'Version 1.4.0', author: 'Maya' })
  .switch('develop', { create: true })
  .file('gift-cards.html', text('<!-- Gift cards, sold at the till. (Jonas) -->', '<h2>Gift cards</h2>', '<p>From 10 euros.</p>'))
  .commit('Add the gift card page', { author: 'Jonas' })
  .file('loyalty.html', text('<!-- Loyalty card: a free loaf for every ten. (Maya) -->', '<h2>Loyalty card</h2>', '<p>Buy ten loaves, the eleventh is on us.</p>'))
  .commit('Add the loyalty card page', { author: 'Maya' })
  // origin's default branch is main, as on any GitFlow repository
  .switch('main')
  .origin()
  .switch('develop')
  .build()

const start = once(setup)
const MAIN = () => resolve(start(), 'main')!
const DEVELOP = () => resolve(start(), 'develop')!

/** The release's version commit: version.txt says 1.5.0, it builds on develop, and it was made on release/1.5. */
function versionCommit(state: GitState): Commit | undefined {
  return Object.values(state.repo?.commits ?? {}).find(commit => commit.tree['version.txt'] === '1.5.0\n'
    && isAncestor(state, DEVELOP(), commit.id) && committedOn(state, commit.id, RELEASE))
}

/** main's newest commit is a merge commit of the old main and the release. */
function mergedIntoMain(state: GitState): boolean {
  const version = versionCommit(state)
  const tip = commitAt(state, 'main')
  return !!version && !!tip && tip.parents.length === 2 && tip.parents[0] === MAIN() && isAncestor(state, version.id, tip.parents[1]!)
}

export const gitflowRelease: Scenario = {
  id: 'git-39-gitflow-release',
  track: 'git',
  kind: 'scenario',
  difficulty: 3,
  minutes: 8,
  title: 'A release branch, GitFlow style',
  story: [
    'Your team works GitFlow style: finished features are merged into `develop`, and `main` only gets releases, each with a tag (`v1.4.0` is the last one). Version 1.5.0 is ready on develop, with Jonas\'s gift cards and Maya\'s loyalty card. You\'re doing the release.',
    `Start a branch \`${RELEASE}\` from develop and set version.txt to \`1.5.0\` there, in a commit of its own. Merge the release branch into main with a merge commit, even though git could fast-forward, and put an annotated tag \`${TAG}\` on that merge commit. Then merge the release branch back into develop, so the version change isn't lost there. Ben pushes everything after a last look, so you don't need to push.`
  ].join('\n\n'),
  setup,
  goals: [
    { id: 'release', label: `${RELEASE} starts from develop and sets version.txt to 1.5.0`, check: ({ state }) => !!versionCommit(state) },
    { id: 'main', label: 'main has the release as a merge commit, not a fast-forward', check: ({ state }) => mergedIntoMain(state) },
    {
      id: 'tag',
      label: `${TAG} is an annotated tag on main's merge commit`,
      check: ({ state }) => {
        const tag = tagOf(state, TAG)
        const main = commitAt(state, 'main')
        return !!tag?.annotation && !!main && tag.commit === main.id && main.parents.length === 2 && main.parents[0] === MAIN()
      }
    },
    {
      id: 'develop',
      label: 'develop has the version change too',
      check: ({ state }) => {
        const version = versionCommit(state)
        return !!version && isAncestor(state, version.id, 'develop')
      }
    }
  ],
  hints: [
    `\`git switch -c ${RELEASE} develop\` starts the release branch from develop, wherever you are. \`echo "1.5.0" > version.txt\` and a commit are the release's last change.`,
    `On main, \`git merge --no-ff ${RELEASE}\` makes a merge commit even where a fast-forward would do, so each release is one merge commit on main. Tag main right after it with \`git tag -a\`. Then \`git switch develop\` and merge the release branch there too.`,
    `\`git switch -c ${RELEASE} develop\`, \`echo "1.5.0" > version.txt\`, \`git commit -am "Set the version to 1.5.0"\`, \`git switch main\`, \`git merge --no-ff ${RELEASE}\`, \`git tag -a ${TAG} -m "Version 1.5.0"\`, \`git switch develop\`, \`git merge ${RELEASE}\`.`
  ],
  debrief: {
    title: 'develop collects, main releases',
    paragraphs: [
      'GitFlow keeps two long-lived branches: develop collects finished features, main holds only what was released. A release branch sits between them while a release gets ready: no new features go in, only last fixes and the version number.',
      `\`--no-ff\` gave main one merge commit for the whole release, even though a fast-forward was possible, and \`${TAG}\` marks exactly that commit. Merging the release branch back into develop keeps the version change, and any fix made on the release branch, for everything that comes next.`,
      'GitFlow fits software that ships in versions now and then. Many web teams ship main several times a day instead (trunk-based development): short-lived branches straight into main, no develop, tags only where they help. Both work; pick the one that matches how your team ships.'
    ]
  },
  solution: [
    `git switch -c ${RELEASE} develop`,
    'echo "1.5.0" > version.txt',
    'git commit -am "Set the version to 1.5.0"',
    'git switch main',
    `git merge --no-ff ${RELEASE}`,
    `git tag -a ${TAG} -m "Version 1.5.0"`,
    'git switch develop',
    `git merge ${RELEASE}`
  ]
}
