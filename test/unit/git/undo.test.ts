import { describe, expect, it } from 'vitest'
import { commitsOf, gitCommandNames, headCommit, isWorkingTreeClean, remoteBranchHead, repo, stashEntries, writeFile } from '../../../shared/git'
import { exec, ok } from './helpers'

/** a.txt and b.txt committed as "one", then a.txt changed in "two". */
const base = () => repo().file('a.txt', 'a').file('b.txt', 'b').commit('one').file('a.txt', 'a2').commit('two').build()
const short = (id: string) => id.slice(0, 7)

describe('git restore', () => {
  it('throws away unstaged changes: the file comes back from the index, silently', () => {
    const state = ok(base(), 'echo broken > a.txt', 'rm b.txt')
    const { state: restored, text, last } = exec(state, 'git restore a.txt b.txt')
    expect(last.exitCode).toBe(0)
    expect(text).toBe('')
    expect(restored.workdir['a.txt']).toBe('a2\n')
    expect(restored.workdir['b.txt']).toBe('b\n')
  })

  it('restores from the index, not from HEAD: staged changes stay', () => {
    const state = ok(base(), 'echo staged > a.txt', 'git add a.txt', 'echo later >> a.txt')
    const restored = ok(state, 'git restore a.txt')
    expect(restored.workdir['a.txt']).toBe('staged\n')
    expect(restored.repo!.index['a.txt']).toBe('staged\n')
  })

  it('restores a whole folder or everything with .', () => {
    const state = ok(repo().file('src/x.js', 'x').file('src/y.js', 'y').file('z.js', 'z').commit('one').build(), 'echo X > src/x.js', 'echo Y > src/y.js', 'echo Z > z.js')
    const folder = ok(state, 'git restore src')
    expect([folder.workdir['src/x.js'], folder.workdir['src/y.js'], folder.workdir['z.js']]).toEqual(['x\n', 'y\n', 'Z\n'])
    expect(isWorkingTreeClean(ok(state, 'git restore .'))).toBe(true)
  })

  it('unstages with --staged and keeps the edits in the working tree', () => {
    const state = ok(base(), 'echo mine > a.txt', 'echo n > new.txt', 'git add .')
    const { state: unstaged, text } = exec(state, 'git restore --staged a.txt new.txt')
    expect(text).toBe('')
    expect(unstaged.repo!.index).toEqual({ 'a.txt': 'a2\n', 'b.txt': 'b\n' })
    expect(unstaged.workdir['a.txt']).toBe('mine\n')
    expect(exec(unstaged, 'git status -s').text).toBe(' M a.txt\n?? new.txt')
  })

  it('restores both index and working tree from HEAD with --staged --worktree', () => {
    const state = ok(base(), 'echo mine > a.txt', 'git add a.txt')
    for (const flags of ['--staged --worktree', '-S -W', '-SW']) {
      const restored = ok(state, `git restore ${flags} a.txt`)
      expect(isWorkingTreeClean(restored)).toBe(true)
    }
  })

  it('reports unknown paths like git and changes nothing', () => {
    const state = ok(base(), 'echo broken > a.txt', 'echo u > untracked.txt')
    for (const line of ['git restore nope.txt', 'git restore untracked.txt', 'git restore a.txt nope.txt']) {
      const { state: after, text, last } = exec(state, line)
      expect(last.exitCode).toBe(1)
      expect(text).toMatch(/^error: pathspec '(nope|untracked)\.txt' did not match any file\(s\) known to git$/)
      expect(after).toBe(state)
    }
    expect(exec(state, 'git restore --staged nope.txt').text).toBe('error: pathspec \'nope.txt\' did not match any file(s) known to git')
  })

  it('needs a path', () => {
    const { text, last } = exec(base(), 'git restore')
    expect(text).toBe('fatal: you must specify path(s) to restore')
    expect(last.exitCode).toBe(128)
  })

  it('refuses to restore an unmerged file in the working tree, but --staged takes it back to HEAD', () => {
    const conflicted = ok(
      repo().file('a.txt', 'a').commit('one').switch('topic', { create: true }).file('a.txt', 'theirs').commit('theirs').switch('main').file('a.txt', 'ours').commit('ours').build()
    )
    const merging = exec(conflicted, 'git merge topic').state
    const { text, last } = exec(merging, 'git restore a.txt')
    expect(last.exitCode).toBe(1)
    expect(text).toBe('error: path \'a.txt\' is unmerged')
    const unstaged = ok(merging, 'git restore --staged a.txt')
    expect(unstaged.repo!.unmerged).toEqual({})
    expect(unstaged.repo!.index['a.txt']).toBe('ours\n')
  })
})

describe('git reset', () => {
  it('moves the branch back and unstages by default (mixed), listing what is left unstaged', () => {
    const state = base()
    const one = commitsOf(state, 'HEAD')[1]!.id
    const { state: reset, text, last } = exec(state, 'git reset HEAD~1')
    expect(last.exitCode).toBe(0)
    expect(text).toBe('Unstaged changes after reset:\nM\ta.txt')
    expect(reset.repo!.branches.main).toBe(one)
    expect(reset.repo!.index['a.txt']).toBe('a\n')
    expect(reset.workdir['a.txt']).toBe('a2\n')
    expect(ok(state, 'git reset --mixed HEAD^').repo!.branches.main).toBe(one)
  })

  it('lists deleted files as D and leaves files new in the undone commit untracked', () => {
    const state = repo().file('a.txt', 'a').file('b.txt', 'b').commit('one').remove('b.txt').file('c.txt', 'c').commit('two').build()
    const { state: reset, text } = exec(state, 'git reset HEAD~1')
    expect(text).toBe('Unstaged changes after reset:\nD\tb.txt')
    expect(exec(reset, 'git status -s').text).toBe(' D b.txt\n?? c.txt')
  })

  it('prints nothing when nothing is left unstaged', () => {
    const state = ok(base(), 'echo mine > a.txt', 'git add a.txt')
    const { state: reset, text } = exec(state, 'git reset')
    expect(text).toBe('Unstaged changes after reset:\nM\ta.txt')
    expect(exec(reset, 'git reset').text).toBe('Unstaged changes after reset:\nM\ta.txt')
    expect(exec(base(), 'git reset').text).toBe('')
  })

  it('keeps the changes staged with --soft', () => {
    const state = base()
    const { state: reset, text } = exec(state, 'git reset --soft HEAD~1')
    expect(text).toBe('')
    expect(reset.repo!.index['a.txt']).toBe('a2\n')
    expect(exec(reset, 'git status -s').text).toBe('M  a.txt')
  })

  it('makes index and tracked files match the commit with --hard, and keeps untracked files', () => {
    const state = ok(base(), 'echo lost > a.txt', 'echo staged > new.txt', 'git add new.txt', 'echo u > untracked.txt')
    const one = commitsOf(state, 'HEAD')[1]!
    const { state: reset, text } = exec(state, 'git reset --hard HEAD~1')
    expect(text).toBe(`HEAD is now at ${short(one.id)} one`)
    expect(reset.workdir).toEqual({ 'a.txt': 'a\n', 'b.txt': 'b\n', 'untracked.txt': 'u\n' })
    expect(reset.repo!.index).toEqual(one.tree)
    expect(exec(ok(state, 'git reset --hard'), 'git status -s').text).toBe('?? untracked.txt')
  })

  it('takes hashes, short ids, branch names and HEAD~n', () => {
    const state = ok(base(), 'git branch keep HEAD~1', 'echo c > c.txt', 'git add c.txt', 'git commit -m three')
    const [, two, one] = commitsOf(state, 'HEAD')
    expect(ok(state, `git reset --hard ${two!.id}`).repo!.branches.main).toBe(two!.id)
    expect(ok(state, `git reset --hard ${short(two!.id)}`).repo!.branches.main).toBe(two!.id)
    expect(ok(state, 'git reset --hard keep').repo!.branches.main).toBe(one!.id)
    expect(ok(state, 'git reset --soft HEAD~2').repo!.branches.main).toBe(one!.id)
  })

  it('moves a detached HEAD instead of a branch', () => {
    const state = ok(base(), 'git switch --detach HEAD')
    const reset = ok(state, 'git reset --hard HEAD~1')
    expect(reset.repo!.head).toEqual({ type: 'detached', commit: commitsOf(state, 'HEAD')[1]!.id })
    expect(reset.repo!.branches.main).toBe(state.repo!.branches.main)
  })

  it('unstages paths like git restore --staged', () => {
    const state = ok(base(), 'echo mine > a.txt', 'echo n > n.txt', 'git add .')
    const { state: reset, text } = exec(state, 'git reset a.txt')
    expect(text).toBe('Unstaged changes after reset:\nM\ta.txt')
    expect(exec(reset, 'git status -s').text).toBe(' M a.txt\nA  n.txt')
    expect(exec(ok(state, 'git reset -- n.txt'), 'git status -s').text).toBe('M  a.txt\n?? n.txt')
    expect(exec(state, 'git reset --hard a.txt').text).toBe('fatal: Cannot do hard reset with paths.')
    expect(exec(state, 'git reset --soft HEAD a.txt').text).toBe('fatal: Cannot do soft reset with paths.')
  })

  it('reports unknown revisions like git', () => {
    const { text, last, state } = exec(base(), 'git reset --hard nope')
    expect(last.exitCode).toBe(128)
    expect(text).toBe([
      'fatal: ambiguous argument \'nope\': unknown revision or path not in the working tree.',
      'Use \'--\' to separate paths from revisions, like this:',
      '\'git <command> [<revision>...] -- [<file>...]\''
    ].join('\n'))
    expect(state).toEqual(base())
    expect(exec(base(), 'git reset --hard HEAD~5').last.exitCode).toBe(128)
    expect(exec(base(), 'git reset --keep HEAD').text).toBe('git reset: option \'--keep\' is not in this trainer yet')
  })

  it('ends a merge with --hard or --mixed, refuses --soft, and refuses during a rebase', () => {
    const diverged = repo().file('a.txt', 'a').commit('one').switch('topic', { create: true }).file('a.txt', 'theirs').commit('theirs')
      .switch('main').file('a.txt', 'ours').commit('ours').build()
    const merging = exec(diverged, 'git merge topic').state
    expect(exec(merging, 'git reset --soft').text).toBe('fatal: Cannot do a soft reset in the middle of a merge.')
    const hard = ok(merging, 'git reset --hard')
    expect(hard.repo!.operation).toBeNull()
    expect(hard.repo!.unmerged).toEqual({})
    expect(isWorkingTreeClean(hard)).toBe(true)
    const mixed = ok(merging, 'git reset')
    expect(mixed.repo!.operation).toBeNull()
    expect(mixed.repo!.unmerged).toEqual({})

    const rebasing = exec(ok(diverged, 'git switch topic'), 'git rebase main').state
    expect(rebasing.repo!.operation?.type).toBe('rebase')
    const { text, last } = exec(rebasing, 'git reset --hard')
    expect(last.exitCode).toBe(128)
    expect(text).toBe('fatal: git reset during a rebase is not in this trainer yet; use "git rebase --abort" or finish the rebase first')
  })
})

describe('git revert', () => {
  const pushed = () => repo()
    .file('prices.js', 'croissant: 1.90').file('hours.txt', '7-18').commit('Add prices')
    .file('prices.js', 'croissant: 2').commit('Round prices')
    .file('hours.txt', '7-18, Sunday 8-12').commit('Sunday hours')
    .origin().build()

  it('adds a commit that undoes an older one, with git\'s default message', () => {
    const state = pushed()
    const bad = commitsOf(state, 'HEAD')[1]!
    const { state: reverted, text, last } = exec(state, `git revert ${short(bad.id)}`)
    expect(last.exitCode).toBe(0)
    const head = headCommit(reverted)!
    expect(head.message).toBe(`Revert "Round prices"\n\nThis reverts commit ${bad.id}.`)
    expect(head.parents).toEqual([state.repo!.branches.main])
    expect(head.tree).toEqual({ 'prices.js': 'croissant: 1.90\n', 'hours.txt': '7-18, Sunday 8-12\n' })
    expect(reverted.workdir).toEqual(head.tree)
    expect(text).toBe(`[main ${short(head.id)}] Revert "Round prices"\n 1 file changed, 1 insertion(+), 1 deletion(-)`)
    expect(commitsOf(reverted, 'HEAD').map(commit => commit.id)).toContain(bad.id)
  })

  it('takes HEAD~n and accepts --no-edit', () => {
    const reverted = ok(pushed(), 'git revert --no-edit HEAD~1')
    expect(headCommit(reverted)!.tree['prices.js']).toBe('croissant: 1.90\n')
    expect(headCommit(ok(pushed(), 'git revert HEAD'))!.tree['hours.txt']).toBe('7-18\n')
  })

  it('pushes like any other commit', () => {
    const state = ok(pushed(), 'git revert HEAD~1', 'git push')
    expect(remoteBranchHead(state, 'main')).toBe(state.repo!.branches.main)
  })

  it('reverts a commit that added or deleted a file', () => {
    const state = repo().file('a.txt', 'a').commit('one').file('b.txt', 'b').commit('add b').remove('a.txt').commit('drop a').build()
    expect(headCommit(ok(state, 'git revert HEAD'))!.tree).toEqual({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    expect(headCommit(ok(state, 'git revert HEAD~1'))!.tree).toEqual({})
  })

  it('refuses a revert that would conflict and changes nothing', () => {
    const state = repo().file('a.txt', 'one').commit('one').file('a.txt', 'two').commit('two').file('a.txt', 'three').commit('three').build()
    const { state: after, text, last } = exec(state, 'git revert HEAD~1')
    expect(last.exitCode).toBe(1)
    expect(after).toBe(state)
    expect(text).toBe([
      `error: could not revert ${short(commitsOf(state, 'HEAD')[1]!.id)}... two`,
      'hint: this revert conflicts with later changes to a.txt; reverts with conflicts are not in this trainer yet'
    ].join('\n'))
  })

  it('refuses a merge commit, as git does without -m', () => {
    const state = repo().file('a.txt', 'a').commit('one').switch('topic', { create: true }).file('b.txt', 'b').commit('b')
      .switch('main').file('c.txt', 'c').commit('c').merge('topic').build()
    const { text, last } = exec(state, 'git revert HEAD')
    expect(last.exitCode).toBe(128)
    expect(text).toBe(`error: commit ${state.repo!.branches.main} is a merge but no -m option was given.\nfatal: revert failed`)
    expect(exec(state, 'git revert -m 1 HEAD').text).toBe('git revert: option \'-m\' is not in this trainer yet')
  })

  it('refuses with staged changes, or with local changes to the files it touches', () => {
    const staged = ok(pushed(), 'echo x > x.txt', 'git add x.txt')
    expect(exec(staged, 'git revert HEAD~1').text).toBe('error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed')
    const dirty = ok(pushed(), 'echo mine > prices.js')
    expect(exec(dirty, 'git revert HEAD~1').text).toBe([
      'error: Your local changes to the following files would be overwritten by merge:',
      '\tprices.js',
      'Please commit your changes or stash them before you merge.',
      'Aborting',
      'fatal: revert failed'
    ].join('\n'))
    // local changes elsewhere are fine and stay
    const elsewhere = ok(pushed(), 'echo mine > hours.txt', 'git revert HEAD~1')
    expect(elsewhere.workdir['hours.txt']).toBe('mine\n')
  })

  it('reports bad revisions and a missing argument', () => {
    expect(exec(pushed(), 'git revert nope').text).toBe('fatal: bad revision \'nope\'')
    expect(exec(pushed(), 'git revert').text).toBe('usage: git revert [--no-edit] <commit>')
    expect(exec(pushed(), 'git revert HEAD HEAD~1').text).toBe('git revert: reverting several commits at once is not in this trainer yet')
  })
})

describe('git stash', () => {
  /** feature with one commit; a.txt changed and staged, b.txt changed, u.txt untracked. */
  const busy = () => ok(base(), 'echo staged > a.txt', 'git add a.txt', 'echo wip > b.txt', 'echo u > u.txt')

  it('saves staged and unstaged changes, leaves untracked files, and cleans the tracked files', () => {
    const state = busy()
    const head = headCommit(state)!
    const { state: stashed, text, last } = exec(state, 'git stash')
    expect(last.exitCode).toBe(0)
    expect(text).toBe(`Saved working directory and index state WIP on main: ${short(head.id)} two`)
    expect(stashed.workdir).toEqual({ ...head.tree, 'u.txt': 'u\n' })
    expect(stashed.repo!.index).toEqual(head.tree)
    expect(stashEntries(stashed)).toHaveLength(1)
    expect(stashEntries(stashed)[0]).toMatchObject({
      base: head.id,
      message: `WIP on main: ${short(head.id)} two`,
      index: { 'a.txt': 'staged\n', 'b.txt': 'b\n' },
      workdir: { 'a.txt': 'staged\n', 'b.txt': 'wip\n' },
      untracked: {}
    })
    expect(stashEntries(stashed)[0]!.id).toMatch(/^[0-9a-f]{40}$/)
    expect(ok(state, 'git stash push').repo!.stash).toEqual(stashed.repo!.stash)
  })

  it('removes new staged files from the working tree and brings them back staged', () => {
    const state = ok(base(), 'echo n > n.txt', 'git add n.txt')
    const stashed = ok(state, 'git stash')
    expect(stashed.workdir['n.txt']).toBeUndefined()
    const popped = ok(stashed, 'git stash pop')
    expect(exec(popped, 'git status -s').text).toBe('A  n.txt')
  })

  it('takes untracked files along with -u, but never ignored ones', () => {
    // the .gitignore is committed: a stashed .gitignore would stop ignoring debug.log, in git too
    const state = ok(base(), 'echo "*.log" > .gitignore', 'git add .gitignore', 'git commit -m ignore', 'echo wip > b.txt', 'echo u > u.txt', 'echo n > src/n.txt', 'echo log > debug.log')
    const stashed = ok(state, 'git stash -u')
    expect(isWorkingTreeClean(stashed)).toBe(true)
    expect(stashed.workdir['debug.log']).toBe('log\n')
    expect(stashEntries(stashed)[0]!.untracked).toEqual({ 'src/n.txt': 'n\n', 'u.txt': 'u\n' })
    expect(ok(state, 'git stash push --include-untracked').repo!.stash[0]!.untracked).toEqual(stashEntries(stashed)[0]!.untracked)
    const popped = ok(stashed, 'git stash pop')
    expect(popped.workdir['u.txt']).toBe('u\n')
  })

  it('names an entry with -m', () => {
    const { state, text } = exec(busy(), 'git stash push -m "half-done gift cards"')
    expect(text).toBe('Saved working directory and index state On main: half-done gift cards')
    expect(exec(state, 'git stash list').text).toBe('stash@{0}: On main: half-done gift cards')
    expect(exec(busy(), 'git stash -m later').text).toBe('Saved working directory and index state On main: later')
  })

  it('says so when there is nothing to stash', () => {
    const { text, last, state } = exec(ok(base(), 'echo u > u.txt'), 'git stash')
    expect(text).toBe('No local changes to save')
    expect(last.exitCode).toBe(0)
    expect(stashEntries(state)).toEqual([])
  })

  it('lists entries newest first, and pop brings the newest back and drops it', () => {
    const state = ok(busy(), 'git stash', 'git switch -c topic', 'echo t > a.txt', 'git stash')
    const two = headCommit(state)!
    expect(exec(state, 'git stash list').text).toBe([
      `stash@{0}: WIP on topic: ${short(two.id)} two`,
      `stash@{1}: WIP on main: ${short(two.id)} two`
    ].join('\n'))
    const newest = stashEntries(state)[0]!
    const { state: popped, text } = exec(state, 'git stash pop')
    expect(popped.workdir['a.txt']).toBe('t\n')
    expect(text).toBe([
      'On branch topic',
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
      '\tmodified:   a.txt',
      '',
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      '\tu.txt',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")',
      `Dropped refs/stash@{0} (${newest.id})`
    ].join('\n'))
    expect(stashEntries(popped)).toHaveLength(1)
  })

  it('brings staged changes back unstaged after pop, like git without --index', () => {
    const popped = ok(busy(), 'git stash', 'git stash pop')
    expect(popped.workdir).toEqual(busy().workdir)
    expect(exec(popped, 'git status -s').text).toBe(' M a.txt\n M b.txt\n?? u.txt')
  })

  it('applies onto another branch with a three-way merge of the changes', () => {
    const state = ok(repo().file('a.txt', 'one\ntwo\nthree').file('b.txt', 'b').commit('one').build(), 'git switch -c topic', 'echo b2 > b.txt', 'git commit -am b2', 'git switch main')
    const stashed = ok(writeFile(state, 'a.txt', 'one\ntwo\nthree\nfour\n'), 'git stash', 'git switch topic')
    const applied = ok(stashed, 'git stash apply')
    expect(applied.workdir['a.txt']).toBe('one\ntwo\nthree\nfour\n')
    expect(applied.workdir['b.txt']).toBe('b2\n')
    expect(stashEntries(applied)).toHaveLength(1)
  })

  it('applies and drops a chosen entry: stash@{n} or n', () => {
    const state = ok(busy(), 'git stash', 'echo second > b.txt', 'git stash')
    const older = stashEntries(state)[1]!
    expect(ok(state, 'git stash apply stash@{1}').workdir['b.txt']).toBe('wip\n')
    expect(ok(state, 'git stash apply 1').workdir['b.txt']).toBe('wip\n')
    const { state: dropped, text } = exec(state, 'git stash drop stash@{1}')
    expect(text).toBe(`Dropped stash@{1} (${older.id})`)
    expect(stashEntries(dropped)).toEqual([stashEntries(state)[0]])
    expect(stashEntries(ok(state, 'git stash drop'))).toEqual([older])
    expect(stashEntries(ok(state, 'git stash clear'))).toEqual([])
  })

  it('reports an empty stash and bad entries', () => {
    for (const command of ['pop', 'apply', 'drop']) {
      const { text, last } = exec(base(), `git stash ${command}`)
      expect(text).toBe('No stash entries found.')
      expect(last.exitCode).toBe(1)
    }
    const state = ok(busy(), 'git stash')
    expect(exec(state, 'git stash pop stash@{3}').text).toBe('error: stash@{3} is not a valid reference')
    expect(exec(state, 'git stash list').text).not.toBe('')
    expect(exec(state, 'git stash show').text).toBe('git stash show is not in this trainer yet')
    expect(exec(state, 'git stash push a.txt').text).toBe('git stash push: stashing only some paths is not in this trainer yet')
  })

  it('refuses to pop over local changes it would overwrite, and keeps the entry', () => {
    const state = ok(busy(), 'git stash', 'echo other > b.txt')
    const { state: after, text, last } = exec(state, 'git stash pop')
    expect(last.exitCode).toBe(1)
    expect(after).toBe(state)
    expect(text).toBe([
      'error: Your local changes to the following files would be overwritten by merge:',
      '\tb.txt',
      'Please commit your changes or stash them before you merge.',
      'Aborting',
      'The stash entry is kept in case you need it again.'
    ].join('\n'))
  })

  it('refuses to apply when the changes conflict with a commit made since', () => {
    const state = ok(busy(), 'git stash', 'echo committed > b.txt', 'git commit -am other')
    const { state: after, text, last } = exec(state, 'git stash pop')
    expect(last.exitCode).toBe(1)
    expect(after).toBe(state)
    expect(text).toBe([
      'error: this stash conflicts with b.txt; applying a stash with conflicts is not in this trainer yet',
      'The stash entry is kept in case you need it again.'
    ].join('\n'))
  })

  it('refuses to restore untracked files that already exist', () => {
    const state = ok(busy(), 'git stash -u', 'echo again > u.txt')
    const { text, last } = exec(state, 'git stash pop')
    expect(last.exitCode).toBe(1)
    expect(text).toBe('u.txt already exists, no checkout\nerror: could not restore untracked files from stash\nThe stash entry is kept in case you need it again.')
  })

  it('refuses with unmerged files and before the first commit', () => {
    const conflicted = repo().file('a.txt', 'a').commit('one').switch('topic', { create: true }).file('a.txt', 'theirs').commit('theirs')
      .switch('main').file('a.txt', 'ours').commit('ours').build()
    const merging = exec(conflicted, 'git merge topic').state
    expect(exec(merging, 'git stash').text).toBe('a.txt: needs merge\nerror: could not save the stash: you have unmerged files')
    expect(exec(repo().file('a.txt', 'a').stage().build(), 'git stash').text).toBe('You do not have the initial commit yet')
  })

  it('switches branches after stashing where git refused before', () => {
    const state = ok(repo().file('a.txt', 'a').commit('one').switch('topic', { create: true }).file('a.txt', 'topic').commit('topic').build(), 'echo wip > a.txt')
    expect(exec(state, 'git switch main').last.exitCode).toBe(1)
    const back = ok(state, 'git stash', 'git switch main', 'git switch topic', 'git stash pop')
    expect(back.workdir['a.txt']).toBe('wip\n')
  })
})

describe('command list', () => {
  it('supports restore, reset, revert, stash, reflog and cherry-pick, not show', () => {
    expect(gitCommandNames).toEqual(expect.arrayContaining(['restore', 'reset', 'revert', 'stash', 'reflog', 'cherry-pick']))
    expect(exec(base(), 'git show HEAD').text).toBe('git: \'show\' is not in this trainer yet')
  })
})
