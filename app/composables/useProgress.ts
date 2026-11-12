// Progress per level, shared by the home page, the track page and the play page. Persisted in localStorage through the guarded adapter.
import { recordPlay, recordSolve } from '#shared/levels'
import type { LevelProgress, Progress, Session } from '#shared/levels'

export function useProgress() {
  // The app is a client-side SPA (ssr: false), so the initial value is read in the browser.
  const progress = useState<Progress>('progress', () => loadProgress())

  const levelProgress = (levelId: string): LevelProgress | null => progress.value.levels[levelId] ?? null
  const isSolved = (levelId: string) => levelProgress(levelId)?.solved === true

  // a level solved for the first time in this visit, until the track page has drawn its lane in once
  const justSolved = useState<string | null>('just-solved', () => null)

  /** Records a solved session and stores it; an unsolved one changes nothing. */
  function record(levelId: string, session: Session) {
    const first = session.solved && !isSolved(levelId)
    progress.value = recordSolve(progress.value, levelId, session)
    saveProgress(progress.value)
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
    progress.value = recordPlay(progress.value, levelId, at)
    saveProgress(progress.value)
  }

  return { progress, levelProgress, isSolved, record, markPlayed, takeJustSolved }
}
