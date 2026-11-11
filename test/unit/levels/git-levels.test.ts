import { describe, expect, it } from 'vitest'
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

/** Goals at the very start: false unless trivially true before you do anything (listed explicitly). */
const initialGoals: Record<string, Record<string, boolean>> = {
  'git-01-first-commit': { initialised: false, committed: false, clean: false },
  'git-02-branch': { 'on-branch': false, 'committed': false, 'main-unchanged': true },
  'git-03-merge': { 'on-main': false, 'merged': false },
  'git-04-merge-conflict': { 'merged': false, 'resolved': false, 'merge-commit': false },
  'git-05-rebase': { 'contains-main': false, 'linear': true, 'on-branch': true },
  'git-06-teammate-sync': { 'pushed': false, 'up-to-date': true, 'linear': true, 'resolved': true, 'lease': false }
}

describe('level list', () => {
  it('has the six v0.1 git levels in order', () => {
    expect(gitLevels.map(item => item.id)).toEqual(Object.keys(initialGoals))
    expect(levels).toEqual(gitLevels)
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-02-branch')
    expect(nextLevel('git-06-teammate-sync')).toBeNull()
    expect(levelById('nope')).toBeNull()
  })
})

describe.each(gitLevels.map(item => [item.id, item] as const))('%s', (_id, item) => {
  it('is well-formed', () => {
    expect(item.track).toBe('git')
    expect(item.title).not.toBe('')
    const paragraphs = item.story.split('\n\n')
    expect(paragraphs.length).toBeGreaterThanOrEqual(1)
    expect(paragraphs.length).toBeLessThanOrEqual(3)
    expect(item.hints).toHaveLength(3)
    for (const hint of item.hints) expect(hint.trim()).not.toBe('')
    expect(item.hints[2]).toMatch(/`git /)
    expect(item.debrief.paragraphs.length).toBeGreaterThanOrEqual(2)
    expect(item.debrief.paragraphs.length).toBeLessThanOrEqual(4)
    const goalIds = item.goals.map(goal => goal.id)
    expect(new Set(goalIds).size).toBe(goalIds.length)
    const eventIds = (item.teammates ?? []).map(event => event.id)
    expect(new Set(eventIds).size).toBe(eventIds.length)
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
