// The play page's layout choice (docs/adr/0004-editor-layouts.md), stored per viewer in localStorage.
export const PLAY_LAYOUTS = ['terminal', 'ide'] as const

export type PlayLayout = typeof PLAY_LAYOUTS[number]

export const LAYOUT_STORAGE_KEY = 'grindstone:layout'

/** A stored value back to a layout. 'mix' (dropped on 2026-11-11) becomes the IDE; anything else unknown is Terminal. */
export function parseLayout(value: string | null | undefined): PlayLayout {
  if (value === 'mix') return 'ide'
  return PLAY_LAYOUTS.find(layout => layout === value) ?? 'terminal'
}
