// The IDE terminal's height the viewer dragged it to, kept per browser in localStorage (null: the default sizes).
// Every storage access is guarded: with storage blocked the choice simply lasts for the visit.
import { TERMINAL_HEIGHT_KEY, parseTerminalHeight } from '~/utils/terminal-size'

function readHeight(): number | null {
  try {
    return parseTerminalHeight(window.localStorage.getItem(TERMINAL_HEIGHT_KEY))
  } catch {
    return null
  }
}

export function useTerminalHeight() {
  const height = useState<number | null>('terminal-height', readHeight)

  /** While dragging: the new height, not stored yet. */
  function set(value: number) {
    height.value = value
  }

  /** The drag ended or a key moved it: keep the current height. */
  function commit() {
    try {
      if (height.value !== null) window.localStorage.setItem(TERMINAL_HEIGHT_KEY, String(height.value))
    } catch {
      // blocked storage: keep the choice for this visit only
    }
  }

  /** Back to the default sizes. */
  function reset() {
    height.value = null
    try {
      window.localStorage.removeItem(TERMINAL_HEIGHT_KEY)
    } catch {
      // blocked storage: nothing stored to remove
    }
  }

  return { height: readonly(height), set, commit, reset }
}
