// The play page's layout choice (docs/adr/0004-editor-layouts.md), stored per viewer in localStorage.
export const PLAY_LAYOUTS = ['terminal', 'ide', 'mix'] as const

export type PlayLayout = typeof PLAY_LAYOUTS[number]

export const LAYOUT_STORAGE_KEY = 'grindstone:layout'

/** A stored value back to a layout; anything unknown (or nothing) is the default, Terminal. */
export function parseLayout(value: string | null | undefined): PlayLayout {
  return PLAY_LAYOUTS.find(layout => layout === value) ?? 'terminal'
}
