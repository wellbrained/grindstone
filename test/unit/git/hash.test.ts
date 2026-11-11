import { describe, expect, it } from 'vitest'
import { blobId, commitId, hashString, shortId } from '../../../shared/git/objects/hash'

const fields = {
  parents: ['a'.repeat(40)],
  tree: { 'b.txt': '2\n', 'a.txt': '1\n' },
  message: 'Add a',
  author: { name: 'You', email: 'you@example.com' },
  timestamp: 100
}

describe('hash', () => {
  it('produces stable 40 character hex ids', () => {
    expect(hashString('hello')).toMatch(/^[0-9a-f]{40}$/)
    expect(hashString('hello')).toBe(hashString('hello'))
    expect(hashString('hello')).not.toBe(hashString('hellp'))
  })

  it('derives commit ids from content and ignores tree key order', () => {
    const reordered = { ...fields, tree: { 'a.txt': '1\n', 'b.txt': '2\n' } }
    expect(commitId(fields)).toBe(commitId(reordered))
    expect(commitId(fields)).not.toBe(commitId({ ...fields, timestamp: 101 }))
    expect(commitId(fields)).not.toBe(commitId({ ...fields, message: 'Add b' }))
  })

  it('shortens ids to seven characters', () => {
    expect(shortId(commitId(fields))).toHaveLength(7)
    expect(blobId('x\n')).toMatch(/^[0-9a-f]{40}$/)
  })
})
