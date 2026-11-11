// Level 4: a merge where both sides changed the same line; resolve it and conclude with a merge commit.
import { currentBranch, isAncestor, repo, resolve } from '../../git'
import type { GitState } from '../../git'
import type { Level } from '../types'
import { conflictFullyResolved } from './checks'

const mergeCommitOnMain = (state: GitState) => {
  const id = resolve(state, 'main')
  const feature = resolve(state, 'feature/footer')
  const parents = id ? state.repo!.commits[id]!.parents : []
  return parents.length === 2 && !!feature && parents.includes(feature)
}

export const mergeConflict: Level = {
  id: 'git-04-merge-conflict',
  track: 'git',
  title: 'Merge conflict',
  story: [
    'The bakery website shows a footer line. While you added the contact email on feature/footer, Ben added the opening hours to the same line, straight on main.',
    'Merge feature/footer into main. Git cannot pick between two edits of one line, so it will stop and ask you. Keep both pieces of information, then finish the merge.'
  ].join('\n\n'),
  setup: () => repo()
    .file('README.md', '# Juniper Bakery website')
    .file('src/footer.ts', 'export const footer = \'Juniper Bakery\'')
    .commit('Add the footer')
    .switch('feature/footer', { create: true })
    .file('src/footer.ts', 'export const footer = \'Juniper Bakery - hello@juniper.example\'')
    .commit('Add the contact email to the footer')
    .switch('main')
    .file('src/footer.ts', 'export const footer = \'Juniper Bakery - open daily 7 to 18\'')
    .commit('Add opening hours to the footer', { author: 'Ben' })
    .build(),
  goals: [
    { id: 'merged', label: 'feature/footer is merged into main', check: ({ state }) => currentBranch(state) === 'main' && isAncestor(state, 'feature/footer', 'main') },
    {
      id: 'resolved',
      label: 'Conflict resolved: no conflict markers left',
      check: ({ state }) => mergeCommitOnMain(state) && conflictFullyResolved(state, 'main')
    },
    { id: 'merge-commit', label: 'main ends in a merge commit with two parents', check: ({ state }) => mergeCommitOnMain(state) }
  ],
  hints: [
    'Start the merge from main and read what git prints. `git status` tells you which file needs you.',
    'Git wrote both versions into the file between <<<<<<<, ======= and >>>>>>> markers. Replace that whole block with the line you want, mark the file resolved with `git add`, then commit to conclude the merge.',
    'Run `git merge feature/footer`, then `echo "export const footer = \'Juniper Bakery - open daily 7 to 18 - hello@juniper.example\'" > src/footer.ts` (or `edit src/footer.ts`), then `git add src/footer.ts` and `git commit --no-edit`.'
  ],
  debrief: {
    title: 'You decided, git recorded it',
    paragraphs: [
      'Git merges line by line against the common ancestor. Ben changed the footer line one way and you changed it another, so there was no right answer for git to pick: it stopped and wrote both versions into the file with conflict markers.',
      'Resolving means editing the file into the version you want and removing every marker. `git add` then tells git the file is settled, and the commit concludes the merge.',
      'That commit has two parents, Ben\'s commit on main and yours on feature/footer, so the history shows exactly where the two lines of work met. Committing a file that still contains markers is the classic mistake: the markers ship.'
    ]
  },
  solution: [
    'git merge feature/footer',
    'echo "export const footer = \'Juniper Bakery - open daily 7 to 18 - hello@juniper.example\'" > src/footer.ts',
    'git add src/footer.ts',
    'git commit --no-edit'
  ]
}
