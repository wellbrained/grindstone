import { describe, expect, it } from 'vitest'
import { commitsOf } from '../../../shared/git'
import { gitLevels, levelById, levels, nextLevel, playStep, startLevel } from '../../../shared/levels'
import type { Level, Session, SolutionStep, SubmitResult } from '../../../shared/levels'
import { deepFreeze } from '../git/helpers'

/** Plays lines (and editor saves) through the engine; returns the last result and every step. */
function play(level: Level, lines: SolutionStep[], from: Session = startLevel(level)) {
  let session = from
  const steps: SubmitResult[] = []
  for (const line of lines) {
    const result = playStep(deepFreeze(session), level, line)
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
  'git-practice-merge-no-ff': { 'merge-commit': false },
  'git-20-both-sides-moved-on': { 'merged': false, 'merge-commit': false, 'looked': false },
  'git-practice-merge-ff-only': { 'merged': false, 'ff-only': false },
  'git-04-merge-conflict': { 'merged': false, 'resolved': false, 'merge-commit': false },
  'git-practice-keep-their-version': { theirs: false },
  'git-21-back-out-of-a-merge': { 'no-merge': false, 'branch': false, 'clean': false },
  'git-practice-list-conflicts': { listed: false },
  'git-22-catch-up-with-main': { 'merged': false, 'resolved': false, 'both': false, 'main-unchanged': false },
  'git-practice-merge-main-in': { 'merged': false, 'main-unchanged': false },
  'git-05-rebase': { 'contains-main': false, 'linear': true, 'on-branch': true },
  'git-practice-rebase-onto-main': { 'on-top': false },
  'git-23-conflict-during-a-rebase': { 'on-top': false, 'resolved': false, 'both': false },
  'git-practice-abort-rebase': { 'given-up': false },
  'git-24-push-a-rebased-branch': { 'on-top': false, 'pushed': false, 'lease': false },
  'git-practice-push-with-lease': { pushed: false, lease: false },
  'git-25-tidy-up-before-review': { 'one-commit': false, 'message': false, 'changes': false },
  'git-practice-reword-old-commit': { fixed: false },
  'git-26-push-your-first-branch': { pushed: false, upstream: false, checked: false },
  'git-practice-push-with-upstream': { pushed: false, upstream: false },
  'git-27-get-your-teammates-work': { fetched: false, looked: false, pulled: false },
  'git-practice-fetch-only': { fetched: false },
  'git-28-your-push-was-rejected': { 'pushed': false, 'ben': false, 'on-top': false },
  'git-practice-pull-rebase': { 'on-top': false },
  'git-29-ahead-and-behind': { yours: false, theirs: false, synced: false },
  'git-practice-unpushed-commits': { listed: false },
  'git-06-teammate-sync': { 'pushed': false, 'up-to-date': true, 'linear': true, 'resolved': true, 'lease': false },
  'git-practice-prune-gone-branches': { pruned: false, deleted: false },
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
  'git-practice-stash-untracked': { stashed: false },
  'git-30-committed-on-main': { 'branch': false, 'main-back': false, 'on-branch': false },
  'git-practice-move-commit-to-branch': { moved: false, main: false },
  'git-31-lost-commits-after-reset': { looked: false, back: false, files: false },
  'git-practice-find-lost-commit': { back: false },
  'git-32-rebased-the-wrong-branch': { 'main-back': false, 'on-top': false },
  'git-practice-undo-rebase': { undone: false },
  'git-33-committed-a-secret': { 'out-of-history': false, 'one-commit': false, 'kept': false },
  'git-practice-untrack-file': { untracked: false },
  'git-practice-remove-file': { deleted: false },
  'git-34-deleted-a-branch': { 'restored': false, 'main-unchanged': false },
  'git-practice-restore-branch': { restored: false },
  'git-35-pull-request-flow': { merged: false, pulled: false, deleted: false, pruned: false },
  'git-practice-clean-up-after-merge': { pulled: false, deleted: false, pruned: false },
  'git-36-hotfix-mid-feature': { hotfix: false, shipped: false, back: false, merged: false },
  'git-practice-stash-for-hotfix': { stashed: false, hotfix: false },
  'git-37-fix-the-release-branch': { 'picked': false, 'nothing-else': false, 'pushed': false },
  'git-practice-cherry-pick-commit': { picked: false },
  'git-practice-cherry-pick-x': { recorded: false },
  'git-38-tag-a-release': { tagged: false, pushed: false },
  'git-practice-annotated-tag': { tagged: false },
  'git-practice-list-tags': { listed: false },
  'git-39-gitflow-release': { release: false, main: false, tag: false, develop: false },
  'git-practice-release-from-develop': { started: false }
}

describe('level list', () => {
  it('has the git levels in play order: each scenario, then its practice tasks', () => {
    expect(gitLevels.map(item => item.id)).toEqual(Object.keys(initialGoals))
    expect(levels).toEqual(gitLevels)
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-practice-stage-one-file')
    expect(nextLevel('git-practice-commit-all')?.id).toBe('git-07-stage-together')
    expect(nextLevel('git-practice-ignore-logs')?.id).toBe('git-02-branch')
    expect(nextLevel('git-06-teammate-sync')?.id).toBe('git-practice-prune-gone-branches')
    expect(nextLevel('git-practice-prune-gone-branches')?.id).toBe('git-11-fix-last-commit')
    expect(nextLevel('git-practice-stash-untracked')?.id).toBe('git-30-committed-on-main')
    expect(nextLevel('git-practice-restore-branch')?.id).toBe('git-35-pull-request-flow')
    expect(nextLevel('git-practice-release-from-develop')).toBeNull()
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

/** 4.2: the resolved index.html, as the solution writes it. */
const AUTUMN_RESOLVED = level('git-23-conflict-during-a-rebase').solution[1] as string
/** 8.1: the Sunday line, as the solution adds it. */
const SUNDAY_LINE = level('git-35-pull-request-flow').solution[2] as string
/** 8.2: the banner fix, as the solution writes it. */
const BANNER_FIX = level('git-36-hotfix-mid-feature').solution[2] as string
/** 4.4: the short ids of your three commits, oldest first. */
const GIFT = commitsOf(startLevel(level('git-25-tidy-up-before-review')).state, 'main..feature/gift-cards').map(commit => commit.id.slice(0, 7)).reverse()

/** Wrong paths that must not solve an entry: at least one per scenario, and the obvious one per practice task. */
const wrongPaths: [id: string, why: string, lines: SolutionStep[], failing: string[]][] = [
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
  ['git-03-merge', 'merges main into the feature branch', ['git merge main'], ['on-main', 'merged']],
  ['git-practice-merge-no-ff', 'fast-forwards', ['git merge fix/croissant-price'], ['merge-commit']],
  ['git-20-both-sides-moved-on', 'merges main into the feature branch instead', ['git merge main', 'git log --graph --oneline'], ['merged', 'merge-commit', 'looked']],
  ['git-20-both-sides-moved-on', 'rebases first, so main only fast-forwards', [
    'git rebase main',
    'git switch main',
    'git merge feature/weekly-specials',
    'git log --graph --oneline'
  ], ['merged', 'merge-commit', 'looked']],
  ['git-20-both-sides-moved-on', 'looks at the history before merging only', ['git log --graph --oneline --all', 'git switch main', 'git merge feature/weekly-specials'], ['looked']],
  ['git-practice-merge-ff-only', 'merges without --ff-only', ['git merge feature/newsletter'], ['ff-only']],
  ['git-04-merge-conflict', 'commits the conflict markers', ['git merge feature/footer', 'git add .', 'git commit --no-edit'], ['resolved']],
  ['git-practice-keep-their-version', 'keeps our version instead', ['git checkout --ours prices.json', 'git add prices.json', 'git commit'], ['theirs']],
  ['git-practice-keep-their-version', 'commits the conflict markers', ['git add prices.json', 'git commit'], ['theirs']],
  ['git-21-back-out-of-a-merge', 'commits the conflict markers', ['git add .', 'git commit --no-edit'], ['branch', 'clean']],
  ['git-21-back-out-of-a-merge', 'resolves the conflict instead of aborting', [
    'git checkout --ours src/menu.js',
    'git add src/menu.js',
    'git commit --no-edit'
  ], ['branch']],
  ['git-practice-list-conflicts', 'lists every file instead', ['ls'], ['listed']],
  ['git-22-catch-up-with-main', 'merges the feature into main instead', [
    'git switch main',
    'git merge feature/order-pickup',
    'git checkout --ours index.html',
    'git add index.html',
    'git commit --no-edit'
  ], ['merged', 'resolved', 'both', 'main-unchanged']],
  ['git-22-catch-up-with-main', 'commits the conflict markers', ['git merge main', 'git add .', 'git commit --no-edit'], ['resolved', 'both']],
  ['git-22-catch-up-with-main', 'takes main\'s line and drops the order link', [
    'git merge main',
    'git checkout --theirs index.html',
    'git add index.html',
    'git commit --no-edit'
  ], ['both']],
  ['git-practice-merge-main-in', 'merges the branch into main instead', ['git switch main', 'git merge feature/gift-boxes'], ['merged', 'main-unchanged']],
  ['git-practice-merge-main-in', 'rebases instead of merging', ['git rebase main'], ['merged']],
  ['git-05-rebase', 'merges main into the feature branch', ['git merge main'], ['linear']],
  ['git-practice-rebase-onto-main', 'merges main in instead', ['git merge main'], ['on-top']],
  ['git-23-conflict-during-a-rebase', 'merges main in instead', ['git merge main', AUTUMN_RESOLVED, 'git add index.html', 'git commit --no-edit'], ['on-top']],
  ['git-23-conflict-during-a-rebase', 'commits the conflict markers', ['git rebase main', 'git add index.html', 'git rebase --continue'], ['resolved', 'both']],
  ['git-23-conflict-during-a-rebase', 'skips the clashing commit', ['git rebase main', 'git rebase --skip'], ['on-top', 'both']],
  ['git-23-conflict-during-a-rebase', 'resolves but never continues', ['git rebase main', AUTUMN_RESOLVED, 'git add index.html'], ['on-top', 'resolved', 'both']],
  ['git-practice-abort-rebase', 'skips the commit instead', ['git rebase --skip'], ['given-up']],
  ['git-24-push-a-rebased-branch', 'pushes without force and is rejected', ['git rebase main', 'git push'], ['pushed', 'lease']],
  ['git-24-push-a-rebased-branch', 'overwrites origin with a bare --force', ['git rebase main', 'git push --force'], ['lease']],
  ['git-24-push-a-rebased-branch', 'pulls the old commits back in after the rejection', ['git rebase main', 'git push', 'git pull', 'git push'], ['on-top', 'lease']],
  ['git-24-push-a-rebased-branch', 'merges main in instead of rebasing', ['git merge main', 'git push'], ['on-top', 'lease']],
  ['git-practice-push-with-lease', 'overwrites origin with a bare --force', ['git push --force'], ['lease']],
  ['git-practice-push-with-lease', 'pushes without force and is rejected', ['git push'], ['pushed', 'lease']],
  ['git-25-tidy-up-before-review', 'renames only the newest commit', ['git commit --amend -m "Add gift cards to the shop"'], ['one-commit', 'message', 'changes']],
  ['git-25-tidy-up-before-review', 'squashes but keeps the old messages, "wip" included', [
    'git rebase -i main',
    { save: `pick ${GIFT[0]}\nsquash ${GIFT[1]}\nsquash ${GIFT[2]}\n` },
    { save: 'Add gift card product page\n\nwip\n\nfix typo\n' }
  ], ['message']],
  ['git-25-tidy-up-before-review', 'melds the commits but never writes the new message', ['git rebase -i main', { save: `pick ${GIFT[0]}\nfixup ${GIFT[1]}\nfixup ${GIFT[2]}\n` }], ['message']],
  ['git-25-tidy-up-before-review', 'drops the two small commits and their changes', ['git rebase -i main', { save: `reword ${GIFT[0]}\n` }, { save: 'Add gift cards to the shop' }], ['changes']],
  ['git-practice-reword-old-commit', 'amends the newest commit instead', ['git commit --amend -m "Add newsletter form"'], ['fixed']],
  ['git-26-push-your-first-branch', 'pushes without -u and never sets the upstream', ['git push origin feature/stollen-orders', 'git status'], ['upstream', 'checked']],
  ['git-26-push-your-first-branch', 'never checks with git status', ['git push -u origin feature/stollen-orders'], ['checked']],
  ['git-26-push-your-first-branch', 'looks at git status before the upstream is set', ['git push origin feature/stollen-orders', 'git status', 'git branch -u origin/feature/stollen-orders'], ['checked']],
  ['git-practice-push-with-upstream', 'pushes without -u', ['git push origin fix/allergen-note'], ['upstream']],
  ['git-27-get-your-teammates-work', 'pulls without looking first', ['git pull', 'git status'], ['looked']],
  ['git-27-get-your-teammates-work', 'looks with a plain git log, which only shows main', ['git fetch', 'git log --oneline'], ['looked', 'pulled']],
  ['git-27-get-your-teammates-work', 'looks before fetching, when origin/main is still old', ['git status', 'git pull'], ['looked']],
  ['git-practice-fetch-only', 'pulls, which merges her commit into main', ['git pull'], ['fetched']],
  ['git-28-your-push-was-rejected', 'pulls with a merge commit', ['git push', 'git pull', 'git push'], ['on-top']],
  ['git-28-your-push-was-rejected', 'overwrites the commit of Ben with a bare --force', ['git push', 'git push --force'], ['ben', 'on-top']],
  ['git-28-your-push-was-rejected', 'rebases but never pushes', ['git push', 'git pull --rebase'], ['pushed', 'ben']],
  ['git-practice-pull-rebase', 'pulls with a merge commit', ['git pull'], ['on-top']],
  ['git-29-ahead-and-behind', 'syncs without looking first', ['git pull --rebase', 'git push', 'git log --oneline origin/main..main', 'git log --oneline main..origin/main'], ['yours', 'theirs']],
  ['git-29-ahead-and-behind', 'looks at everything at once', ['git log --oneline --graph --all', 'git pull --rebase', 'git push'], ['yours', 'theirs']],
  ['git-29-ahead-and-behind', 'overwrites the commit of Maya with a bare --force', ['git log --oneline origin/main..main', 'git log --oneline main..origin/main', 'git push --force'], ['synced']],
  ['git-practice-unpushed-commits', 'shows the whole history', ['git log --oneline'], ['listed']],
  ['git-practice-unpushed-commits', 'asks git status, which only counts them', ['git status'], ['listed']],
  ['git-practice-prune-gone-branches', 'deletes the local branch but keeps the stale origin/ copy', ['git fetch', 'git branch -d feature/allergy-labels'], ['pruned']],
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
  ['git-practice-stash-untracked', 'leaves the new file behind', ['git stash'], ['stashed']],
  ['git-30-committed-on-main', 'keeps the changes staged on main with a soft reset', ['git branch feature/cake-orders', 'git reset --soft origin/main'], ['on-branch']],
  ['git-30-committed-on-main', 'moves main back before a branch holds the commits', ['git reset --hard origin/main', 'git switch -c feature/cake-orders'], ['branch']],
  ['git-30-committed-on-main', 'only creates the branch, main keeps the commits', ['git switch -c feature/cake-orders'], ['main-back']],
  ['git-practice-move-commit-to-branch', 'switches to a new branch, main keeps the commit', ['git switch -c feature/gluten-free'], ['main']],
  ['git-31-lost-commits-after-reset', 'goes back only to the first of the two commits', ['git reflog', 'git reset --hard HEAD@{2}'], ['back', 'files']],
  ['git-31-lost-commits-after-reset', 'moves the branch back without the files', ['git reflog', 'git reset HEAD@{1}'], ['files']],
  ['git-practice-find-lost-commit', 'moves main back without the files', ['git reflog', 'git reset HEAD@{1}'], ['back']],
  ['git-32-rebased-the-wrong-branch', 'does the intended rebase without fixing main', ['git switch feature/allergen-labels', 'git rebase main'], ['main-back', 'on-top']],
  ['git-32-rebased-the-wrong-branch', 'resets main to the start of the rebase', ['git reflog', 'git reset --hard HEAD@{3}', 'git switch feature/allergen-labels', 'git rebase main'], ['main-back', 'on-top']],
  ['git-32-rebased-the-wrong-branch', 'merges origin/main into the rebased main', ['git merge origin/main'], ['main-back', 'on-top']],
  ['git-practice-undo-rebase', 'goes back one move, to the last copied commit', ['git reset --hard HEAD@{1}'], ['undone']],
  ['git-33-committed-a-secret', 'commits the removal on top: the key stays in the history', [
    'git rm --cached .env',
    'echo ".env" >> .gitignore',
    'git add .gitignore',
    'git commit -m "Stop tracking .env"'
  ], ['out-of-history', 'one-commit']],
  ['git-33-committed-a-secret', 'deletes .env from the disk with a plain git rm', [
    'git rm .env',
    'echo ".env" >> .gitignore',
    'git add .gitignore',
    'git commit --amend --no-edit'
  ], ['kept']],
  ['git-33-committed-a-secret', 'amends without ignoring .env', ['git rm --cached .env', 'git commit --amend --no-edit'], ['one-commit', 'kept']],
  ['git-practice-untrack-file', 'deletes the file from the disk too', ['git rm .vscode/settings.json', 'git commit -m "Remove editor settings"'], ['untracked']],
  ['git-practice-remove-file', 'deletes the file without staging the deletion', ['rm summer.html', 'git commit -m "Remove the summer ice cream page"'], ['deleted']],
  ['git-34-deleted-a-branch', 'resets main onto the lost commits', ['git reflog', 'git reset --hard HEAD@{2}', 'git branch feature/loyalty-card'], ['main-unchanged']],
  ['git-34-deleted-a-branch', 'brings back only the first commit', ['git reflog', 'git branch feature/loyalty-card HEAD@{3}'], ['restored', 'main-unchanged']],
  ['git-34-deleted-a-branch', 'creates a new branch from main instead', ['git switch -c feature/loyalty-card'], ['restored', 'main-unchanged']],
  ['git-practice-restore-branch', 'creates the branch on the current commit', ['git branch fix/price-typo'], ['restored']],
  ['git-35-pull-request-flow', 'branches from the stale main, without pulling first', [
    'git switch -c feature/sunday-hours',
    SUNDAY_LINE,
    'git commit -am "Add the Sunday opening hours"',
    'git push -u origin feature/sunday-hours',
    'git switch main',
    'git pull',
    'git branch -d feature/sunday-hours',
    'git fetch --prune'
  ], ['merged']],
  ['git-35-pull-request-flow', 'leaves the branch and its origin/ copy behind', level('git-35-pull-request-flow').solution.slice(0, -2), ['deleted', 'pruned']],
  ['git-35-pull-request-flow', 'deletes the branch but never pulls the merge', [
    ...level('git-35-pull-request-flow').solution.slice(0, 6),
    'git branch -d feature/sunday-hours',
    'git fetch --prune'
  ], ['pulled', 'deleted', 'pruned']],
  ['git-practice-clean-up-after-merge', 'deletes and prunes without pulling the merge', ['git branch -d feature/newsletter-form', 'git fetch --prune'], ['pulled']],
  ['git-36-hotfix-mid-feature', 'commits the fix straight on main, no hotfix branch', [
    'git stash',
    'git switch main',
    BANNER_FIX,
    'git commit -am "Fix the Christmas Eve hours in the banner"',
    'git push',
    'git switch feature/gift-cards',
    'git stash pop',
    'git merge main'
  ], ['hotfix']],
  ['git-36-hotfix-mid-feature', 'fixes it on the feature branch and ships the gift cards with it', [
    BANNER_FIX,
    'git commit -am "Fix the Christmas Eve hours in the banner"',
    'git switch main',
    'git merge feature/gift-cards',
    'git push',
    'git switch feature/gift-cards'
  ], ['hotfix', 'shipped', 'back']],
  ['git-36-hotfix-mid-feature', 'never brings the fix into the feature branch', level('git-36-hotfix-mid-feature').solution.slice(0, -1), ['merged']],
  ['git-36-hotfix-mid-feature', 'rebases the feature branch Jonas already pulled', [
    ...level('git-36-hotfix-mid-feature').solution.slice(0, 8),
    'git rebase main',
    'git stash pop'
  ], ['merged']],
  ['git-practice-stash-for-hotfix', 'starts the hotfix from the feature branch', ['git stash', 'git switch -c hotfix/menu-typo'], ['hotfix']],
  ['git-practice-stash-for-hotfix', 'switches without stashing, which git refuses', ['git switch -c hotfix/menu-typo main'], ['stashed', 'hotfix']],
  ['git-37-fix-the-release-branch', 'merges main into the release branch', ['git switch release/1.4', 'git merge main', 'git push'], ['picked', 'nothing-else']],
  ['git-37-fix-the-release-branch', 'picks the Christmas link instead of the fix', ['git switch release/1.4', 'git cherry-pick main', 'git push'], ['picked', 'nothing-else']],
  ['git-37-fix-the-release-branch', 'picks the fix but does not push', level('git-37-fix-the-release-branch').solution.slice(0, 2), ['pushed']],
  ['git-practice-cherry-pick-commit', 'merges main instead', ['git merge main'], ['picked']],
  ['git-practice-cherry-pick-x', 'picks without -x', ['git cherry-pick main'], ['recorded']],
  ['git-38-tag-a-release', 'makes a lightweight tag', ['git tag v1.4.0 HEAD~1', 'git push origin v1.4.0'], ['tagged', 'pushed']],
  ['git-38-tag-a-release', 'tags the newest commit, which is not the release', ['git tag -a v1.4.0 -m "Version 1.4.0: online orders"', 'git push origin v1.4.0'], ['tagged', 'pushed']],
  ['git-38-tag-a-release', 'pushes with a plain git push, which sends no tags', ['git tag -a v1.4.0 -m "Version 1.4.0: online orders" HEAD~1', 'git push'], ['pushed']],
  ['git-practice-annotated-tag', 'makes a lightweight tag', ['git tag v1.5.0'], ['tagged']],
  ['git-practice-list-tags', 'looks at the log instead', ['git log --oneline'], ['listed']],
  ['git-39-gitflow-release', 'fast-forwards main instead of making a merge commit', [
    ...level('git-39-gitflow-release').solution.slice(0, 4),
    'git merge release/1.5',
    ...level('git-39-gitflow-release').solution.slice(5)
  ], ['main', 'tag']],
  ['git-39-gitflow-release', 'never merges the release back into develop', level('git-39-gitflow-release').solution.slice(0, -2), ['develop']],
  ['git-39-gitflow-release', 'makes a lightweight tag', [
    ...level('git-39-gitflow-release').solution.slice(0, 5),
    'git tag v1.5.0',
    ...level('git-39-gitflow-release').solution.slice(6)
  ], ['tag']],
  ['git-39-gitflow-release', 'sets the version on develop, without a release branch', [
    'echo "1.5.0" > version.txt',
    'git commit -am "Set the version to 1.5.0"',
    'git switch main',
    'git merge --no-ff develop',
    'git tag -a v1.5.0 -m "Version 1.5.0"'
  ], ['release', 'main', 'develop']],
  ['git-practice-release-from-develop', 'starts the release from main', ['git switch -c release/1.6'], ['started']]
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
  const resolve = item.solution.find(line => typeof line === 'string' && line.startsWith('echo')) as string

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

describe('git-20-both-sides-moved-on', () => {
  it('makes a merge commit and draws both lines of work in git log --graph', () => {
    const { steps } = play(level('git-20-both-sides-moved-on'), level('git-20-both-sides-moved-on').solution)
    const text = (i: number) => steps[i]!.output.map(line => 'text' in line ? line.text : '').join('\n')
    expect(text(1)).toContain('Merge made by the \'ort\' strategy.')
    expect(text(2)).toMatch(/^\* {3}[0-9a-f]{7} \(HEAD -> main\) Merge branch 'feature\/weekly-specials'\n\|\\\n/)
    expect(text(2)).toContain('\n|/\n')
  })
})

describe('git-21-back-out-of-a-merge', () => {
  const item = level('git-21-back-out-of-a-merge')

  it('starts inside the conflicted merge, with the conflict block of the story', () => {
    const { text } = play(item, ['git status', 'cat src/menu.js'])
    expect(text).toContain('You have unmerged paths.\n  (fix conflicts and run "git commit")\n  (use "git merge --abort" to abort the merge)')
    expect(text).toContain('\tboth modified:   src/menu.js')
    expect(text).toContain([
      'export function visibleItems(items, filter) {',
      '<<<<<<< HEAD',
      '  // Allergens are shown next to each item, never filtered out.',
      '  return items.map(item => ({ ...item, label: withAllergens(item) }))',
      '=======',
      '  // Filter by category; \'all\' shows everything. (Jonas)',
      '  return filter === \'all\' ? items : items.filter(item => item.category === filter)',
      '>>>>>>> feature/menu-filter',
      '}'
    ].join('\n'))
  })

  it('puts your files back as they were, also the cleanly merged menu.html', () => {
    const { session } = play(item, ['git merge --abort'])
    expect(session.state.workdir['src/menu.js']).not.toContain('filter ===')
    expect(session.state.workdir['menu.html']).not.toContain('categories')
    expect(session.state.workdir['src/allergens.js']).toContain('withAllergens')
  })
})

describe('git-practice-keep-their-version', () => {
  it('also counts git restore --theirs', () => {
    expect(play(level('git-practice-keep-their-version'), ['git restore --theirs prices.json', 'git add prices.json', 'git commit']).session.solved).toBe(true)
  })
})

describe('git-practice-list-conflicts', () => {
  it('also counts git status -s', () => {
    const { session, text } = play(level('git-practice-list-conflicts'), ['git status -s'])
    expect(text).toContain('UU menu.html\nUU style.css')
    expect(session.solved).toBe(true)
  })
})

describe('git-22-catch-up-with-main', () => {
  it('conflicts on the opening hours line, on your branch', () => {
    const { text, session } = play(level('git-22-catch-up-with-main'), ['git merge main', 'git status'])
    expect(text).toContain('CONFLICT (content): Merge conflict in index.html')
    expect(text).toContain('On branch feature/order-pickup')
    expect(session.goalsMet).toEqual({ 'merged': false, 'resolved': false, 'both': false, 'main-unchanged': false })
  })
})

describe('git-23-conflict-during-a-rebase', () => {
  const item = level('git-23-conflict-during-a-rebase')

  it('stops at your second commit, with the first one already replayed and the third still to come', () => {
    const { text, session } = play(item, ['git rebase main', 'git status'])
    expect(text).toContain('CONFLICT (content): Merge conflict in index.html')
    expect(text).toMatch(/Could not apply [0-9a-f]{7}\.\.\. Link the autumn menu from the home page/)
    expect(text).toContain('You are currently rebasing branch \'feature/autumn-menu\' on')
    expect(commitsOf(session.state, 'main..HEAD').map(commit => commit.message)).toEqual(['Add the autumn menu page'])
    expect(session.goalsMet).toEqual({ 'on-top': false, 'resolved': false, 'both': false })
  })

  it('replays the third commit after --continue', () => {
    const { steps } = play(item, item.solution)
    const last = steps.at(-1)!.output.map(line => 'text' in line ? line.text : '').join('\n')
    expect(last).toMatch(/^\[detached HEAD [0-9a-f]{7}\] Link the autumn menu from the home page\n/)
    expect(last).toContain('Successfully rebased and updated refs/heads/feature/autumn-menu.')
  })
})

describe('git-24-push-a-rebased-branch', () => {
  const item = level('git-24-push-a-rebased-branch')

  it('rejects a plain push of the rebased branch as non-fast-forward', () => {
    const { text } = play(item, ['git rebase main', 'git push'])
    expect(text).toContain(' ! [rejected]        feature/faq -> feature/faq (non-fast-forward)')
  })

  it('does not count a bare --force, but undo takes it back', () => {
    const forced = play(item, ['git rebase main', 'git push -f'])
    expect(play(item, ['git push --force-with-lease'], forced.session).session.solved).toBe(false)
    expect(play(item, ['undo', 'git push --force-with-lease'], forced.session).session.solved).toBe(true)
  })
})

describe('git-25-tidy-up-before-review', () => {
  const item = level('git-25-tidy-up-before-review')

  it('names the real ids of your commits in its last hint', () => {
    expect(item.hints[2]).toContain(`\`reword ${GIFT[0]} …\`, \`fixup ${GIFT[1]} …\`, \`fixup ${GIFT[2]} …\``)
  })

  it('opens the todo list with your three commits, and the message after Start rebase', () => {
    const { session, text } = play(item, item.solution.slice(0, 2))
    expect(text).toBe('hint: Waiting for your editor to close the file...\nhint: Waiting for your editor to close the file...')
    expect(session.state.repo!.operation).toMatchObject({ editor: { kind: 'message', path: '.git/COMMIT_EDITMSG' } })
    expect(session.history.map(record => record.line)).toEqual(['git rebase -i main', 'edit .git/rebase-merge/git-rebase-todo'])
    expect(startLevel(item).goalsMet).toEqual(session.goalsMet)
  })

  it('also counts squash with a new message', () => {
    const { session } = play(item, ['git rebase -i main', { save: `pick ${GIFT[0]}\nsquash ${GIFT[1]}\ns ${GIFT[2]}\n` }, { save: '# keep it short\nAdd gift cards to the shop\n' }])
    expect(session.solved).toBe(true)
  })

  it('undo takes the saved todo list back and the list opens again', () => {
    const { session } = play(item, [...item.solution.slice(0, 2), 'undo'])
    expect(session.state.repo!.operation).toMatchObject({ editor: { kind: 'todo' } })
    expect(play(item, item.solution.slice(1), session).session.solved).toBe(true)
  })

  it('cancels with git rebase --abort while the list is open', () => {
    const { session } = play(item, ['git rebase -i main', 'git log', 'git rebase --abort'])
    expect(session.history.map(record => record.exitCode)).toEqual([0, 1, 0])
    expect(session.state).toEqual(startLevel(item).state)
  })
})

describe('git-26-push-your-first-branch', () => {
  const item = level('git-26-push-your-first-branch')

  it('refuses a plain push with git\'s upstream message, then tracks after -u', () => {
    const { steps } = play(item, item.solution)
    const texts = steps.map(step => step.output.map(line => 'text' in line ? line.text : '').join('\n'))
    expect(texts[0]).toContain('fatal: The current branch feature/stollen-orders has no upstream branch.')
    expect(texts[0]).toContain('    git push --set-upstream origin feature/stollen-orders')
    expect(texts[1]).toContain('branch \'feature/stollen-orders\' set up to track \'origin/feature/stollen-orders\'.')
    expect(texts[2]).toContain('Your branch is up to date with \'origin/feature/stollen-orders\'.')
  })

  it('also counts pushing first and setting the upstream afterwards', () => {
    const { session } = play(item, ['git push origin feature/stollen-orders', 'git branch -u origin/feature/stollen-orders', 'git status'])
    expect(session.solved).toBe(true)
  })
})

describe('git-27-get-your-teammates-work', () => {
  const item = level('git-27-get-your-teammates-work')

  it('says behind by 2 after the fetch, and fast-forwards on pull', () => {
    const { steps } = play(item, item.solution)
    const texts = steps.map(step => step.output.map(line => 'text' in line ? line.text : '').join('\n'))
    expect(texts[1]).toContain('Your branch is behind \'origin/main\' by 2 commits, and can be fast-forwarded.')
    expect(texts[2].split('\n')).toHaveLength(2)
    expect(texts[2]).toMatch(/^[0-9a-f]{7} \(origin\/main\) Add the Sunday brunch rolls to the menu\n[0-9a-f]{7} Show the opening hours in the footer$/)
    expect(texts[3]).toContain('Fast-forward')
  })

  it('also counts a git log of origin/main as the look', () => {
    expect(play(item, ['git fetch', 'git log --oneline origin/main', 'git pull']).session.solved).toBe(true)
  })
})

describe('git-28-your-push-was-rejected', () => {
  const item = level('git-28-your-push-was-rejected')

  it('rejects the first push with "fetch first", right after Ben pushed', () => {
    const { steps } = play(item, ['git push'])
    const text = steps[0]!.output.map(line => 'text' in line ? line.text : '').join('\n')
    expect(steps[0]!.notices.map(notice => notice.author)).toEqual(['Ben'])
    // nothing ticks the moment Ben pushes
    expect(steps[0]!.session.goalsMet).toEqual({ 'pushed': false, 'ben': false, 'on-top': false })
    expect(text).toContain(' ! [rejected]        main -> main (fetch first)')
    expect(text).toContain('hint: \'git pull\' before pushing again.')
  })

  it('also counts fetch and rebase onto origin/main, and Ben pushes even when you pull first', () => {
    expect(play(item, ['git push', 'git fetch', 'git rebase origin/main', 'git push']).session.solved).toBe(true)
    const early = play(item, ['git pull --rebase', 'git push'])
    expect(early.session.solved).toBe(false)
    expect(play(item, ['git pull --rebase', 'git push'], early.session).session.solved).toBe(true)
  })
})

describe('git-29-ahead-and-behind', () => {
  const item = level('git-29-ahead-and-behind')

  it('starts diverged, 2 and 1', () => {
    const { text } = play(item, ['git status'])
    expect(text).toContain('Your branch and \'origin/main\' have diverged,\nand have 2 and 1 different commits each, respectively.')
  })

  it('counts other spellings of the same ranges, and a merge as the sync', () => {
    const { session } = play(item, ['git log ^origin/main HEAD', 'git log --oneline ..origin/main', 'git pull', 'git push'])
    expect(session.solved).toBe(true)
  })
})

describe('git-practice-prune-gone-branches', () => {
  it('lists the stale origin/ branch until you prune it', () => {
    const item = level('git-practice-prune-gone-branches')
    expect(play(item, ['git branch -a']).text).toContain('remotes/origin/feature/allergy-labels')
    const { steps } = play(item, item.solution)
    expect(steps[0]!.output.map(line => 'text' in line ? line.text : '').join('\n')).toContain(' - [deleted]         (none)     -> origin/feature/allergy-labels')
  })
})

const texts = (steps: SubmitResult[]) => steps.map(step => step.output.map(line => 'text' in line ? line.text : '').join('\n'))

describe('git-30-committed-on-main', () => {
  it('also counts switching to the new branch first and resetting main from there', () => {
    const { session } = play(level('git-30-committed-on-main'), [
      'git switch -c feature/cake-orders',
      'git switch main',
      'git reset --hard origin/main',
      'git switch feature/cake-orders'
    ])
    expect(session.solved).toBe(true)
  })
})

describe('git-31-lost-commits-after-reset', () => {
  const item = level('git-31-lost-commits-after-reset')

  it('starts with the reset and both commits in the reflog, and names the real id in its last hint', () => {
    const { state } = startLevel(item)
    const lost = commitsOf(state, 'HEAD@{1}')
    expect(lost.map(commit => commit.message).slice(0, 2)).toEqual(['Add stollen and mince pies to the Christmas menu', 'Add the Christmas menu page'])
    expect(item.hints[2]).toContain(`git reset --hard ${lost[0]!.id.slice(0, 7)}`)
    const [log, reflog] = texts(play(item, ['git log --oneline', 'git reflog']).steps)
    expect(log).not.toContain('Christmas')
    expect(reflog!.split('\n')).toEqual([
      expect.stringMatching(/^[0-9a-f]{7} \(HEAD -> feature\/christmas-menu, main, origin\/main\) HEAD@\{0\}: reset: moving to HEAD~2$/),
      `${lost[0]!.id.slice(0, 7)} HEAD@{1}: commit: Add stollen and mince pies to the Christmas menu`,
      `${lost[1]!.id.slice(0, 7)} HEAD@{2}: commit: Add the Christmas menu page`,
      expect.stringMatching(/HEAD@\{3\}: checkout: moving from main to feature\/christmas-menu$/),
      expect.stringMatching(/HEAD@\{4\}: commit \(initial\): Start the bakery website$/)
    ])
  })

  it('also counts the id from the reflog, and a rescue branch merged back', () => {
    const lost = commitsOf(startLevel(item).state, 'HEAD@{1}')[0]!.id.slice(0, 7)
    expect(play(item, ['git reflog', `git reset --hard ${lost}`]).session.solved).toBe(true)
    expect(play(item, ['git reflog', `git branch rescue ${lost}`, 'git merge rescue']).session.solved).toBe(true)
  })
})

describe('git-32-rebased-the-wrong-branch', () => {
  const item = level('git-32-rebased-the-wrong-branch')

  it('starts diverged, with the whole rebase in the reflog and main\'s old position right below it', () => {
    const { state } = startLevel(item)
    expect(item.solution[2]).toBe('git reset --hard HEAD@{4}')
    expect(state.repo!.reflog!.HEAD!.slice(0, 5).map(entry => entry.message)).toEqual([
      'rebase (finish): returning to refs/heads/main',
      'rebase (pick): Style the address footer',
      'rebase (pick): Open at 6:30 on Saturdays',
      'rebase (start): checkout feature/allergen-labels',
      'pull: Fast-forward'
    ])
    expect(commitsOf(state, 'HEAD@{4}')[0]!.id).toBe(commitsOf(state, 'origin/main')[0]!.id)
    expect(commitsOf(state, 'ORIG_HEAD')[0]!.id).toBe(commitsOf(state, 'origin/main')[0]!.id)
    expect(texts(play(item, ['git status']).steps)[0]).toContain('and have 4 and 2 different commits each, respectively.')
  })

  it('also counts ORIG_HEAD, main@{1} and origin/main as the way back', () => {
    for (const rev of ['ORIG_HEAD', 'main@{1}', 'origin/main']) {
      expect(play(item, [`git reset --hard ${rev}`, 'git switch feature/allergen-labels', 'git rebase main']).session.solved).toBe(true)
    }
  })
})

describe('git-33-committed-a-secret', () => {
  const item = level('git-33-committed-a-secret')

  it('keeps .env on the disk after git rm --cached, and git add . skips it once it is ignored', () => {
    const { steps, session } = play(item, ['git rm --cached .env', 'git status -s', 'echo ".env" >> .gitignore', 'git add .', 'git status -s'])
    expect(texts(steps)[0]).toBe('rm \'.env\'')
    expect(texts(steps)[1]).toBe('D  .env\n?? .env')
    expect(texts(steps)[4]).toBe('D  .env\nM  .gitignore')
    expect(session.state.workdir['.env']).toContain('PAYMENT_API_KEY=test-key-not-real-0000')
  })

  it('also counts amending with a new message', () => {
    expect(play(item, ['git rm --cached .env', 'echo ".env" >> .gitignore', 'git add .gitignore', 'git commit --amend -m "Add card payments, key stays local"']).session.solved).toBe(true)
  })
})

describe('git-34-deleted-a-branch', () => {
  const item = level('git-34-deleted-a-branch')

  it('quotes the id git printed when it deleted the branch, in the story and the last hint', () => {
    const deleted = play(item, ['git branch feature/loyalty-card HEAD@{2}', 'git branch -D feature/loyalty-card'])
    const line = texts(deleted.steps)[1]!
    expect(line).toMatch(/^Deleted branch feature\/loyalty-card \(was [0-9a-f]{7}\)\.$/)
    expect(item.story).toContain(`"${line}"`)
    expect(item.hints[2]).toContain(`git branch feature/loyalty-card ${line.slice(-9, -2)}`)
  })

  it('also counts the id from the story', () => {
    const id = /\(was ([0-9a-f]{7})\)/.exec(item.story)![1]!
    expect(play(item, [`git branch feature/loyalty-card ${id}`]).session.solved).toBe(true)
  })

  it('has no log for the deleted branch any more', () => {
    expect(texts(play(item, ['git reflog show feature/loyalty-card']).steps)[0]).toContain('fatal: ambiguous argument \'feature/loyalty-card\'')
  })
})

describe('git-practice-restore-branch', () => {
  it('quotes the id git printed when it deleted the branch', () => {
    const item = level('git-practice-restore-branch')
    const deleted = play(item, ['git branch fix/price-typo HEAD@{1}', 'git branch -D fix/price-typo'])
    expect(item.kind === 'practice' && item.task).toContain(`"${texts(deleted.steps)[1]}"`)
  })
})

describe('git-practice-undo-rebase', () => {
  it('also counts the reflog line below the rebase start', () => {
    expect(play(level('git-practice-undo-rebase'), ['git reflog', 'git reset --hard HEAD@{3}']).session.solved).toBe(true)
  })
})

describe('git-35-pull-request-flow', () => {
  const item = level('git-35-pull-request-flow')

  it('has Maya merge the pull request right after your push, and delete the branch on origin', () => {
    const { steps } = play(item, item.solution.slice(0, 5))
    expect(steps.map(step => step.notices.map(notice => notice.author))).toEqual([[], [], [], [], ['Maya']])
    const state = steps[4]!.session.state
    const tip = state.origin!.commits[state.origin!.branches.main!]!
    expect(tip.message).toBe('Merge pull request #12 from feature/sunday-hours')
    expect(state.origin!.branches['feature/sunday-hours']).toBeUndefined()
    expect(steps[4]!.session.goalsMet).toEqual({ merged: true, pulled: false, deleted: false, pruned: false })
  })

  it('deletes the branch with -d once main has the merge', () => {
    const { steps } = play(item, item.solution)
    expect(texts(steps)[7]).toMatch(/^Deleted branch feature\/sunday-hours \(was [0-9a-f]{7}\)\.$/)
    expect(texts(steps)[8]).toContain(' - [deleted]         (none)     -> origin/feature/sunday-hours')
  })
})

describe('git-36-hotfix-mid-feature', () => {
  const item = level('git-36-hotfix-mid-feature')

  it('refuses to switch while the gift card work is uncommitted', () => {
    const { text } = play(item, ['git switch main'])
    expect(text).toContain('error: Your local changes to the following files would be overwritten by checkout:\n\tgift-cards.html')
  })

  it('also counts a WIP commit instead of the stash, and deleting the hotfix branch after the merge', () => {
    const { session } = play(item, [
      'git commit -am "WIP gift card amounts"',
      'git switch -c hotfix/christmas-eve main',
      BANNER_FIX,
      'git commit -am "Fix the Christmas Eve hours in the banner"',
      'git switch main',
      'git merge hotfix/christmas-eve',
      'git branch -d hotfix/christmas-eve',
      'git push',
      'git switch feature/gift-cards',
      'git merge main'
    ])
    expect(session.solved).toBe(true)
  })
})

describe('git-37-fix-the-release-branch', () => {
  const item = level('git-37-fix-the-release-branch')

  it('names the real id of Jonas\'s fix in its last hint, and copies it as a new commit', () => {
    const { state } = startLevel(item)
    const fix = commitsOf(state, 'main').find(commit => commit.message === 'Allow up to 12 loaves per order')!
    expect(item.hints[2]).toContain(`git cherry-pick ${fix.id.slice(0, 7)}`)
    const { steps, session } = play(item, item.solution.slice(0, 2))
    const tip = commitsOf(session.state, 'release/1.4')[0]!
    expect(texts(steps)[1]).toBe(`[release/1.4 ${tip.id.slice(0, 7)}] Allow up to 12 loaves per order\n 1 file changed, 1 insertion(+), 1 deletion(-)`)
    expect(tip.id).not.toBe(fix.id)
  })

  it('also counts -x and the fix named as main~1', () => {
    expect(play(item, ['git switch release/1.4', 'git cherry-pick -x main~1', 'git push']).session.solved).toBe(true)
  })
})

describe('git-38-tag-a-release', () => {
  const item = level('git-38-tag-a-release')

  it('shows the old tag, and the new one on the released commit, in the log', () => {
    const { steps } = play(item, ['git tag', 'git tag -a v1.4.0 -m "Version 1.4.0: online orders" HEAD~1', 'git log --oneline', 'git push origin v1.4.0'])
    expect(texts(steps)[0]).toBe('v1.3.0')
    expect(texts(steps)[2]).toMatch(/^[0-9a-f]{7} \(HEAD -> main, origin\/main\) Start the Christmas menu page\n[0-9a-f]{7} \(tag: v1\.4\.0\) Add online orders\n[0-9a-f]{7} \(tag: v1\.3\.0\) Add the opening hours page\n/)
    expect(texts(steps)[3]).toBe('To https://git.example.com/team/project.git\n * [new tag]         v1.4.0 -> v1.4.0')
  })

  it('also counts the id, and git push --tags', () => {
    const id = commitsOf(startLevel(item).state, 'main')[1]!.id.slice(0, 7)
    expect(play(item, [`git tag -a v1.4.0 -m "Version 1.4.0: online orders" ${id}`, 'git push --tags']).session.solved).toBe(true)
  })
})

describe('git-39-gitflow-release', () => {
  it('makes a merge commit on main and tags it, and also counts deleting the release branch at the end', () => {
    const item = level('git-39-gitflow-release')
    const { steps } = play(item, item.solution)
    expect(texts(steps)[4]).toContain('Merge made by the \'ort\' strategy.')
    expect(play(item, [...item.solution, 'git branch -d release/1.5']).session.goalsMet).toEqual({ release: true, main: true, tag: true, develop: true })
  })
})

describe('git-practice-list-tags', () => {
  it('also counts git tag -n and -l', () => {
    expect(play(level('git-practice-list-tags'), ['git tag -n']).session.solved).toBe(true)
    expect(play(level('git-practice-list-tags'), ['git tag -l "v1.*"']).session.solved).toBe(true)
  })
})
