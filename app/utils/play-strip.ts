// The counters in the strip above every play page (PlayStrip, docs/features/ui.md "Play strip"): what a run counts,
// written beside the short instruction. Git counts commands, Debugging reloads, Working with AI false alarms, Web
// fundamentals wrong predictions and then reloads (a prediction-only practice task has no app to reload).

export type StripCounterId = 'commands' | 'reloads' | 'falseAlarms' | 'wrongPredictions'

export interface StripCounter {
  id: StripCounterId
  n: number
}

/** What a play page knows about its run; a track reads only its own counts (a missing one is 0). */
export type StripRun
  = | { track: 'git', commands: number }
    | { track: 'debugging', reloads: number }
    | { track: 'ai', falseAlarms: number }
    | { track: 'web', wrongPredictions: number, reloads: number, predictionOnly: boolean }

/** The strip's counters for a run, in the order they are shown. */
export function stripCounters(run: StripRun): StripCounter[] {
  switch (run.track) {
    case 'git':
      return [{ id: 'commands', n: run.commands }]
    case 'debugging':
      return [{ id: 'reloads', n: run.reloads }]
    case 'ai':
      return [{ id: 'falseAlarms', n: run.falseAlarms }]
    case 'web':
      return [
        { id: 'wrongPredictions', n: run.wrongPredictions },
        ...(run.predictionOnly ? [] : [{ id: 'reloads' as const, n: run.reloads }])
      ]
  }
}

/** The counter's test id (kept from before the shared strip, the e2e tests read them). */
export const STRIP_TESTID: Record<StripCounterId, string> = {
  commands: 'commands',
  reloads: 'reloads',
  falseAlarms: 'false-alarms',
  wrongPredictions: 'wrong-predictions'
}
