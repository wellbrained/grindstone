import { describe, expect, it } from 'vitest'
import { PROGRESS_VERSION, emptyProgress, parseProgress, recordSolve, serializeProgress } from '../../../shared/levels'
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
    expect(emptyProgress()).toEqual({ version: PROGRESS_VERSION, levels: {} })
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
    const progress = recordSolve(emptyProgress(), 'git-02-branch', session({ commandCount: 3 }))
    expect(parseProgress(serializeProgress(progress))).toEqual(progress)
  })

  it('falls back to empty progress on missing, broken or foreign data', () => {
    for (const text of [null, undefined, '', 'not json', '42', '[]', 'null', '{"version":99,"levels":{}}', '{"version":1}', '{"version":1,"levels":[]}']) {
      expect(parseProgress(text)).toEqual(emptyProgress())
    }
  })

  it('drops malformed level entries and keeps the valid ones', () => {
    const good = { solved: true, hintsUsed: 1, commands: 4, bestCommands: 4 }
    const text = JSON.stringify({ version: 1, levels: { good, bad: { solved: 'yes' }, negative: { ...good, commands: -1 }, none: null } })
    expect(parseProgress(text)).toEqual({ version: 1, levels: { good } })
  })
})
