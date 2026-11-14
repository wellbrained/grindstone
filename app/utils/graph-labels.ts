// Fitting the commit graph's labels (branch and tag pills) into the room the graph has (docs/features/ui.md, "Graph layout").
// Pure maths, no DOM: CommitGraph.vue measures its box and draws what this returns.

/** The text cut to at most `max` characters with an ellipsis in the middle, so a long `feature/…` or `origin/…` name keeps its start and its end. */
export function fitLabel(text: string, max: number): string {
  if (text.length <= max) return text
  // room for the ellipsis and at least one character on each side
  const keep = Math.max(max, 3) - 1
  const head = Math.ceil(keep * 0.6)
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`
}

export interface FlowedPill {
  x: number
  /** 0 for the first line of pills, 1 for the next, … */
  line: number
}

/**
 * Pills in a row, left to right, with `gap` between them; a pill that would pass `max` starts a new line (a pill is never
 * split, and the first of a line is placed even when it is wider than `max`). `lines` is how many lines it took (0 without pills).
 */
export function flowPills(widths: number[], max: number, gap: number): { pills: FlowedPill[], lines: number } {
  const pills: FlowedPill[] = []
  let x = 0
  let line = 0
  for (const width of widths) {
    if (x > 0 && x + width > max) {
      x = 0
      line++
    }
    pills.push({ x, line })
    x += width + gap
  }
  return { pills, lines: widths.length ? line + 1 : 0 }
}
