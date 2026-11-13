// Goal helpers for Debugging levels: every goal reads what the app did in the check run of the last reload (or, in a
// find task, the line you clicked), never the code's text, so any fix that works counts (ADR 0007).
import type { Goal } from '../types'
import type { DebugRecord, DebugState, FindTarget, ProbeValue } from './types'

type DebugGoal = Goal<DebugState, DebugRecord>

/** The value a probe read in the last reload's check run; undefined before a reload or when it could not run. */
export const probeValue = (state: DebugState, probe: string): ProbeValue | undefined => state.observed?.probes[probe]

/**
 * A probe read exactly this after the last reload (a text like '1' or '2.40', a count like 3), in a check run that
 * finished: one that hung (an endless loop, a request that never settled) proves nothing.
 */
export function probeGoal(id: string, label: string, probe: string, expected: ProbeValue): DebugGoal {
  return { id, label, check: ({ state }) => state.observed?.finished === true && probeValue(state, probe) === expected }
}

/** The last reload's check run went through (loading and every probe) without an error in the Console. */
export function noErrorsGoal(label = 'No errors in the Console after a reload'): DebugGoal {
  return { id: 'no-errors', label, check: ({ state }) => state.observed?.finished === true && state.observed.errors.length === 0 }
}

/** A find task: the line you clicked last is the answer. */
export function foundGoal(label: string, target: FindTarget): DebugGoal {
  return {
    id: 'found',
    label,
    check: ({ state }) => state.picked !== null && state.picked.path === target.path && target.lines.includes(state.picked.line)
  }
}
