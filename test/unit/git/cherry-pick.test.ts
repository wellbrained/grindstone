import { describe, expect, it } from 'vitest'
import { commitsOf, operationInProgress, repo, resolve, unmergedPaths } from '../../../shared/git'
import { exec, ok } from './helpers'

const short = (id: string | null | undefined) => id!.slice(0, 7)

/** main: base, then a fix and a feature on main; release/1.4 branched off before both. */
const releaseRepo = () => repo()
  .file('app.txt', 'title\nbody\nfooter\n')
  .file('notes.txt', 'notes\n')
  .commit('Initial commit')
  .branch('release/1.4')
  .file('app.txt', 'title\nbody fixed\nfooter\n')
  .commit('Fix the body', { author: 'Jonas' })
  .file('new.txt', 'new feature\n')
  .commit('Add the new feature')
  .switch('release/1.4')
  .build()

describe('git cherry-pick', () => {
  it('copies one commit onto HEAD with its message and author, like git', () => {
    const state = releaseRepo()
    const fix = resolve(state, 'main~1')!
    const { state: picked, last, text } = exec(state, `git cherry-pick ${short(fix)}`)
    const tip = commitsOf(picked, 'release/1.4')[0]!
    expect(last.exitCode).toBe(0)
    expect(text).toBe(`[release/1.4 ${short(tip.id)}] Fix the body\n 1 file changed, 1 insertion(+), 1 deletion(-)`)
    expect(tip.id).not.toBe(fix)
    expect(tip.message).toBe('Fix the body')
    expect(tip.author.name).toBe('Jonas')
    expect(tip.parents).toEqual([resolve(state, 'release/1.4')])
    expect(tip.tree).toEqual({ 'app.txt': 'title\nbody fixed\nfooter\n', 'notes.txt': 'notes\n' })
    expect(picked.workdir['new.txt']).toBeUndefined()
    expect(picked.repo!.reflog!.HEAD![0]!.message).toBe('cherry-pick: Fix the body')
    expect(picked.repo!.reflog!['release/1.4']![0]!.message).toBe('cherry-pick: Fix the body')
    expect(operationInProgress(picked)).toBeNull()
  })

  it('picks several commits in order, also as a range', () => {
    const state = releaseRepo()
    const listed = ok(state, 'git cherry-pick main~1 main')
    expect(commitsOf(listed, 'release/1.4').map(commit => commit.message).slice(0, 2)).toEqual(['Add the new feature', 'Fix the body'])
    const ranged = ok(state, 'git cherry-pick main~2..main')
    expect(commitsOf(ranged, 'release/1.4').map(commit => commit.message)).toEqual(['Add the new feature', 'Fix the body', 'Initial commit'])
  })

  it('appends where the commit came from with -x', () => {
    const state = releaseRepo()
    const fix = resolve(state, 'main~1')!
    const picked = ok(state, 'git cherry-pick -x main~1')
    expect(commitsOf(picked, 'HEAD')[0]!.message).toBe(`Fix the body\n\n(cherry picked from commit ${fix})`)
  })

  it('applies the change without committing with -n', () => {
    const state = releaseRepo()
    const { state: applied, text } = exec(state, 'git cherry-pick -n main~1')
    expect(text).toBe('')
    expect(resolve(applied, 'HEAD')).toBe(resolve(state, 'HEAD'))
    expect(applied.repo!.index['app.txt']).toBe('title\nbody fixed\nfooter\n')
    expect(exec(applied, 'git status -s').text).toBe('M  app.txt')
  })

  it('refuses bad revisions, merge commits, staged changes and no arguments', () => {
    const state = releaseRepo()
    expect(exec(state, 'git cherry-pick nope').text).toBe('fatal: bad revision \'nope\'')
    expect(exec(state, 'git cherry-pick').last.exitCode).toBe(129)
    const merged = ok(state, 'git switch main', 'git switch -c side HEAD~1', 'echo s > side.txt', 'git add side.txt', 'git commit -m side', 'git switch main', 'git merge --no-ff side -m "Merge side"', 'git switch release/1.4')
    const merge = resolve(merged, 'main')!
    const refused = exec(merged, 'git cherry-pick main')
    expect(refused.text).toBe(`error: commit ${merge} is a merge but no -m option was given.\nfatal: cherry-pick failed`)
    expect(refused.last.exitCode).toBe(128)
    const staged = exec(state, 'echo x > notes.txt', 'git add notes.txt', 'git cherry-pick main~1')
    expect(staged.text).toBe('error: your local changes would be overwritten by cherry-pick.\nhint: commit your changes or stash them to proceed.\nfatal: cherry-pick failed')
  })

  it('stops on a conflict like git, with status, --continue and the original author', () => {
    const state = ok(releaseRepo(), 'echo "title\nbody for 1.4\nfooter" > app.txt', 'git commit -am "Change the body for 1.4"')
    const fix = resolve(state, 'main~1')!
    const { state: stopped, last, text } = exec(state, 'git cherry-pick main~1')
    expect(last.exitCode).toBe(1)
    expect(text).toBe([
      'Auto-merging app.txt',
      'CONFLICT (content): Merge conflict in app.txt',
      `error: could not apply ${short(fix)}... Fix the body`,
      'hint: After resolving the conflicts, mark them with',
      'hint: "git add/rm <pathspec>", then run',
      'hint: "git cherry-pick --continue".',
      'hint: You can instead skip this commit with "git cherry-pick --skip".',
      'hint: To abort and get back to the state before "git cherry-pick",',
      'hint: run "git cherry-pick --abort".',
      'hint: Disable this message with "git config set advice.mergeConflict false"'
    ].join('\n'))
    expect(operationInProgress(stopped)).toBe('cherry-pick')
    expect(unmergedPaths(stopped)).toEqual(['app.txt'])
    expect(stopped.workdir['app.txt']).toContain(`>>>>>>> ${short(fix)} (Fix the body)`)
    expect(exec(stopped, 'git status').text).toBe([
      'On branch release/1.4',
      `You are currently cherry-picking commit ${short(fix)}.`,
      '  (fix conflicts and run "git cherry-pick --continue")',
      '  (use "git cherry-pick --skip" to skip this patch)',
      '  (use "git cherry-pick --abort" to cancel the cherry-pick operation)',
      '',
      'Unmerged paths:',
      '  (use "git add <file>..." to mark resolution)',
      '\tboth modified:   app.txt',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")'
    ].join('\n'))
    expect(exec(stopped, 'git cherry-pick --continue').text).toContain('error: Committing is not possible because you have unmerged files.')
    expect(exec(stopped, 'git switch main').text).toBe('fatal: cannot switch branch while cherry-picking\nConsider "git cherry-pick --quit" or "git worktree add".')
    expect(exec(stopped, 'git cherry-pick main').text).toBe('error: cherry-pick is already in progress\nhint: try "git cherry-pick (--continue | --abort | --quit)"\nfatal: cherry-pick failed')

    const resolved = ok(stopped, 'echo "title\nbody fixed for 1.4\nfooter" > app.txt', 'git add app.txt')
    expect(exec(resolved, 'git status').text).toContain('  (all conflicts fixed: run "git cherry-pick --continue")')
    const { state: continued, text: continuedText } = exec(resolved, 'git cherry-pick --continue')
    const tip = commitsOf(continued, 'HEAD')[0]!
    expect(continuedText).toBe(`[release/1.4 ${short(tip.id)}] Fix the body\n 1 file changed, 1 insertion(+), 1 deletion(-)`)
    expect(tip.author.name).toBe('Jonas')
    expect(operationInProgress(continued)).toBeNull()
    expect(continued.repo!.reflog!.HEAD![0]!.message).toBe('cherry-pick: Fix the body')
  })

  it('concludes a stopped pick with a plain git commit too', () => {
    const state = ok(releaseRepo(), 'echo "title\nbody for 1.4\nfooter" > app.txt', 'git commit -am "Change the body for 1.4"')
    const committed = ok(exec(state, 'git cherry-pick main~1').state, 'echo "title\nboth\nfooter" > app.txt', 'git add app.txt', 'git commit')
    const tip = commitsOf(committed, 'HEAD')[0]!
    expect(tip.message).toBe('Fix the body')
    expect(tip.parents).toHaveLength(1)
    expect(operationInProgress(committed)).toBeNull()
    expect(committed.repo!.reflog!.HEAD![0]!.message).toBe('commit (cherry-pick): Fix the body')
  })

  it('aborts back to where it started, and skips a commit', () => {
    const state = ok(releaseRepo(), 'echo "title\nbody for 1.4\nfooter" > app.txt', 'git commit -am "Change the body for 1.4"')
    const aborted = ok(exec(state, 'git cherry-pick main~1').state, 'git cherry-pick --abort')
    expect(aborted.workdir).toEqual(state.workdir)
    expect(aborted.repo!.index).toEqual(state.repo!.index)
    expect(operationInProgress(aborted)).toBeNull()

    // the first pick conflicts and is skipped, the second goes through
    const skipped = ok(exec(state, 'git cherry-pick main~1 main').state, 'git cherry-pick --skip')
    expect(commitsOf(skipped, 'HEAD').map(commit => commit.message).slice(0, 2)).toEqual(['Add the new feature', 'Change the body for 1.4'])
    expect(operationInProgress(skipped)).toBeNull()
    expect(skipped.workdir['app.txt']).toBe('title\nbody for 1.4\nfooter\n')

    // aborting after an earlier pick went through takes that one back too
    const partly = exec(state, 'git cherry-pick main main~1').state
    expect(commitsOf(partly, 'HEAD')[0]!.message).toBe('Add the new feature')
    const back = ok(partly, 'git cherry-pick --abort')
    expect(resolve(back, 'HEAD')).toBe(resolve(state, 'HEAD'))
    expect(back.repo!.reflog!.HEAD![0]!.message).toBe(`reset: moving to ${resolve(state, 'HEAD')}`)
    expect(exec(back, 'git cherry-pick --abort').text).toBe('error: no cherry-pick or revert in progress\nfatal: cherry-pick failed')
  })

  it('stops with git\'s message when the pick changes nothing', () => {
    const state = releaseRepo()
    const twice = ok(state, 'git cherry-pick main~1')
    const { state: empty, last, text } = exec(twice, 'git cherry-pick main~1')
    expect(last.exitCode).toBe(1)
    expect(text).toBe([
      'On branch release/1.4',
      `You are currently cherry-picking commit ${short(resolve(state, 'main~1'))}.`,
      '  (all conflicts fixed: run "git cherry-pick --continue")',
      '  (use "git cherry-pick --skip" to skip this patch)',
      '  (use "git cherry-pick --abort" to cancel the cherry-pick operation)',
      '',
      'nothing to commit, working tree clean',
      'The previous cherry-pick is now empty, possibly due to conflict resolution.',
      'If you wish to commit it anyway, use:',
      '',
      '    git commit --allow-empty',
      '',
      'Otherwise, please use \'git cherry-pick --skip\''
    ].join('\n'))
    expect(operationInProgress(ok(empty, 'git cherry-pick --skip'))).toBeNull()
    expect(commitsOf(ok(empty, 'git commit --allow-empty'), 'HEAD')[0]!.message).toBe('Fix the body')
  })

  it('takes theirs from the commit being picked', () => {
    const state = exec(ok(releaseRepo(), 'echo "title\nbody for 1.4\nfooter" > app.txt', 'git commit -am "Change the body for 1.4"'), 'git cherry-pick main~1').state
    expect(ok(state, 'git checkout --theirs app.txt').workdir['app.txt']).toBe('title\nbody fixed\nfooter\n')
  })
})
