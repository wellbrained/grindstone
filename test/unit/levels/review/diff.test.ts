import { describe, expect, it } from 'vitest'
import { MAX_COMMENT_LINES, canonicalPlace, placeFor, placeOf, placeRows, pullRequestDiff, rowIn } from '../../../../shared/levels/review/diff'
import type { FileDiff } from '../../../../shared/levels/review/diff'

// The diff of a pull request (ADR 0008): git's line diff (LCS, shared/git/diff.ts) between the files before and after
// it, grouped into hunks with three lines of context, every row numbered on both sides; and where a comment on a stretch
// of rows sits (its lines on each side).

const lines = (count: number, from = 1) => Array.from({ length: count }, (_, index) => `line ${index + from}`)
const text = (rows: string[]) => `${rows.join('\n')}\n`

/** A row as [kind, old, new, text], to read the tables below. */
const table = (file: FileDiff) => file.hunks.map(hunk => [hunk.header, hunk.rows.map(row => [row.kind, row.old, row.new, row.text])])

describe('the diff of a pull request', () => {
  it('leaves out files that did not change and lists the others in path order', () => {
    const base = { 'b.js': 'same\n', 'c.js': 'old\n', 'a.js': 'old\n' }
    const head = { 'b.js': 'same\n', 'c.js': 'new\n', 'a.js': 'new\n' }
    expect(pullRequestDiff(base, head).map(file => file.path)).toEqual(['a.js', 'c.js'])
    expect(pullRequestDiff(base, base)).toEqual([])
  })

  it('numbers every row on both sides: a changed line is removed, then added', () => {
    const base = text(['const a = 1', 'const b = 2', 'const c = 3'])
    const head = text(['const a = 1', 'const b = 20', 'const c = 3'])
    const [file] = pullRequestDiff({ 'x.js': base }, { 'x.js': head })
    expect(file).toMatchObject({ path: 'x.js', status: 'modified', added: 1, removed: 1 })
    expect(table(file!)).toEqual([['@@ -1,3 +1,3 @@', [
      ['same', 1, 1, 'const a = 1'],
      ['del', 2, null, 'const b = 2'],
      ['add', null, 2, 'const b = 20'],
      ['same', 3, 3, 'const c = 3']
    ]]])
  })

  it('keeps three lines of context around a change and splits changes far apart into hunks, as git does', () => {
    const base = lines(20)
    const head = [...base]
    head[2] = 'changed 3'
    head.splice(15, 0, 'added after 15')
    const [file] = pullRequestDiff({ 'x.js': text(base) }, { 'x.js': text(head) })
    expect(file!.hunks.map(hunk => hunk.header)).toEqual(['@@ -1,6 +1,6 @@', '@@ -13,6 +13,7 @@'])
    expect(file!.hunks[0]!.rows.map(row => row.kind)).toEqual(['same', 'same', 'del', 'add', 'same', 'same', 'same'])
    expect(file!.hunks[1]!.rows.map(row => [row.old, row.new])).toEqual([[13, 13], [14, 14], [15, 15], [null, 16], [16, 17], [17, 18], [18, 19]])
    // two changes close together share a hunk
    const near = [...base]
    near[2] = 'changed 3'
    near[8] = 'changed 9'
    expect(pullRequestDiff({ 'x.js': text(base) }, { 'x.js': text(near) })[0]!.hunks).toHaveLength(1)
  })

  it('shows an added file as all added and a deleted one as all removed', () => {
    const [added] = pullRequestDiff({}, { 'new.js': 'one\ntwo\n' })
    expect(added).toMatchObject({ status: 'added', added: 2, removed: 0 })
    expect(table(added!)).toEqual([['@@ -0,0 +1,2 @@', [['add', null, 1, 'one'], ['add', null, 2, 'two']]]])
    const [deleted] = pullRequestDiff({ 'old.js': 'gone\n' }, {})
    expect(deleted).toMatchObject({ status: 'deleted', added: 0, removed: 1 })
    expect(table(deleted!)).toEqual([['@@ -1 +0,0 @@', [['del', 1, null, 'gone']]]])
  })

  it('tells a missing last newline apart (the line itself changed)', () => {
    const [file] = pullRequestDiff({ 'x.js': 'a\nb' }, { 'x.js': 'a\nb\n' })
    expect(file!.hunks[0]!.rows.map(row => [row.kind, row.text])).toEqual([['same', 'a'], ['del', 'b'], ['add', 'b']])
  })
})

describe('where a comment sits', () => {
  const base = text(['const a = 1', 'const b = 2', 'const c = 3', 'const d = 4'])
  const head = text(['const a = 1', 'const b = 20', 'const bb = 21', 'const c = 3', 'const d = 4'])
  const [file] = pullRequestDiff({ 'x.js': base }, { 'x.js': head })
  // rows: 0 same 1/1, 1 del 2/-, 2 add -/2, 3 add -/3, 4 same 3/4, 5 same 4/5

  it('covers the lines its rows have on each side, in either order of the ends', () => {
    expect(placeOf(file!, 0, 2, 3)).toEqual({ path: 'x.js', head: { start: 2, end: 3 }, base: null })
    expect(placeOf(file!, 0, 1, 1)).toEqual({ path: 'x.js', head: null, base: { start: 2, end: 2 } })
    expect(placeOf(file!, 0, 3, 1)).toEqual({ path: 'x.js', head: { start: 2, end: 3 }, base: { start: 2, end: 2 } })
    // an unchanged row has a line on both sides
    expect(placeOf(file!, 0, 4, 4)).toEqual({ path: 'x.js', head: { start: 4, end: 4 }, base: { start: 3, end: 3 } })
    expect(placeOf(file!, 0, 0, 9)).toBeNull()
    expect(placeOf(file!, 1, 0, 0)).toBeNull()
  })

  it('knows which rows are inside it, and finds them again from the place', () => {
    const place = placeOf(file!, 0, 1, 2)!
    expect(file!.hunks[0]!.rows.map(row => rowIn(row, place))).toEqual([false, true, true, false, false, false])
    expect(placeRows(file!, place)).toEqual({ hunk: 0, from: 1, to: 2 })
    expect(placeRows(file!, placeOf(file!, 0, 4, 5)!)).toEqual({ hunk: 0, from: 4, to: 5 })
  })

  it('refuses a place that is not one stretch of rows of the diff, or is longer than a comment may be', () => {
    // lines that are not in the diff at all, a file that did not change
    expect(placeRows(file!, { path: 'x.js', head: { start: 40, end: 41 }, base: null })).toBeNull()
    expect(placeRows(file!, { path: 'y.js', head: { start: 1, end: 1 }, base: null })).toBeNull()
    // head line 2 and base line 3 are not one stretch (row 2 and row 4, with row 3 between them uncovered)
    expect(placeRows(file!, { path: 'x.js', head: { start: 2, end: 2 }, base: { start: 3, end: 3 } })).toBeNull()
    // nothing on either side
    expect(placeRows(file!, { path: 'x.js', head: null, base: null })).toBeNull()
    // across two hunks
    const far = lines(30)
    const changed = [...far]
    changed[1] = 'x'
    changed[25] = 'y'
    const [split] = pullRequestDiff({ 'x.js': text(far) }, { 'x.js': text(changed) })
    expect(split!.hunks).toHaveLength(2)
    expect(placeRows(split!, { path: 'x.js', head: { start: 2, end: 26 }, base: null })).toBeNull()
    // at most MAX_COMMENT_LINES rows
    const long = lines(MAX_COMMENT_LINES + 1, 100)
    const [big] = pullRequestDiff({ 'x.js': '' }, { 'x.js': text(long) })
    expect(placeOf(big!, 0, 0, MAX_COMMENT_LINES - 1)).not.toBeNull()
    expect(placeOf(big!, 0, 0, MAX_COMMENT_LINES)).toBeNull()
  })

  it('gives a comment every line its rows have, and refuses lines that are not one stretch of one hunk', () => {
    const diff = pullRequestDiff({ 'x.js': base }, { 'x.js': head })
    // head line 4 is an unchanged row: it is base line 3 as well
    expect(canonicalPlace(diff, { path: 'x.js', head: { start: 4, end: 4 }, base: null })).toEqual({ path: 'x.js', head: { start: 4, end: 4 }, base: { start: 3, end: 3 } })
    expect(canonicalPlace(diff, { path: 'x.js', head: { start: 2, end: 2 }, base: { start: 3, end: 3 } })).toBeNull()
    expect(canonicalPlace(diff, { path: 'x.js', head: { start: 9, end: 9 }, base: null })).toBeNull()
    const far = lines(30)
    const changed = [...far]
    changed[1] = 'x'
    changed[25] = 'y'
    expect(canonicalPlace(pullRequestDiff({ 'x.js': text(far) }, { 'x.js': text(changed) }), { path: 'x.js', head: { start: 2, end: 26 }, base: null })).toBeNull()
  })

  it('turns a level\'s spot (head lines or removed lines) into the place a comment on it has', () => {
    const diff = pullRequestDiff({ 'x.js': base }, { 'x.js': head })
    expect(placeFor(diff, { path: 'x.js', lines: [2, 3] })).toEqual({ path: 'x.js', head: { start: 2, end: 3 }, base: null })
    expect(placeFor(diff, { path: 'x.js', removed: [2, 2] })).toEqual({ path: 'x.js', head: null, base: { start: 2, end: 2 } })
    expect(placeFor(diff, { path: 'x.js', removed: [2, 2], lines: [2, 2] })).toEqual({ path: 'x.js', head: { start: 2, end: 2 }, base: { start: 2, end: 2 } })
    expect(placeFor(diff, { path: 'x.js', lines: [9, 9] })).toBeNull()
    expect(placeFor(diff, { path: 'nope.js', lines: [1, 1] })).toBeNull()
  })
})
