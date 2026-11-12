// Line-based diff (LCS). Files are small, so a quadratic table is fine.

export interface Edit {
  type: 'equal' | 'add' | 'del'
  line: string
}

export interface Hunk {
  header: string
  lines: Edit[]
}

/** Splits content into lines that keep their '\n', so a missing final newline stays visible. */
export function splitLines(content: string): string[] {
  // a non-string is a value inherited from Object.prototype (a file named toString, …): treat it as no content
  if (typeof content !== 'string' || content === '') return []
  const lines = content.split('\n').map(line => `${line}\n`)
  const last = lines.length - 1
  if (lines[last] === '\n') lines.pop()
  else lines[last] = lines[last]!.slice(0, -1)
  return lines
}

/** For every line of `a`, the index of the matching line in `b` (longest common subsequence), or undefined. */
export function matchLines(a: string[], b: string[]): Array<number | undefined> {
  const n = a.length
  const m = b.length
  const width = m + 1
  const table = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!)
    }
  }
  const matches: Array<number | undefined> = Array.from({ length: n })
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matches[i] = j
      i++
      j++
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      i++
    } else {
      j++
    }
  }
  return matches
}

export function diffLines(a: string[], b: string[]): Edit[] {
  const matches = matchLines(a, b)
  const edits: Edit[] = []
  let j = 0
  for (let i = 0; i < a.length; i++) {
    const match = matches[i]
    if (match === undefined) {
      edits.push({ type: 'del', line: a[i]! })
      continue
    }
    while (j < match) edits.push({ type: 'add', line: b[j++]! })
    edits.push({ type: 'equal', line: a[i]! })
    j++
  }
  while (j < b.length) edits.push({ type: 'add', line: b[j++]! })
  return edits
}

export function countChanges(before: string | undefined, after: string | undefined) {
  const edits = diffLines(splitLines(before ?? ''), splitLines(after ?? ''))
  return {
    insertions: edits.filter(edit => edit.type === 'add').length,
    deletions: edits.filter(edit => edit.type === 'del').length
  }
}

function range(start: number, count: number) {
  if (count === 0) return `${start - 1 < 0 ? 0 : start - 1},0`
  return count === 1 ? `${start}` : `${start},${count}`
}

/** Groups edits into unified-diff hunks with `context` lines around each change. */
export function hunks(edits: Edit[], context = 3): Hunk[] {
  const changed = edits.map((edit, index) => edit.type === 'equal' ? -1 : index).filter(index => index >= 0)
  if (changed.length === 0) return []

  const groups: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - context)
    const end = Math.min(edits.length - 1, index + context)
    const last = groups[groups.length - 1]
    if (last && start <= last[1] + 1) last[1] = end
    else groups.push([start, end])
  }

  return groups.map(([start, end]) => {
    let oldLine = 1
    let newLine = 1
    for (let i = 0; i < start; i++) {
      if (edits[i]!.type !== 'add') oldLine++
      if (edits[i]!.type !== 'del') newLine++
    }
    const lines = edits.slice(start, end + 1)
    const oldCount = lines.filter(edit => edit.type !== 'add').length
    const newCount = lines.filter(edit => edit.type !== 'del').length
    return {
      header: `@@ -${range(oldLine, oldCount)} +${range(newLine, newCount)} @@`,
      lines
    }
  })
}
