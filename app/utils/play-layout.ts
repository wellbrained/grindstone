// The play page's layout choice (docs/adr/0004-editor-layouts.md), stored per viewer in localStorage, and small helpers
// the play page's components share.
import type { EditorWait } from '#shared/git'

export const PLAY_LAYOUTS = ['terminal', 'ide'] as const

export type PlayLayout = typeof PLAY_LAYOUTS[number]

export const LAYOUT_STORAGE_KEY = 'grindstone:layout'

/** A stored value back to a layout. 'mix' (dropped on 2026-11-11) becomes the IDE; anything else unknown is Terminal. */
export function parseLayout(value: string | null | undefined): PlayLayout {
  if (value === 'mix') return 'ide'
  return PLAY_LAYOUTS.find(layout => layout === value) ?? 'terminal'
}

/** Phones and tablets: a focus there would pop up the keyboard unasked. */
export const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches

/** Stacked layouts (below lg) may have the element out of view: scroll it in, smoothly unless motion is reduced. */
export function revealIfStacked(el: HTMLElement | null | undefined) {
  if (window.matchMedia('(min-width: 64rem)').matches) return
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
}

/** The i18n key of the help line for the file git waits for: the todo list or a commit message. */
export const editorHelpKey = (wait: Pick<EditorWait, 'kind'> | null) => wait?.kind === 'todo' ? 'gitEditor.todoHelp' : 'gitEditor.messageHelp'
