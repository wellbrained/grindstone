import { describe, expect, it } from 'vitest'
import { currentBranch, remoteBranchHead, repo, teammateCommit, upstreamOf } from '../../../shared/git'
import { exec, ok } from './helpers'

const published = () => repo().file('a.txt', 'a').commit('one').origin()

describe('smaller features', () => {
  it('prints short status with -s', () => {
    const state = ok(published().build(), 'echo b >> a.txt', 'echo n > n.txt', 'git add n.txt', 'touch u.txt')
    expect(exec(state, 'git status -s').text).toBe(' M a.txt\nA  n.txt\n?? u.txt')
  })

  it('creates a tracking branch when switching to a branch that only exists on origin', () => {
    const state = ok(teammateCommit(published().build(), { author: 'Anna', branch: 'feature/search', message: 'Search', files: { 's.txt': 's\n' } }), 'git fetch')
    const { state: switched, text } = exec(state, 'git switch feature/search')
    expect(text).toBe('branch \'feature/search\' set up to track \'origin/feature/search\'.\nSwitched to a new branch \'feature/search\'\nYour branch is up to date with \'origin/feature/search\'.')
    expect(currentBranch(switched)).toBe('feature/search')
    expect(switched.workdir['s.txt']).toBe('s\n')
  })

  it('sets an upstream with branch -u', () => {
    const state = ok(published().build(), 'git switch -c topic')
    const { state: tracked, text } = exec(state, 'git branch -u origin/main')
    expect(text).toBe('branch \'topic\' set up to track \'origin/main\'.')
    expect(upstreamOf(tracked, 'topic')).toBe('origin/main')
    expect(exec(state, 'git branch -u origin/nope').text).toBe('fatal: the requested upstream branch \'origin/nope\' does not exist')
  })

  it('warns about commits left behind on a detached HEAD', () => {
    const state = ok(published().build(), 'git checkout --detach', 'echo x > x.txt', 'git add .', 'git commit -m lost')
    const { text } = exec(state, 'git switch main')
    expect(text).toContain('Warning: you are leaving 1 commit behind, not connected to')
    expect(text).toContain('Switched to branch \'main\'')
  })

  it('prunes remote-tracking refs that are gone on origin', () => {
    const state = published().switch('old', { create: true }).push('old').build()
    const gone = { ...state, origin: { ...state.origin!, branches: { main: state.origin!.branches.main! } } }
    const { state: pruned, text } = exec(gone, 'git fetch --prune')
    expect(text).toBe('From https://git.example.com/team/project.git\n - [deleted]         (none)     -> origin/old')
    expect(pruned.repo!.remoteBranches.old).toBeUndefined()
  })

  it('rebases and merges onto the upstream when no argument is given', () => {
    const state = ok(teammateCommit(published().build(), { author: 'Anna', message: 'Two', files: { 'b.txt': 'b\n' } }), 'git fetch', 'echo c > c.txt', 'git add .', 'git commit -m mine')
    const rebased = ok(state, 'git rebase')
    expect(rebased.repo!.commits[rebased.repo!.branches.main!]!.parents).toEqual([remoteBranchHead(state, 'main')])
    const merged = ok(state, 'git merge')
    expect(merged.repo!.commits[merged.repo!.branches.main!]!.message).toBe('Merge remote-tracking branch \'origin/main\'')
  })

  it('keeps fetched commits when pull stops on a conflict', () => {
    const state = ok(teammateCommit(published().build(), { author: 'Anna', message: 'Theirs', files: { 'a.txt': 'theirs\n' } }), 'echo mine > a.txt', 'git commit -am mine')
    const { state: pulled, text, last } = exec(state, 'git pull')
    expect(last.exitCode).toBe(1)
    expect(text).toContain('CONFLICT (content): Merge conflict in a.txt')
    expect(pulled.workdir['a.txt']).toBe('<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> origin/main\n')
    expect(pulled.repo!.remoteBranches.main).toBe(remoteBranchHead(state, 'main'))
  })

  it('reports syntax errors in chains', () => {
    expect(exec(published().build(), '; ls').text).toBe('bash: syntax error near unexpected token `;\'')
    expect(exec(published().build(), 'ls &&').text).toBe('bash: syntax error near unexpected token `newline\'')
    expect(exec(published().build(), 'ls ;').last.exitCode).toBe(0)
  })
})
