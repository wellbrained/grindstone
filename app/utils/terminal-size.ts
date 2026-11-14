// The height of the terminal in the IDE layout, which the viewer can drag (docs/features/ui.md, "Terminal height").
// Pure maths and the stored value's reader; the drag handle is `TerminalSplitter.vue`, the storage `useTerminalHeight`.

export const TERMINAL_HEIGHT_KEY = 'grindstone:terminal-height'

/** The terminal keeps at least 10rem (the CSS `min-h-40` of its box). */
export const MIN_TERMINAL_HEIGHT = 160
/** The editor above it keeps at least this much (its header, tabs and a few lines). */
export const MIN_EDITOR_HEIGHT = 160
/** The room of the drag handle between the two. */
export const SPLITTER_HEIGHT = 16
export const KEY_STEP = 24
export const KEY_STEP_BIG = 96

/** The tallest the terminal may get in a column of this height, leaving the editor its minimum. */
export const maxTerminalHeight = (columnHeight: number) =>
  Math.max(MIN_TERMINAL_HEIGHT, Math.floor(columnHeight) - SPLITTER_HEIGHT - MIN_EDITOR_HEIGHT)

/**
 * The saved height as it is applied in a column of this height: kept inside the bounds, so a window that got shorter does not
 * squeeze the editor away. Null without a saved height; the saved value as it is while the column is not measured yet.
 */
export function appliedTerminalHeight(saved: number | null, columnHeight: number): number | null {
  if (saved === null) return null
  if (!(columnHeight > 0)) return saved
  return clampHeight(saved, MIN_TERMINAL_HEIGHT, maxTerminalHeight(columnHeight))
}

export const clampHeight = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)))

/** A stored value back to a height; anything that is not a sane number of pixels is no value (the default sizes apply). */
export function parseTerminalHeight(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || !/^\d{1,4}$/.test(raw)) return null
  const value = Number(raw)
  return value >= MIN_TERMINAL_HEIGHT ? value : null
}

/**
 * The height a key asks for, or null for a key that does nothing. The handle sits above the terminal, so Up moves it up
 * (taller terminal) and Down moves it down; Shift takes the big step; Home and End go to the smallest and the largest.
 */
export function stepTerminalHeight(key: string, shift: boolean, value: number, min: number, max: number): number | null {
  const step = shift ? KEY_STEP_BIG : KEY_STEP
  if (key === 'ArrowUp') return clampHeight(value + step, min, max)
  if (key === 'ArrowDown') return clampHeight(value - step, min, max)
  if (key === 'Home') return min
  if (key === 'End') return max
  return null
}
