import { describe, expect, it } from 'vitest'
import { PROGRESS_VERSION, emptyProgress, parseProgress, recordPlay, recordSolve, serializeProgress } from '../../../shared/levels'
import type { Session } from '../../../shared/levels'

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

describe('progress', () => {
  it('starts empty', () => {
    expect(PROGRESS_VERSION).toBe(2)
    expect(emptyProgress()).toEqual({ version: PROGRESS_VERSION, levels: {}, lastPlayed: null })
  })

  it('records a solve with hints, commands and the best command count', () => {
    let progress = recordSolve(emptyProgress(), 'git-01-first-commit', session({ commandCount: 7, hintsUsed: 2 }))
    expect(progress.levels['git-01-first-commit']).toEqual({ solved: true, hintsUsed: 2, commands: 7, bestCommands: 7 })
    progress = recordSolve(progress, 'git-01-first-commit', session({ commandCount: 4, hintsUsed: 0 }))
    expect(progress.levels['git-01-first-commit']).toEqual({ solved: true, hintsUsed: 0, commands: 4, bestCommands: 4 })
    progress = recordSolve(progress, 'git-01-first-commit', session({ commandCount: 9, hintsUsed: 1 }))
    expect(progress.levels['git-01-first-commit']).toEqual({ solved: true, hintsUsed: 1, commands: 9, bestCommands: 4 })
  })

  it('ignores a session that is not solved', () => {
    const progress = emptyProgress()
    expect(recordSolve(progress, 'git-01-first-commit', session({ solved: false }))).toBe(progress)
  })

  it('round-trips through serialize and parse', () => {
    const progress = recordPlay(recordSolve(emptyProgress(), 'git-02-branch', session({ commandCount: 3 })), 'git-03-merge', 1700)
    expect(parseProgress(serializeProgress(progress))).toEqual(progress)
  })

  it('records the last played level and time, without touching the level entries', () => {
    const solved = recordSolve(emptyProgress(), 'git-01-first-commit', session({}))
    const played = recordPlay(solved, 'git-02-branch', 42)
    expect(played.lastPlayed).toEqual({ levelId: 'git-02-branch', at: 42 })
    expect(played.levels).toBe(solved.levels)
    expect(recordPlay(played, 'git-03-merge', 50).lastPlayed).toEqual({ levelId: 'git-03-merge', at: 50 })
  })

  it('falls back to empty progress on missing, broken or foreign data', () => {
    for (const text of [null, undefined, '', 'not json', '42', '[]', 'null', '{"version":99,"levels":{}}', '{"version":0,"levels":{}}', '{"version":"2","levels":{}}', '{"version":1}', '{"version":1,"levels":[]}', '{"version":2,"levels":"x"}']) {
      expect(parseProgress(text)).toEqual(emptyProgress())
    }
  })

  it('drops malformed level entries and keeps the valid ones', () => {
    const good = { solved: true, hintsUsed: 1, commands: 4, bestCommands: 4 }
    const text = JSON.stringify({ version: 2, levels: { good, bad: { solved: 'yes' }, negative: { ...good, commands: -1 }, none: null }, lastPlayed: null })
    expect(parseProgress(text)).toEqual({ version: 2, levels: { good }, lastPlayed: null })
  })

  it('migrates version 1 data: the levels are kept, nothing is marked as last played', () => {
    const good = { solved: true, hintsUsed: 1, commands: 4, bestCommands: 3 }
    const text = JSON.stringify({ version: 1, levels: { 'git-01-first-commit': good, 'broken': { solved: 1 } } })
    expect(parseProgress(text)).toEqual({ version: 2, levels: { 'git-01-first-commit': good }, lastPlayed: null })
  })

  it('drops a malformed last played entry and keeps the levels', () => {
    const good = { solved: true, hintsUsed: 0, commands: 3, bestCommands: 3 }
    for (const lastPlayed of [null, 'git-01', 42, [], {}, { levelId: '', at: 1 }, { levelId: 'git-01-first-commit' }, { levelId: 'git-01-first-commit', at: -1 }, { levelId: 'git-01-first-commit', at: 'now' }, { levelId: 7, at: 1 }]) {
      const text = JSON.stringify({ version: 2, levels: { good }, lastPlayed })
      expect(parseProgress(text), JSON.stringify(lastPlayed)).toEqual({ version: 2, levels: { good }, lastPlayed: null })
    }
    const missing = JSON.stringify({ version: 2, levels: { good } })
    expect(parseProgress(missing)).toEqual({ version: 2, levels: { good }, lastPlayed: null })
    const valid = JSON.stringify({ version: 2, levels: {}, lastPlayed: { levelId: 'git-03-merge', at: 1700, extra: true } })
    expect(parseProgress(valid).lastPlayed).toEqual({ levelId: 'git-03-merge', at: 1700 })
  })
})
