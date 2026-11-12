// Progress per entry (scenario or practice task): pure data plus (de)serialisation. The UI owns the storage
// (localStorage adapter) and the backup file; both go through `readProgress`, so a bad file can never break the app.
// Version 3 keeps a best and a latest run, a "practise again" flag and when an entry was last played. Versions 1 and 2
// are migrated on read (docs/features/levels.md, "Progress").
import type { Session } from './types'

export const PROGRESS_VERSION = 3

/** One solve: how many commands it took (undone ones included) and how many hints were revealed. */
export interface Run {
  commands: number
  hints: number
}

export interface LevelProgress {
  /** Stays true once solved; only a reset clears it. */
  solved: boolean
  /** The best solve: fewest commands, ties broken by fewest hints. Null before the first solve (or unknown). */
  best: Run | null
  /** The most recent solve. */
  latest: Run | null
  /** Solved, but you want to practise it again; only a solved entry can carry it. */
  practiseAgain: boolean
  /** When you last typed a command in it (ms since epoch), for Continue. */
  lastPlayed: number | null
}

export interface Progress {
  version: typeof PROGRESS_VERSION
  levels: Record<string, LevelProgress>
}

/** The entry you last played, for Continue. */
export interface LastPlayed {
  levelId: string
  /** ms since epoch */
  at: number
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, levels: {} }
}

const blankEntry = (): LevelProgress => ({ solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: null })

const withEntry = (progress: Progress, levelId: string, change: (entry: LevelProgress) => LevelProgress): Progress => ({
  ...progress,
  levels: { ...progress.levels, [levelId]: change(progress.levels[levelId] ?? blankEntry()) }
})

/** Fewer commands wins; on a tie, fewer hints. */
export const isBetterRun = (run: Run, than: Run | null) =>
  !than || run.commands < than.commands || (run.commands === than.commands && run.hints < than.hints)

/** Marks an entry as the one you last played. */
export function recordPlay(progress: Progress, levelId: string, at: number): Progress {
  return withEntry(progress, levelId, entry => ({ ...entry, lastPlayed: at }))
}

/** Records a solved session as the latest run (and the best, when it is); an unsolved one leaves the progress as it is. */
export function recordSolve(progress: Progress, levelId: string, session: Session): Progress {
  if (!session.solved) return progress
  const run: Run = { commands: session.commandCount, hints: session.hintsUsed }
  return withEntry(progress, levelId, entry => ({
    ...entry,
    solved: true,
    latest: run,
    best: isBetterRun(run, entry.best) ? run : entry.best
  }))
}

/** Sets or clears the "practise again" flag; only a solved entry can carry it. */
export function setPractiseAgain(progress: Progress, levelId: string, flag: boolean): Progress {
  const entry = progress.levels[levelId]
  if (!entry?.solved || entry.practiseAgain === flag) return progress
  return withEntry(progress, levelId, current => ({ ...current, practiseAgain: flag }))
}

/** Forgets these entries completely: solved, runs, flag and last played (a reset of an entry, a chapter or a track). */
export function resetEntries(progress: Progress, levelIds: readonly string[]): Progress {
  const drop = new Set(levelIds)
  return { ...progress, levels: Object.fromEntries(Object.entries(progress.levels).filter(([id]) => !drop.has(id))) }
}

/** The entry you typed in most recently; null when you have not played anything. */
export function lastPlayed(progress: Progress): LastPlayed | null {
  let latest: LastPlayed | null = null
  for (const [levelId, entry] of Object.entries(progress.levels)) {
    if (entry.lastPlayed !== null && (!latest || entry.lastPlayed > latest.at)) latest = { levelId, at: entry.lastPlayed }
  }
  return latest
}

export interface ProgressSummary {
  solved: number
  practiseAgain: number
}

/** How much a progress holds, for the backup messages ("7 solved, 1 to practise again"). */
export function summarizeProgress(progress: Progress, levelIds?: readonly string[]): ProgressSummary {
  const ids = levelIds ?? Object.keys(progress.levels)
  const entries = ids.map(id => progress.levels[id]).filter(entry => entry !== undefined)
  return { solved: entries.filter(entry => entry.solved).length, practiseAgain: entries.filter(entry => entry.practiseAgain).length }
}

export function serializeProgress(progress: Progress): string {
  return JSON.stringify(progress)
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const asRun = (value: unknown): Run | null => isObject(value) && isCount(value.commands) && isCount(value.hints)
  ? { commands: value.commands, hints: value.hints }
  : null

/** A version 3 entry; a broken field falls back to its blank value, an entry without `solved` is dropped. */
function readEntry(value: unknown): LevelProgress | null {
  if (!isObject(value) || typeof value.solved !== 'boolean') return null
  const entry: LevelProgress = {
    solved: value.solved,
    best: asRun(value.best),
    latest: asRun(value.latest),
    practiseAgain: value.solved && value.practiseAgain === true,
    lastPlayed: isCount(value.lastPlayed) ? value.lastPlayed : null
  }
  return entry.solved || entry.lastPlayed !== null ? entry : null
}

/**
 * A version 1 or 2 entry (`{ solved, hintsUsed, commands, bestCommands }`): the latest run is kept as it was; the best
 * keeps its command count and, since the hints of that run were never stored, takes the latest run's hints.
 */
function migrateEntry(value: unknown): LevelProgress | null {
  if (!isObject(value) || typeof value.solved !== 'boolean' || !isCount(value.hintsUsed) || !isCount(value.commands) || !isCount(value.bestCommands)) return null
  if (!value.solved) return null
  return {
    solved: true,
    best: { commands: Math.min(value.bestCommands, value.commands), hints: value.hintsUsed },
    latest: { commands: value.commands, hints: value.hintsUsed },
    practiseAgain: false,
    lastPlayed: null
  }
}

export type ReadResult
  = | { ok: true, progress: Progress }
    | { ok: false, error: 'json' | 'shape' | 'version' }

/**
 * Reads progress text strictly: broken JSON, a foreign shape or an unknown version is an error (the backup upload
 * shows it and changes nothing). Inside valid data, malformed entries are dropped and broken fields fall back to blank.
 */
export function readProgress(text: string): ReadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'json' }
  }
  if (!isObject(data) || !isObject(data.levels)) return { ok: false, error: 'shape' }
  if (data.version !== 1 && data.version !== 2 && data.version !== PROGRESS_VERSION) return { ok: false, error: 'version' }

  const levels: Record<string, LevelProgress> = {}
  const read = data.version === PROGRESS_VERSION ? readEntry : migrateEntry
  for (const [id, value] of Object.entries(data.levels)) {
    if (id === '') continue
    const entry = read(value)
    if (entry) levels[id] = entry
  }
  // version 2 kept the last played level beside the entries
  const last = data.lastPlayed
  if (data.version === 2 && isObject(last) && typeof last.levelId === 'string' && last.levelId !== '' && isCount(last.at)) {
    levels[last.levelId] = { ...(levels[last.levelId] ?? blankEntry()), lastPlayed: last.at }
  }
  return { ok: true, progress: { version: PROGRESS_VERSION, levels } }
}

/** Reads stored progress; anything missing or unreadable gives empty progress (the app never fails on its storage). */
export function parseProgress(text: string | null | undefined): Progress {
  if (!text) return emptyProgress()
  const result = readProgress(text)
  return result.ok ? result.progress : emptyProgress()
}
