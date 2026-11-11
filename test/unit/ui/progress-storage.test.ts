import { describe, expect, it } from 'vitest'
import { PROGRESS_KEY, loadProgress, saveProgress } from '../../../app/utils/progress-storage'
import type { StorageLike } from '../../../app/utils/progress-storage'
import { emptyProgress } from '../../../shared/levels'
import type { Progress } from '../../../shared/levels'

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) }
}
const blocked: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  }
}
const solved: Progress = { version: 1, levels: { 'git-01-first-commit': { solved: true, hintsUsed: 1, commands: 4, bestCommands: 3 } } }

describe('progress storage', () => {
  it('round-trips progress', () => {
    const storage = memory()
    expect(saveProgress(solved, storage)).toBe(true)
    expect(storage.data.has(PROGRESS_KEY)).toBe(true)
    expect(loadProgress(storage)).toEqual(solved)
  })

  it('starts empty without data or with broken data', () => {
    const storage = memory()
    expect(loadProgress(storage)).toEqual(emptyProgress())
    storage.setItem(PROGRESS_KEY, '{nope')
    expect(loadProgress(storage)).toEqual(emptyProgress())
  })

  it('works with storage that throws or is missing', () => {
    expect(loadProgress(blocked)).toEqual(emptyProgress())
    expect(saveProgress(solved, blocked)).toBe(false)
    expect(loadProgress(null)).toEqual(emptyProgress())
    expect(saveProgress(solved, null)).toBe(false)
  })
})
