// The shop's deploys (ADR 0007, chapter 7; docs/features/levels.md "The deploys"): the last few changes that went live,
// each a few edits on the files before it. A level writes its history as data (`deployHistory`), its starting files
// are the live deploy's, and the model keeps every version's files: the Deploys panel shows each deploy's diff (git's
// line diff, shared/git/diff.ts, with each line's numbers on both sides), and Roll back puts a version's files in the
// editor. A line of a diff can be found again in the code as it is now (`lineIn`), so a click on it opens Code there.
// Pure; never throws on what a player typed (only on level data, which the tests load).
import { diffLines, matchLines, splitLines } from '../../git/diff'
import type { Edit } from '../../git/diff'
import type { Deploy, DeployHistory } from './types'

/** One deploy as a level writes it: who, when, why, and its edits (each the first occurrence of a text, replaced). */
export interface DeploySpec {
  id: string
  author: string
  at: string
  message: string
  edits: readonly { path: string, replace: readonly [string, string] }[]
}

/** The most deploys a level lists (the panel shows the last few). */
export const MAX_DEPLOYS = 8

/** Lines of context around a change, as git shows them. */
const CONTEXT = 3

/**
 * The largest comparison `lineIn` makes (lines of one text times lines of the other): the diff is quadratic, and the
 * code in the editor is whatever the player typed or pasted. Past it, a line keeps its number.
 */
export const MAX_MAP_CELLS = 4_000_000

/** Builds a level's deploy history from the files before the first deploy; throws for what a level cannot mean. */
export function deployHistory(base: Readonly<Record<string, string>>, specs: readonly DeploySpec[]): DeployHistory {
  if (!specs.length) throw new Error('a deploy history needs at least one deploy')
  if (specs.length > MAX_DEPLOYS) throw new Error(`a level lists at most ${MAX_DEPLOYS} deploys`)
  const seen = new Set<string>()
  let files: Readonly<Record<string, string>> = { ...base }
  const list: Deploy[] = []
  for (const spec of specs) {
    if (!/^[0-9a-f]{7}$/.test(spec.id)) throw new Error(`deploy ${spec.id}: an id is 7 hex digits`)
    if (seen.has(spec.id)) throw new Error(`deploy ${spec.id} is listed twice`)
    seen.add(spec.id)
    let next: Record<string, string> = { ...files }
    for (const edit of spec.edits) {
      const text = Object.hasOwn(next, edit.path) ? next[edit.path]! : null
      if (text === null) throw new Error(`deploy ${spec.id}: no file ${edit.path}`)
      const [from, to] = edit.replace
      if (!text.includes(from)) throw new Error(`deploy ${spec.id}: ${edit.path} does not contain ${JSON.stringify(from)}`)
      next = { ...next, [edit.path]: text.replace(from, () => to) }
    }
    if (!differingPaths(files, next).length) throw new Error(`deploy ${spec.id} changes nothing`)
    files = next
    list.push({ id: spec.id, author: spec.author, at: spec.at, message: spec.message, files })
  }
  return { base: { ...base }, list }
}

/** The files that are live: the newest deploy's. */
export const liveFiles = (history: DeployHistory): Readonly<Record<string, string>> => history.list.at(-1)?.files ?? history.base

export function deployById(history: DeployHistory, id: string): Deploy | null {
  return history.list.find(deploy => deploy.id === id) ?? null
}

/** The files before a deploy (the one before it, or the base); null for an unknown id. */
export function filesBefore(history: DeployHistory, id: string): Readonly<Record<string, string>> | null {
  const index = history.list.findIndex(deploy => deploy.id === id)
  if (index < 0) return null
  return index === 0 ? history.base : history.list[index - 1]!.files
}

/** The paths whose text differs between two file sets (one has it and the other not, too), in order. */
export function differingPaths(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): string[] {
  const paths = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...paths].filter(path => a[path] !== b[path]).sort()
}

/** The newest deploy whose files are exactly these (what "your saved code is this version" names); null for none. */
export function versionOf(history: DeployHistory, files: Readonly<Record<string, string>>): string | null {
  for (let index = history.list.length - 1; index >= 0; index--) {
    const deploy = history.list[index]!
    if (!differingPaths(deploy.files, files).length) return deploy.id
  }
  return null
}

/** One line of a diff: unchanged, added or removed, its number before and after, and the line after it to open. */
export interface DiffLine {
  kind: 'same' | 'add' | 'del'
  text: string
  /** Its number in the file before the deploy (null: added). */
  old: number | null
  /** Its number in the file after the deploy (null: removed). */
  new: number | null
  /** The line of the file after the deploy to show for it: its own, or for a removed line where it was. */
  at: number
}

export interface DiffHunk {
  /** git's `@@ -1,3 +1,4 @@`. */
  header: string
  lines: DiffLine[]
}

/** One file a deploy changed. */
export interface FileChange {
  path: string
  added: number
  removed: number
  hunks: DiffHunk[]
}

const range = (start: number, count: number) => count === 0 ? `${Math.max(start - 1, 0)},0` : count === 1 ? `${start}` : `${start},${count}`

function numbered(edits: readonly Edit[]): DiffLine[] {
  let old = 1
  let next = 1
  return edits.map((edit) => {
    const text = edit.line.replace(/\n$/, '')
    if (edit.type === 'del') return { kind: 'del', text, old: old++, new: null, at: next }
    if (edit.type === 'add') return { kind: 'add', text, old: null, new: next, at: next++ }
    return { kind: 'same', text, old: old++, new: next, at: next++ }
  })
}

/** The lines grouped into git's hunks, with CONTEXT unchanged lines around each change. */
function hunksOf(lines: readonly DiffLine[]): DiffHunk[] {
  const groups: [number, number][] = []
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    const start = Math.max(0, index - CONTEXT)
    const end = Math.min(lines.length - 1, index + CONTEXT)
    const last = groups.at(-1)
    if (last && start <= last[1] + 1) last[1] = end
    else groups.push([start, end])
  })
  return groups.map(([start, end]) => {
    const part = lines.slice(start, end + 1)
    const before = part.filter(line => line.kind !== 'add')
    const after = part.filter(line => line.kind !== 'del')
    const oldStart = before[0]?.old ?? (lines.slice(0, start).filter(line => line.kind !== 'add').length + 1)
    const newStart = after[0]?.new ?? (lines.slice(0, start).filter(line => line.kind !== 'del').length + 1)
    return { header: `@@ -${range(oldStart, before.length)} +${range(newStart, after.length)} @@`, lines: part }
  })
}

/** What a deploy changed, file by file (in path order); nothing for an unknown id. */
export function deployChanges(history: DeployHistory, id: string): FileChange[] {
  const deploy = deployById(history, id)
  const before = filesBefore(history, id)
  if (!deploy || !before) return []
  return differingPaths(before, deploy.files).map((path) => {
    const lines = numbered(diffLines(splitLines(before[path] ?? ''), splitLines(deploy.files[path] ?? '')))
    return {
      path,
      added: lines.filter(line => line.kind === 'add').length,
      removed: lines.filter(line => line.kind === 'del').length,
      hunks: hunksOf(lines)
    }
  })
}

/** How many lines a text has (as splitLines counts them), without splitting it. */
function lineCount(text: string): number {
  if (!text) return 0
  let count = 0
  let at = text.indexOf('\n')
  while (at >= 0) {
    count++
    at = text.indexOf('\n', at + 1)
  }
  return text.endsWith('\n') ? count : count + 1
}

/**
 * Where line `line` of `from` is in `to` (1-based): the same line where it is still there (longest common
 * subsequence), else the place of the line right after the last one kept before it. Null when there is no such line
 * (`to` is empty, `line` is not one of `from`'s). Texts too big to compare keep the number.
 */
export function lineIn(from: string, line: number, to: string): number | null {
  const fromCount = lineCount(from)
  const toCount = lineCount(to)
  if (!Number.isInteger(line) || line < 1 || line > fromCount || toCount === 0) return null
  if (fromCount * toCount > MAX_MAP_CELLS) return Math.min(line, toCount)
  const matches = matchLines(splitLines(from), splitLines(to))
  const own = matches[line - 1]
  if (own !== undefined) return own + 1
  for (let index = line - 2; index >= 0; index--) {
    const kept = matches[index]
    if (kept !== undefined) return Math.min(kept + 2, toCount)
  }
  return 1
}
