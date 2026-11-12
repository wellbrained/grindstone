import { describe, expect, it } from 'vitest'
import { commitsOf, createState, operationInProgress, resolve, submitEditor, waitingEditor } from '../../../shared/git'
import type { GitState } from '../../../shared/git'
import { deepFreeze, exec, ok } from './helpers'

/** main and f both change a.txt, so merging, picking or rebasing one onto the other conflicts. */
const diverged = () => ok(createState(),
  'git init', 'echo base > a.txt', 'git add .', 'git commit -m base', 'git branch f',
  'echo main > a.txt', 'git commit -am "main change"',
  'git switch f', 'echo f > a.txt', 'git commit -am "f change"', 'git switch main')

const short = (state: GitState, rev: string) => resolve(state, rev)!.slice(0, 7)

describe('stash during a merge or cherry-pick (review item 1)', () => {
  it('ends a merge like the hard reset real git does', () => {
    const conflicted = exec(diverged(), 'git merge f').state
    expect(operationInProgress(conflicted)).toBe('merge')
    const stashed = ok(conflicted, 'echo resolved > a.txt', 'git add a.txt', 'git stash')
    expect(stashed.repo!.operation).toBeNull()
    expect(stashed.repo!.unmerged).toEqual({})
    const commit = exec(stashed, 'git commit -m done')
    expect(commit.text).toContain('nothing to commit')
    expect(commit.last.exitCode).toBe(1)
    expect(commitsOf(commit.state, 'HEAD')[0]!.parents).toHaveLength(1)
  })

  it('ends a stopped cherry-pick; with picks still waiting git keeps the sequence going', () => {
    const state = ok(diverged(), 'git switch f', 'echo more > more.txt', 'git add .', 'git commit -m more', 'git switch main')
    const single = exec(state, 'git cherry-pick f~1').state
    expect(operationInProgress(single)).toBe('cherry-pick')
    const stashed = ok(single, 'echo resolved > a.txt', 'git add a.txt', 'git stash')
    expect(operationInProgress(stashed)).toBeNull()
    expect(stashed.repo!.unmerged).toEqual({})
    expect(exec(stashed, 'git commit -m done').text).toContain('nothing to commit')

    const several = exec(state, 'git cherry-pick f~1 f').state
    const parked = ok(several, 'echo resolved > a.txt', 'git add a.txt', 'git stash')
    expect(operationInProgress(parked)).toBe('cherry-pick')
    expect(exec(parked, 'git status').text).toContain('Cherry-pick currently in progress.')
    expect(exec(parked, 'git commit -m done').text).toContain('nothing to commit')
  })
})

describe('names that exist on Object.prototype (review item 2)', () => {
  const names = ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']
  const state = diverged()

  it('git reflog <name> is an unknown revision, never a crash', () => {
    for (const name of names) {
      const result = exec(state, `git reflog ${name}`)
      expect(result.last.exitCode, name).toBe(128)
      expect(result.text, name).toContain(`fatal: ambiguous argument '${name}'`)
    }
  })

  it('git switch <name> says the reference is invalid', () => {
    for (const name of names) {
      const result = exec(state, `git switch ${name}`)
      expect(result.last.exitCode, name).not.toBe(0)
      expect(result.text, name).toContain(name)
      expect(result.state, name).toBe(state)
    }
  })

  it('git branch <name> creates the branch once, then reports it exists', () => {
    for (const name of names) {
      const created = exec(state, `git branch ${name}`)
      expect(created.last.exitCode, name).toBe(0)
      expect(resolve(created.state, name), name).toBe(resolve(state, 'HEAD'))
      const again = exec(created.state, `git branch ${name}`)
      expect(again.last.exitCode, name).not.toBe(0)
      expect(again.text, name).toContain('already exists')
    }
    // an unknown name must not look like an existing branch when deleting or renaming either
    for (const name of names) {
      expect(exec(state, `git branch -d ${name}`).last.exitCode, name).not.toBe(0)
      expect(exec(state, `git branch -m ${name} other`).last.exitCode, name).not.toBe(0)
    }
  })

  it('other revision arguments do not resolve prototype members', () => {
    for (const name of names) {
      expect(resolve(state, name), name).toBeNull()
      expect(exec(state, `git log ${name}`).last.exitCode, name).not.toBe(0)
      expect(exec(state, `git merge ${name}`).last.exitCode, name).not.toBe(0)
      expect(exec(state, `git tag ${name}`).last.exitCode, name).toBe(0)
      expect(exec(state, `git reflog ${name}@{0}`).last.exitCode, name).not.toBe(0)
    }
  })
})

describe('file names that exist on Object.prototype (review item 2)', () => {
  it('shell commands treat them like any other missing or created file', () => {
    const state = diverged()
    for (const name of ['toString', 'constructor', '__proto__']) {
      expect(exec(state, `cat ${name}`).text).toBe(`cat: ${name}: No such file or directory`)
      expect(exec(state, `rm ${name}`).last.exitCode).toBe(1)
      const appended = ok(state, `echo hi >> ${name}`, `echo there >> ${name}`)
      expect(exec(appended, `cat ${name}`).text).toBe('hi\nthere')
      expect(Object.keys(ok(state, `touch ${name}`).workdir)).toContain(name)
      expect(exec(ok(state, `echo x > ${name}`), `git add ${name}`).last.exitCode).toBe(0)
    }
  })
})

describe('--abort keeps untracked files (review item 3)', () => {
  const withUntracked = (conflicted: GitState) => ok(conflicted, 'echo mine > scratch.txt')

  it('merge', () => {
    const state = diverged()
    const aborted = ok(withUntracked(exec(state, 'git merge f').state), 'git merge --abort')
    expect(aborted.workdir).toEqual({ ...state.workdir, 'scratch.txt': 'mine\n' })
    expect(aborted.repo!.operation).toBeNull()
  })

  it('cherry-pick', () => {
    const state = diverged()
    const aborted = ok(withUntracked(exec(state, 'git cherry-pick f').state), 'git cherry-pick --abort')
    expect(aborted.workdir).toEqual({ ...state.workdir, 'scratch.txt': 'mine\n' })
    expect(operationInProgress(aborted)).toBeNull()
  })

  it('rebase', () => {
    const state = ok(diverged(), 'git switch f')
    const aborted = ok(withUntracked(exec(state, 'git rebase main').state), 'git rebase --abort')
    expect(aborted.workdir).toEqual({ ...state.workdir, 'scratch.txt': 'mine\n' })
    expect(operationInProgress(aborted)).toBeNull()
  })

  it('still removes files the operation itself brought in', () => {
    const state = ok(diverged(), 'git switch f', 'echo new > extra.txt', 'git add .', 'git commit -m extra', 'git switch main')
    const conflicted = exec(state, 'git merge f').state
    expect(conflicted.workdir['extra.txt']).toBe('new\n')
    const aborted = ok(conflicted, 'git merge --abort')
    expect(aborted.workdir).toEqual(state.workdir)
  })
})

describe('cherry-pick with three dots (review item 5)', () => {
  it('says it is not in the trainer yet instead of a bad revision', () => {
    const state = diverged()
    const result = exec(state, 'git cherry-pick main...f')
    expect(result.last.exitCode).not.toBe(0)
    expect(result.text).toContain('not in this trainer yet')
    expect(result.text).not.toContain('bad revision')
    expect(result.state).toBe(state)
  })
})

describe('rebase -i squash whose conflict is resolved to HEAD (review item 6)', () => {
  const state = ok(createState(),
    'git init', 'echo base > a.txt', 'git add .', 'git commit -m base',
    'git switch -c feature',
    'echo A > b.txt', 'git add .', 'git commit -m A',
    'echo B > c.txt', 'git add .', 'git commit -m B',
    'echo f > a.txt', 'git commit -am C',
    'git switch main', 'echo m > a.txt', 'git commit -am M', 'git switch feature')

  it('still opens the combined message of the squashes already melded in', () => {
    const waiting = exec(state, 'git rebase -i main').state
    const todo = [`pick ${short(state, 'feature~2')}`, `squash ${short(state, 'feature~1')}`, `squash ${short(state, 'feature')}`].join('\n')
    const stopped = submitEditor(deepFreeze(waiting), todo)
    expect(stopped.exitCode).toBe(1)
    const resolved = ok(stopped.state, 'echo m > a.txt', 'git add a.txt')
    const continued = exec(resolved, 'git rebase --continue')
    expect(continued.last.exitCode).toBe(0)
    const editor = waitingEditor(continued.state)!
    expect(editor.kind).toBe('message')
    expect(editor.text.startsWith('# This is a combination of 2 commits.\n# This is the 1st commit message:\n\nA\n\n# This is the commit message #2:\n\nB\n')).toBe(true)
    const finished = submitEditor(deepFreeze(continued.state), 'A and B\n')
    expect(finished.exitCode).toBe(0)
    expect(commitsOf(finished.state, 'main..feature').map(commit => commit.message)).toEqual(['A and B'])
  })
})
