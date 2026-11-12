// Progress per level: pure data plus (de)serialisation. The UI owns the storage (localStorage adapter).
// Version 2 added `lastPlayed`; version 1 data is migrated on read (the levels are kept, nothing is marked as last played).
import type { Session } from './types'

export const PROGRESS_VERSION = 2

export interface LevelProgress {
  solved: boolean
  /** Hints revealed in the latest solve. */
  hintsUsed: number
  /** Commands typed in the latest solve (undone ones included). */
  commands: number
  /** Fewest commands of any solve. */
  bestCommands: number
}

/** The level you last played (typed a command in), for "Continue". */
export interface LastPlayed {
  levelId: string
  /** ms since epoch */
  at: number
}

export interface Progress {
  version: typeof PROGRESS_VERSION
  levels: Record<string, LevelProgress>
  lastPlayed: LastPlayed | null
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, levels: {}, lastPlayed: null }
}

/** Marks a level as the one you last played. */
export function recordPlay(progress: Progress, levelId: string, at: number): Progress {
  return { ...progress, lastPlayed: { levelId, at } }
}

/** Records a solved session; an unsolved one leaves the progress as it is. */
export function recordSolve(progress: Progress, levelId: string, session: Session): Progress {
  if (!session.solved) return progress
  const previous = progress.levels[levelId]
  const entry: LevelProgress = {
    solved: true,
    hintsUsed: session.hintsUsed,
    commands: session.commandCount,
    bestCommands: previous ? Math.min(previous.bestCommands, session.commandCount) : session.commandCount
  }
  return { ...progress, levels: { ...progress.levels, [levelId]: entry } }
}

export function serializeProgress(progress: Progress): string {
  return JSON.stringify(progress)
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function isLastPlayed(value: unknown): value is LastPlayed {
  return isObject(value) && typeof value.levelId === 'string' && value.levelId !== '' && isCount(value.at)
}

function isLevelProgress(value: unknown): value is LevelProgress {
  return isObject(value)
    && typeof value.solved === 'boolean'
    && isCount(value.hintsUsed)
    && isCount(value.commands)
    && isCount(value.bestCommands)
}

/**
 * Reads stored progress; missing, broken or unknown-version data gives empty progress, bad entries are dropped.
 * Version 1 (no `lastPlayed`) is read as version 2 with `lastPlayed: null`.
 */
export function parseProgress(text: string | null | undefined): Progress {
  if (!text) return emptyProgress()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return emptyProgress()
  }
  if (!isObject(data) || (data.version !== 1 && data.version !== PROGRESS_VERSION) || !isObject(data.levels)) return emptyProgress()
  const levels: Record<string, LevelProgress> = {}
  for (const [id, entry] of Object.entries(data.levels)) {
    if (isLevelProgress(entry)) {
      levels[id] = { solved: entry.solved, hintsUsed: entry.hintsUsed, commands: entry.commands, bestCommands: entry.bestCommands }
    }
  }
  const lastPlayed = data.version === PROGRESS_VERSION && isLastPlayed(data.lastPlayed)
    ? { levelId: data.lastPlayed.levelId, at: data.lastPlayed.at }
    : null
  return { version: PROGRESS_VERSION, levels, lastPlayed }
}
