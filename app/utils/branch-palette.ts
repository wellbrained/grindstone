// One colour per branch, the same in the terminal and in the graph.
// The palette itself is CSS (`--branch-0` ... in assets/css/main.css, with a `.branch-c-N` class each); this file only picks the slot.

/** Number of `--branch-N` tokens in main.css. */
export const BRANCH_PALETTE_SIZE = 7

/** `origin/main` and `main` are the same line, so they share a colour. */
export function baseBranchName(name: string): string {
  return name.replace(/^refs\/heads\//, '').replace(/^(?:refs\/remotes\/)?origin\//, '')
}

function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value
}

/** A stable palette slot for a branch name; `main` (and `origin/main`) is always slot 0, everything else lands on 1 to 6. */
export function branchIndex(name: string): number {
  const base = baseBranchName(name)
  if (base === 'main') return 0
  return 1 + hash(base) % (BRANCH_PALETTE_SIZE - 1)
}

/** The CSS class that sets `color` to the branch colour. */
export function branchClass(name: string): string {
  return `branch-c-${branchIndex(name)}`
}
