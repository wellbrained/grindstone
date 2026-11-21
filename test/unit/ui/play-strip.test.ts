import { describe, expect, it } from 'vitest'
import { STRIP_TESTID, stripCounters } from '../../../app/utils/play-strip'

// Every play page has the same strip; each track counts what its runs are about (docs/features/ui.md, "Play strip").
describe('stripCounters', () => {
  it('git counts commands', () => {
    expect(stripCounters({ track: 'git', commands: 4 })).toEqual([{ id: 'commands', n: 4 }])
  })

  it('Debugging counts reloads', () => {
    expect(stripCounters({ track: 'debugging', reloads: 2 })).toEqual([{ id: 'reloads', n: 2 }])
  })

  it('Working with AI counts false alarms', () => {
    expect(stripCounters({ track: 'ai', falseAlarms: 1 })).toEqual([{ id: 'falseAlarms', n: 1 }])
  })

  it('Web fundamentals counts wrong predictions first, then reloads', () => {
    expect(stripCounters({ track: 'web', wrongPredictions: 1, reloads: 3, predictionOnly: false })).toEqual([
      { id: 'wrongPredictions', n: 1 },
      { id: 'reloads', n: 3 }
    ])
  })

  it('a prediction-only Web task has nothing to reload', () => {
    expect(stripCounters({ track: 'web', wrongPredictions: 0, reloads: 0, predictionOnly: true })).toEqual([{ id: 'wrongPredictions', n: 0 }])
  })

  it('gives every counter its own test id', () => {
    const ids = Object.values(STRIP_TESTID)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
