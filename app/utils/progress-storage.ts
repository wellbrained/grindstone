// The localStorage adapter around the engine's parseProgress / serializeProgress.
// Storage can be missing or throw (private windows, blocked site data): every access is guarded and the app works without it.
import { emptyProgress, parseProgress, serializeProgress } from '../../shared/levels'
import type { Progress } from '../../shared/levels'

export const PROGRESS_KEY = 'grindstone:progress'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** The browser's localStorage, or null when it is unavailable. */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadProgress(storage: StorageLike | null = browserStorage()): Progress {
  if (!storage) return emptyProgress()
  try {
    return parseProgress(storage.getItem(PROGRESS_KEY))
  } catch {
    return emptyProgress()
  }
}

/** Returns false when nothing could be stored. */
export function saveProgress(progress: Progress, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(PROGRESS_KEY, serializeProgress(progress))
    return true
  } catch {
    return false
  }
}
