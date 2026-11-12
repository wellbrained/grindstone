import { describe, expect, it } from 'vitest'
import { commitsOf } from '../../../shared/git'
import { gitLevels, levelById, levels, nextLevel, startLevel, submit } from '../../../shared/levels'
import type { Level, Session, SubmitResult } from '../../../shared/levels'
import { deepFreeze } from '../git/helpers'

/** Plays lines through the engine; returns the last result and every step. */
function play(level: Level, lines: string[], from: Session = startLevel(level)) {
  let session = from
  const steps: SubmitResult[] = []
  for (const line of lines) {
    const result = submit(deepFreeze(session), level, line)
    steps.push(result)
    session = result.session
  }
  const text = steps.flatMap(step => step.output).map(line => 'text' in line ? line.text : '').join('\n')
  return { session, steps, text }
}

const level = (id: string) => {
  const found = levelById(id)
  if (!found) throw new Error(`no level ${id}`)
  return found
}

/** Goals at the very start: false unless trivially true before you do anything (listed explicitly). In play order. */
const initialGoals: Record<string, Record<string, boolean>> = {
  'git-01-first-commit': { initialised: false, committed: false, clean: false },
  'git-practice-stage-one-file': { staged: false },
  'git-practice-commit-all': { 'committed': false, 'one-go': false },
  'git-07-stage-together': { 'typo-commit': false, 'prices-commit': false, 'clean': false },
  'git-practice-diff-staged': { shown: false },
  'git-08-what-changed': { 'hours': false, 'no-theme': true, 'looked': false },
  'git-practice-diff-file': { shown: false },
  'git-09-read-history': { read: false, branch: false },
  'git-practice-log-oneline': { shown: false },
  'git-10-ignore-build-files': { 'gitignore': false, 'kept': true, 'not-committed': true, 'clean': false },
  'git-practice-ignore-logs': { ignored: false, kept: true, clean: false },
  'git-02-branch': { 'on-branch': false, 'committed': false, 'main-unchanged': true },
  'git-practice-list-branches': { shown: false },
  'git-16-started-on-wrong-branch': { 'on-branch': false, 'committed': false, 'main-unchanged': false, 'clean': false },
  'git-practice-switch-back': { back: false, dash: false },
  'git-17-pick-up-teammate-branch': { tracking: false, jonas: false, thanks: false, pushed: false },
  'git-practice-remote-branches': { shown: false },
  'git-18-clean-up-branches': { 'merged-gone': false, 'experiment-gone': false, 'renamed': false },
  'git-practice-rename-branch': { renamed: false },
  'git-practice-delete-merged-branch': { deleted: false },
  'git-19-look-at-old-version': { 'looked': false, 'branch': false, 'main-unchanged': false },
  'git-practice-branch-from-commit': { branch: false },
  'git-03-merge': { 'on-main': false, 'merged': false },
  'git-04-merge-conflict': { 'merged': false, 'resolved': false, 'merge-commit': false },
  'git-05-rebase': { 'contains-main': false, 'linear': true, 'on-branch': true },
  'git-06-teammate-sync': { 'pushed': false, 'up-to-date': true, 'linear': true, 'resolved': true, 'lease': false },
  'git-11-fix-last-commit': { 'message': false, 'files': false, 'one-commit': true, 'clean': false },
  'git-practice-amend-no-edit': { amended: false, clean: false },
  'git-12-throw-away-change': { menu: false, prices: false, hours: true },
  'git-practice-unstage-file': { unstaged: false, app: true },
  'git-practice-discard-file': { discarded: false, kept: true },
  'git-13-undo-local-commit': { 'blink-gone': false, 'back': false, 'kept': true },
  'git-practice-reset-soft': { undone: false, staged: false },
  'git-practice-reset-hard': { dropped: false, files: false },
  'git-14-undo-pushed-commit': { reverted: false, history: true, pushed: false },
  'git-practice-revert-before-last': { reverted: false },
  'git-15-park-unfinished-work': { 'fixed': false, 'back': false, 'stash-empty': false },
  'git-practice-stash-untracked': { stashed: false }
}

describe('level list', () => {
  it('has the git levels in play order: each scenario, then its practice tasks', () => {
    expect(gitLevels.map(item => item.id)).toEqual(Object.keys(initialGoals))
    expect(levels).toEqual(gitLevels)
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-practice-stage-one-file')
    expect(nextLevel('git-practice-commit-all')?.id).toBe('git-07-stage-together')
    expect(nextLevel('git-practice-ignore-logs')?.id).toBe('git-02-branch')
    expect(nextLevel('git-06-teammate-sync')?.id).toBe('git-11-fix-last-commit')
    expect(nextLevel('git-practice-stash-untracked')).toBeNull()
    expect(levelById('nope')).toBeNull()
  })
})

describe.each(gitLevels.map(item => [item.id, item] as const))('%s', (_id, item) => {
  it('is well-formed', () => {
    expect(item.track).toBe('git')
    expect(item.title).not.toBe('')
    expect([1, 2, 3]).toContain(item.difficulty)
    expect(item.minutes).toBeGreaterThan(0)
    for (const hint of item.hints) expect(hint.trim()).not.toBe('')
    const goalIds = item.goals.map(goal => goal.id)
    expect(new Set(goalIds).size).toBe(goalIds.length)
    const eventIds = (item.teammates ?? []).map(event => event.id)
    expect(new Set(eventIds).size).toBe(eventIds.length)
    if (item.kind === 'scenario') {
      expect(item.id).toMatch(/^git-\d\d-[a-z-]+$/)
      const paragraphs = item.story.split('\n\n')
      expect(paragraphs.length).toBeGreaterThanOrEqual(1)
      expect(paragraphs.length).toBeLessThanOrEqual(3)
      expect(item.hints).toHaveLength(3)
      expect(item.hints[2]).toMatch(/`git /)
      expect(item.debrief.paragraphs.length).toBeGreaterThanOrEqual(2)
      expect(item.debrief.paragraphs.length).toBeLessThanOrEqual(4)
    } else {
      // one short task: 1-3 commands, one hint, about half a minute, a one-line why
      expect(item.id).toMatch(/^git-practice-[a-z-]+$/)
      expect(item.task).not.toBe('')
      expect(item.task).not.toContain('\n')
      expect(item.hints).toHaveLength(1)
      expect(item.why).not.toBe('')
      expect(item.why).not.toContain('\n')
      expect(item.solution.length).toBeLessThanOrEqual(3)
      expect(item.goals.length).toBeLessThanOrEqual(3)
      expect(item.minutes).toBeLessThanOrEqual(1)
      expect(levelById(item.practises)?.kind).toBe('scenario')
    }
  })

  it('builds the same setup every time', () => {
    expect(item.setup()).toEqual(item.setup())
  })

  it('is not solved at the start, with only the listed goals trivially true', () => {
    const session = startLevel(item)
    expect(session.solved).toBe(false)
    expect(session.goalsMet).toEqual(initialGoals[item.id])
  })

  it('is solved by replaying its solution, on the last line', () => {
    const { session, steps } = play(item, item.solution)
    expect(session.solved).toBe(true)
    expect(Object.values(session.goalsMet).every(Boolean)).toBe(true)
    expect(steps.map(step => step.solvedNow)).toEqual(item.solution.map((_, i) => i === item.solution.length - 1))
  })
})

/** Wrong paths that must not solve an entry: at least one per scenario, and the obvious one per practice task. */
const wrongPaths: [id: string, why: string, lines: string[], failing: string[]][] = [
  ['git-01-first-commit', 'commits only one of the two files', ['git init', 'git add README.md', 'git commit -m "First commit"'], ['committed', 'clean']],
  ['git-practice-stage-one-file', 'stages both files', ['git add .'], ['staged']],
  ['git-practice-commit-all', 'stages with git add first', ['git add .', 'git commit -m "Update"'], ['one-go']],
  ['git-07-stage-together', 'commits both changes at once', ['git add .', 'git commit -m "Fix typo and add prices"'], ['typo-commit']],
  ['git-07-stage-together', 'commits the price list first', ['git add prices.md', 'git commit -m "Add price list"', 'git add README.md', 'git commit -m "Fix typo in README"'], ['typo-commit', 'prices-commit']],
  ['git-practice-diff-staged', 'shows only the unstaged side', ['git diff'], ['shown']],
  ['git-08-what-changed', 'commits everything, dark theme included', ['git diff', 'git diff --staged', 'git add .', 'git commit -m "Update the site"'], ['no-theme']],
  ['git-08-what-changed', 'commits only what was staged', ['git diff', 'git diff --staged', 'git commit -m "New hours"'], ['hours']],
  ['git-08-what-changed', 'commits the right files without looking', ['git add contact.html', 'git commit -m "New hours"'], ['looked']],
  ['git-practice-diff-file', 'shows every file', ['git diff'], ['shown']],
  ['git-09-read-history', 'puts the branch on the change itself', ['git log --oneline', 'git branch before-shipping-change HEAD~2'], ['branch']],
  ['git-09-read-history', 'puts the branch on the newest commit', ['git log', 'git branch before-shipping-change'], ['branch']],
  ['git-practice-log-oneline', 'shows the whole history', ['git log --oneline'], ['shown']],
  ['git-10-ignore-build-files', 'commits the build output and .env', ['git add .', 'git commit -m "Build"'], ['gitignore', 'not-committed']],
  ['git-10-ignore-build-files', 'deletes the files instead of ignoring them', ['rm -r dist .env'], ['gitignore', 'kept']],
  ['git-10-ignore-build-files', 'writes the .gitignore but does not commit it', ['echo "dist/" > .gitignore', 'echo ".env" >> .gitignore'], ['gitignore', 'clean']],
  ['git-practice-ignore-logs', 'replaces the .gitignore with >', ['echo "*.log" > .gitignore', 'git commit -am "Ignore log files"'], ['kept']],
  ['git-practice-list-branches', 'looks at git status instead', ['git status'], ['shown']],
  ['git-practice-list-branches', 'lists only the branches on origin', ['git branch -r'], ['shown']],
  ['git-16-started-on-wrong-branch', 'commits on main first, then creates the branch', [
    'git add contact.html',
    'git commit -m "Add contact form"',
    'git switch -c feature/contact-form'
  ], ['main-unchanged']],
  ['git-16-started-on-wrong-branch', 'creates the branch but stays on main', [
    'git branch feature/contact-form',
    'git add contact.html',
    'git commit -m "Add contact form"'
  ], ['on-branch', 'committed', 'main-unchanged']],
  ['git-practice-switch-back', 'types the branch name', ['git switch feature/contact-form'], ['dash']],
  ['git-17-pick-up-teammate-branch', 'starts a new branch from main instead of the one from origin', [
    'git switch -c feature/newsletter',
    'echo "<h2>Thanks for signing up!</h2>" > thanks.html',
    'git add thanks.html',
    'git commit -m "Add the thank-you page"',
    'git push -u origin feature/newsletter'
  ], ['tracking', 'jonas', 'thanks', 'pushed']],
  ['git-17-pick-up-teammate-branch', 'commits but does not push', [
    'git fetch',
    'git switch feature/newsletter',
    'echo "<h2>Thanks for signing up!</h2>" > thanks.html',
    'git add thanks.html',
    'git commit -m "Add the thank-you page"'
  ], ['pushed']],
  ['git-17-pick-up-teammate-branch', 'commits on a detached origin/feature/newsletter', [
    'git fetch',
    'git checkout origin/feature/newsletter',
    'echo "<h2>Thanks for signing up!</h2>" > thanks.html',
    'git add thanks.html',
    'git commit -m "Add the thank-you page"'
  ], ['tracking', 'jonas', 'thanks', 'pushed']],
  ['git-practice-remote-branches', 'lists only the local branches', ['git branch'], ['shown']],
  ['git-18-clean-up-branches', 'merges the experiment so that -d works', [
    'git merge experiment/parallax',
    'git branch -d feature/opening-hours experiment/parallax',
    'git branch -m feature/galery feature/gallery'
  ], ['experiment-gone']],
  ['git-18-clean-up-branches', 'copies the gallery branch instead of renaming it', [
    'git branch -d feature/opening-hours',
    'git branch -D experiment/parallax',
    'git branch feature/gallery feature/galery'
  ], ['renamed']],
  ['git-practice-rename-branch', 'creates a second branch instead', ['git switch -c feature/cake-order'], ['renamed']],
  ['git-practice-delete-merged-branch', 'deletes the branch it is on', ['git branch -d fix/menu-note'], ['deleted']],
  ['git-19-look-at-old-version', 'creates the branch without looking first', ['git switch -c old-menu HEAD~2'], ['looked']],
  ['git-19-look-at-old-version', 'moves main back instead', ['git log --oneline', 'git reset --hard HEAD~2', 'git switch -c old-menu'], ['looked', 'main-unchanged']],
  ['git-19-look-at-old-version', 'looks but keeps no branch', ['git switch --detach HEAD~2', 'cat menu.html'], ['branch', 'main-unchanged']],
  ['git-practice-branch-from-commit', 'starts the branch at the newest commit', ['git switch -c fix/prices'], ['branch']],
  ['git-11-fix-last-commit', 'adds the file in a second commit', ['git add src/streak.css', 'git commit -m "Add streak counter"'], ['one-commit']],
  ['git-11-fix-last-commit', 'fixes the message but forgets the file', ['git commit --amend -m "Add streak counter"'], ['files', 'clean']],
  ['git-practice-amend-no-edit', 'makes a new commit', ['git add src/reminders.css', 'git commit -m "Add reminder styles"'], ['amended']],
  ['git-12-throw-away-change', 'unstages everything', ['git restore menu.html', 'git restore --staged .'], ['hours']],
  ['git-12-throw-away-change', 'throws everything away with reset --hard', ['git reset --hard'], ['prices', 'hours']],
  ['git-12-throw-away-change', 'restores prices.js instead of unstaging it', ['git restore menu.html prices.js'], ['prices']],
  ['git-practice-unstage-file', 'unstages both files', ['git restore --staged .'], ['app']],
  ['git-practice-discard-file', 'discards every change', ['git restore .'], ['kept']],
  ['git-13-undo-local-commit', 'takes back both commits with --hard', ['git reset --hard HEAD~2'], ['kept']],
  ['git-13-undo-local-commit', 'takes back both commits, the blink stays in style.css', ['git reset HEAD~2'], ['blink-gone']],
  ['git-13-undo-local-commit', 'reverts the blink commit instead', ['git revert HEAD'], ['blink-gone', 'back']],
  ['git-practice-reset-soft', 'unstages the changes with a mixed reset', ['git reset HEAD~1'], ['staged']],
  ['git-practice-reset-hard', 'keeps the files with a mixed reset', ['git reset HEAD~2'], ['files']],
  ['git-14-undo-pushed-commit', 'rewrites history with reset and a force push', ['git reset --hard HEAD~2', 'git push --force'], ['reverted', 'history', 'pushed']],
  ['git-14-undo-pushed-commit', 'reverts but does not push', ['git revert HEAD~1'], ['pushed']],
  ['git-14-undo-pushed-commit', 'reverts the newest commit instead', ['git revert HEAD', 'git push'], ['reverted', 'pushed']],
  ['git-practice-revert-before-last', 'reverts the newest commit', ['git revert HEAD'], ['reverted']],
  ['git-15-park-unfinished-work', 'commits the unfinished work to switch', [
    'git commit -am "WIP gift cards"',
    'git switch main',
    'echo "export const saturday = \'8:00-14:00\'" > src/hours.js',
    'git commit -am "Close at 14:00 on Saturdays"',
    'git switch feature/gift-cards'
  ], ['back']],
  ['git-15-park-unfinished-work', 'applies the stash but leaves it there', [
    'git stash',
    'git switch main',
    'echo "export const saturday = \'8:00-14:00\'" > src/hours.js',
    'git commit -am "Close at 14:00 on Saturdays"',
    'git switch feature/gift-cards',
    'git stash apply'
  ], ['stash-empty']],
  ['git-practice-stash-untracked', 'leaves the new file behind', ['git stash'], ['stashed']]
]

describe.each(wrongPaths)('%s: %s', (id, _why, lines, failing) => {
  it('is not solved', () => {
    const { session } = play(level(id), lines)
    expect(session.solved).toBe(false)
    expect(Object.entries(session.goalsMet).filter(([, met]) => !met).map(([goal]) => goal).sort()).toEqual([...failing].sort())
  })
})

describe('git-16-started-on-wrong-branch', () => {
  it('carries the unfinished contact form along to the new branch', () => {
    const { text, session } = play(level('git-16-started-on-wrong-branch'), ['git switch -c feature/contact-form', 'git status -s'])
    expect(text).toBe('Switched to a new branch \'feature/contact-form\'\n?? contact.html')
    expect(session.goalsMet).toEqual({ 'on-branch': true, 'committed': false, 'main-unchanged': true, 'clean': false })
  })
})

describe('git-practice-switch-back', () => {
  it('also counts git checkout -', () => {
    expect(play(level('git-practice-switch-back'), ['git checkout -']).session.solved).toBe(true)
  })
})

describe('git-17-pick-up-teammate-branch', () => {
  const item = level('git-17-pick-up-teammate-branch')

  it('does not know Jonas\'s branch before a fetch, and creates a tracking branch after it', () => {
    const { steps } = play(item, ['git branch -a', 'git switch feature/newsletter', 'git fetch', 'git branch -a', 'git switch feature/newsletter'])
    const text = (i: number) => steps[i]!.output.map(line => 'text' in line ? line.text : '').join('\n')
    expect(text(0)).toBe('* main\n  remotes/origin/main')
    expect(text(1)).toBe('fatal: invalid reference: feature/newsletter')
    expect(text(3)).toBe('* main\n  remotes/origin/feature/newsletter\n  remotes/origin/main')
    expect(text(4)).toBe([
      'branch \'feature/newsletter\' set up to track \'origin/feature/newsletter\'.',
      'Switched to a new branch \'feature/newsletter\'',
      'Your branch is up to date with \'origin/feature/newsletter\'.'
    ].join('\n'))
  })
})

describe('git-18-clean-up-branches', () => {
  it('refuses -d on the unmerged experiment, like git', () => {
    const { text, session } = play(level('git-18-clean-up-branches'), ['git branch -d experiment/parallax'])
    expect(text).toBe('error: the branch \'experiment/parallax\' is not fully merged\nhint: If you are sure you want to delete it, run \'git branch -D experiment/parallax\'')
    expect(session.goalsMet['experiment-gone']).toBe(false)
  })
})

describe('git-19-look-at-old-version', () => {
  const item = level('git-19-look-at-old-version')
  const before = () => commitsOf(startLevel(item).state, 'main')[2]!

  it('names the real id of the last commit before the redesign in its last hint', () => {
    expect(commitsOf(startLevel(item).state, 'main')[1]!.message).toBe('Redesign the menu page')
    expect(item.hints[2]).toContain(`git switch --detach ${before().id.slice(0, 7)}`)
  })

  it('shows the breakfast box in the detached version', () => {
    const { text } = play(item, [`git checkout ${before().id.slice(0, 7)}`, 'cat menu.html'])
    expect(text).toContain('You are in \'detached HEAD\' state.')
    expect(text).toContain('Saturday breakfast box')
  })

  it('accepts git checkout <id> and HEAD~2 for looking', () => {
    expect(play(item, ['git checkout HEAD~2', 'git switch -c old-menu']).session.solved).toBe(true)
    expect(play(item, [`git checkout ${before().id}`, 'git switch -c old-menu']).session.solved).toBe(true)
  })

  it('does not count restoring a file with checkout as looking', () => {
    const { session } = play(item, ['git checkout menu.html', 'git switch -c old-menu HEAD~2'])
    expect(session.goalsMet.looked).toBe(false)
  })
})

describe('git-14-undo-pushed-commit', () => {
  it('names the real id of the bad commit in its last hint', () => {
    const item = level('git-14-undo-pushed-commit')
    const bad = commitsOf(startLevel(item).state, 'main').find(commit => commit.message === 'Round prices to whole euros')!.id
    expect(item.hints[2]).toContain(`git revert ${bad.slice(0, 7)}`)
  })
})

describe('git-15-park-unfinished-work', () => {
  it('refuses the switch before the stash, and lists the entry after it', () => {
    const { steps } = play(level('git-15-park-unfinished-work'), ['git switch main', 'git stash', 'git stash list'])
    const text = (i: number) => steps[i]!.output.map(line => 'text' in line ? line.text : '').join('\n')
    expect(text(0)).toContain('Please commit your changes or stash them before you switch branches.')
    expect(text(2)).toMatch(/^stash@\{0\}: WIP on feature\/gift-cards: [0-9a-f]{7} Add a 25 euro gift card$/)
  })
})

describe('git-10-ignore-build-files', () => {
  it('refuses git add .env once it is ignored, like real git', () => {
    const { text } = play(level('git-10-ignore-build-files'), ['echo ".env" > .gitignore', 'git add .env'])
    expect(text).toContain('The following paths are ignored by one of your .gitignore files:')
  })
})

describe('git-09-read-history', () => {
  it('accepts git log in any form and the full id of the commit', () => {
    const item = level('git-09-read-history')
    const { state } = startLevel(item)
    const before = commitsOf(state, 'main').find(commit => commit.message === 'Add free shipping from 50 euros')!.id
    expect(play(item, ['git log', `git branch before-shipping-change ${before}`]).session.solved).toBe(true)
    expect(play(item, ['git log -n 4', 'git branch before-shipping-change HEAD~3']).session.solved).toBe(true)
  })
})

describe('git-02-branch', () => {
  it('does not count a commit made on main', () => {
    const { session } = play(level('git-02-branch'), [
      'echo "export const greeting = \'Hello, friend!\'" > src/greeting.ts',
      'git commit -am "Make the greeting friendlier"',
      'git switch -c feature/greeting'
    ])
    expect(session.goalsMet['main-unchanged']).toBe(false)
    expect(session.solved).toBe(false)
  })

  it('does not count an empty commit', () => {
    const { session } = play(level('git-02-branch'), ['git switch -c feature/greeting', 'git commit --allow-empty -m "Nothing"'])
    expect(session.goalsMet.committed).toBe(false)
  })
})

describe('git-04-merge-conflict', () => {
  const item = level('git-04-merge-conflict')

  it('stops with a conflict on the merge', () => {
    const { text, session } = play(item, ['git merge feature/footer'])
    expect(text).toContain('CONFLICT (content): Merge conflict in src/footer.ts')
    expect(session.goalsMet).toEqual({ 'merged': false, 'resolved': false, 'merge-commit': false })
  })

  it('does not count a merge commit that still has conflict markers', () => {
    const { session } = play(item, ['git merge feature/footer', 'git add .', 'git commit --no-edit'])
    expect(session.goalsMet.merged).toBe(true)
    expect(session.goalsMet['merge-commit']).toBe(true)
    expect(session.goalsMet.resolved).toBe(false)
    expect(session.solved).toBe(false)
  })

  it('does not count an aborted merge', () => {
    const { session } = play(item, ['git merge feature/footer', 'git merge --abort'])
    expect(session.solved).toBe(false)
  })
})

describe('git-05-rebase', () => {
  it('does not count merging main into the feature branch', () => {
    const { session } = play(level('git-05-rebase'), ['git merge main'])
    expect(session.goalsMet['contains-main']).toBe(true)
    expect(session.goalsMet.linear).toBe(false)
    expect(session.solved).toBe(false)
  })
})

describe('git-06-teammate-sync', () => {
  const item = level('git-06-teammate-sync')
  const resolve = item.solution.find(line => line.startsWith('echo'))!

  it('has Anna push right before your first push, which still succeeds', () => {
    const { steps, session } = play(item, ['git push -u origin feature/login'])
    expect(steps[0]!.notices.map(notice => notice.author)).toEqual(['Anna'])
    expect(session.history).toEqual([{ line: 'git push -u origin feature/login', exitCode: 0 }])
    expect(session.goalsMet).toEqual({ 'pushed': true, 'up-to-date': false, 'linear': true, 'resolved': true, 'lease': false })
  })

  it('is solved on the realistic path: a plain push after the rebase is rejected, then --force-with-lease', () => {
    const { session, text } = play(item, [
      'git push -u origin feature/login',
      'git fetch',
      'git rebase origin/main',
      resolve,
      'git add src/login.ts',
      'git rebase --continue',
      'git push',
      'git push --force-with-lease'
    ])
    expect(text).toContain('CONFLICT (content): Merge conflict in src/login.ts')
    expect(text).toContain('[rejected]')
    expect(session.solved).toBe(true)
  })

  it('does not count merging origin/main', () => {
    const { session } = play(item, [
      'git push -u origin feature/login',
      'git fetch',
      'git merge origin/main',
      resolve,
      'git add src/login.ts',
      'git commit --no-edit',
      'git push'
    ])
    expect(session.goalsMet).toMatchObject({ 'pushed': true, 'up-to-date': true, 'linear': false, 'resolved': true })
    expect(session.solved).toBe(false)
  })

  const rebased = ['git push -u origin feature/login', 'git fetch', 'git rebase origin/main', resolve, 'git add src/login.ts', 'git rebase --continue']

  it('does not count a bare --force, not even followed by --force-with-lease', () => {
    for (const force of ['git push --force', 'git push -f', 'git push -uf origin feature/login']) {
      const forced = play(item, [...rebased, force])
      expect(forced.session.goalsMet).toEqual({ 'pushed': true, 'up-to-date': true, 'linear': true, 'resolved': true, 'lease': false })
      expect(play(item, ['git push --force-with-lease'], forced.session).session.solved).toBe(false)
      // undo takes the bare --force back
      expect(play(item, ['undo', 'git push --force-with-lease'], forced.session).session.solved).toBe(true)
    }
  })

  it('does not count committing the conflict markers', () => {
    const { session } = play(item, [...rebased.slice(0, 3), 'git add src/login.ts', 'git rebase --continue', 'git push --force-with-lease'])
    expect(session.goalsMet.resolved).toBe(false)
    expect(session.solved).toBe(false)
  })

  it('does not count a rebase onto a stale origin/main', () => {
    const { session } = play(item, ['git fetch', 'git rebase origin/main', 'git push -u origin feature/login'])
    expect(session.goalsMet['up-to-date']).toBe(false)
  })
})
