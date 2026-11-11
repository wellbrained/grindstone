// Progress per level: pure data plus (de)serialisation. The UI owns the storage (localStorage adapter).
import type { Session } from './types'

export const PROGRESS_VERSION = 1

export interface LevelProgress {
  solved: boolean
  /** Hints revealed in the latest solve. */
  hintsUsed: number
  /** Commands typed in the latest solve (undone ones included). */
  commands: number
  /** Fewest commands of any solve. */
  bestCommands: number
}

export interface Progress {
  version: typeof PROGRESS_VERSION
  levels: Record<string, LevelProgress>
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, levels: {} }
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

function isLevelProgress(value: unknown): value is LevelProgress {
  return isObject(value)
    && typeof value.solved === 'boolean'
    && isCount(value.hintsUsed)
    && isCount(value.commands)
    && isCount(value.bestCommands)
}

/** Reads stored progress; missing, broken or other-version data gives empty progress, bad entries are dropped. */
export function parseProgress(text: string | null | undefined): Progress {
  if (!text) return emptyProgress()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return emptyProgress()
  }
  if (!isObject(data) || data.version !== PROGRESS_VERSION || !isObject(data.levels)) return emptyProgress()
  const levels: Record<string, LevelProgress> = {}
  for (const [id, entry] of Object.entries(data.levels)) {
    if (isLevelProgress(entry)) {
      levels[id] = { solved: entry.solved, hintsUsed: entry.hintsUsed, commands: entry.commands, bestCommands: entry.bestCommands }
    }
  }
  return { version: PROGRESS_VERSION, levels }
}
