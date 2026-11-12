// `git checkout --ours|--theirs <path>` and `git restore --ours|--theirs <path>` during a conflict (docs/features/git-model.md).
// Expected output checked against git 2.55.
import { describe, expect, it } from 'vitest'
import { createState } from '../../../shared/git'
import { exec, ok } from './helpers'

/** main and feat both changed f.txt; main deleted del.txt, feat changed it; g.txt is untouched. Merging feat into main conflicts. */
const conflicted = () => {
  const state = ok(createState(),
    'git init', 'echo a > f.txt', 'echo b >> f.txt', 'echo x > g.txt', 'echo d > del.txt', 'git add .', 'git commit -m one',
    'git switch -c feat', 'echo a > f.txt', 'echo FEAT >> f.txt', 'echo feat > del.txt', 'git commit -am f',
    'git switch main', 'echo a > f.txt', 'echo MAIN >> f.txt', 'rm del.txt', 'git commit -am m'
  )
  const merged = exec(state, 'git merge feat')
  expect(merged.last.exitCode).toBe(1)
  return merged.state
}

describe('git checkout --ours / --theirs', () => {
  it('writes their version of a conflicted file; the file stays unmerged until git add', () => {
    const { state, text, last } = exec(conflicted(), 'git checkout --theirs f.txt')
    expect(last.exitCode).toBe(0)
    expect(text).toBe('Updated 1 path from the index')
    expect(state.workdir['f.txt']).toBe('a\nFEAT\n')
    expect(state.repo!.unmerged['f.txt']).toBe('both modified')
    expect(exec(state, 'git status -s').text).toBe('DU del.txt\nUU f.txt')

    const done = ok(state, 'git add f.txt', 'rm del.txt', 'git add .')
    expect(done.repo!.unmerged).toEqual({})
  })

  it('writes our version, also after their version was written', () => {
    const { state } = exec(conflicted(), 'git checkout --theirs f.txt', 'git checkout --ours f.txt')
    expect(state.workdir['f.txt']).toBe('a\nMAIN\n')
    expect(state.repo!.unmerged['f.txt']).toBe('both modified')
  })

  it('takes the last of --ours and --theirs, like git', () => {
    expect(exec(conflicted(), 'git checkout --ours --theirs f.txt').state.workdir['f.txt']).toBe('a\nFEAT\n')
    expect(exec(conflicted(), 'git checkout --theirs --ours -- f.txt').state.workdir['f.txt']).toBe('a\nMAIN\n')
  })

  it('refuses a side that deleted the file, and changes nothing', () => {
    const start = conflicted()
    const ours = exec(start, 'git checkout --ours del.txt')
    expect(ours.text).toBe('error: path \'del.txt\' does not have our version')
    expect(ours.last.exitCode).toBe(1)
    expect(ours.state).toEqual(start)
    const theirs = exec(start, 'git checkout --theirs del.txt')
    expect(theirs.text).toBe('Updated 1 path from the index')
    expect(theirs.state.workdir['del.txt']).toBe('feat\n')
  })

  it('checks out a path without a conflict from the index, counting only files that changed', () => {
    expect(exec(conflicted(), 'git checkout --ours g.txt').text).toBe('Updated 0 paths from the index')
    const edited = ok(conflicted(), 'echo changed > g.txt')
    const { state, text } = exec(edited, 'git checkout --theirs g.txt')
    expect(text).toBe('Updated 1 path from the index')
    expect(state.workdir['g.txt']).toBe('x\n')
  })

  it('takes every conflicted file of a pathspec', () => {
    const { state, text } = exec(conflicted(), 'git checkout --theirs .')
    expect(text).toBe('Updated 2 paths from the index')
    expect(state.workdir['f.txt']).toBe('a\nFEAT\n')
    expect(state.workdir['del.txt']).toBe('feat\n')
  })

  it('needs paths and refuses switching branches', () => {
    expect(exec(conflicted(), 'git checkout --theirs').text).toBe('fatal: \'--ours/--theirs\' needs the paths to check out')
    const switching = exec(conflicted(), 'git checkout --ours main')
    expect(switching.text).toBe('fatal: \'--ours/--theirs\' cannot be used with switching branches')
    expect(switching.last.exitCode).toBe(128)
    expect(exec(conflicted(), 'git checkout --ours nope.txt').text).toBe('error: pathspec \'nope.txt\' did not match any file(s) known to git')
  })

  it('refuses a plain checkout -- of an unmerged path, like git', () => {
    const { text, last } = exec(conflicted(), 'git checkout -- f.txt')
    expect(text).toBe('error: path \'f.txt\' is unmerged')
    expect(last.exitCode).toBe(1)
  })

  it('works outside a merge like a plain checkout from the index', () => {
    const state = ok(createState(), 'git init', 'echo a > f.txt', 'git add .', 'git commit -m one', 'echo b > f.txt')
    const { state: after, text } = exec(state, 'git checkout --theirs f.txt')
    expect(text).toBe('Updated 1 path from the index')
    expect(after.workdir['f.txt']).toBe('a\n')
  })

  it('reads ours and theirs as git does in a rebase: ours is the branch you rebase onto', () => {
    const state = ok(createState(),
      'git init', 'echo a > f.txt', 'git add .', 'git commit -m one',
      'git switch -c feat', 'echo FEAT > f.txt', 'git commit -am f',
      'git switch main', 'echo MAIN > f.txt', 'git commit -am m',
      'git switch feat'
    )
    const rebasing = exec(state, 'git rebase main').state
    expect(exec(rebasing, 'git checkout --ours f.txt').state.workdir['f.txt']).toBe('MAIN\n')
    expect(exec(rebasing, 'git checkout --theirs f.txt').state.workdir['f.txt']).toBe('FEAT\n')
  })
})

describe('git restore --ours / --theirs', () => {
  it('writes that side silently; the file stays unmerged', () => {
    const { state, text, last } = exec(conflicted(), 'git restore --theirs f.txt')
    expect(last.exitCode).toBe(0)
    expect(text).toBe('')
    expect(state.workdir['f.txt']).toBe('a\nFEAT\n')
    expect(state.repo!.unmerged['f.txt']).toBe('both modified')
    expect(exec(conflicted(), 'git restore --ours f.txt').state.workdir['f.txt']).toBe('a\nMAIN\n')
  })

  it('removes the file when that side deleted it, like git', () => {
    const { state, last } = exec(conflicted(), 'git restore --ours del.txt')
    expect(last.exitCode).toBe(0)
    expect(state.workdir['del.txt']).toBeUndefined()
    expect(state.repo!.unmerged['del.txt']).toBe('deleted by us')
  })

  it('refuses --staged', () => {
    const { text, last } = exec(conflicted(), 'git restore --theirs --staged f.txt')
    expect(text).toBe('fatal: \'--ours\' or \'--theirs\' cannot be used with --staged')
    expect(last.exitCode).toBe(128)
  })

  it('still refuses an unmerged path without --ours or --theirs', () => {
    expect(exec(conflicted(), 'git restore f.txt').text).toBe('error: path \'f.txt\' is unmerged')
  })
})
