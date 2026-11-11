// Conflict blocks in a file: finding them and the three "accept" actions of the editor (docs/features/ui.md, Editor).
// Pure text in, text out; the CodeMirror extension (app/editor/conflicts.ts) only draws what this finds.

/** Which side of a conflict block to keep. */
export type ConflictChoice = 'current' | 'incoming' | 'both'

/** A character range [from, to) in the text. */
export interface TextRange {
  from: number
  to: number
}

/**
 * One `<<<<<<< ... ======= ... >>>>>>>` block (diff3's optional `|||||||` base section included).
 * Ranges are character offsets into the text; `ours`, `base` and `theirs` cover the content lines between the markers,
 * each with its line breaks. Line numbers are 0-based.
 */
export interface ConflictBlock {
  /** Start of the `<<<<<<<` line to the end of the `>>>>>>>` line, its line break included. */
  from: number
  to: number
  ours: TextRange
  base: TextRange | null
  theirs: TextRange
  /** Label after `<<<<<<<` (e.g. HEAD) and after `>>>>>>>` (e.g. the branch name). */
  oursLabel: string
  theirsLabel: string
  startLine: number
  baseLine: number | null
  separatorLine: number
  endLine: number
}

const START = /^<{7}(?: (.*))?$/
const BASE = /^\|{7}(?: .*)?$/
const SEPARATOR = /^={7}$/
const END = /^>{7}(?: (.*))?$/

interface Line {
  text: string
  /** Offset of the first character. */
  from: number
  /** Offset after the line break (or the end of the text on the last line). */
  next: number
}

function linesOf(text: string): Line[] {
  const lines: Line[] = []
  let from = 0
  while (from <= text.length) {
    const end = text.indexOf('\n', from)
    if (end === -1) {
      if (from < text.length) lines.push({ text: text.slice(from), from, next: text.length })
      break
    }
    lines.push({ text: text.slice(from, end).replace(/\r$/, ''), from, next: end + 1 })
    from = end + 1
  }
  return lines
}

/**
 * Every complete conflict block, in order. A block that is never closed is ignored, and a new `<<<<<<<`
 * before the end starts over, so hand-edited, half-removed markers never produce a wrong action.
 */
export function parseConflicts(text: string): ConflictBlock[] {
  const lines = linesOf(text)
  const blocks: ConflictBlock[] = []
  let start = -1
  let base = -1
  let separator = -1

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.text
    if (START.test(line)) {
      start = index
      base = -1
      separator = -1
    } else if (start === -1) {
      continue
    } else if (separator === -1 && base === -1 && BASE.test(line)) {
      base = index
    } else if (separator === -1 && SEPARATOR.test(line)) {
      separator = index
    } else if (separator !== -1 && END.test(line)) {
      const at = (i: number) => lines[i]!
      const oursEnd = base === -1 ? separator : base
      blocks.push({
        from: at(start).from,
        to: at(index).next,
        ours: { from: at(start).next, to: at(oursEnd).from },
        base: base === -1 ? null : { from: at(base).next, to: at(separator).from },
        theirs: { from: at(separator).next, to: at(index).from },
        oursLabel: START.exec(at(start).text)?.[1] ?? '',
        theirsLabel: END.exec(line)?.[1] ?? '',
        startLine: start,
        baseLine: base === -1 ? null : base,
        separatorLine: separator,
        endLine: index
      })
      start = -1
    }
  }
  return blocks
}

/** What replaces a block for a choice: the kept lines, with their line breaks. */
export function conflictReplacement(text: string, block: ConflictBlock, choice: ConflictChoice): string {
  const ours = text.slice(block.ours.from, block.ours.to)
  const theirs = text.slice(block.theirs.from, block.theirs.to)
  let kept = choice === 'current' ? ours : choice === 'incoming' ? theirs : ours + theirs
  // a block that closes the file without a final line break leaves none behind either
  const endsWithBreak = text.slice(block.from, block.to).endsWith('\n')
  if (!endsWithBreak && kept.endsWith('\n')) kept = kept.slice(0, kept.endsWith('\r\n') ? -2 : -1)
  return kept
}

/** The text with one block resolved. */
export function resolveConflict(text: string, block: ConflictBlock, choice: ConflictChoice): string {
  return text.slice(0, block.from) + conflictReplacement(text, block, choice) + text.slice(block.to)
}

/** The text with the block at `index` (in `parseConflicts` order) resolved; unchanged when there is no such block. */
export function acceptConflict(text: string, index: number, choice: ConflictChoice): string {
  const block = parseConflicts(text)[index]
  return block ? resolveConflict(text, block, choice) : text
}
