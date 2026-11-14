// The diff of a pull request (ADR 0008, docs/features/levels.md "The review environment"): git's line diff (the LCS
// of shared/git/diff.ts, as the Git track and the Deploys panel use it) between the files before and after the pull
// request, file by file in path order, grouped into hunks with git's three lines of context, each row numbered on both
// sides. A comment sits on one stretch of rows of one hunk; where it is is said by the lines those rows have on each
// side (`CommentPlace`), so a level can name its planted issues by line numbers alone. Sous's description is shown as
// numbered lines too (`descriptionFile`: the paragraphs, then the claims), so a comment can point at a claim.
// Pure; never throws on what a player sends (a place that is not in the diff is simply null).
import { diffLines, splitLines } from '../../git/diff'
import type { CommentPlace, Files, LineSpan, PullRequest, Spot } from './types'

/** Lines of context around a change, as git shows them. */
export const DIFF_CONTEXT = 3

/** The most rows one comment may cover (a comment on a whole file finds nothing in particular). */
export const MAX_COMMENT_LINES = 12

/** One row of a diff: unchanged, added or removed, with its number in the file before (`old`) and after (`new`). */
export interface DiffRow {
  kind: 'same' | 'add' | 'del'
  /** The line without its newline. */
  text: string
  /** Its number in the file before the pull request (null: added). */
  old: number | null
  /** Its number in the file after it (null: removed). */
  new: number | null
}

export interface DiffHunk {
  /** git's `@@ -1,3 +1,4 @@`. */
  header: string
  rows: DiffRow[]
}

/** One file the pull request changed. */
export interface FileDiff {
  path: string
  status: 'added' | 'deleted' | 'modified'
  added: number
  removed: number
  hunks: DiffHunk[]
}

const range = (start: number, count: number) => count === 0 ? `${Math.max(start - 1, 0)},0` : count === 1 ? `${start}` : `${start},${count}`

function numbered(before: string, after: string): DiffRow[] {
  let old = 1
  let next = 1
  return diffLines(splitLines(before), splitLines(after)).map((edit) => {
    const text = edit.line.replace(/\n$/, '')
    if (edit.type === 'del') return { kind: 'del', text, old: old++, new: null }
    if (edit.type === 'add') return { kind: 'add', text, old: null, new: next++ }
    return { kind: 'same', text, old: old++, new: next++ }
  })
}

/** The rows grouped into git's hunks, with DIFF_CONTEXT unchanged rows around each change. */
function hunksOf(rows: readonly DiffRow[]): DiffHunk[] {
  const groups: [number, number][] = []
  rows.forEach((row, index) => {
    if (row.kind === 'same') return
    const start = Math.max(0, index - DIFF_CONTEXT)
    const end = Math.min(rows.length - 1, index + DIFF_CONTEXT)
    const last = groups.at(-1)
    if (last && start <= last[1] + 1) last[1] = end
    else groups.push([start, end])
  })
  return groups.map(([start, end]) => {
    const part = rows.slice(start, end + 1)
    const before = part.filter(row => row.kind !== 'add')
    const after = part.filter(row => row.kind !== 'del')
    const oldStart = before[0]?.old ?? (rows.slice(0, start).filter(row => row.kind !== 'add').length + 1)
    const newStart = after[0]?.new ?? (rows.slice(0, start).filter(row => row.kind !== 'del').length + 1)
    return { header: `@@ -${range(oldStart, before.length)} +${range(newStart, after.length)} @@`, rows: part }
  })
}

const diffs = new WeakMap<object, FileDiff[]>()

/** A pull request's diff (`pullRequestDiff` of its base and head), worked out once per pull request. */
export function diffOf(pr: { base: Files, head: Files }): FileDiff[] {
  let diff = diffs.get(pr)
  if (!diff) {
    diff = pullRequestDiff(pr.base, pr.head)
    diffs.set(pr, diff)
  }
  return diff
}

/**
 * The path of Sous's description among the places a comment can sit (no file of the shop has it: their names have an
 * extension).
 */
export const DESCRIPTION_PATH = 'description'

type Description = Pick<PullRequest, 'description' | 'claims'>

/**
 * Sous's description as numbered lines, like a file nobody changed: each paragraph one line, then each claim one line,
 * as one hunk of unchanged rows (each line has its number on both sides). A comment sits on them as on a file's rows.
 */
export function descriptionFile(pr: Description): FileDiff {
  const rows: DiffRow[] = [...pr.description, ...pr.claims].map((text, index) => ({ kind: 'same', text, old: index + 1, new: index + 1 }))
  return { path: DESCRIPTION_PATH, status: 'modified', added: 0, removed: 0, hunks: rows.length ? [{ header: '', rows }] : [] }
}

/** The line of the description a claim is on (`index` in `claims`, from 0), as a level's spot. Throws for no such claim. */
export function claimAt(pr: Description, index: number): Spot & { lines: readonly [number, number] } {
  if (!Number.isInteger(index) || index < 0 || index >= pr.claims.length) throw new Error(`no claim ${index} in ${JSON.stringify(pr.claims)}`)
  const line = pr.description.length + index + 1
  return { path: DESCRIPTION_PATH, lines: [line, line] }
}

/**
 * The line of the description a paragraph is on (`index` in `description`, from 0), as a level's spot: for a paragraph
 * that states what the code breaks. Throws for no such paragraph.
 */
export function paragraphAt(pr: Description, index: number): Spot & { lines: readonly [number, number] } {
  if (!Number.isInteger(index) || index < 0 || index >= pr.description.length) throw new Error(`no paragraph ${index} in ${JSON.stringify(pr.description)}`)
  return { path: DESCRIPTION_PATH, lines: [index + 1, index + 1] }
}

const targets = new WeakMap<object, FileDiff[]>()

/** Everywhere a comment can sit, worked out once per pull request: the description first, then the diff's files. */
export function commentTargets(pr: Description & { base: Files, head: Files }): FileDiff[] {
  let found = targets.get(pr)
  if (!found) {
    found = [descriptionFile(pr), ...diffOf(pr)]
    targets.set(pr, found)
  }
  return found
}

/** What the pull request changed, file by file in path order; files that did not change are left out. */
export function pullRequestDiff(base: Files, head: Files): FileDiff[] {
  const paths = [...new Set([...Object.keys(base), ...Object.keys(head)])].filter(path => base[path] !== head[path]).sort()
  return paths.map((path) => {
    const rows = numbered(Object.hasOwn(base, path) ? base[path]! : '', Object.hasOwn(head, path) ? head[path]! : '')
    return {
      path,
      status: !Object.hasOwn(base, path) ? 'added' : !Object.hasOwn(head, path) ? 'deleted' : 'modified',
      added: rows.filter(row => row.kind === 'add').length,
      removed: rows.filter(row => row.kind === 'del').length,
      hunks: hunksOf(rows)
    }
  })
}

const within = (line: number | null, span: LineSpan | null) => line !== null && span !== null && line >= span.start && line <= span.end

/** The row is one of the place's: its line after the pull request, or before it, is in the place's span on that side. */
export const rowIn = (row: DiffRow, place: CommentPlace): boolean => within(row.new, place.head) || within(row.old, place.base)

/** The span of these numbers (they ascend), or null when there are none. */
function spanOf(numbers: (number | null)[]): LineSpan | null {
  const known = numbers.filter((line): line is number => line !== null)
  return known.length ? { start: known[0]!, end: known.at(-1)! } : null
}

/**
 * Where a comment on rows `from` to `to` (either order, both included) of a hunk sits: the lines they have on each
 * side. Null for rows that are not there, or more than MAX_COMMENT_LINES of them.
 */
export function placeOf(file: FileDiff, hunk: number, from: number, to: number): CommentPlace | null {
  const rows = file.hunks[hunk]?.rows
  const first = Math.min(from, to)
  const last = Math.max(from, to)
  if (!rows || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last >= rows.length) return null
  if (last - first + 1 > MAX_COMMENT_LINES) return null
  const part = rows.slice(first, last + 1)
  return { path: file.path, head: spanOf(part.map(row => row.new)), base: spanOf(part.map(row => row.old)) }
}

const sameSpan = (a: LineSpan | null, b: LineSpan | null) => a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end)

/**
 * The rows a place covers, when it is exactly one stretch of rows of one hunk (the place `placeOf` gives for them);
 * null otherwise: lines that are not in the diff, two stretches, two hunks, too many rows.
 */
export function placeRows(file: FileDiff, place: CommentPlace): { hunk: number, from: number, to: number } | null {
  if (place.path !== file.path) return null
  for (const [hunk, { rows }] of file.hunks.entries()) {
    const inside = rows.flatMap((row, index) => rowIn(row, place) ? [index] : [])
    if (!inside.length) continue
    const from = inside[0]!
    const to = inside.at(-1)!
    const found = placeOf(file, hunk, from, to)
    if (!found || to - from + 1 !== inside.length || !sameSpan(found.head, place.head) || !sameSpan(found.base, place.base)) return null
    return { hunk, from, to }
  }
  return null
}

/**
 * The place a comment covering these lines really has: the rows with a line in it (on its side), when they are one
 * stretch of one hunk, and every line those rows have (an unchanged row has one on each side). Null otherwise.
 */
export function canonicalPlace(diff: readonly FileDiff[], place: CommentPlace): CommentPlace | null {
  const file = diff.find(each => each.path === place.path)
  if (!file) return null
  const matches = file.hunks.flatMap(({ rows }, hunk) => rows.flatMap((row, index) => rowIn(row, place) ? [{ hunk, index }] : []))
  const first = matches[0]
  const last = matches.at(-1)
  if (!first || !last || first.hunk !== last.hunk || last.index - first.index + 1 !== matches.length) return null
  return placeOf(file, first.hunk, first.index, last.index)
}

/** The place of a comment on a level's spot (a solution's comment): the rows with its lines; null when they are not one stretch. */
export function placeFor(diff: readonly FileDiff[], spot: Spot): CommentPlace | null {
  return canonicalPlace(diff, {
    path: spot.path,
    head: spot.lines ? { start: spot.lines[0], end: spot.lines[1] } : null,
    base: spot.removed ? { start: spot.removed[0], end: spot.removed[1] } : null
  })
}

/** The file of the diff a place is in, and its rows there; null when it is not a place a comment can have. */
export function locate(diff: readonly FileDiff[], place: CommentPlace): { file: FileDiff, hunk: number, from: number, to: number } | null {
  const file = diff.find(each => each.path === place.path)
  const rows = file ? placeRows(file, place) : null
  return file && rows ? { file, ...rows } : null
}
