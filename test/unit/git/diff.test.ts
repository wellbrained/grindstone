import { describe, expect, it } from 'vitest'
import { countChanges, diffLines, hunks, splitLines } from '../../../shared/git/diff'

describe('splitLines', () => {
  it('keeps line terminators so a missing final newline is visible', () => {
    expect(splitLines('a\nb\n')).toEqual(['a\n', 'b\n'])
    expect(splitLines('a\nb')).toEqual(['a\n', 'b'])
    expect(splitLines('')).toEqual([])
  })
})

describe('diffLines', () => {
  it('finds equal, deleted and added lines', () => {
    const edits = diffLines(['a\n', 'b\n', 'c\n'], ['a\n', 'B\n', 'c\n', 'd\n'])
    expect(edits.map(edit => `${edit.type}:${edit.line.trim()}`)).toEqual([
      'equal:a', 'del:b', 'add:B', 'equal:c', 'add:d'
    ])
  })

  it('counts insertions and deletions', () => {
    expect(countChanges('a\nb\n', 'a\nc\nd\n')).toEqual({ insertions: 2, deletions: 1 })
    expect(countChanges(undefined, 'x\n')).toEqual({ insertions: 1, deletions: 0 })
    expect(countChanges('x\ny\n', undefined)).toEqual({ insertions: 0, deletions: 2 })
  })
})

describe('hunks', () => {
  it('groups changes with three lines of context', () => {
    const before = ['1\n', '2\n', '3\n', '4\n', '5\n', '6\n', '7\n', '8\n', '9\n', '10\n']
    const after = ['1\n', '2\n', '3\n', '4\n', '5\n', 'six\n', '7\n', '8\n', '9\n', '10\n']
    const result = hunks(diffLines(before, after))
    expect(result).toHaveLength(1)
    expect(result[0]!.header).toBe('@@ -3,7 +3,7 @@')
    expect(result[0]!.lines.map(line => line.type)).toEqual(['equal', 'equal', 'equal', 'del', 'add', 'equal', 'equal', 'equal'])
  })

  it('uses git headers for files that are created or emptied', () => {
    expect(hunks(diffLines([], ['a\n']))[0]!.header).toBe('@@ -0,0 +1 @@')
    expect(hunks(diffLines(['a\n', 'b\n'], []))[0]!.header).toBe('@@ -1,2 +0,0 @@')
  })
})
