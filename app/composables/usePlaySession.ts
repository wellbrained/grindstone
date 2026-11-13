// What every play page shares, whatever the track's environment (docs/features/ui.md, "Play page"): the session in
// memory, the goal checklist, the next level, recording the solve, the stats events, the spark and the debrief.
// A track's own play composable (git: useGitPlay) keeps its panels' state next to the session and calls `update` with
// every new session and `solved` on the action that solved the level.
// The session lives in memory (useState): leaving the page and coming back keeps it, a browser reload starts the level again.
import { nextLevel, runOf } from '#shared/levels'
import type { LevelOf, Progress, SessionOf } from '#shared/levels'

/** The spark effect runs about this long before the debrief opens. */
const DEBRIEF_DELAY_MS = 900

export interface PlaySessionOptions<T> {
  /** The state of a fresh visit: the session at the level's start plus the track's own play state (git: the terminal log). */
  fresh: () => T
  /** Again: clears the track's own panels (git: closes the editor panel) before the session starts over. */
  onRestart?: () => void
}

export function usePlaySession<S, R, T extends { session: SessionOf<S, R> }>(level: LevelOf<S, R, unknown>, options: PlaySessionOptions<T>) {
  const { progress, record, markPlayed, levelProgress } = useProgress()

  // `play:<id>` is the key restartPlays drops (useProgress)
  const store = useState<T>(`play:${level.id}`, options.fresh)
  const debriefOpen = ref(false)
  /** The progress right before the last solve on this page: the debrief's radar grows from it. */
  const progressBefore = shallowRef<Progress | null>(null)
  // the radar grows once per solve: "Show debrief" later opens it without the growth (ADR 0007)
  watch(debriefOpen, (open) => {
    if (!open) progressBefore.value = null
  })
  const sparkKey = ref(0)
  let debriefTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(debriefTimer))

  const session = computed(() => store.value.session)
  const next = nextLevel(level.id)
  const goals = computed(() => level.goals.map(goal => ({ id: goal.id, label: goal.label, met: session.value.goalsMet[goal.id] === true })))
  /** The best run so far (this one included, once it is recorded). */
  const best = computed(() => levelProgress(level.id)?.best ?? null)

  // stats: the first counted action of a visit to this level counts as a start (docs/analytics.md)
  let started = false

  /** Takes the new session of an action; sends the start and hint events. */
  function update(updated: SessionOf<S, R>) {
    const hintsBefore = session.value.hintsUsed
    store.value.session = updated
    if (!started && updated.commandCount > 0) {
      started = true
      trackEvent('level-start', { level: level.id })
    }
    if (updated.hintsUsed > hintsBefore) trackEvent('hint', { level: level.id, hint: updated.hintsUsed })
  }

  /** The action that first solved the level: records it, sends the event, plays the spark and opens the debrief. */
  function solved(attempt: SessionOf<S, R>) {
    progressBefore.value = progress.value
    record(level.id, attempt)
    trackEvent('level-solved', { level: level.id, ...runOf(attempt) })
    sparkKey.value++
    // a practice task has no debrief: its panel shows why it works, with Next and Again
    if (level.kind === 'practice') return
    // let the spark play before the dialog covers it
    clearTimeout(debriefTimer)
    debriefTimer = setTimeout(() => {
      debriefOpen.value = true
    }, DEBRIEF_DELAY_MS)
  }

  /** Again / Play again: the same entry from its start, as a new attempt (hints and counts from zero). */
  function again() {
    clearTimeout(debriefTimer)
    debriefOpen.value = false
    options.onRestart?.()
    store.value = options.fresh()
  }

  // a reset or a loaded backup restarts this page in place (useProgress)
  onScopeDispose(registerPlay(level.id, again))

  return {
    store,
    session,
    next,
    goals,
    best,
    debriefOpen,
    progressBefore,
    sparkKey,
    /** Typing or saving in a level makes it the one Continue opens. */
    markPlayed: () => markPlayed(level.id),
    update,
    solved,
    again
  }
}
