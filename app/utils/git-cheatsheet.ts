// Content of the git cheat sheet (/git/cheat-sheet). Pure data plus the link to the levels that use a command,
// derived from the level solutions so it never goes stale. Supported forms: docs/features/git-model.md.
import { gitLevels } from '../../shared/levels'
import type { Level } from '../../shared/levels'

export interface CheatCommand {
  /** The git subcommand, e.g. 'commit'. */
  name: string
  /** What it does, in one line. */
  summary: string
  /** Typical uses: the command line and what it does. */
  examples: { line: string, note: string }[]
  /** Not in the trainer yet. */
  comingSoon?: boolean
}

export interface CheatGroup {
  id: string
  title: string
  commands: CheatCommand[]
}

export const cheatGroups: CheatGroup[] = [
  {
    id: 'start',
    title: 'Start and save',
    commands: [
      { name: 'init', summary: 'Turn the current folder into a git repository.', examples: [{ line: 'git init', note: 'Start tracking this folder' }] },
      { name: 'status', summary: 'Show the branch, what is staged, what changed and what git does not track yet.', examples: [{ line: 'git status', note: 'Where am I, what changed?' }, { line: 'git status -s', note: 'The short version' }] },
      { name: 'add', summary: 'Stage changes: choose what goes into the next commit.', examples: [{ line: 'git add app.js', note: 'Stage one file' }, { line: 'git add .', note: 'Stage everything in this folder' }] },
      { name: 'commit', summary: 'Save the staged changes as a snapshot with a message.', examples: [{ line: 'git commit -m "Add login form"', note: 'Commit what is staged' }, { line: 'git commit -am "Fix typo"', note: 'Stage tracked files and commit in one go' }, { line: 'git commit --amend -m "Better message"', note: 'Replace the last commit (only before you push it)' }] }
    ]
  },
  {
    id: 'branches',
    title: 'Branches',
    commands: [
      { name: 'branch', summary: 'List, create and delete branches.', examples: [{ line: 'git branch', note: 'List local branches' }, { line: 'git branch -a', note: 'Include origin/* branches' }, { line: 'git branch -d feature/login', note: 'Delete a merged branch' }] },
      { name: 'switch', summary: 'Move to another branch (the modern way).', examples: [{ line: 'git switch main', note: 'Go to main' }, { line: 'git switch -c feature/login', note: 'Create a branch and switch to it' }] },
      { name: 'checkout', summary: 'The older all-rounder: switch branches, or restore a file.', examples: [{ line: 'git checkout -b feature/login', note: 'Create a branch and switch to it' }, { line: 'git checkout -- app.js', note: 'Throw away unstaged changes to a file' }] }
    ]
  },
  {
    id: 'combine',
    title: 'Combine work',
    commands: [
      { name: 'merge', summary: 'Bring another branch into the current one: fast-forward, or a merge commit.', examples: [{ line: 'git merge feature/login', note: 'Merge into the branch you are on' }, { line: 'git merge --abort', note: 'Give up a merge with conflicts' }] },
      { name: 'rebase', summary: 'Replay your commits on top of another branch, for a straight history.', examples: [{ line: 'git rebase main', note: 'Put your branch on top of main' }, { line: 'git rebase --continue', note: 'After fixing a conflict and git add' }, { line: 'git rebase --abort', note: 'Go back to how it was before' }] }
    ]
  },
  {
    id: 'remotes',
    title: 'Remotes and teammates',
    commands: [
      { name: 'fetch', summary: 'Download what others pushed, without touching your branches.', examples: [{ line: 'git fetch', note: 'Update origin/*' }] },
      { name: 'pull', summary: 'Fetch and bring the changes into your branch.', examples: [{ line: 'git pull', note: 'Fetch and merge' }, { line: 'git pull --rebase', note: 'Fetch and rebase your work on top' }] },
      { name: 'push', summary: 'Upload your commits to origin.', examples: [{ line: 'git push -u origin feature/login', note: 'First push of a new branch, remember the upstream' }, { line: 'git push --force-with-lease', note: 'Update a rewritten branch, but only if nobody pushed in between' }] }
    ]
  },
  {
    id: 'inspect',
    title: 'Look around',
    commands: [
      { name: 'log', summary: 'Show the history.', examples: [{ line: 'git log --oneline', note: 'One line per commit' }, { line: 'git log --oneline --graph --all', note: 'All branches as a graph' }] },
      { name: 'diff', summary: 'Show what changed, line by line.', examples: [{ line: 'git diff', note: 'Changes not staged yet' }, { line: 'git diff --staged', note: 'What the next commit will contain' }] }
    ]
  },
  {
    id: 'undo',
    title: 'Undo',
    commands: [
      { name: 'reset', comingSoon: true, summary: 'Move the branch back, keeping or dropping the changes.', examples: [{ line: 'git reset --soft HEAD~1', note: 'Undo the last commit, keep its changes staged' }] },
      { name: 'revert', comingSoon: true, summary: 'Add a new commit that undoes an old one; safe on shared branches.', examples: [{ line: 'git revert a1b2c3d', note: 'Undo a pushed commit' }] },
      { name: 'stash', comingSoon: true, summary: 'Put unfinished changes aside and get them back later.', examples: [{ line: 'git stash', note: 'Park your changes' }, { line: 'git stash pop', note: 'Bring them back' }] },
      { name: 'cherry-pick', comingSoon: true, summary: 'Copy one commit from another branch onto yours.', examples: [{ line: 'git cherry-pick a1b2c3d', note: 'Take just that fix' }] }
    ]
  }
]

/** The git subcommands a command line runs, e.g. 'git add . && git commit -m "x"' gives ['add', 'commit']. */
export function gitSubcommands(line: string): string[] {
  return [...line.matchAll(/(?:^|&&|;)\s*git\s+([a-z-]+)/g)].map(match => match[1]!)
}

/** The levels whose solution uses this git subcommand, in level order. */
export function levelsUsing(name: string, levels: readonly Level[] = gitLevels): Level[] {
  return levels.filter(level => level.solution.some(line => gitSubcommands(line).includes(name)))
}
