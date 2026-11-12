import { describe, expect, it } from 'vitest'
import { commitsOf, createState, repo, resolve, teammateCommit } from '../../../shared/git'
import type { GitState } from '../../../shared/git'
import { exec, ok } from './helpers'

const short = (state: GitState, rev: string) => resolve(state, rev)!.slice(0, 7)
/** The messages of a log, newest first. */
const messages = (state: GitState, name = 'HEAD') => (state.repo!.reflog?.[name] ?? []).map(entry => entry.message)

/** a.txt in "one", changed in "two", on main. */
const base = () => ok(createState(), 'git init', 'echo a > a.txt', 'git add .', 'git commit -m one', 'echo b >> a.txt', 'git commit -am two')

describe('git reflog', () => {
  it('lists every move of HEAD, newest first, with git\'s messages and decorations', () => {
    const state = ok(base(), 'git commit --amend -m "two, better"')
    const { text, last } = exec(state, 'git reflog')
    expect(text).toBe([
      `${short(state, 'HEAD')} (HEAD -> main) HEAD@{0}: commit (amend): two, better`,
      `${short(state, 'HEAD@{1}')} HEAD@{1}: commit: two`,
      `${short(state, 'HEAD~1')} HEAD@{2}: commit (initial): one`
    ].join('\n'))
    expect(last.output[0]!.refs).toEqual([{ start: 9, end: 13, ref: 'HEAD' }, { start: 17, end: 21, ref: 'main' }])
  })

  it('shows a branch\'s own log with `show <branch>` or the name, and a limit with -n', () => {
    const state = ok(base(), 'git switch -c feature', 'echo c > c.txt', 'git add .', 'git commit -m three', 'git switch main')
    expect(exec(state, 'git reflog show feature').text).toBe([
      `${short(state, 'feature')} (feature) feature@{0}: commit: three`,
      `${short(state, 'main')} (HEAD -> main) feature@{1}: branch: Created from HEAD`
    ].join('\n'))
    expect(exec(state, 'git reflog feature').text).toBe(exec(state, 'git reflog show feature').text)
    expect(exec(state, 'git reflog -n 2').text.split('\n')).toEqual([
      `${short(state, 'main')} (HEAD -> main) HEAD@{0}: checkout: moving from feature to main`,
      `${short(state, 'feature')} (feature) HEAD@{1}: commit: three`
    ])
    expect(exec(state, 'git reflog -1').text.split('\n')).toHaveLength(1)
    expect(messages(state, 'main')).toEqual(['commit: two', 'commit (initial): one'])
  })

  it('answers like git for an unknown ref, before the first commit and for other subcommands', () => {
    expect(exec(base(), 'git reflog show nope').text).toBe([
      'fatal: ambiguous argument \'nope\': unknown revision or path not in the working tree.',
      'Use \'--\' to separate paths from revisions, like this:',
      '\'git <command> [<revision>...] -- [<file>...]\''
    ].join('\n'))
    expect(exec(ok(createState(), 'git init'), 'git reflog').text).toBe('fatal: your current branch \'main\' does not have any commits yet')
    expect(exec(base(), 'git reflog expire --all').text).toBe('git reflog expire is not in this trainer yet')
    expect(exec(createState(), 'git reflog').last.exitCode).toBe(128)
  })

  it('records reset, and HEAD@{n} brings a commit back that reset --hard dropped', () => {
    const dropped = ok(base(), 'git reset --hard HEAD~1')
    expect(messages(dropped)[0]).toBe('reset: moving to HEAD~1')
    expect(messages(dropped, 'main')[0]).toBe('reset: moving to HEAD~1')
    // the commit is gone from log --all and the graph's refs, but the reflog still knows it
    expect(exec(dropped, 'git log --oneline --all').text.split('\n')).toHaveLength(1)
    expect(resolve(dropped, 'HEAD@{1}')).toBe(resolve(base(), 'main'))
    const { state: back, text } = exec(dropped, 'git reset --hard HEAD@{1}')
    expect(text).toBe(`HEAD is now at ${short(base(), 'main')} two`)
    expect(back.workdir['a.txt']).toBe('a\nb\n')
    expect(messages(back)[0]).toBe('reset: moving to HEAD@{1}')
  })

  it('sets ORIG_HEAD on reset, merge and rebase', () => {
    const reset = ok(base(), 'git reset --hard HEAD~1')
    expect(resolve(reset, 'ORIG_HEAD')).toBe(resolve(base(), 'main'))
    expect(resolve(ok(reset, 'git reset --hard ORIG_HEAD'), 'main')).toBe(resolve(base(), 'main'))
    expect(resolve(base(), 'ORIG_HEAD')).toBeNull()
    expect(exec(base(), 'git reset ORIG_HEAD').last.exitCode).toBe(128)
  })

  it('resolves HEAD@{n}, <branch>@{n} and @{n} wherever a revision goes', () => {
    const state = ok(base(), 'git switch -c feature', 'git switch main')
    expect(resolve(state, 'HEAD@{0}')).toBe(resolve(state, 'HEAD'))
    expect(resolve(state, 'main@{1}')).toBe(resolve(state, 'main~1'))
    expect(resolve(state, '@{1}')).toBe(resolve(state, 'main~1'))
    expect(resolve(state, 'HEAD@{2}~1')).toBe(resolve(state, 'main~1'))
    expect(resolve(state, 'HEAD@{9}')).toBeNull()
    expect(resolve(state, 'nope@{0}')).toBeNull()
    expect(exec(state, 'git log --oneline main@{1}').text).toBe(`${short(state, 'main~1')} one`)
    expect(exec(state, 'git branch old main@{1}').state.repo!.branches.old).toBe(resolve(state, 'main~1'))
    expect(exec(state, 'git switch --detach HEAD@{3}').last.exitCode).toBe(0)
  })

  it('records switch and checkout with where HEAD came from, and new branches in their own log', () => {
    const state = ok(base(), 'git switch -c feature', 'git checkout HEAD~1', 'git checkout -b fix')
    const detached = resolve(state, 'main~1')!
    expect(messages(state).slice(0, 3)).toEqual([
      `checkout: moving from ${detached} to fix`,
      'checkout: moving from feature to HEAD~1',
      'checkout: moving from main to feature'
    ])
    expect(messages(state, 'fix')).toEqual(['branch: Created from HEAD'])
    expect(messages(ok(base(), 'git branch old HEAD~1'), 'old')).toEqual(['branch: Created from HEAD~1'])
    // "Already on" moves nothing, but git still writes an entry
    expect(messages(ok(base(), 'git switch main'))).toEqual(['checkout: moving from main to main', ...messages(base())])
  })

  it('records merges as fast-forward or with the strategy, and a concluded conflict as commit (merge)', () => {
    const forked = ok(base(), 'git switch -c feature', 'echo c > c.txt', 'git add .', 'git commit -m three', 'git switch main')
    expect(messages(ok(forked, 'git merge feature'))[0]).toBe('merge feature: Fast-forward')
    const both = ok(forked, 'echo d > d.txt', 'git add .', 'git commit -m four', 'git merge feature')
    expect(messages(both)[0]).toBe('merge feature: Merge made by the \'ort\' strategy.')
    expect(messages(both, 'main')[0]).toBe('merge feature: Merge made by the \'ort\' strategy.')
    expect(resolve(both, 'ORIG_HEAD')).toBe(resolve(both, 'main^1'))
    const conflicted = ok(base(), 'git switch -c side', 'echo x > a.txt', 'git commit -am side', 'git switch main', 'echo y > a.txt', 'git commit -am mine')
    const merged = ok(exec(conflicted, 'git merge side').state, 'echo z > a.txt', 'git add a.txt', 'git commit --no-edit')
    expect(messages(merged)[0]).toBe('commit (merge): Merge branch \'side\'')
  })

  it('records a rebase step by step in HEAD\'s log and its finish in the branch\'s log', () => {
    const forked = ok(base(), 'git switch -c feature', 'echo c > c.txt', 'git add .', 'git commit -m three', 'git switch main', 'echo d > d.txt', 'git add .', 'git commit -m four', 'git switch feature')
    const before = resolve(forked, 'feature')
    const rebased = ok(forked, 'git rebase main')
    expect(messages(rebased).slice(0, 3)).toEqual([
      'rebase (finish): returning to refs/heads/feature',
      'rebase (pick): three',
      'rebase (start): checkout main'
    ])
    expect(messages(rebased, 'feature')[0]).toBe(`rebase (finish): refs/heads/feature onto ${resolve(forked, 'main')}`)
    expect(resolve(rebased, 'feature@{1}')).toBe(before)
    expect(resolve(rebased, 'ORIG_HEAD')).toBe(before)
    // going back with the reflog undoes the rebase
    expect(resolve(ok(rebased, 'git reset --hard ORIG_HEAD'), 'feature')).toBe(before)
    expect(resolve(ok(rebased, 'git reset --hard HEAD@{3}'), 'feature')).toBe(before)
  })

  it('records an aborted rebase\'s way back, and pull with its command line', () => {
    const forked = ok(base(), 'git switch -c side', 'echo x > a.txt', 'git commit -am side', 'git switch main', 'echo y > a.txt', 'git commit -am mine')
    const aborted = ok(exec(forked, 'git rebase side').state, 'git rebase --abort')
    expect(messages(aborted).slice(0, 2)).toEqual(['rebase (abort): returning to refs/heads/main', 'rebase (start): checkout side'])

    const cloned = repo().file('a.txt', 'a').commit('one').origin().build()
    const pushed = teammateCommit(cloned, { author: 'Anna', message: 'From Anna', files: { 'b.txt': 'b\n' } })
    expect(messages(ok(pushed, 'git pull'))[0]).toBe('pull: Fast-forward')
    const rebased = ok(pushed, 'echo c > c.txt', 'git add .', 'git commit -m mine', 'git pull --rebase')
    const anna = resolve(rebased, 'origin/main')!
    expect(messages(rebased).slice(0, 3)).toEqual(['pull --rebase (finish): returning to refs/heads/main', 'pull --rebase (pick): mine', `pull --rebase (start): checkout ${anna}`])
  })

  it('records revert, stash and branch renames; deleting a branch deletes its log, HEAD\'s keeps its commits', () => {
    expect(messages(ok(base(), 'git revert HEAD'))[0]).toBe('revert: Revert "two"')
    expect(messages(ok(base(), 'echo c >> a.txt', 'git stash'))[0]).toBe('reset: moving to HEAD')
    const renamed = ok(base(), 'git branch -m trunk')
    expect(messages(renamed)[0]).toBe('Branch: renamed refs/heads/main to refs/heads/trunk')
    expect(messages(renamed, 'trunk')).toEqual(['Branch: renamed refs/heads/main to refs/heads/trunk', 'commit: two', 'commit (initial): one'])
    expect(renamed.repo!.reflog!.main).toBeUndefined()

    const worked = ok(base(), 'git switch -c idea', 'echo i > i.txt', 'git add .', 'git commit -m idea', 'git switch main')
    const tip = resolve(worked, 'idea')!
    const deleted = exec(worked, 'git branch -D idea')
    expect(deleted.text).toBe(`Deleted branch idea (was ${tip.slice(0, 7)}).`)
    expect(exec(deleted.state, 'git reflog show idea').last.exitCode).toBe(128)
    expect(resolve(deleted.state, 'idea@{0}')).toBeNull()
    expect(commitsOf(deleted.state, 'HEAD@{1}')[0]!.id).toBe(tip)
    expect(resolve(ok(deleted.state, 'git branch idea HEAD@{1}'), 'idea')).toBe(tip)
  })

  it('is recorded by the setup builder too, so a level can start with a realistic reflog', () => {
    const state = repo().file('a.txt', 'a').commit('one').file('a.txt', 'b').commit('two').run('git reset --hard HEAD~1').build()
    expect(messages(state)).toEqual(['reset: moving to HEAD~1', 'commit: two', 'commit (initial): one'])
  })
})
