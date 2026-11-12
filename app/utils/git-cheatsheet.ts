// Structure of the git cheat sheet (/git/cheat-sheet): groups, command names and example lines (data, not translated),
// plus the link to the levels that use a command, derived from the level solutions so it never goes stale. Every
// visible text lives in the i18n locales under `cheat.*`; the key helpers below say where. Supported forms: docs/features/git-model.md.
import { gitLevels, gitSubcommands } from '../../shared/levels'
import type { Level } from '../../shared/levels'

export interface CheatCommand {
  /** The git subcommand, e.g. 'commit'. */
  name: string
  /** Typical uses: the command lines (data, not translated). Their notes are i18n keys, see `noteKey`. */
  examples: { line: string }[]
  /** Not in the trainer yet. */
  comingSoon?: boolean
}

export interface CheatGroup {
  id: string
  commands: CheatCommand[]
}

export const cheatGroups: CheatGroup[] = [
  {
    id: 'start',
    commands: [
      { name: 'init', examples: [{ line: 'git init' }] },
      { name: 'status', examples: [{ line: 'git status' }, { line: 'git status -s' }] },
      { name: 'add', examples: [{ line: 'git add app.js' }, { line: 'git add .' }] },
      { name: 'rm', examples: [{ line: 'git rm old-page.html' }, { line: 'git rm --cached .env' }, { line: 'git rm -r --cached dist' }] },
      { name: 'commit', examples: [{ line: 'git commit -m "Add login form"' }, { line: 'git commit -am "Fix typo"' }, { line: 'git commit --amend -m "Better message"' }] }
    ]
  },
  {
    id: 'branches',
    commands: [
      { name: 'branch', examples: [{ line: 'git branch' }, { line: 'git branch -a' }, { line: 'git branch -d feature/login' }, { line: 'git branch -m feature/gallery' }] },
      { name: 'switch', examples: [{ line: 'git switch main' }, { line: 'git switch -c feature/login' }, { line: 'git switch -' }, { line: 'git switch --detach a1b2c3d' }] },
      { name: 'checkout', examples: [{ line: 'git checkout -b feature/login' }, { line: 'git checkout -- app.js' }, { line: 'git checkout --theirs prices.json' }] },
      { name: 'tag', examples: [{ line: 'git tag' }, { line: 'git tag -a v1.4.0 -m "Version 1.4.0"' }, { line: 'git tag v1.4.0 a1b2c3d' }, { line: 'git push origin v1.4.0' }, { line: 'git tag -d v1.4.0' }] }
    ]
  },
  {
    id: 'combine',
    commands: [
      { name: 'merge', examples: [{ line: 'git merge feature/login' }, { line: 'git merge --no-ff feature/login' }, { line: 'git merge --ff-only feature/login' }, { line: 'git merge --abort' }] },
      { name: 'rebase', examples: [{ line: 'git rebase main' }, { line: 'git rebase --continue' }, { line: 'git rebase --abort' }, { line: 'git rebase -i HEAD~3' }, { line: 'git rebase -i main' }] },
      { name: 'cherry-pick', examples: [{ line: 'git cherry-pick a1b2c3d' }, { line: 'git cherry-pick -x a1b2c3d' }, { line: 'git cherry-pick --continue' }, { line: 'git cherry-pick --abort' }] }
    ]
  },
  {
    id: 'remotes',
    commands: [
      { name: 'remote', examples: [{ line: 'git remote -v' }] },
      { name: 'fetch', examples: [{ line: 'git fetch' }, { line: 'git fetch --prune' }] },
      { name: 'pull', examples: [{ line: 'git pull' }, { line: 'git pull --rebase' }] },
      { name: 'push', examples: [{ line: 'git push -u origin feature/login' }, { line: 'git push --force-with-lease' }] }
    ]
  },
  {
    id: 'inspect',
    commands: [
      { name: 'log', examples: [{ line: 'git log --oneline' }, { line: 'git log --oneline --graph --all' }, { line: 'git log origin/main..main' }, { line: 'git log main..origin/main' }] },
      { name: 'diff', examples: [{ line: 'git diff' }, { line: 'git diff --staged' }] }
    ]
  },
  {
    id: 'undo',
    commands: [
      { name: 'restore', examples: [{ line: 'git restore app.js' }, { line: 'git restore --staged app.js' }] },
      { name: 'reset', examples: [{ line: 'git reset --soft HEAD~1' }, { line: 'git reset HEAD~1' }, { line: 'git reset --hard HEAD~1' }] },
      { name: 'reflog', examples: [{ line: 'git reflog' }, { line: 'git reset --hard HEAD@{1}' }, { line: 'git branch rescue a1b2c3d' }, { line: 'git reset --hard ORIG_HEAD' }] },
      { name: 'revert', examples: [{ line: 'git revert a1b2c3d' }, { line: 'git revert HEAD~1' }] },
      { name: 'stash', examples: [{ line: 'git stash' }, { line: 'git stash -u' }, { line: 'git stash list' }, { line: 'git stash pop' }] }
    ]
  }
]

/** i18n key of a group's title. */
export const groupKey = (groupId: string) => `cheat.groups.${groupId}`
/** i18n key of a command's one-line summary. */
export const summaryKey = (command: string) => `cheat.commands.${command}.summary`
/** i18n key of the note above an example line (counted from 0 in the order of `examples`). */
export const noteKey = (command: string, index: number) => `cheat.commands.${command}.examples.${index}`

/** The scenarios whose solution uses this git subcommand, in level order (practice tasks have no number to link by). */
export function levelsUsing(name: string, levels: readonly Level[] = gitLevels): Level[] {
  return levels.filter(level => level.kind === 'scenario' && level.solution.some(step => typeof step === 'string' && gitSubcommands(step).includes(name)))
}
