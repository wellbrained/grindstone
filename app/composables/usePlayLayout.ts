// The layout the viewer picked (Terminal / IDE / Mix), shared by every play page and kept in localStorage.
// Every storage access is guarded: with storage blocked the choice simply lasts for the visit.
import { LAYOUT_STORAGE_KEY, parseLayout } from '~/utils/play-layout'
import type { PlayLayout } from '~/utils/play-layout'

function readLayout(): PlayLayout {
  try {
    return parseLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY))
  } catch {
    return 'terminal'
  }
}

export function usePlayLayout() {
  const layout = useState<PlayLayout>('play-layout', readLayout)

  function setLayout(value: PlayLayout) {
    layout.value = value
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, value)
    } catch {
      // blocked storage: keep the choice for this visit only
    }
  }

  return { layout: readonly(layout), setLayout }
}
