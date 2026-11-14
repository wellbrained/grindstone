// Run the PR (ADR 0008, docs/features/ui.md "Working with AI play page"): a pull request's files as a Debugging app that
// only runs. The Debugging sandbox, bridge, App and Console are used as they are; the app is a Debugging level made for
// the moment (no probes, no goals), played with `useDebuggingPlay(level, { runOnly: true })`, so nothing is recorded.
import type { DebugLevel, ReviewLevel, RunSpec } from '../../shared/levels'

/** Which files run: the pull request's (head) or main's, before it (base). */
export type RunSide = 'head' | 'base'

/** The pull request's files on one side as an app to run; null for a level that does not run. */
export function runLevel(level: ReviewLevel, side: RunSide): DebugLevel | null {
  const run: RunSpec | undefined = level.run
  if (!run) return null
  const files = side === 'head' ? level.pr.head : level.pr.base
  return {
    id: `${level.id}--run-${side}`,
    track: 'debugging',
    kind: 'practice',
    practises: level.id,
    title: level.title,
    difficulty: 1,
    minutes: 0.5,
    task: '',
    hints: [''],
    why: '',
    sandbox: { page: run.page, open: run.open, probes: [], ...(run.backend ? { backend: run.backend } : {}) },
    setup: () => ({ files: { ...files }, observed: null, picked: null }),
    goals: [],
    solution: []
  }
}
