// Keyboard moves along a tab set (WAI-ARIA tabs with automatic activation): Left and Right step and wrap, Home and End
// jump to the ends. Used by the play pages' tab sets (PlayTabs, and the Debugging panels under the code).

/** The tab a key moves to, or null when the key does not move along a tab set. */
export function tabAfterKey<T extends string>(names: readonly T[], current: T, key: string): T | null {
  const count = names.length
  if (!count) return null
  const index = Math.max(names.indexOf(current), 0)
  const to = key === 'ArrowRight'
    ? (index + 1) % count
    : key === 'ArrowLeft' ? (index + count - 1) % count : key === 'Home' ? 0 : key === 'End' ? count - 1 : -1
  return to < 0 ? null : names[to]!
}

/** Phone tab sets: as many columns as tabs, six take two rows of three (one row of six would cut their names). */
export const TAB_COLUMNS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-3',
  7: 'grid-cols-4'
}
