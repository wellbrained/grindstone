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

/** What a probe must read: exactly this value, or a number within a bound (chapter 6: "at most 1 request"). */
export type ProbeExpectation = ProbeValue | { atMost: number } | { atLeast: number }

/** The value meets the expectation: equal, or a number within its bound (a missing value never does). */
export function meets(value: ProbeValue | undefined, expected: ProbeExpectation): boolean {
  if (expected === null || typeof expected !== 'object') return value === expected
  if (typeof value !== 'number') return false
  return 'atMost' in expected ? value <= expected.atMost : value >= expected.atLeast
}

/**
 * Several probes read these after the last reload (exactly, or a number within a bound), in a check run that finished:
 * one goal for what belongs together ("Order can be tapped, and the message above it still shows"), so a guard never
 * passes on its own at the start. `clean`: and nothing red in the Console either (a fix that works but leaves an
 * uncaught error behind does not count).
 */
export function probesGoal(id: string, label: string, expected: Readonly<Record<string, ProbeExpectation>>, options: { clean?: boolean } = {}): DebugGoal {
  return {
    id,
    label,
    check: ({ state }) => state.observed?.finished === true
      && (!options.clean || state.observed.errors.length === 0)
      && Object.entries(expected).every(([probe, value]) => meets(probeValue(state, probe), value))
  }
}

/** A probe read a number of at least `min` after the last reload (a contrast ratio), in a check run that finished. */
export function probeAtLeast(id: string, label: string, probe: string, min: number): DebugGoal {
  return {
    id,
    label,
    check: ({ state }) => {
      const value = probeValue(state, probe)
      return state.observed?.finished === true && typeof value === 'number' && value >= min
    }
  }
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
