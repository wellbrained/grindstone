import { describe, expect, it } from 'vitest'
import { commitsOf, createState, hasMergeCommits, isAncestor } from '../../../shared/git'
import { exec, ok } from './helpers'

const base = () => ok(createState(), 'git init', 'echo "title" > app.txt', 'echo "body" >> app.txt', 'git add .', 'git commit -m one')

/** main and feature both change app.txt's second line; feature also adds f.txt first. */
const diverged = () => ok(base(),
  'git switch -c feature',
  'echo f > f.txt', 'git add .', 'git commit -m "Add f"',
  'echo "title" > app.txt', 'echo "feature body" >> app.txt', 'git commit -am "Change body on feature"',
  'git switch main',
  'echo "title" > app.txt', 'echo "main body" >> app.txt', 'git commit -am "Change body on main"',
  'git switch feature'
)

describe('git rebase', () => {
  it('replays commits onto the upstream without a merge commit', () => {
    const state = ok(base(),
      'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f', 'echo g > g.txt', 'git add .', 'git commit -m g',
      'git switch main', 'echo m > m.txt', 'git add .', 'git commit -m m', 'git switch feature'
    )
    const oldFeature = state.repo!.branches.feature!
    const { state: after, text } = exec(state, 'git rebase main')
    expect(text).toBe('Successfully rebased and updated refs/heads/feature.')
    expect(after.repo!.branches.feature).not.toBe(oldFeature)
    expect(after.repo!.head).toEqual({ type: 'branch', name: 'feature' })
    expect(isAncestor(after, 'main', 'feature')).toBe(true)
    expect(hasMergeCommits(after, 'main..feature')).toBe(false)
    expect(commitsOf(after, 'main..feature').map(commit => commit.message)).toEqual(['g', 'f'])
    expect(after.workdir).toEqual({ 'app.txt': 'title\nbody\n', 'f.txt': 'f\n', 'g.txt': 'g\n', 'm.txt': 'm\n' })
  })

  it('reports an up-to-date branch and fast-forwards a branch that is only behind', () => {
    const state = ok(base(), 'git branch feature', 'echo m > m.txt', 'git add .', 'git commit -m m')
    expect(exec(state, 'git rebase feature').text).toBe('Current branch main is up to date.')
    const behind = ok(state, 'git switch feature', 'git rebase main')
    expect(behind.repo!.branches.feature).toBe(state.repo!.branches.main)
  })

  it('stops on a conflict and continues after the conflict is resolved (edge case)', () => {
    const state = diverged()
    const stopped = exec(state, 'git rebase main')
    const conflicting = state.repo!.branches.feature!
    expect(stopped.text).toBe([
      'Auto-merging app.txt',
      'CONFLICT (content): Merge conflict in app.txt',
      `error: could not apply ${conflicting.slice(0, 7)}... Change body on feature`,
      'hint: Resolve all conflicts manually, mark them as resolved with',
      'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".',
      'hint: You can instead skip this commit: run "git rebase --skip".',
      'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
      'hint: Disable this message with "git config set advice.mergeConflict false"',
      `Could not apply ${conflicting.slice(0, 7)}... # Change body on feature`
    ].join('\n'))
    expect(stopped.last.exitCode).toBe(1)
    expect(stopped.state.workdir['app.txt']).toBe(`title\n<<<<<<< HEAD\nmain body\n=======\nfeature body\n>>>>>>> ${conflicting.slice(0, 7)} (Change body on feature)\n`)

    const status = exec(stopped.state, 'git status').text
    expect(status).toContain(`interactive rebase in progress; onto ${state.repo!.branches.main!.slice(0, 7)}`)
    expect(status).toContain('You are currently rebasing branch \'feature\' on')
    expect(status).toContain('\tboth modified:   app.txt')

    expect(exec(stopped.state, 'git rebase --continue').text).toBe('error: you must edit all merge conflicts and then\nmark them as resolved using git add')

    const resolved = ok(stopped.state, 'echo "title" > app.txt', 'echo "main and feature body" >> app.txt', 'git add app.txt')
    const { state: done, text } = exec(resolved, 'git rebase --continue')
    expect(text).toMatch(/^\[detached HEAD [0-9a-f]{7}\] Change body on feature\n 1 file changed, 1 insertion\(\+\), 1 deletion\(-\)\nSuccessfully rebased and updated refs\/heads\/feature\.$/)
    expect(done.repo!.operation).toBeNull()
    expect(done.repo!.head).toEqual({ type: 'branch', name: 'feature' })
    expect(commitsOf(done, 'main..feature').map(commit => commit.message)).toEqual(['Change body on feature', 'Add f'])
    expect(done.workdir['app.txt']).toBe('title\nmain and feature body\n')
    expect(hasMergeCommits(done, 'feature')).toBe(false)
  })

  it('aborts and restores the original state (edge case)', () => {
    const state = diverged()
    const stopped = exec(state, 'git rebase main').state
    const aborted = ok(stopped, 'echo "half done" > app.txt', 'git rebase --abort')
    expect(aborted.repo!.head).toEqual(state.repo!.head)
    expect(aborted.repo!.branches).toEqual(state.repo!.branches)
    expect(aborted.repo!.index).toEqual(state.repo!.index)
    expect(aborted.repo!.unmerged).toEqual({})
    expect(aborted.repo!.operation).toBeNull()
    expect(aborted.workdir).toEqual(state.workdir)
    expect(exec(state, 'git rebase --abort').text).toBe('fatal: no rebase in progress')
  })

  it('skips the conflicting commit with --skip', () => {
    const stopped = exec(diverged(), 'git rebase main').state
    const skipped = ok(stopped, 'git rebase --skip')
    expect(commitsOf(skipped, 'main..feature').map(commit => commit.message)).toEqual(['Add f'])
    expect(skipped.workdir['app.txt']).toBe('title\nmain body\n')
  })

  it('refuses to start with uncommitted changes', () => {
    const state = ok(diverged(), 'echo dirty >> f.txt')
    expect(exec(state, 'git rebase main').text).toBe('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.')
    expect(exec(ok(state, 'git add .'), 'git rebase main').text).toBe('error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.')
  })

  it('drops commits whose changes are already upstream', () => {
    const state = ok(base(),
      'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m "Add f"',
      'git switch main', 'echo f > f.txt', 'git add .', 'git commit -m "Add f too"', 'git switch feature'
    )
    const after = ok(state, 'git rebase main')
    expect(after.repo!.branches.feature).toBe(after.repo!.branches.main)
  })
})
