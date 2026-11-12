import { describe, expect, it } from 'vitest'
import { createState, isIgnored } from '../../../shared/git'
import { exec, ok } from './helpers'

/** a.txt, .env and src/{x,y}.js committed on main. */
const base = () => ok(createState(), 'git init', 'echo a > a.txt', 'echo KEY=test-key-not-real-0000 > .env', 'echo x > src/x.js', 'echo y > src/y.js', 'git add .', 'git commit -m one')

describe('git rm', () => {
  it('removes a file from the index and the working tree, and prints it like git', () => {
    const { state, text } = exec(base(), 'git rm a.txt')
    expect(text).toBe('rm \'a.txt\'')
    expect(state.workdir['a.txt']).toBeUndefined()
    expect(state.repo!.index['a.txt']).toBeUndefined()
    expect(exec(state, 'git status -s').text).toBe('D  a.txt')
  })

  it('keeps the file with --cached: it becomes untracked, and ignored once a .gitignore names it', () => {
    const { state, text } = exec(base(), 'git rm --cached .env')
    expect(text).toBe('rm \'.env\'')
    expect(state.workdir['.env']).toBe('KEY=test-key-not-real-0000\n')
    expect(exec(state, 'git status -s').text).toBe('D  .env\n?? .env')
    const ignored = ok(state, 'echo .env > .gitignore')
    expect(isIgnored(ignored, '.env')).toBe(true)
    expect(exec(ignored, 'git status -s').text).toBe('D  .env\n?? .gitignore')
  })

  it('refuses to lose changes git has nowhere else, unless -f', () => {
    const changed = ok(base(), 'echo b > a.txt')
    expect(exec(changed, 'git rm a.txt').text).toBe([
      'error: the following file has local modifications:',
      '    a.txt',
      '(use --cached to keep the file, or -f to force removal)'
    ].join('\n'))
    expect(exec(changed, 'git rm a.txt').state).toBe(changed)
    expect(exec(changed, 'git rm --cached a.txt').last.exitCode).toBe(0)
    expect(exec(changed, 'git rm -f a.txt').state.workdir['a.txt']).toBeUndefined()

    const staged = ok(base(), 'echo b > a.txt', 'git add a.txt', 'echo n > new.txt', 'git add new.txt')
    expect(exec(staged, 'git rm a.txt new.txt').text).toBe([
      'error: the following files have changes staged in the index:',
      '    a.txt',
      '    new.txt',
      '(use --cached to keep the file, or -f to force removal)'
    ].join('\n'))
    expect(exec(staged, 'git rm --cached new.txt').state.workdir['new.txt']).toBe('n\n')

    const both = ok(staged, 'echo c > a.txt')
    expect(exec(both, 'git rm --cached a.txt').text).toBe([
      'error: the following file has staged content different from both the',
      'file and the HEAD:',
      '    a.txt',
      '(use -f to force removal)'
    ].join('\n'))
    expect(exec(both, 'git rm --cached -f a.txt').state.workdir['a.txt']).toBe('c\n')
  })

  it('needs -r for a folder; a glob or a deleted file is fine', () => {
    expect(exec(base(), 'git rm src').text).toBe('fatal: not removing \'src\' recursively without -r')
    expect(exec(base(), 'git rm -r src').text).toBe('rm \'src/x.js\'\nrm \'src/y.js\'')
    expect(exec(base(), 'git rm --cached \'src/*.js\'').text).toBe('rm \'src/x.js\'\nrm \'src/y.js\'')
    expect(exec(ok(base(), 'rm a.txt'), 'git rm a.txt').state.repo!.index['a.txt']).toBeUndefined()
    expect(exec(base(), 'git rm -q a.txt').text).toBe('')
  })

  it('reports unknown paths and a missing pathspec like git', () => {
    const missing = exec(base(), 'git rm nope.txt')
    expect(missing.text).toBe('fatal: pathspec \'nope.txt\' did not match any files')
    expect(missing.last.exitCode).toBe(128)
    expect(exec(ok(base(), 'echo u > u.txt'), 'git rm u.txt').text).toBe('fatal: pathspec \'u.txt\' did not match any files')
    expect(exec(base(), 'git rm').text).toBe('fatal: No pathspec was given. Which files should I remove?')
    expect(exec(createState(), 'git rm a.txt').last.exitCode).toBe(128)
  })

  it('resolves a conflict by removing the file', () => {
    const conflicted = exec(ok(base(), 'git switch -c side', 'git rm a.txt', 'git commit -m "Drop a"', 'git switch main', 'echo b > a.txt', 'git commit -am "Change a"'), 'git merge side').state
    expect(conflicted.repo!.unmerged['a.txt']).toBe('deleted by them')
    const resolved = ok(conflicted, 'git rm a.txt', 'git commit --no-edit')
    expect(resolved.repo!.operation).toBeNull()
    expect(resolved.workdir['a.txt']).toBeUndefined()
  })
})
