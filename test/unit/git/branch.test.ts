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

describe('git branch -m', () => {
  /** On `feature`, which tracks origin/feature. */
  const tracking = () => {
    const state = ok(base(), 'git switch -c feature')
    return { ...state, repo: { ...state.repo!, remoteBranches: { feature: state.repo!.branches.feature! }, upstream: { feature: 'feature' } } }
  }

  it('renames the current branch silently and keeps HEAD on it', () => {
    const state = ok(base(), 'git switch -c feature/galery')
    const tip = state.repo!.branches['feature/galery']
    const { text, last, state: renamed } = exec(state, 'git branch -m feature/gallery')
    expect(last.exitCode).toBe(0)
    expect(text).toBe('')
    expect(renamed.repo!.branches['feature/gallery']).toBe(tip)
    expect(renamed.repo!.branches['feature/galery']).toBeUndefined()
    expect(renamed.repo!.head).toEqual({ type: 'branch', name: 'feature/gallery' })
    expect(renamed.workdir).toEqual(state.workdir)
  })

  it('renames another branch with two names, also spelled --move', () => {
    const state = ok(base(), 'git branch typo')
    const renamed = ok(state, 'git branch -m typo fixed')
    expect(Object.keys(renamed.repo!.branches).sort()).toEqual(['fixed', 'main'])
    expect(renamed.repo!.head).toEqual({ type: 'branch', name: 'main' })
    expect(Object.keys(ok(state, 'git branch --move typo fixed').repo!.branches).sort()).toEqual(['fixed', 'main'])
  })

  it('moves the upstream config along', () => {
    const renamed = ok(tracking(), 'git branch -m feature/better')
    expect(renamed.repo!.upstream).toEqual({ 'feature/better': 'feature' })
    expect(exec(renamed, 'git status').text).toContain('Your branch is up to date with \'origin/feature\'.')
  })

  it('refuses an existing name without -M, and overwrites it with -M', () => {
    const state = ok(base(), 'echo b >> a.txt', 'git commit -am two', 'git branch taken HEAD~1')
    const refused = exec(state, 'git branch -m taken')
    expect(refused.text).toBe('fatal: a branch named \'taken\' already exists')
    expect(refused.last.exitCode).toBe(128)
    const forced = ok(state, 'git branch -M taken')
    expect(forced.repo!.branches.taken).toBe(state.repo!.branches.main)
    expect(forced.repo!.branches.main).toBeUndefined()
    expect(forced.repo!.head).toEqual({ type: 'branch', name: 'taken' })
  })

  it('answers like git for unknown branches, bad names and wrong argument counts (edge cases)', () => {
    expect(exec(base(), 'git branch -m nope other').text).toBe('fatal: no branch named \'nope\'')
    expect(exec(base(), 'git branch -m "bad name"').text).toBe('fatal: \'bad name\' is not a valid branch name')
    expect(exec(base(), 'git branch -m').text).toBe('fatal: branch name required')
    expect(exec(base(), 'git branch -m a b c').text).toBe('fatal: too many arguments for a rename operation')
    expect(exec(ok(base(), 'git switch --detach HEAD'), 'git branch -m x').text).toBe('fatal: cannot rename the current branch while not on any')
  })

  it('refuses to force a rename over the branch you are on (edge case)', () => {
    expect(exec(ok(base(), 'git branch other'), 'git branch -M other main').text)
      .toBe('fatal: cannot force update the branch \'main\' used by worktree at \'/home/you/project\'')
  })

  it('accepts renaming a branch to its own name', () => {
    const { last, state } = exec(base(), 'git branch -m main main')
    expect(last.exitCode).toBe(0)
    expect(state.repo!.head).toEqual({ type: 'branch', name: 'main' })
  })

  it('renames the unborn branch before the first commit', () => {
    const state = ok(createState(), 'git init', 'git branch -m trunk', 'touch a', 'git add a', 'git commit -m one')
    expect(Object.keys(state.repo!.branches)).toEqual(['trunk'])
  })
})

describe('git switch - and checkout -', () => {
  it('goes back to the branch you were on before, and forth again', () => {
    const state = ok(base(), 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f', 'git switch main')
    const back = exec(state, 'git switch -')
    expect(back.text).toBe('Switched to branch \'feature\'')
    expect(back.state.repo!.head).toEqual({ type: 'branch', name: 'feature' })
    expect(back.state.workdir['f.txt']).toBe('f\n')
    const forth = exec(back.state, 'git checkout -')
    expect(forth.text).toBe('Switched to branch \'main\'')
    expect(forth.state.workdir['f.txt']).toBeUndefined()
  })

  it('remembers the previous branch after switch -c and checkout -b', () => {
    expect(ok(base(), 'git switch -c feature', 'git switch -').repo!.head).toEqual({ type: 'branch', name: 'main' })
    expect(ok(base(), 'git checkout -b feature', 'git checkout -').repo!.head).toEqual({ type: 'branch', name: 'main' })
  })

  it('does not count staying on the same branch as a move', () => {
    const state = ok(base(), 'git switch -c feature', 'git switch feature')
    expect(ok(state, 'git switch -').repo!.head).toEqual({ type: 'branch', name: 'main' })
  })

  it('goes back to a detached HEAD with checkout -, and asks for --detach with switch - (edge case)', () => {
    const state = ok(base(), 'echo b >> a.txt', 'git commit -am two', 'git switch --detach HEAD~1', 'git switch main')
    const first = state.repo!.commits[state.repo!.branches.main!]!.parents[0]!
    expect(ok(state, 'git checkout -').repo!.head).toEqual({ type: 'detached', commit: first })
    expect(exec(state, 'git switch -').text).toBe([
      `fatal: a branch is expected, got commit '${first.slice(0, 7)}'`,
      'hint: If you want to detach HEAD at the commit, try again with the --detach option.'
    ].join('\n'))
    expect(ok(state, 'git switch --detach -').repo!.head).toEqual({ type: 'detached', commit: first })
  })

  it('answers like git when there is no previous branch (edge case)', () => {
    const switched = exec(base(), 'git switch -')
    expect(switched.text).toBe('fatal: invalid reference: @{-1}')
    expect(switched.last.exitCode).toBe(128)
    expect(exec(base(), 'git checkout -').text).toBe('error: pathspec \'-\' did not match any file(s) known to git')
  })

  it('answers like git when the previous branch was deleted (edge case)', () => {
    const state = ok(base(), 'git switch -c gone', 'git switch main', 'git branch -d gone')
    expect(exec(state, 'git switch -').text).toBe('fatal: invalid reference: @{-1}')
  })
})
