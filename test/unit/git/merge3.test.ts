import { describe, expect, it } from 'vitest'
import { merge3, mergeTrees } from '../../../shared/git/merge3'

const labels = { ours: 'HEAD', theirs: 'feature' }

describe('merge3', () => {
  it('takes the side that changed', () => {
    expect(merge3('a\nb\nc\n', 'a\nB\nc\n', 'a\nb\nc\n', labels)).toEqual({ content: 'a\nB\nc\n', conflict: false })
    expect(merge3('a\nb\nc\n', 'a\nb\nc\n', 'a\nb\nC\n', labels)).toEqual({ content: 'a\nb\nC\n', conflict: false })
  })

  it('combines changes in separate regions', () => {
    const base = 'one\ntwo\nthree\nfour\nfive\n'
    const ours = 'ONE\ntwo\nthree\nfour\nfive\n'
    const theirs = 'one\ntwo\nthree\nfour\nFIVE\n'
    expect(merge3(base, ours, theirs, labels)).toEqual({ content: 'ONE\ntwo\nthree\nfour\nFIVE\n', conflict: false })
  })

  it('accepts the same change made on both sides', () => {
    expect(merge3('a\n', 'b\n', 'b\n', labels)).toEqual({ content: 'b\n', conflict: false })
  })

  it('writes conflict markers when both sides change the same lines differently', () => {
    const result = merge3('title\nold\nend\n', 'title\nours\nend\n', 'title\ntheirs\nend\n', labels)
    expect(result.conflict).toBe(true)
    expect(result.content).toBe('title\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\nend\n')
  })

  it('merges insertions at the end of the file from both sides as a conflict', () => {
    const result = merge3('a\n', 'a\nb\n', 'a\nc\n', labels)
    expect(result.content).toBe('a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> feature\n')
  })

  it('terminates the last line inside a conflict block', () => {
    const result = merge3('x', 'y', 'z', labels)
    expect(result.content).toBe('<<<<<<< HEAD\ny\n=======\nz\n>>>>>>> feature\n')
  })
})

describe('mergeTrees', () => {
  it('merges paths and reports each kind of conflict', () => {
    const base = { 'same.txt': 'a\n', 'ours.txt': 'a\n', 'both.txt': 'a\n', 'gone.txt': 'a\n', 'theirs-gone.txt': 'a\n' }
    const ours = { 'same.txt': 'a\n', 'ours.txt': 'A\n', 'both.txt': 'ours\n', 'theirs-gone.txt': 'changed\n', 'added.txt': 'one\n' }
    const theirs = { 'same.txt': 'a\n', 'ours.txt': 'a\n', 'both.txt': 'theirs\n', 'gone.txt': 'changed\n', 'added.txt': 'two\n' }
    const result = mergeTrees(base, ours, theirs, labels)

    expect(result.tree['same.txt']).toBe('a\n')
    expect(result.tree['ours.txt']).toBe('A\n')
    expect(result.conflicts).toEqual([
      { path: 'added.txt', kind: 'both added', message: 'CONFLICT (add/add): Merge conflict in added.txt' },
      { path: 'both.txt', kind: 'both modified', message: 'CONFLICT (content): Merge conflict in both.txt' },
      { path: 'gone.txt', kind: 'deleted by us', message: 'CONFLICT (modify/delete): gone.txt deleted in HEAD and modified in feature.  Version feature of gone.txt left in tree.' },
      { path: 'theirs-gone.txt', kind: 'deleted by them', message: 'CONFLICT (modify/delete): theirs-gone.txt deleted in feature and modified in HEAD.  Version HEAD of theirs-gone.txt left in tree.' }
    ])
    expect(result.tree['gone.txt']).toBe('changed\n')
    expect(result.index['gone.txt']).toBeUndefined()
    expect(result.index['both.txt']).toBe('ours\n')
    expect(result.autoMerged).toEqual(['added.txt', 'both.txt'])
  })

  it('applies deletions from one side', () => {
    const result = mergeTrees({ 'a.txt': 'x\n' }, { 'a.txt': 'x\n' }, {}, labels)
    expect(result.tree).toEqual({})
    expect(result.conflicts).toEqual([])
  })
})
