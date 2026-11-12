import { describe, expect, it } from 'vitest'
import { createState, repo, run } from '../../../shared/git'
import { exec, ok, textOf } from './helpers'

const base = () => ok(createState(), 'git init', 'echo "line 1" > app.txt', 'echo "line 2" >> app.txt', 'echo "line 3" >> app.txt', 'git add .', 'git commit -m one')

describe('git merge', () => {
  it('says already up to date when the branch is contained (edge case)', () => {
    const state = ok(base(), 'git branch old', 'echo x > x.txt', 'git add .', 'git commit -m two')
    const { text, state: after } = exec(state, 'git merge old')
    expect(text).toBe('Already up to date.')
    expect(after.repo!.branches.main).toBe(state.repo!.branches.main)
  })

  it('fast-forwards when HEAD is behind (edge case)', () => {
    const state = ok(base(), 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f', 'git switch main')
    const from = state.repo!.branches.main!
    const to = state.repo!.branches.feature!
    const { text, state: after } = exec(state, 'git merge feature')
    expect(text).toBe([
      `Updating ${from.slice(0, 7)}..${to.slice(0, 7)}`,
      'Fast-forward',
      ' f.txt | 1 +',
      ' 1 file changed, 1 insertion(+)',
      ' create mode 100644 f.txt'
    ].join('\n'))
    expect(after.repo!.branches.main).toBe(to)
    expect(after.workdir['f.txt']).toBe('f\n')
  })

  it('creates a merge commit when both sides moved (edge case)', () => {
    const state = ok(base(),
      'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f',
      'git switch main', 'echo m > m.txt', 'git add .', 'git commit -m m'
    )
    const { text, state: after } = exec(state, 'git merge feature')
    expect(text).toBe('Merge made by the \'ort\' strategy.\n f.txt | 1 +\n 1 file changed, 1 insertion(+)\n create mode 100644 f.txt')
    const merge = after.repo!.commits[after.repo!.branches.main!]!
    expect(merge.parents).toEqual([state.repo!.branches.main, state.repo!.branches.feature])
    expect(merge.message).toBe('Merge branch \'feature\'')
    expect(after.workdir).toEqual({ 'app.txt': 'line 1\nline 2\nline 3\n', 'f.txt': 'f\n', 'm.txt': 'm\n' })
  })

  it('creates a merge commit with --no-ff and refuses with --ff-only', () => {
    const state = ok(base(), 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f', 'git switch main')
    const noFf = ok(state, 'git merge --no-ff feature')
    expect(noFf.repo!.commits[noFf.repo!.branches.main!]!.parents).toHaveLength(2)
    const diverged = ok(state, 'echo m > m.txt', 'git add .', 'git commit -m m')
    expect(exec(diverged, 'git merge --ff-only feature').text).toBe('fatal: Not possible to fast-forward, aborting.')
  })

  it('stops on a conflict, then add and commit conclude the merge (edge case)', () => {
    const state = ok(base(),
      'git switch -c feature', 'echo "line 1" > app.txt', 'echo "feature line" >> app.txt', 'echo "line 3" >> app.txt', 'git commit -am f',
      'git switch main', 'echo "line 1" > app.txt', 'echo "main line" >> app.txt', 'echo "line 3" >> app.txt', 'git commit -am m'
    )
    const conflicted = exec(state, 'git merge feature')
    expect(conflicted.text).toBe([
      'Auto-merging app.txt',
      'CONFLICT (content): Merge conflict in app.txt',
      'Automatic merge failed; fix conflicts and then commit the result.'
    ].join('\n'))
    expect(conflicted.last.exitCode).toBe(1)
    expect(conflicted.state.workdir['app.txt']).toBe('line 1\n<<<<<<< HEAD\nmain line\n=======\nfeature line\n>>>>>>> feature\nline 3\n')

    const status = exec(conflicted.state, 'git status').text
    expect(status).toBe([
      'On branch main',
      'You have unmerged paths.',
      '  (fix conflicts and run "git commit")',
      '  (use "git merge --abort" to abort the merge)',
      '',
      'Unmerged paths:',
      '  (use "git add <file>..." to mark resolution)',
      '\tboth modified:   app.txt',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")'
    ].join('\n'))

    expect(exec(conflicted.state, 'git commit -m done').text).toBe([
      'error: Committing is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add/rm <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.'
    ].join('\n'))

    const resolved = ok(conflicted.state, 'echo "line 1" > app.txt', 'echo "both lines" >> app.txt', 'echo "line 3" >> app.txt', 'git add app.txt')
    expect(exec(resolved, 'git status').text).toContain('All conflicts fixed but you are still merging.\n  (use "git commit" to conclude merge)')
    const { state: done, text } = exec(resolved, 'git commit')
    const merge = done.repo!.commits[done.repo!.branches.main!]!
    expect(text).toBe(`[main ${merge.id.slice(0, 7)}] Merge branch 'feature'`)
    expect(merge.parents).toHaveLength(2)
    expect(merge.tree['app.txt']).toBe('line 1\nboth lines\nline 3\n')
    expect(done.repo!.operation).toBeNull()
  })

  it('aborts a conflicted merge and restores the previous state', () => {
    const state = ok(base(),
      'git switch -c feature', 'echo feature > app.txt', 'git commit -am f',
      'git switch main', 'echo main > app.txt', 'git commit -am m'
    )
    const conflicted = exec(state, 'git merge feature').state
    const aborted = ok(conflicted, 'git merge --abort')
    expect(aborted.workdir).toEqual(state.workdir)
    expect(aborted.repo!.index).toEqual(state.repo!.index)
    expect(aborted.repo!.operation).toBeNull()
    expect(aborted.repo!.unmerged).toEqual({})
    expect(exec(state, 'git merge --abort').text).toBe('fatal: There is no merge to abort (MERGE_HEAD missing).')
  })

  it('refuses to merge over local changes and unknown refs', () => {
    const state = ok(base(), 'git switch -c feature', 'echo f > app.txt', 'git commit -am f', 'git switch main', 'echo local > app.txt')
    expect(textOf(run(state, 'git merge feature'))).toContain('error: Your local changes to the following files would be overwritten by merge:\n\tapp.txt')
    expect(exec(base(), 'git merge nope').text).toBe('merge: nope - not something we can merge')
  })
})

describe('setup builder merge', () => {
  const diverged = () => repo()
    .file('app.txt', 'base')
    .commit('one')
    .switch('feature', { create: true })
    .file('app.txt', 'feature')
    .commit('f')
    .switch('main')

  it('can start a level inside a conflicted merge', () => {
    const state = diverged().file('app.txt', 'main').commit('m').merge('feature', { conflicts: true }).build()
    expect(state.repo!.operation?.type).toBe('merge')
    expect(state.repo!.unmerged).toEqual({ 'app.txt': 'both modified' })
  })

  it('throws when the merge was expected to conflict but did not, and when a plain merge conflicts', () => {
    expect(() => diverged().merge('feature', { conflicts: true })).toThrow('was expected to stop with conflicts')
    expect(() => diverged().file('app.txt', 'main').commit('m').merge('feature')).toThrow('setup step "git merge feature" failed')
  })
})
