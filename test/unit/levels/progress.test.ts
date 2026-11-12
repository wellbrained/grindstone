import { describe, expect, it } from 'vitest'
import {
  PROGRESS_VERSION,
  emptyProgress,
  lastPlayed,
  parseProgress,
  readProgress,
  recordPlay,
  recordSolve,
  resetEntries,
  serializeProgress,
  setPractiseAgain,
  summarizeProgress
} from '../../../shared/levels'
import type { LevelProgress, Session } from '../../../shared/levels'

const session = (overrides: Partial<Session>): Session => ({
  levelId: 'git-01-first-commit',
  state: { cwd: '/', workdir: {}, repo: null, origin: null, user: { name: 'You', email: 'you@example.com' }, clock: 0 },
  history: [],
  snapshots: [],
  firedEvents: [],
  hintsUsed: 0,
  goalsMet: {},
  solved: true,
  commandCount: 5,
  ...overrides
})

const solved = (overrides: Partial<LevelProgress> = {}): LevelProgress => ({
  solved: true,
  best: { commands: 3, hints: 0 },
  latest: { commands: 3, hints: 0 },
  practiseAgain: false,
  lastPlayed: null,
  ...overrides
})

const solve = (commandCount: number, hintsUsed: number) => session({ commandCount, hintsUsed })

describe('progress v3', () => {
  it('starts empty', () => {
    expect(PROGRESS_VERSION).toBe(3)
    expect(emptyProgress()).toEqual({ version: 3, levels: {} })
  })

  it('keeps the latest run and the best run: fewest commands, ties broken by fewest hints', () => {
    let progress = recordSolve(emptyProgress(), 'a', solve(7, 2))
    expect(progress.levels.a).toEqual(solved({ best: { commands: 7, hints: 2 }, latest: { commands: 7, hints: 2 } }))
    progress = recordSolve(progress, 'a', solve(4, 3))
    expect(progress.levels.a).toMatchObject({ best: { commands: 4, hints: 3 }, latest: { commands: 4, hints: 3 } })
    // same commands, fewer hints: the new best
    progress = recordSolve(progress, 'a', solve(4, 1))
    expect(progress.levels.a).toMatchObject({ best: { commands: 4, hints: 1 }, latest: { commands: 4, hints: 1 } })
    // a worse replay is only the latest; it stays solved
    progress = recordSolve(progress, 'a', solve(9, 0))
    expect(progress.levels.a).toMatchObject({ solved: true, best: { commands: 4, hints: 1 }, latest: { commands: 9, hints: 0 } })
    // same commands, more hints: not better
    progress = recordSolve(progress, 'a', solve(4, 2))
    expect(progress.levels.a!.best).toEqual({ commands: 4, hints: 1 })
  })

  it('ignores a session that is not solved', () => {
    const progress = recordSolve(emptyProgress(), 'a', solve(3, 0))
    expect(recordSolve(progress, 'a', session({ solved: false }))).toBe(progress)
  })

  it('records when an entry was last played, and finds the newest', () => {
    let progress = recordPlay(emptyProgress(), 'b', 42)
    expect(progress.levels.b).toEqual({ solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: 42 })
    progress = recordSolve(recordPlay(progress, 'a', 50), 'a', solve(3, 0))
    expect(progress.levels.a).toMatchObject({ solved: true, lastPlayed: 50 })
    expect(lastPlayed(progress)).toEqual({ levelId: 'a', at: 50 })
    expect(lastPlayed(recordPlay(progress, 'b', 60))).toEqual({ levelId: 'b', at: 60 })
    expect(lastPlayed(emptyProgress())).toBeNull()
  })

  it('flags a solved entry to practise again, and only a solved one; replaying keeps the flag', () => {
    const progress = recordSolve(recordPlay(emptyProgress(), 'b', 1), 'a', solve(3, 0))
    const flagged = setPractiseAgain(progress, 'a', true)
    expect(flagged.levels.a!.practiseAgain).toBe(true)
    expect(setPractiseAgain(progress, 'b', true)).toBe(progress)
    expect(setPractiseAgain(progress, 'nope', true)).toBe(progress)
    expect(recordSolve(flagged, 'a', solve(2, 0)).levels.a).toMatchObject({ practiseAgain: true, best: { commands: 2, hints: 0 } })
    expect(setPractiseAgain(flagged, 'a', false).levels.a!.practiseAgain).toBe(false)
  })

  it('resets entries completely: solved, runs, flag and last played', () => {
    let progress = recordSolve(recordPlay(emptyProgress(), 'a', 5), 'a', solve(3, 0))
    progress = setPractiseAgain(recordSolve(progress, 'b', solve(4, 1)), 'b', true)
    progress = recordPlay(progress, 'c', 9)
    const reset = resetEntries(progress, ['a', 'c', 'unknown'])
    expect(Object.keys(reset.levels)).toEqual(['b'])
    expect(lastPlayed(reset)).toBeNull()
    expect(resetEntries(progress, Object.keys(progress.levels))).toEqual(emptyProgress())
  })

  it('summarizes solved and flagged entries, optionally for some ids', () => {
    const progress = setPractiseAgain(recordSolve(recordSolve(recordPlay(emptyProgress(), 'c', 1), 'a', solve(3, 0)), 'b', solve(3, 0)), 'b', true)
    expect(summarizeProgress(progress)).toEqual({ solved: 2, practiseAgain: 1 })
    expect(summarizeProgress(progress, ['a', 'x'])).toEqual({ solved: 1, practiseAgain: 0 })
  })

  it('round-trips through serialize and parse', () => {
    const progress = setPractiseAgain(recordPlay(recordSolve(emptyProgress(), 'git-02-branch', solve(3, 1)), 'git-03-merge', 1700), 'git-02-branch', true)
    expect(parseProgress(serializeProgress(progress))).toEqual(progress)
    expect(readProgress(serializeProgress(progress))).toEqual({ ok: true, progress })
  })
})

describe('reading progress', () => {
  it('falls back to empty progress on missing, broken or foreign data', () => {
    for (const text of [null, undefined, '', 'not json', '42', '[]', 'null', '{"version":99,"levels":{}}', '{"version":0,"levels":{}}', '{"version":"3","levels":{}}', '{"version":1}', '{"version":1,"levels":[]}', '{"version":3,"levels":"x"}']) {
      expect(parseProgress(text)).toEqual(emptyProgress())
    }
  })

  it('tells why a file is not progress, for the backup upload', () => {
    expect(readProgress('not json')).toEqual({ ok: false, error: 'json' })
    expect(readProgress('[]')).toEqual({ ok: false, error: 'shape' })
    expect(readProgress('{"version":3}')).toEqual({ ok: false, error: 'shape' })
    expect(readProgress('{"version":4,"levels":{}}')).toEqual({ ok: false, error: 'version' })
    expect(readProgress('{"version":3,"levels":{}}')).toEqual({ ok: true, progress: emptyProgress() })
  })

  it('drops malformed entries and falls back to blank values for broken fields', () => {
    const good = solved({ lastPlayed: 7 })
    const text = JSON.stringify({
      version: 3,
      levels: {
        good,
        'noSolved': { best: null },
        'notObject': 'x',
        'none': null,
        'badRuns': { ...good, best: { commands: -1, hints: 0 }, latest: { commands: 2 } },
        'badFlag': { ...good, practiseAgain: 'yes', lastPlayed: 'now' },
        // a flag needs a solve; an unsolved entry is kept only while it was played
        'unsolvedFlag': { solved: false, best: null, latest: null, practiseAgain: true, lastPlayed: 3 },
        'unsolvedBlank': { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: null },
        '': good
      }
    })
    expect(parseProgress(text).levels).toEqual({
      good,
      badRuns: { ...good, best: null, latest: null },
      badFlag: { ...good, practiseAgain: false, lastPlayed: null },
      unsolvedFlag: { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: 3 }
    })
  })

  it('migrates version 2: runs from the old counts, last played onto its entry', () => {
    const text = JSON.stringify({
      version: 2,
      levels: {
        'git-01-first-commit': { solved: true, hintsUsed: 1, commands: 6, bestCommands: 4 },
        'git-03-merge': { solved: true, hintsUsed: 0, commands: 3, bestCommands: 3 },
        'broken': { solved: 'yes' },
        'unsolved': { solved: false, hintsUsed: 0, commands: 0, bestCommands: 0 }
      },
      lastPlayed: { levelId: 'git-04-merge-conflict', at: 1700 }
    })
    expect(parseProgress(text)).toEqual({
      version: 3,
      levels: {
        'git-01-first-commit': solved({ best: { commands: 4, hints: 1 }, latest: { commands: 6, hints: 1 } }),
        'git-03-merge': solved({ best: { commands: 3, hints: 0 }, latest: { commands: 3, hints: 0 } }),
        'git-04-merge-conflict': { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: 1700 }
      }
    })
    // last played on a solved entry lands on that entry
    const onSolved = JSON.stringify({ version: 2, levels: { a: { solved: true, hintsUsed: 0, commands: 3, bestCommands: 3 } }, lastPlayed: { levelId: 'a', at: 9 } })
    expect(parseProgress(onSolved).levels.a).toEqual(solved({ lastPlayed: 9 }))
  })

  it('drops a malformed version 2 last played and keeps the levels', () => {
    const levels = { a: { solved: true, hintsUsed: 0, commands: 3, bestCommands: 3 } }
    for (const last of [null, 'git-01', 42, [], {}, { levelId: '', at: 1 }, { levelId: 'a' }, { levelId: 'a', at: -1 }, { levelId: 'a', at: 'now' }, { levelId: 7, at: 1 }]) {
      expect(parseProgress(JSON.stringify({ version: 2, levels, lastPlayed: last })).levels, JSON.stringify(last)).toEqual({ a: solved() })
    }
  })

  it('migrates version 1 data: the levels are kept, nothing was played', () => {
    const text = JSON.stringify({ version: 1, levels: { 'git-01-first-commit': { solved: true, hintsUsed: 1, commands: 4, bestCommands: 3 }, 'broken': { solved: 1 } } })
    expect(parseProgress(text)).toEqual({
      version: 3,
      levels: { 'git-01-first-commit': solved({ best: { commands: 3, hints: 1 }, latest: { commands: 4, hints: 1 } }) }
    })
  })
})
