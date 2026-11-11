// Public API of the level engine (docs/features/levels.md).
import { gitLevels } from './git'
import type { Level } from './types'

export type * from './types'
export type { LevelProgress, Progress } from './progress'

export { MAX_SNAPSHOTS, TRAINER_COMMANDS, saveFile, startLevel, submit } from './engine'
export { PROGRESS_VERSION, emptyProgress, parseProgress, recordSolve, serializeProgress } from './progress'
export { gitLevels }

/** Every level of every track, in play order. */
export const levels: Level[] = [...gitLevels]

export function levelById(id: string): Level | null {
  return levels.find(level => level.id === id) ?? null
}

/** The level after `id` in play order, or null for the last one (or an unknown id). */
export function nextLevel(id: string): Level | null {
  const index = levels.findIndex(level => level.id === id)
  return index === -1 ? null : levels[index + 1] ?? null
}
