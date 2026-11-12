import { describe, expect, it } from 'vitest'
import { MAX_BACKUP_BYTES, backupFileName, readBackupFile } from '../../../app/utils/progress-backup'
import { MAX_FUTURE_MS, continueTarget, emptyProgress, entryOf, gitTrack, lastPlayed, readProgress, recordPlay, trackToContinue } from '../../../shared/levels'

const NOW = Date.UTC(2026, 10, 12)
const file = (text: string, size = text.length) => ({ size, text: () => Promise.resolve(text) })

describe('backup file name', () => {
  it('derives the name from the site name, in the local date', () => {
    expect(backupFileName('Grindstone', new Date(2026, 10, 2))).toBe('grindstone-progress-2026-11-02.json')
    expect(backupFileName('My  Cool App!', new Date(2026, 0, 31))).toBe('my-cool-app-progress-2026-01-31.json')
    expect(backupFileName('', new Date(2026, 0, 1))).toBe('app-progress-2026-01-01.json')
  })
})

describe('reading a backup file', () => {
  it('rejects a file over 1 MB without reading it', async () => {
    let read = false
    const big = {
      size: MAX_BACKUP_BYTES + 1,
      text: () => {
        read = true
        return Promise.resolve('{}')
      }
    }
    expect(await readBackupFile(big, NOW)).toEqual({ ok: false, error: 'size' })
    expect(read).toBe(false)
    expect((await readBackupFile(file('{"version":3,"levels":{}}', MAX_BACKUP_BYTES), NOW)).ok).toBe(true)
  })

  it('reports an unreadable file and a bad one', async () => {
    expect(await readBackupFile({ size: 1, text: () => Promise.reject(new Error('gone')) }, NOW)).toEqual({ ok: false, error: 'read' })
    expect(await readBackupFile(file('nope'), NOW)).toEqual({ ok: false, error: 'json' })
  })
})

describe('hostile progress files', () => {
  const entry = (lastPlayed: number | null) => ({ solved: true, best: null, latest: null, practiseAgain: false, lastPlayed })
  const text = (levels: Record<string, unknown>) => JSON.stringify({ version: 3, levels })

  it('drops a lastPlayed far in the future, and accepts one within a day', () => {
    const result = readProgress(text({ a: entry(NOW + MAX_FUTURE_MS + 1), b: entry(NOW + MAX_FUTURE_MS), c: entry(Number.MAX_SAFE_INTEGER) }), NOW)
    expect(result.ok && [result.progress.levels.a!.lastPlayed, result.progress.levels.b!.lastPlayed, result.progress.levels.c!.lastPlayed]).toEqual([null, NOW + MAX_FUTURE_MS, null])
  })

  it('never lets an id this version does not know win Continue, but keeps it stored', () => {
    const first = gitTrack.chapters[0]!.levels[0]!.id
    const second = gitTrack.chapters[0]!.levels[1]!.id
    const result = readProgress(text({ [first]: { ...entry(NOW - 1000), solved: false }, 'future-level': { ...entry(NOW), solved: false } }), NOW)
    if (!result.ok) throw new Error('unreadable')
    expect(result.progress.levels['future-level']).toBeDefined()
    expect(lastPlayed(result.progress)!.levelId).toBe('future-level')
    expect(continueTarget(gitTrack, result.progress)).toMatchObject({ reason: 'resume', place: { level: { id: first } } })
    expect(trackToContinue(result.progress)!.id).toBe(gitTrack.id)
    expect(second).toBeTruthy()
  })

  it('does not let __proto__, constructor and friends reach Object.prototype', () => {
    const result = readProgress(`{"version":3,"levels":{"__proto__":${JSON.stringify(entry(1))},"constructor":${JSON.stringify(entry(2))},"toString":${JSON.stringify(entry(3))}}}`, NOW)
    if (!result.ok) throw new Error('unreadable')
    expect(Object.getPrototypeOf(result.progress.levels)).toBeNull()
    expect(Object.keys(result.progress.levels).sort()).toEqual(['constructor', 'toString'])
    expect(({} as Record<string, unknown>).solved).toBeUndefined()
    expect(entryOf(result.progress, 'constructor')!.lastPlayed).toBe(2)
    // lookups of ids that were never stored find nothing, not Object.prototype members
    expect(entryOf(emptyProgress(), 'constructor')).toBeUndefined()
    expect(entryOf(emptyProgress(), '__proto__')).toBeUndefined()
    expect(recordPlay(emptyProgress(), 'toString', 5).levels.toString!.lastPlayed).toBe(5)
  })
})
