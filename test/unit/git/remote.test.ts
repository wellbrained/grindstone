import { describe, expect, it } from 'vitest'
import { remoteBranchHead, repo, teammateCommit, trackingBranchHead } from '../../../shared/git'
import { exec, ok } from './helpers'

const URL = 'https://git.example.com/team/project.git'
const short = (id: string | null | undefined) => id!.slice(0, 7)

/** main with one commit, published to origin and tracked. */
const published = () => repo().file('app.txt', 'title\nbody\n').commit('Initial commit').origin()

describe('git fetch', () => {
  it('copies new commits and moves origin/* refs', () => {
    const state = published().teammate('Anna', 'Update docs', { 'docs.md': 'hello\n' }).build()
    const before = state.repo!.remoteBranches.main!
    const after = remoteBranchHead(state, 'main')!
    expect(state.repo!.commits[after]).toBeUndefined()

    const { state: fetched, text } = exec(state, 'git fetch')
    expect(text).toBe(`From ${URL}\n   ${short(before)}..${short(after)}  main       -> origin/main`)
    expect(trackingBranchHead(fetched, 'main')).toBe(after)
    expect(fetched.repo!.commits[after]!.author.name).toBe('Anna')
    expect(fetched.repo!.branches.main).toBe(before)
    expect(exec(fetched, 'git fetch').text).toBe('')
  })

  it('reports new branches and forced updates', () => {
    const state = published()
      .teammate('Anna', 'Start search', { 'search.txt': 's\n' }, { branch: 'feature/search' })
      .build()
    expect(exec(state, 'git fetch origin').text).toBe(`From ${URL}\n * [new branch]      feature/search -> origin/feature/search`)
  })

  it('shows ahead and behind counts in status', () => {
    const behind = ok(published().teammate('Anna', 'One', { 'a.txt': '1\n' }).teammate('Anna', 'Two', { 'b.txt': '2\n' }).build(), 'git fetch')
    expect(exec(behind, 'git status').text).toBe([
      'On branch main',
      'Your branch is behind \'origin/main\' by 2 commits, and can be fast-forwarded.',
      '  (use "git pull" to update your local branch)',
      '',
      'nothing to commit, working tree clean'
    ].join('\n'))

    const diverged = ok(behind, 'echo x > x.txt', 'git add .', 'git commit -m mine')
    expect(exec(diverged, 'git status').text).toContain('Your branch and \'origin/main\' have diverged,\nand have 1 and 2 different commits each, respectively.')

    const ahead = ok(published().build(), 'echo x > x.txt', 'git add .', 'git commit -m mine')
    expect(exec(ahead, 'git status').text).toContain('Your branch is ahead of \'origin/main\' by 1 commit.\n  (use "git push" to publish your local commits)')
    expect(exec(published().build(), 'git status').text).toContain('Your branch is up to date with \'origin/main\'.')
  })
})

describe('git pull', () => {
  it('fast-forwards to the upstream', () => {
    const state = published().teammate('Anna', 'Add docs', { 'docs.md': 'd\n' }).build()
    const { state: pulled, text } = exec(state, 'git pull')
    expect(text).toContain('Fast-forward\n docs.md | 1 +')
    expect(pulled.repo!.branches.main).toBe(remoteBranchHead(state, 'main'))
    expect(pulled.workdir['docs.md']).toBe('d\n')
  })

  it('merges diverged history by default', () => {
    const state = ok(published().teammate('Anna', 'Add docs', { 'docs.md': 'd\n' }).build(), 'echo x > x.txt', 'git add .', 'git commit -m mine')
    const pulled = ok(state, 'git pull')
    const head = pulled.repo!.commits[pulled.repo!.branches.main!]!
    expect(head.parents).toHaveLength(2)
    expect(head.message).toBe('Merge branch \'main\' of https://git.example.com/team/project')
  })

  it('rebases with --rebase', () => {
    const state = ok(published().teammate('Anna', 'Add docs', { 'docs.md': 'd\n' }).build(), 'echo x > x.txt', 'git add .', 'git commit -m mine')
    const { state: pulled, text } = exec(state, 'git pull --rebase')
    expect(text).toContain('Successfully rebased and updated refs/heads/main.')
    const head = pulled.repo!.commits[pulled.repo!.branches.main!]!
    expect(head.message).toBe('mine')
    expect(head.parents).toEqual([remoteBranchHead(state, 'main')])
  })

  it('explains a missing upstream', () => {
    const state = ok(published().build(), 'git switch -c topic')
    expect(exec(state, 'git pull').text).toContain('There is no tracking information for the current branch.')
  })
})

describe('git push', () => {
  it('pushes to the upstream as a fast-forward', () => {
    const state = ok(published().build(), 'echo x > x.txt', 'git add .', 'git commit -m mine')
    const before = remoteBranchHead(state, 'main')
    const { state: pushed, text } = exec(state, 'git push')
    const head = pushed.repo!.branches.main!
    expect(text).toBe(`To ${URL}\n   ${short(before)}..${short(head)}  main -> main`)
    expect(remoteBranchHead(pushed, 'main')).toBe(head)
    expect(trackingBranchHead(pushed, 'main')).toBe(head)
    expect(pushed.origin!.commits[head]).toBeDefined()
    expect(exec(pushed, 'git push').text).toBe('Everything up-to-date')
  })

  it('publishes a new branch with -u and sets the upstream', () => {
    const state = ok(published().build(), 'git switch -c feature/login', 'echo l > login.txt', 'git add .', 'git commit -m login')
    expect(exec(state, 'git push').text).toBe([
      'fatal: The current branch feature/login has no upstream branch.',
      'To push the current branch and set the remote as upstream, use',
      '',
      '    git push --set-upstream origin feature/login',
      '',
      'To have this happen automatically for branches without a tracking',
      'upstream, see \'push.autoSetupRemote\' in \'git help config\'.'
    ].join('\n'))
    const { state: pushed, text } = exec(state, 'git push -u origin feature/login')
    expect(text).toBe(`To ${URL}\n * [new branch]      feature/login -> feature/login\nbranch 'feature/login' set up to track 'origin/feature/login'.`)
    expect(pushed.repo!.upstream['feature/login']).toBe('feature/login')
    expect(remoteBranchHead(pushed, 'feature/login')).toBe(pushed.repo!.branches['feature/login'])
  })

  it('is rejected after a teammate commit, then succeeds after fetch, rebase and --force-with-lease (edge case)', () => {
    const state = ok(published().teammate('Anna', 'Add docs', { 'docs.md': 'd\n' }).build(), 'echo x > x.txt', 'git add .', 'git commit -m mine')

    const fetchFirst = exec(state, 'git push')
    expect(fetchFirst.text).toBe([
      `To ${URL}`,
      ' ! [rejected]        main -> main (fetch first)',
      `error: failed to push some refs to '${URL}'`,
      'hint: Updates were rejected because the remote contains work that you do not',
      'hint: have locally. This is usually caused by another repository pushing to',
      'hint: the same ref. If you want to integrate the remote changes, use',
      'hint: \'git pull\' before pushing again.',
      'hint: See the \'Note about fast-forwards\' in \'git push --help\' for details.'
    ].join('\n'))
    expect(fetchFirst.last.exitCode).toBe(1)
    expect(fetchFirst.state).toBe(state)

    const fetched = ok(state, 'git fetch')
    const nonFf = exec(fetched, 'git push')
    expect(nonFf.text).toContain(' ! [rejected]        main -> main (non-fast-forward)')
    expect(nonFf.text).toContain('hint: Updates were rejected because the tip of your current branch is behind')

    const pushed = ok(fetched, 'git rebase origin/main', 'git push --force-with-lease')
    expect(remoteBranchHead(pushed, 'main')).toBe(pushed.repo!.branches.main)
  })

  it('force-pushes a rebased branch with --force-with-lease', () => {
    const state = ok(
      published().switch('feature', { create: true }).file('f.txt', 'f\n').commit('Add f').push('feature')
        .teammate('Anna', 'Add docs', { 'docs.md': 'd\n' }).build(),
      'git fetch', 'git rebase origin/main'
    )
    expect(exec(state, 'git push').text).toContain(' ! [rejected]        feature -> feature (non-fast-forward)')
    const before = remoteBranchHead(state, 'feature')
    const { state: pushed, text } = exec(state, 'git push --force-with-lease')
    expect(text).toBe(`To ${URL}\n + ${short(before)}...${short(pushed.repo!.branches.feature)} feature -> feature (forced update)`)
    expect(remoteBranchHead(pushed, 'feature')).toBe(pushed.repo!.branches.feature)
  })

  it('refuses --force-with-lease when origin moved after the last fetch, --force overwrites (edge case)', () => {
    const state = ok(
      published().switch('feature', { create: true }).file('f.txt', 'f\n').commit('Add f').push('feature').build(),
      'git commit --amend -m "Add file f"'
    )
    const teammate = teammateCommit(state, { author: 'Anna', branch: 'feature', message: 'Tweak f', files: { 'f.txt': 'f2\n' } })
    const lease = exec(teammate, 'git push --force-with-lease')
    expect(lease.text).toBe(`To ${URL}\n ! [rejected]        feature -> feature (stale info)\nerror: failed to push some refs to '${URL}'`)
    expect(lease.last.exitCode).toBe(1)

    const forced = ok(teammate, 'git push --force')
    expect(remoteBranchHead(forced, 'feature')).toBe(forced.repo!.branches.feature)
  })

  it('only pushes when there is a remote', () => {
    const local = repo().file('a.txt', 'a').commit('one').build()
    expect(exec(local, 'git push').text).toContain('fatal: No configured push destination.')
    expect(exec(local, 'git fetch').text).toBe('fatal: \'origin\' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.')
  })
})

describe('fetch output', () => {
  it('pads ref names only to the widest name shown', () => {
    const state = repo().file('a.txt', 'a').commit('one').branch('feature/very-long-name').origin()
      .teammate('Anna', 'Two', { 'b.txt': 'b' }).build()
    expect(exec(state, 'git fetch').text.split('\n')[1]).toMatch(/ main {7}-> origin\/main$/)
  })
})
