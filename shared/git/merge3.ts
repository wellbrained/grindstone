// Line-based three-way merge (diff3 style) for files and flat trees.
import { matchLines, splitLines } from './diff'
import type { Tree, UnmergedKind } from './types'

export interface MergeLabels {
  ours: string
  theirs: string
}

export interface Merge3Result {
  content: string
  conflict: boolean
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i])
const terminated = (lines: string[]) => lines.map(line => line.endsWith('\n') ? line : `${line}\n`)

/** Merges `ours` and `theirs` against `base`; overlapping different changes become a conflict block. */
export function merge3(base: string, ours: string, theirs: string, labels: MergeLabels): Merge3Result {
  const baseLines = splitLines(base)
  const oursLines = splitLines(ours)
  const theirsLines = splitLines(theirs)
  const toOurs = matchLines(baseLines, oursLines)
  const toTheirs = matchLines(baseLines, theirsLines)

  const result: string[] = []
  let conflict = false
  let b = 0
  let o = 0
  let t = 0

  while (b < baseLines.length || o < oursLines.length || t < theirsLines.length) {
    if (b < baseLines.length && toOurs[b] === o && toTheirs[b] === t) {
      result.push(baseLines[b]!)
      b++
      o++
      t++
      continue
    }

    // Unstable region: up to the next base line that both sides kept.
    let next = b
    while (next < baseLines.length && (toOurs[next] === undefined || toTheirs[next] === undefined)) next++
    const oEnd = toOurs[next] ?? oursLines.length
    const tEnd = toTheirs[next] ?? theirsLines.length
    const baseChunk = baseLines.slice(b, next)
    const oursChunk = oursLines.slice(o, oEnd)
    const theirsChunk = theirsLines.slice(t, tEnd)

    if (same(oursChunk, baseChunk)) {
      result.push(...theirsChunk)
    } else if (same(theirsChunk, baseChunk) || same(oursChunk, theirsChunk)) {
      result.push(...oursChunk)
    } else {
      // Move lines both sides share at the edges out of the conflict block (like git's zealous merge).
      let head = 0
      while (head < oursChunk.length && head < theirsChunk.length && oursChunk[head] === theirsChunk[head]) head++
      let tail = 0
      while (
        tail < oursChunk.length - head && tail < theirsChunk.length - head
        && oursChunk[oursChunk.length - 1 - tail] === theirsChunk[theirsChunk.length - 1 - tail]
      ) tail++
      conflict = true
      result.push(...oursChunk.slice(0, head))
      result.push(`<<<<<<< ${labels.ours}\n`)
      result.push(...terminated(oursChunk.slice(head, oursChunk.length - tail)))
      result.push('=======\n')
      result.push(...terminated(theirsChunk.slice(head, theirsChunk.length - tail)))
      result.push(`>>>>>>> ${labels.theirs}\n`)
      result.push(...oursChunk.slice(oursChunk.length - tail))
    }
    b = next
    o = oEnd
    t = tEnd
  }

  return { content: result.join(''), conflict }
}

export interface TreeConflict {
  path: string
  kind: UnmergedKind
  message: string
}

export interface TreeMergeResult {
  /** What the working tree should contain: merged files, conflicted files with markers. */
  tree: Tree
  /** What the index should contain: merged files, our side for conflicted files. */
  index: Tree
  conflicts: TreeConflict[]
  /** Paths changed on both sides (git prints "Auto-merging <path>"). */
  autoMerged: string[]
}

/** Three-way merge of flat trees, path by path. */
export function mergeTrees(base: Tree, ours: Tree, theirs: Tree, labels: MergeLabels): TreeMergeResult {
  const paths = [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].sort()
  const tree: Tree = {}
  const index: Tree = {}
  const conflicts: TreeConflict[] = []
  const autoMerged: string[] = []

  const put = (path: string, content: string | undefined, staged: string | undefined) => {
    if (content !== undefined) tree[path] = content
    if (staged !== undefined) index[path] = staged
  }

  for (const path of paths) {
    const b = base[path]
    const o = ours[path]
    const t = theirs[path]

    if (o === t) put(path, o, o)
    else if (o === b) put(path, t, t)
    else if (t === b) put(path, o, o)
    else if (o !== undefined && t !== undefined) {
      autoMerged.push(path)
      const merged = merge3(b ?? '', o, t, labels)
      if (merged.conflict) {
        const added = b === undefined
        conflicts.push({
          path,
          kind: added ? 'both added' : 'both modified',
          message: `CONFLICT (${added ? 'add/add' : 'content'}): Merge conflict in ${path}`
        })
        put(path, merged.content, o)
      } else {
        put(path, merged.content, merged.content)
      }
    } else if (o === undefined) {
      conflicts.push({
        path,
        kind: 'deleted by us',
        message: `CONFLICT (modify/delete): ${path} deleted in ${labels.ours} and modified in ${labels.theirs}.  Version ${labels.theirs} of ${path} left in tree.`
      })
      put(path, t, undefined)
    } else {
      conflicts.push({
        path,
        kind: 'deleted by them',
        message: `CONFLICT (modify/delete): ${path} deleted in ${labels.theirs} and modified in ${labels.ours}.  Version ${labels.ours} of ${path} left in tree.`
      })
      put(path, o, o)
    }
  }

  return { tree, index, conflicts, autoMerged }
}
