// The open editor tabs of a play page (IDE and Mix layouts). They follow the engine's working tree by the rules in
// app/utils/editor-tabs.ts: clean tabs reload or close, dirty tabs get a notice (docs/features/ui.md, Sync rules).
import type { Tree } from '#shared/git'
import { keepMine, markSaved, openTab, reloadFromDisk, syncTabs } from '~/utils/editor-tabs'
import type { EditorTab } from '~/utils/editor-tabs'

export function useEditorTabs(workdir: () => Tree) {
  const tabs = ref<EditorTab[]>([])
  const activePath = ref<string | null>(null)
  const active = computed(() => tabs.value.find(tab => tab.path === activePath.value) ?? null)

  /** After tabs went away, the neighbour of the closed active tab (or the last one) becomes active. */
  function settleActive(previous: EditorTab[]) {
    if (activePath.value && tabs.value.some(tab => tab.path === activePath.value)) return
    const index = previous.findIndex(tab => tab.path === activePath.value)
    const remaining = tabs.value
    activePath.value = remaining.length ? remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!.path : null
  }

  watch(workdir, (tree) => {
    const previous = tabs.value
    tabs.value = syncTabs(previous, tree)
    settleActive(previous)
  })

  const replace = (path: string, change: (tab: EditorTab) => EditorTab | null) => {
    const previous = tabs.value
    tabs.value = previous.flatMap((tab) => {
      if (tab.path !== path) return [tab]
      const next = change(tab)
      return next ? [next] : []
    })
    settleActive(previous)
  }

  /** Opens a file (or focuses its tab). */
  function open(path: string) {
    if (!tabs.value.some(tab => tab.path === path)) tabs.value = [...tabs.value, openTab(path, workdir())]
    activePath.value = path
  }

  function close(path: string) {
    replace(path, () => null)
  }

  function setDraft(path: string, draft: string) {
    const tab = tabs.value.find(candidate => candidate.path === path)
    if (tab && tab.draft !== draft) replace(path, current => ({ ...current, draft }))
  }

  return {
    tabs,
    activePath,
    active,
    open,
    close,
    setDraft,
    reload: (path: string) => replace(path, tab => reloadFromDisk(tab, workdir())),
    keep: (path: string) => replace(path, tab => keepMine(tab, workdir())),
    /** Call right before the save reaches the engine, so the new working tree finds the tab in sync. */
    saved: (path: string, content: string) => replace(path, tab => markSaved(tab, content))
  }
}

export type EditorTabs = ReturnType<typeof useEditorTabs>
