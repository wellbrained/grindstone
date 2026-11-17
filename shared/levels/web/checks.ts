// Goal helpers for Web fundamentals levels: the prediction's own goal, next to Debugging's (checks.ts there), which read
// what the app did in the check run of the last reload, never the code's text.
import type { Goal } from '../types'
import type { DebugRecord, DebugState } from '../debugging/types'

/** Every question of the level's prediction is answered, right or wrong (a wrong answer never blocks). */
export function predictedGoal(label: string, questions: number): Goal<DebugState, DebugRecord> {
  return { id: 'predicted', label, check: ({ state }) => (state.predicted?.length ?? 0) >= questions }
}
