// Progress per entry, shared by the home page, the track page, the play page and the About page. Persisted in
// localStorage through the guarded adapter. Resets also drop the in-memory play sessions of the entries they clear, so
// a level you open afterwards starts fresh (a level page that is open restarts itself, see useLevelPlay).
import { entryOf, recordPlay, recordSolve, resetEntries, setPractiseAgain } from '#shared/levels'
import type { LevelProgress, Progress, Session } from '#shared/levels'

/** Restart callbacks of the play pages that are open now, by level id (registered by useLevelPlay). */
const openPlays = new Map<string, () => void>()

export function registerPlay(levelId: string, restart: () => void) {
  openPlays.set(levelId, restart)
  return () => {
    if (openPlays.get(levelId) === restart) openPlays.delete(levelId)
  }
}

/** Starts these entries over: an open play page restarts, any other stored session is dropped. */
export function restartPlays(levelIds: readonly string[]) {
  const dropped: string[] = []
  for (const id of levelIds) {
    const restart = openPlays.get(id)
    if (restart) restart()
    else dropped.push(`play:${id}`)
  }
  if (dropped.length) clearNuxtState(dropped)
}

export function useProgress() {
  // The app is a client-side SPA (ssr: false), so the initial value is read in the browser.
  const progress = useState<Progress>('progress', () => loadProgress())

  const levelProgress = (levelId: string): LevelProgress | null => entryOf(progress.value, levelId) ?? null
  const isSolved = (levelId: string) => levelProgress(levelId)?.solved === true

  // a level solved for the first time in this visit, until the track page has drawn its lane in once
  const justSolved = useState<string | null>('just-solved', () => null)

  /** Shows the progress and stores it; false when the browser would not store it (the page still works with it). */
  function commit(next: Progress): boolean {
    progress.value = next
    return saveProgress(next)
  }

  /** Records a solved session and stores it; an unsolved one changes nothing. */
  function record(levelId: string, session: Session) {
    const first = session.solved && !isSolved(levelId)
    commit(recordSolve(progress.value, levelId, session))
    if (first) justSolved.value = levelId
  }

  /** The level solved for the first time since the track page was last shown, once (then it is cleared). */
  function takeJustSolved(): string | null {
    const id = justSolved.value
    justSolved.value = null
    return id
  }

  /** Marks the level as the one you last played (for Continue) and stores it. */
  function markPlayed(levelId: string, at = Date.now()) {
    commit(recordPlay(progress.value, levelId, at))
  }

  /** Sets or clears "practise again" on a solved entry. */
  function setFlag(levelId: string, flag: boolean) {
    commit(setPractiseAgain(progress.value, levelId, flag))
  }

  /** Clears solved, runs, flag and last played of these entries, and starts their sessions over. */
  function reset(levelIds: readonly string[]) {
    commit(resetEntries(progress.value, levelIds))
    restartPlays(levelIds)
  }

  /** Replaces all progress (a loaded backup); every session starts over. False when it could not be stored. */
  function replace(next: Progress): boolean {
    const ids = [...new Set([...Object.keys(progress.value.levels), ...Object.keys(next.levels)])]
    const stored = commit(next)
    restartPlays(ids)
    return stored
  }

  return { progress, levelProgress, isSolved, record, markPlayed, takeJustSolved, setFlag, reset, replace }
}
