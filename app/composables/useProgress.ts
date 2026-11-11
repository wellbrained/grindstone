// Progress per level, shared by the home page and the play page. Persisted in localStorage through the guarded adapter.
import { recordSolve } from '#shared/levels'
import type { LevelProgress, Progress, Session } from '#shared/levels'

export function useProgress() {
  // The app is a client-side SPA (ssr: false), so the initial value is read in the browser.
  const progress = useState<Progress>('progress', () => loadProgress())

  const levelProgress = (levelId: string): LevelProgress | null => progress.value.levels[levelId] ?? null
  const isSolved = (levelId: string) => levelProgress(levelId)?.solved === true

  /** Records a solved session and stores it; an unsolved one changes nothing. */
  function record(levelId: string, session: Session) {
    progress.value = recordSolve(progress.value, levelId, session)
    saveProgress(progress.value)
  }

  return { progress, levelProgress, isSolved, record }
}
