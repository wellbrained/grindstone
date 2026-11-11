// Editor tabs and how they follow the engine's working tree (docs/features/ui.md, Sync rules). Pure: no Vue, no DOM.
import type { Tree } from '#shared/git'

export interface EditorTab {
  path: string
  /** The file as it was on disk when the draft was last in sync with it; null: not on disk (a new file, or deleted). */
  base: string | null
  /** What the editor shows. */
  draft: string
  /**
   * Set when the file changed on disk while the tab had unsaved edits: the new disk content (null: deleted).
   * The tab shows a notice until the player reloads or keeps their version.
   */
  changed: { disk: string | null } | null
}

/** Unsaved edits: the draft differs from what it was based on. A tab for a file that does not exist yet is clean while empty. */
export const isDirty = (tab: EditorTab) => tab.draft !== (tab.base ?? '')

/** A tab for a file, loaded from disk. */
export function openTab(path: string, workdir: Tree): EditorTab {
  const disk = workdir[path] ?? null
  return { path, base: disk, draft: disk ?? '', changed: null }
}

export type SyncDecision
  = | { type: 'keep' }
    | { type: 'reload', content: string }
    | { type: 'close' }
    | { type: 'notice', disk: string | null }

/**
 * What a tab does when the working tree changed (a command, undo, reset, a teammate):
 * - unchanged on disk (or back to what the tab was based on): keep, and drop a notice that no longer applies;
 * - changed, no unsaved edits: reload; deleted, no unsaved edits: close;
 * - changed or deleted under unsaved edits: a notice ("Reload from disk" / "Keep mine"), the draft stays.
 */
export function decideSync(tab: EditorTab, workdir: Tree): SyncDecision {
  const disk = workdir[tab.path] ?? null
  if (disk === tab.base) return { type: 'keep' }
  if (!isDirty(tab)) return disk === null ? { type: 'close' } : { type: 'reload', content: disk }
  return { type: 'notice', disk }
}

/** All tabs after a working-tree change, with the decisions applied; closed tabs are dropped. */
export function syncTabs(tabs: EditorTab[], workdir: Tree): EditorTab[] {
  const next: EditorTab[] = []
  for (const tab of tabs) {
    const decision = decideSync(tab, workdir)
    if (decision.type === 'close') continue
    if (decision.type === 'reload') next.push({ ...tab, base: decision.content, draft: decision.content, changed: null })
    else if (decision.type === 'notice') next.push(tab.changed?.disk === decision.disk ? tab : { ...tab, changed: { disk: decision.disk } })
    else next.push(tab.changed ? { ...tab, changed: null } : tab)
  }
  return next
}

/** "Reload from disk": throw the draft away and show the file as it is now (a deleted file closes: returns null). */
export function reloadFromDisk(tab: EditorTab, workdir: Tree): EditorTab | null {
  const disk = workdir[tab.path] ?? null
  if (disk === null) return null
  return { ...tab, base: disk, draft: disk, changed: null }
}

/** "Keep mine": the draft stays and now counts as an edit of the current disk content (saving overwrites it, or recreates a deleted file). */
export function keepMine(tab: EditorTab, workdir: Tree): EditorTab {
  return { ...tab, base: workdir[tab.path] ?? null, changed: null }
}

/** After a save: the draft is what is on disk now. */
export const markSaved = (tab: EditorTab, content: string): EditorTab => ({ ...tab, base: content, draft: content, changed: null })
