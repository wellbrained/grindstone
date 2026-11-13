import { describe, expect, it } from 'vitest'
import {
  emptyProgress,
  formatCredit,
  gitTrack,
  isRadarEmpty,
  levelCredit,
  parseProgress,
  radarGain,
  recordPlay,
  recordSolve,
  resetEntries,
  trackRadar
} from '../../../shared/levels'
import type { Level, LevelProgress, Progress, Session } from '../../../shared/levels'
import { bigTrack, practiceTrack } from './fixtures'

// practiceTrack: chapter A is s1 (practice p1a, p1b), s2, s3 (practice p3a); chapter B is t1 (practice q1a).
// Scenarios have three hints, practice tasks one.

const session = (hintsUsed: number, commandCount = 3): Session => ({
  levelId: 'x',
  state: { cwd: '/', workdir: {}, repo: null, origin: null, user: { name: 'You', email: 'you@example.com' }, clock: 0 },
  history: [],
  snapshots: [],
  firedEvents: [],
  hintsUsed,
  goalsMet: {},
  solved: true,
  commandCount
})

/** Solves each id once with that many hints. */
const solves = (entries: Record<string, number>, progress: Progress = emptyProgress()) =>
  Object.entries(entries).reduce((current, [id, hints]) => recordSolve(current, id, session(hints)), progress)

const entry = (fields: Partial<LevelProgress>): LevelProgress => ({
  solved: true,
  best: null,
  latest: null,
  practiseAgain: false,
  lastPlayed: null,
  fewestHints: null,
  ...fields
})

const level = (id: string): Level => {
  const found = practiceTrack().chapters.flatMap(chapter => chapter.levels).find(candidate => candidate.id === id)
  if (!found) throw new Error(id)
  return found
}

describe('level credit', () => {
  it('is 1 for a solve without the last hint, 0.5 when every solve revealed it, 0 unsolved', () => {
    const scenario = level('s1')
    const practice = level('p1a')
    expect(scenario.hints).toHaveLength(3)
    expect(practice.hints).toHaveLength(1)
    expect(levelCredit(scenario, undefined)).toBe(0)
    expect(levelCredit(scenario, entry({ solved: false, lastPlayed: 5 }))).toBe(0)
    expect(levelCredit(scenario, entry({ fewestHints: 0 }))).toBe(1)
    expect(levelCredit(scenario, entry({ fewestHints: 2 }))).toBe(1)
    expect(levelCredit(scenario, entry({ fewestHints: 3 }))).toBe(0.5)
    expect(levelCredit(practice, entry({ fewestHints: 0 }))).toBe(1)
    expect(levelCredit(practice, entry({ fewestHints: 1 }))).toBe(0.5)
    // solved, but how is unknown (broken data): half, never more than we know
    expect(levelCredit(scenario, entry({ fewestHints: null }))).toBe(0.5)
  })
})

describe('the skill radar of a track', () => {
  it('has an axis per chapter, in chapter order: the credit over the chapter\'s levels, both kinds counted', () => {
    // s1 clean (1), p1a with its one hint (0.5), s2 with all three hints (0.5), s3 with two hints (1); B untouched
    const axes = trackRadar(practiceTrack(), solves({ s1: 0, p1a: 1, s2: 3, s3: 2 }))
    expect(axes.map(axis => axis.chapter.id)).toEqual(['a', 'b'])
    expect(axes[0]).toMatchObject({ value: 3, total: 6, solved: 4, share: 0.5, coming: false })
    expect(axes[1]).toMatchObject({ value: 0, total: 2, solved: 0, share: 0, coming: false })
  })

  it('gives half credit for a solve that needed the last hint', () => {
    const axes = trackRadar(practiceTrack(), solves({ t1: 3, q1a: 0 }))
    expect(axes[1]).toMatchObject({ value: 1.5, total: 2, solved: 2, share: 0.75 })
    expect(formatCredit(axes[1]!.value)).toBe('1.5')
  })

  it('never lowers an axis: a later solve with the last hint keeps a clean solve, a clean replay raises a half one', () => {
    // the hinted replay is shorter, so it becomes the best run; the clean solve still counts
    const clean = solves({ t1: 0 })
    const thenHinted = recordSolve(clean, 't1', session(3, 2))
    expect(thenHinted.levels.t1!.best!.hints).toBe(3)
    expect(trackRadar(practiceTrack(), thenHinted)[1]!.value).toBe(1)

    const hinted = solves({ t1: 3 })
    expect(trackRadar(practiceTrack(), hinted)[1]!.value).toBe(0.5)
    expect(trackRadar(practiceTrack(), solves({ t1: 1 }, hinted))[1]!.value).toBe(1)
  })

  it('counts version 3 progress stored before fewestHints existed from its runs', () => {
    // the best run (fewest commands) used every hint, the latest none: the clean solve still counts in full
    const text = JSON.stringify({
      version: 3,
      levels: {
        t1: { solved: true, best: { commands: 2, hints: 3 }, latest: { commands: 5, hints: 0 }, practiseAgain: false, lastPlayed: null },
        q1a: { solved: true, best: { commands: 1, hints: 1 }, latest: { commands: 1, hints: 1 }, practiseAgain: false, lastPlayed: null }
      }
    })
    expect(trackRadar(practiceTrack(), parseProgress(text))[1]).toMatchObject({ value: 1.5, solved: 2 })
  })

  it('draws a chapter without levels as coming: no value, nothing to share', () => {
    const axes = trackRadar(bigTrack(), solves({ 'big-1-1': 0 }))
    expect(axes).toHaveLength(8)
    expect(axes[7]).toMatchObject({ coming: true, value: 0, total: 0, solved: 0, share: 0 })
    expect(axes.filter(axis => axis.coming)).toHaveLength(1)
    expect(axes[0]).toMatchObject({ coming: false, value: 1, total: 8 })
  })

  it('is empty before the first solve (playing alone does not count), and again after a reset', () => {
    expect(isRadarEmpty(trackRadar(practiceTrack(), emptyProgress()))).toBe(true)
    expect(isRadarEmpty(trackRadar(practiceTrack(), recordPlay(emptyProgress(), 's1', 1)))).toBe(true)
    const progress = solves({ s1: 3, t1: 0 })
    expect(isRadarEmpty(trackRadar(practiceTrack(), progress))).toBe(false)
    // a reset of one entry, then of the rest
    expect(trackRadar(practiceTrack(), resetEntries(progress, ['t1']))[1]!.value).toBe(0)
    expect(isRadarEmpty(trackRadar(practiceTrack(), resetEntries(progress, ['s1', 't1'])))).toBe(true)
    // solves in another track do not reach this one
    expect(isRadarEmpty(trackRadar(gitTrack, progress))).toBe(true)
  })

  it('covers the real git track: eight chapters, none coming', () => {
    const axes = trackRadar(gitTrack, emptyProgress())
    expect(axes.map(axis => axis.chapter.title)).toEqual(gitTrack.chapters.map(chapter => chapter.title))
    expect(axes.every(axis => !axis.coming && axis.total === axis.chapter.levels.length)).toBe(true)
  })
})

describe('what a solve changed on the radar', () => {
  it('names the chapter\'s old and new value, or nothing when it did not change', () => {
    const before = solves({ s1: 0, s2: 3 })
    const after = solves({ s3: 3 }, before)
    expect(radarGain(trackRadar(practiceTrack(), before), trackRadar(practiceTrack(), after), 'a')).toMatchObject({ chapter: { id: 'a' }, from: 1.5, to: 2, total: 6 })
    // a replay that changes nothing
    const again = solves({ s1: 3 }, after)
    expect(radarGain(trackRadar(practiceTrack(), after), trackRadar(practiceTrack(), again), 'a')).toBeNull()
    expect(radarGain(trackRadar(practiceTrack(), after), trackRadar(practiceTrack(), after), 'nope')).toBeNull()
  })

  it('writes values without a trailing .0', () => {
    expect([0, 0.5, 4.5, 5, 10].map(formatCredit)).toEqual(['0', '0.5', '4.5', '5', '10'])
  })
})
