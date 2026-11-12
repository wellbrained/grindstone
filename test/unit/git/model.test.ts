import { describe, expect, it } from 'vitest'
import {
  aheadBehind,
  commitsOf,
  conflictsInProgress,
  createState,
  currentBranch,
  fileContent,
  folder,
  hasConflictMarkers,
  hasMergeCommits,
  headCommit,
  isAncestor,
  isWorkingTreeClean,
  operationInProgress,
  remoteBranchHead,
  repo,
  resolve,
  run,
  teammateCommit,
  trackingBranchHead,
  unmergedPaths,
  upstreamOf
} from '../../../shared/git'
import { exec, ok, textOf } from './helpers'

describe('setup builder', () => {
  it('builds a folder without a repository', () => {
    const state = folder().file('notes.txt', 'hi').build()
    expect(state.repo).toBeNull()
    expect(state.workdir).toEqual({ 'notes.txt': 'hi\n' })
  })

  it('builds commits, branches and leftover changes', () => {
    const state = repo()
      .file('README.md', 'hi')
      .commit('Initial commit')
      .branch('feature/login')
      .switch('feature/login')
      .file('login.ts', 'form')
      .commit('Add login form', { author: 'Anna' })
      .file('wip.txt', 'not committed')
      .build()
    expect(currentBranch(state)).toBe('feature/login')
    expect(commitsOf(state, 'feature/login').map(commit => commit.message)).toEqual(['Add login form', 'Initial commit'])
    expect(headCommit(state)!.author).toEqual({ name: 'Anna', email: 'anna@example.com' })
    expect(state.workdir['wip.txt']).toBe('not committed\n')
    expect(state.repo!.index['wip.txt']).toBeUndefined()
  })

  it('publishes to origin with tracking refs and upstreams', () => {
    const state = repo().file('a.txt', 'a').commit('one').branch('dev').origin().build()
    expect(remoteBranchHead(state, 'main')).toBe(state.repo!.branches.main)
    expect(remoteBranchHead(state, 'dev')).toBe(state.repo!.branches.dev)
    expect(trackingBranchHead(state, 'dev')).toBe(state.repo!.branches.dev)
    expect(upstreamOf(state, 'main')).toBe('origin/main')
  })

  it('throws on a failing setup step so broken levels fail loudly', () => {
    expect(() => repo().switch('nope')).toThrow(/invalid reference/)
  })
})

describe('teammate commits', () => {
  it('commits onto an origin branch without touching the local repository', () => {
    const state = repo().file('a.txt', 'a').commit('one').origin().build()
    const after = teammateCommit(state, { author: 'Anna', message: 'Update a', files: { 'a.txt': 'A\n', 'b.txt': 'b\n' } })
    const head = after.origin!.commits[remoteBranchHead(after, 'main')!]!
    expect(head).toMatchObject({ message: 'Update a', parents: [state.repo!.branches.main], tree: { 'a.txt': 'A\n', 'b.txt': 'b\n' } })
    expect(head.author.name).toBe('Anna')
    expect(after.repo).toBe(state.repo)

    const removed = teammateCommit(after, { author: { name: 'Ben', email: 'ben@example.com' }, message: 'Drop b', files: { 'b.txt': null } })
    expect(removed.origin!.commits[remoteBranchHead(removed, 'main')!]!.tree).toEqual({ 'a.txt': 'A\n' })
  })

  it('creates a new origin branch from the default branch', () => {
    const state = repo().file('a.txt', 'a').commit('one').origin().build()
    const after = teammateCommit(state, { author: 'Anna', message: 'Search', files: { 's.txt': 's\n' }, branch: 'feature/search' })
    expect(after.origin!.commits[remoteBranchHead(after, 'feature/search')!]!.parents).toEqual([remoteBranchHead(state, 'main')])
  })
})

describe('queries', () => {
  it('answers questions goals will ask', () => {
    const state = repo().file('a.txt', 'a').commit('one').switch('feature', { create: true }).file('b.txt', 'b').commit('two').build()
    expect(resolve(state, 'feature~1')).toBe(state.repo!.branches.main)
    expect(isAncestor(state, 'main', 'feature')).toBe(true)
    expect(isAncestor(state, 'feature', 'main')).toBe(false)
    expect(isAncestor(state, 'nope', 'main')).toBe(false)
    expect(aheadBehind(state, 'feature', 'main')).toEqual({ ahead: 1, behind: 0 })
    expect(isWorkingTreeClean(state)).toBe(true)
    expect(isWorkingTreeClean(ok(state, 'touch c'))).toBe(false)
    expect(fileContent(state, 'b.txt')).toBe('b\n')
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\n')).toBe(true)
    expect(hasConflictMarkers('a\n')).toBe(false)
  })

  it('reports conflicts and merge commits', () => {
    const state = repo().file('a.txt', 'a').commit('one')
      .switch('feature', { create: true }).file('a.txt', 'feature').commit('f')
      .switch('main').file('a.txt', 'main').commit('m').build()
    const conflicted = exec(state, 'git merge feature').state
    expect(conflictsInProgress(conflicted)).toBe(true)
    expect(unmergedPaths(conflicted)).toEqual(['a.txt'])
    expect(operationInProgress(conflicted)).toBe('merge')

    const merged = ok(conflicted, 'echo both > a.txt', 'git add a.txt', 'git commit -m merged')
    expect(conflictsInProgress(merged)).toBe(false)
    expect(operationInProgress(merged)).toBeNull()
    expect(hasMergeCommits(merged, 'main')).toBe(true)
    expect(hasMergeCommits(merged, 'feature')).toBe(false)
    expect(hasMergeCommits(merged, 'feature..main')).toBe(true)
  })
})

describe('state', () => {
  it('survives a JSON round trip during every kind of operation', () => {
    const state = repo().file('a.txt', 'a').commit('one').origin()
      .switch('feature', { create: true }).file('a.txt', 'feature').commit('f')
      .switch('main').file('a.txt', 'main').commit('m').build()
    const conflicted = exec(state, 'git rebase feature').state
    const copy = JSON.parse(JSON.stringify(conflicted))
    expect(copy).toEqual(conflicted)
    const finished = ok(copy, 'echo both > a.txt', 'git add a.txt', 'git rebase --continue')
    expect(currentBranch(finished)).toBe('main')
  })

  it('never uses the real clock or randomness', () => {
    const build = () => ok(createState(), 'git init', 'echo a > a', 'git add .', 'git commit -m one', 'git switch -c b', 'echo b > b', 'git add .', 'git commit -m two')
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()))
  })
})

describe('unsupported commands', () => {
  it('names real git commands that are not in the trainer yet', () => {
    const result = run(repo().file('a', 'a').commit('one').build(), 'git cherry-pick main')
    expect(textOf(result)).toBe('git: \'cherry-pick\' is not in this trainer yet')
    expect(result.exitCode).toBe(1)
  })

  it('suggests the closest command for a typo', () => {
    expect(exec(createState(), 'git comit -m x').text).toBe('git: \'comit\' is not a git command. See \'git --help\'.\n\nThe most similar command is\n\tcommit')
  })

  it('names unsupported flags', () => {
    expect(exec(repo().file('a', 'a').commit('one').build(), 'git log --stat').text).toBe('git log: option \'--stat\' is not in this trainer yet')
  })

  it('prints a short usage for bare git', () => {
    expect(exec(createState(), 'git').text).toContain('usage: git')
  })
})
