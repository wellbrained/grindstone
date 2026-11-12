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
  'git-03-merge': { 'on-main': false, 'merged': false },
  'git-04-merge-conflict': { 'merged': false, 'resolved': false, 'merge-commit': false },
  'git-05-rebase': { 'contains-main': false, 'linear': true, 'on-branch': true },
  'git-06-teammate-sync': { 'pushed': false, 'up-to-date': true, 'linear': true, 'resolved': true, 'lease': false }
}

describe('level list', () => {
  it('has the git levels in play order: each scenario, then its practice tasks', () => {
    expect(gitLevels.map(item => item.id)).toEqual(Object.keys(initialGoals))
    expect(levels).toEqual(gitLevels)
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-practice-stage-one-file')
    expect(nextLevel('git-practice-commit-all')?.id).toBe('git-07-stage-together')
    expect(nextLevel('git-practice-ignore-logs')?.id).toBe('git-02-branch')
    expect(nextLevel('git-06-teammate-sync')).toBeNull()
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
  ['git-practice-ignore-logs', 'replaces the .gitignore with >', ['echo "*.log" > .gitignore', 'git commit -am "Ignore log files"'], ['kept']]
]

describe.each(wrongPaths)('%s: %s', (id, _why, lines, failing) => {
  it('is not solved', () => {
    const { session } = play(level(id), lines)
    expect(session.solved).toBe(false)
    expect(Object.entries(session.goalsMet).filter(([, met]) => !met).map(([goal]) => goal).sort()).toEqual([...failing].sort())
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
