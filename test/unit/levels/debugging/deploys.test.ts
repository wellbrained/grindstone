import { describe, expect, it } from 'vitest'
import { MAX_MAP_CELLS, deployById, deployChanges, deployHistory, differingPaths, filesBefore, lineIn, liveFiles, versionOf } from '../../../../shared/levels/debugging/deploys'

// The shop's deploys (ADR 0007, chapter 7; docs/features/levels.md "The deploys"): each deploy is a few edits on the
// files before it, so a level writes its history as data and the model keeps every version's files (Roll back puts them
// in the editor). The diffs are git's line diff (shared/git/diff.ts) with each line's numbers, and a diff line can be
// found again in the code as it is now.

const BASE = {
  'index.html': '<!doctype html>\n<p id="note"></p>\n',
  'order.js': 'const items = []\nconst body = JSON.stringify({ items })\nsend(body)\n'
}

const history = () => deployHistory(BASE, [
  { id: 'a1b2c3d', author: 'Maya', at: 'Yesterday 17:40', message: 'Opening hours for the holidays', edits: [{ path: 'index.html', replace: ['<p id="note"></p>', '<p id="note">Closed on the 26th</p>'] }] },
  { id: 'b7e41d0', author: 'Ben', at: 'Today 08:02', message: 'Order notes', edits: [
    { path: 'order.js', replace: ['const items = []\n', 'const lines = []\nconst note = read()\n'] },
    { path: 'order.js', replace: ['JSON.stringify({ items })', 'JSON.stringify({ lines, note })'] }
  ] }
])

describe('deployHistory', () => {
  it('keeps every version: the files before, and each deploy\'s files', () => {
    const made = history()
    expect(made.base).toEqual(BASE)
    expect(made.list.map(deploy => deploy.id)).toEqual(['a1b2c3d', 'b7e41d0'])
    expect(made.list[0]!.files['index.html']).toContain('Closed on the 26th')
    expect(made.list[0]!.files['order.js']).toBe(BASE['order.js'])
    expect(made.list[1]!.files['order.js']).toBe('const lines = []\nconst note = read()\nconst body = JSON.stringify({ lines, note })\nsend(body)\n')
    expect(made.list[1]!.files['index.html']).toBe(made.list[0]!.files['index.html'])
    expect(liveFiles(made)).toEqual(made.list[1]!.files)
  })

  it('refuses what a level cannot mean', () => {
    const deploy = { id: 'a1b2c3d', author: 'Maya', at: 'Today 08:00', message: 'x', edits: [{ path: 'order.js', replace: ['items', 'lines'] as const }] }
    expect(() => deployHistory(BASE, [])).toThrow(/at least one/)
    expect(() => deployHistory(BASE, [{ ...deploy, id: 'A1B2C3D' }])).toThrow(/7 hex/)
    expect(() => deployHistory(BASE, [deploy, { ...deploy }])).toThrow(/twice/)
    expect(() => deployHistory(BASE, [{ ...deploy, edits: [{ path: 'nope.js', replace: ['a', 'b'] }] }])).toThrow(/no file nope\.js/)
    expect(() => deployHistory(BASE, [{ ...deploy, edits: [{ path: 'order.js', replace: ['missing', 'b'] }] }])).toThrow(/does not contain/)
    expect(() => deployHistory(BASE, [{ ...deploy, edits: [{ path: 'order.js', replace: ['items', 'items'] }] }])).toThrow(/changes nothing/)
    expect(() => deployHistory(BASE, [{ ...deploy, edits: [] }])).toThrow(/changes nothing/)
    expect(() => deployHistory(BASE, Array.from({ length: 9 }, (_, index) => ({ ...deploy, id: `a1b2c3${index}`, edits: [{ path: 'order.js', replace: ['\n', `\n//${index}\n`] as const }] })))).toThrow(/at most 8/)
  })

  it('finds a deploy and the files before it', () => {
    const made = history()
    expect(deployById(made, 'b7e41d0')?.author).toBe('Ben')
    expect(deployById(made, 'fffffff')).toBeNull()
    expect(deployById(made, '__proto__')).toBeNull()
    expect(filesBefore(made, 'a1b2c3d')).toEqual(BASE)
    expect(filesBefore(made, 'b7e41d0')).toEqual(made.list[0]!.files)
    expect(filesBefore(made, 'fffffff')).toBeNull()
  })
})

describe('deployChanges', () => {
  it('is git\'s diff of each changed file, with both line numbers and where a line is now', () => {
    const [change, ...others] = deployChanges(history(), 'b7e41d0')
    expect(others).toEqual([])
    expect(change).toMatchObject({ path: 'order.js', added: 3, removed: 2 })
    expect(change!.hunks).toHaveLength(1)
    expect(change!.hunks[0]!.header).toBe('@@ -1,3 +1,4 @@')
    expect(change!.hunks[0]!.lines).toEqual([
      { kind: 'del', text: 'const items = []', old: 1, new: null, at: 1 },
      { kind: 'del', text: 'const body = JSON.stringify({ items })', old: 2, new: null, at: 1 },
      { kind: 'add', text: 'const lines = []', old: null, new: 1, at: 1 },
      { kind: 'add', text: 'const note = read()', old: null, new: 2, at: 2 },
      { kind: 'add', text: 'const body = JSON.stringify({ lines, note })', old: null, new: 3, at: 3 },
      { kind: 'same', text: 'send(body)', old: 3, new: 4, at: 4 }
    ])
  })

  it('keeps three lines of context around a change and splits far changes into hunks', () => {
    const long = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n') + '\n'
    const made = deployHistory({ 'a.js': long }, [{ id: 'c0ffee1', author: 'Jonas', at: 'Today 11:05', message: 'two', edits: [
      { path: 'a.js', replace: ['line 2\n', 'line two\n'] },
      { path: 'a.js', replace: ['line 18\n', 'line eighteen\n'] }
    ] }])
    const [change] = deployChanges(made, 'c0ffee1')
    expect(change!.hunks.map(hunk => hunk.header)).toEqual(['@@ -1,5 +1,5 @@', '@@ -15,6 +15,6 @@'])
    expect(change!.hunks[1]!.lines.find(line => line.kind === 'add')).toEqual({ kind: 'add', text: 'line eighteen', old: null, new: 18, at: 18 })
  })

  it('has nothing for an unknown deploy', () => {
    expect(deployChanges(history(), 'fffffff')).toEqual([])
  })
})

describe('finding a line again', () => {
  const before = 'a\nb\nc\nd\n'

  it('maps a line to where it is in another text, or to the line that took its place', () => {
    expect(lineIn(before, 3, 'x\na\nb\nc\nd\n')).toBe(4)
    expect(lineIn(before, 2, 'a\nB\nc\nd\n')).toBe(2)
    expect(lineIn(before, 4, 'a\nb\nc\n')).toBe(3)
    expect(lineIn(before, 1, '')).toBeNull()
    expect(lineIn(before, 9, before)).toBeNull()
    expect(lineIn(before, 0, before)).toBeNull()
  })

  it('gives up on texts too big to compare instead of freezing the page (the editor can hold anything)', () => {
    const huge = 'x\n'.repeat(Math.ceil(MAX_MAP_CELLS / 4) + 10)
    const started = performance.now()
    expect(lineIn(before, 3, huge)).toBe(3)
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe('versions', () => {
  it('names the deploy whose files these are (the newest that matches), else none', () => {
    const made = history()
    expect(versionOf(made, liveFiles(made))).toBe('b7e41d0')
    expect(versionOf(made, made.list[0]!.files)).toBe('a1b2c3d')
    expect(versionOf(made, { ...liveFiles(made), 'order.js': '// mine\n' })).toBeNull()
    expect(versionOf(made, BASE)).toBeNull()
  })

  it('lists the files that differ (what a rollback changes)', () => {
    const made = history()
    expect(differingPaths(liveFiles(made), made.list[0]!.files)).toEqual(['order.js'])
    expect(differingPaths(liveFiles(made), BASE)).toEqual(['index.html', 'order.js'])
    expect(differingPaths(BASE, BASE)).toEqual([])
  })
})
