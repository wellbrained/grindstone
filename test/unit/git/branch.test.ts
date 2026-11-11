import { describe, expect, it } from 'vitest'
import { createState } from '../../../shared/git'
import { exec, ok } from './helpers'

const base = () => ok(createState(), 'git init', 'echo a > a.txt', 'git add .', 'git commit -m one')

describe('git branch', () => {
  it('lists branches with the current one marked', () => {
    const { text, last } = exec(base(), 'git branch feature/login', 'git branch bugfix', 'git branch')
    expect(text).toBe('  bugfix\n  feature/login\n* main')
    expect(last.output[2]!.refs).toEqual([{ start: 2, end: 6, ref: 'main' }])
  })

  it('creates a branch at HEAD or at a start point', () => {
    const state = ok(base(), 'echo b >> a.txt', 'git commit -am two', 'git branch old HEAD~1', 'git branch new')
    const repo = state.repo!
    expect(repo.branches.new).toBe(repo.branches.main)
    expect(repo.branches.old).toBe(repo.commits[repo.branches.main!]!.parents[0])
  })

  it('rejects duplicate and invalid names', () => {
    expect(exec(base(), 'git branch main').text).toBe('fatal: a branch named \'main\' already exists')
    expect(exec(base(), 'git branch "bad name"').text).toBe('fatal: \'bad name\' is not a valid branch name')
    expect(exec(ok(createState(), 'git init'), 'git branch x').text).toBe('fatal: not a valid object name: \'main\'')
  })

  it('deletes merged branches and protects unmerged ones', () => {
    const state = ok(base(), 'git branch done')
    const deleted = exec(state, 'git branch -d done')
    expect(deleted.text).toBe(`Deleted branch done (was ${state.repo!.branches.done!.slice(0, 7)}).`)
    expect(deleted.state.repo!.branches.done).toBeUndefined()

    const unmerged = ok(state, 'git switch -c wip', 'echo w > w.txt', 'git add .', 'git commit -m wip', 'git switch main')
    expect(exec(unmerged, 'git branch -d wip').text).toBe('error: the branch \'wip\' is not fully merged\nhint: If you are sure you want to delete it, run \'git branch -D wip\'')
    expect(ok(unmerged, 'git branch -D wip').repo!.branches.wip).toBeUndefined()
    expect(exec(state, 'git branch -d nope').text).toBe('error: branch \'nope\' not found')
  })

  it('refuses to delete the current branch (edge case)', () => {
    const { text, last, state } = exec(base(), 'git branch -d main')
    expect(text).toBe('error: cannot delete branch \'main\' used by worktree at \'/home/you/project\'')
    expect(last.exitCode).toBe(1)
    expect(state.repo!.branches.main).toBeDefined()
  })

  it('lists remote-tracking branches with -r and -a', () => {
    const state = ok(base(), 'git branch feature')
    const withRemote = { ...state, repo: { ...state.repo!, remoteBranches: { main: state.repo!.branches.main! } } }
    expect(exec(withRemote, 'git branch -r').text).toBe('  origin/main')
    expect(exec(withRemote, 'git branch -a').text).toBe('  feature\n* main\n  remotes/origin/main')
  })
})

describe('git switch and checkout', () => {
  it('switches branches and updates the working tree', () => {
    const state = ok(base(), 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m feature')
    const { text, state: back } = exec(state, 'git switch main')
    expect(text).toBe('Switched to branch \'main\'')
    expect(back.workdir).toEqual({ 'a.txt': 'a\n' })
    expect(ok(back, 'git checkout feature').workdir['f.txt']).toBe('f\n')
  })

  it('creates branches with switch -c and checkout -b', () => {
    expect(exec(base(), 'git switch -c feature').text).toBe('Switched to a new branch \'feature\'')
    expect(ok(base(), 'git checkout -b feature').repo!.head).toEqual({ type: 'branch', name: 'feature' })
    expect(exec(base(), 'git switch -c main').text).toBe('fatal: a branch named \'main\' already exists')
  })

  it('says when you are already on the branch and when it does not exist', () => {
    expect(exec(base(), 'git switch main').text).toBe('Already on \'main\'')
    expect(exec(base(), 'git switch nope').text).toBe('fatal: invalid reference: nope')
    expect(exec(base(), 'git checkout nope').text).toBe('error: pathspec \'nope\' did not match any file(s) known to git')
  })

  it('carries uncommitted changes that do not collide', () => {
    const state = ok(base(), 'git branch other', 'echo more >> a.txt', 'touch new.txt')
    const { state: switched, text } = exec(state, 'git switch other')
    expect(text).toBe('M\ta.txt\nSwitched to branch \'other\'')
    expect(switched.workdir).toEqual({ 'a.txt': 'a\nmore\n', 'new.txt': '' })
  })

  it('refuses to switch when local changes would be overwritten (edge case)', () => {
    const state = ok(base(), 'git switch -c other', 'echo other > a.txt', 'git commit -am other', 'git switch main', 'echo local > a.txt')
    const { text, last, state: after } = exec(state, 'git switch other')
    expect(text).toBe([
      'error: Your local changes to the following files would be overwritten by checkout:',
      '\ta.txt',
      'Please commit your changes or stash them before you switch branches.',
      'Aborting'
    ].join('\n'))
    expect(last.exitCode).toBe(1)
    expect(after.repo!.head).toEqual({ type: 'branch', name: 'main' })
    expect(after.workdir['a.txt']).toBe('local\n')
  })

  it('refuses to overwrite untracked files', () => {
    const state = ok(base(), 'git switch -c other', 'echo o > o.txt', 'git add .', 'git commit -m o', 'git switch main', 'echo mine > o.txt')
    expect(exec(state, 'git switch other').text).toBe([
      'error: The following untracked working tree files would be overwritten by checkout:',
      '\to.txt',
      'Please move or remove them before you switch branches.',
      'Aborting'
    ].join('\n'))
  })

  it('detaches HEAD when checking out a commit', () => {
    const state = ok(base(), 'echo b >> a.txt', 'git commit -am two')
    const first = state.repo!.commits[state.repo!.branches.main!]!.parents[0]!
    const { state: detached, text } = exec(state, `git checkout ${first.slice(0, 7)}`)
    expect(detached.repo!.head).toEqual({ type: 'detached', commit: first })
    expect(text).toContain(`HEAD is now at ${first.slice(0, 7)} one`)
    expect(exec(detached, 'git status').text).toContain(`HEAD detached at ${first.slice(0, 7)}`)
    expect(exec(detached, 'git branch').text).toBe(`* (HEAD detached at ${first.slice(0, 7)})\n  main`)
  })

  it('restores a file from the index with checkout --', () => {
    const state = ok(base(), 'echo broken > a.txt')
    const { state: restored, text } = exec(state, 'git checkout -- a.txt')
    expect(text).toBe('Updated 1 path from the index')
    expect(restored.workdir['a.txt']).toBe('a\n')
  })

  it('renames the unborn branch with switch -c before the first commit', () => {
    const state = ok(createState(), 'git init', 'git switch -c trunk', 'touch a', 'git add a', 'git commit -m one')
    expect(Object.keys(state.repo!.branches)).toEqual(['trunk'])
  })
})
