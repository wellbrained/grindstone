import { describe, expect, it } from 'vitest'
import { createState, run, writeFile } from '../../../shared/git'
import { exec, ok, textOf } from './helpers'

describe('shell', () => {
  it('writes and appends with echo redirection', () => {
    const state = ok(createState(), 'echo "hello world" > notes.txt', 'echo more >> notes.txt')
    expect(state.workdir['notes.txt']).toBe('hello world\nmore\n')
    expect(exec(state, 'cat notes.txt').text).toBe('hello world\nmore')
  })

  it('prints echo output without redirection', () => {
    expect(exec(createState(), 'echo a   b "c  d"').text).toBe('a b c  d')
  })

  it('lists files and directories', () => {
    const state = ok(createState(), 'touch b.txt', 'touch a.txt', 'echo x > src/app.ts', 'echo y > src/lib/util.ts')
    expect(exec(state, 'ls').text).toBe('a.txt  b.txt  src')
    expect(exec(state, 'ls src').text).toBe('app.ts  lib')
    expect(exec(state, 'ls nope').text).toBe('ls: cannot access \'nope\': No such file or directory')
  })

  it('creates empty files with touch and keeps existing ones', () => {
    const state = ok(createState(), 'echo keep > a.txt', 'touch a.txt b.txt')
    expect(state.workdir).toEqual({ 'a.txt': 'keep\n', 'b.txt': '' })
  })

  it('removes files and reports missing ones like rm', () => {
    const state = ok(createState(), 'touch a.txt', 'echo x > dir/b.txt')
    expect(exec(state, 'rm a.txt').state.workdir).toEqual({ 'dir/b.txt': 'x\n' })
    expect(exec(state, 'rm nope.txt').text).toBe('rm: cannot remove \'nope.txt\': No such file or directory')
    expect(exec(state, 'rm dir').text).toBe('rm: cannot remove \'dir\': Is a directory')
    expect(exec(state, 'rm -r dir').state.workdir).toEqual({ 'a.txt': '' })
  })

  it('reports cat errors like cat', () => {
    const state = ok(createState(), 'echo x > dir/b.txt')
    expect(exec(state, 'cat nope').text).toBe('cat: nope: No such file or directory')
    expect(exec(state, 'cat dir').text).toBe('cat: dir: Is a directory')
  })

  it('answers unknown commands like bash', () => {
    const result = run(createState(), 'vim notes.txt')
    expect(textOf(result)).toBe('vim: command not found')
    expect(result.exitCode).toBe(127)
    expect(result.output[0]!.kind).toBe('err')
  })

  it('runs chains with && and ; and stops && after a failure', () => {
    const state = ok(createState(), 'touch a.txt && touch b.txt; touch c.txt')
    expect(Object.keys(state.workdir).sort()).toEqual(['a.txt', 'b.txt', 'c.txt'])
    const failed = exec(createState(), 'cat nope && touch d.txt')
    expect(failed.state.workdir['d.txt']).toBeUndefined()
  })

  it('redirects the output of any command into a file', () => {
    const state = ok(createState(), 'echo hi > a.txt', 'cat a.txt > b.txt')
    expect(state.workdir['b.txt']).toBe('hi\n')
  })

  it('reports syntax errors and unsupported pipes', () => {
    expect(exec(createState(), 'echo hi >').text).toBe('bash: syntax error near unexpected token `newline\'')
    expect(exec(createState(), 'ls | wc').text).toBe('pipes (|) are not in this trainer yet')
    expect(exec(createState(), 'echo "oops').text).toBe('bash: unexpected end of input: missing closing "')
  })

  it('does nothing for an empty line', () => {
    const state = createState()
    expect(run(state, '   ')).toEqual({ state, output: [], exitCode: 0 })
  })

  it('exposes writeFile for the editor panel', () => {
    const state = writeFile(createState(), './src/a.ts', 'export {}\n')
    expect(state.workdir).toEqual({ 'src/a.ts': 'export {}\n' })
  })
})
