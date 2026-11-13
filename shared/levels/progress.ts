// Progress per entry (scenario or practice task): pure data plus (de)serialisation. The UI owns the storage
// (localStorage adapter) and the backup file; both go through `readProgress`, so a bad file can never break the app.
// Version 3 keeps a best and a latest run, the fewest hints any solve used (for the skill radar), a "practise again" flag
// and when an entry was last played. Versions 1 and 2 are migrated on read; version 3 data from before `fewestHints`
// gets it from its runs (docs/features/levels.md, "Progress"). Which run is best is the track's measure (`RunMeasure`):
// Git fewest commands, Debugging fewest hints then fewest reloads. Track-agnostic: never imports an environment.
import type { SessionOf } from './types'

export const PROGRESS_VERSION = 3

/**
 * One solve: how many counted actions it took (git: commands; undone ones included), how many hints were revealed and,
 * in a track with reloads (Debugging), how many reloads. `reloads` is absent in git runs, so their stored form did not change.
 */
export interface Run {
  commands: number
  hints: number
  reloads?: number
}

/** A count a best run is chosen by. */
export type RunCounter = 'commands' | 'hints' | 'reloads'

/** How a track picks its best run: the counters in order, fewer wins, each later one breaks a tie (a missing count is 0). */
export type RunMeasure = readonly RunCounter[]

/** Git: fewest commands, ties broken by fewest hints. */
export const fewestCommands: RunMeasure = ['commands', 'hints']

/** Debugging: fewest hints, then fewest reloads (ADR 0007). */
export const fewestHintsThenReloads: RunMeasure = ['hints', 'reloads']

/** What a solve needs from a session, whatever its environment. */
export type Attempt = Pick<SessionOf<unknown, unknown>, 'solved' | 'commandCount' | 'hintsUsed' | 'reloads'>

export interface LevelProgress {
  /** Stays true once solved; only a reset clears it. */
  solved: boolean
  /** The best solve by the track's measure (git: fewest commands, ties fewest hints). Null before the first solve (or unknown). */
  best: Run | null
  /** The most recent solve. */
  latest: Run | null
  /** Solved, but you want to practise it again; only a solved entry can carry it. */
  practiseAgain: boolean
  /** When you last typed a command in it (ms since epoch), for Continue. */
  lastPlayed: number | null
  /**
   * The fewest hints any solve revealed (not necessarily the best run's): the skill radar counts a level in full once
   * one solve did without its last hint. Only goes down. Null before the first solve (or unknown).
   */
  fewestHints: number | null
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

/** The entry of a level id, or undefined. Own entries only: `levels['constructor']` must not find Object.prototype's. */
export const entryOf = (progress: Progress, levelId: string): LevelProgress | undefined =>
  Object.hasOwn(progress.levels, levelId) ? progress.levels[levelId] : undefined

const blankEntry = (): LevelProgress => ({ solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: null, fewestHints: null })

/** The smallest of these counts, null when there is none. */
const fewest = (...counts: (number | null | undefined)[]): number | null => {
  const known = counts.filter((count): count is number => typeof count === 'number')
  return known.length ? Math.min(...known) : null
}

const withEntry = (progress: Progress, levelId: string, change: (entry: LevelProgress) => LevelProgress): Progress => ({
  ...progress,
  levels: { ...progress.levels, [levelId]: change(entryOf(progress, levelId) ?? blankEntry()) }
})

/** True when `run` beats `than` by the measure (default: fewer commands wins; on a tie, fewer hints). */
export function isBetterRun(run: Run, than: Run | null, measure: RunMeasure = fewestCommands): boolean {
  if (!than) return true
  for (const counter of measure) {
    const mine = run[counter] ?? 0
    const theirs = than[counter] ?? 0
    if (mine !== theirs) return mine < theirs
  }
  return false
}

/** The run a solved attempt stands for (`reloads` only when the attempt counted any). */
export const runOf = (attempt: Attempt): Run => ({
  commands: attempt.commandCount,
  hints: attempt.hintsUsed,
  ...(attempt.reloads !== undefined ? { reloads: attempt.reloads } : {})
})

/** Marks an entry as the one you last played. */
export function recordPlay(progress: Progress, levelId: string, at: number): Progress {
  return withEntry(progress, levelId, entry => ({ ...entry, lastPlayed: at }))
}

/**
 * Records a solved session as the latest run (and the best by the track's measure, when it is) and clears "practise
 * again" (you just did); an unsolved one leaves the progress as it is.
 */
export function recordSolve(progress: Progress, levelId: string, session: Attempt, measure: RunMeasure = fewestCommands): Progress {
  if (!session.solved) return progress
  const run = runOf(session)
  return withEntry(progress, levelId, entry => ({
    ...entry,
    solved: true,
    practiseAgain: false,
    latest: run,
    best: isBetterRun(run, entry.best, measure) ? run : entry.best,
    fewestHints: fewest(entry.fewestHints, run.hints)
  }))
}

/** Sets or clears the "practise again" flag; only a solved entry can carry it. */
export function setPractiseAgain(progress: Progress, levelId: string, flag: boolean): Progress {
  const entry = entryOf(progress, levelId)
  if (!entry?.solved || entry.practiseAgain === flag) return progress
  return withEntry(progress, levelId, current => ({ ...current, practiseAgain: flag }))
}

/** Forgets these entries completely: solved, runs, flag and last played (a reset of an entry, a chapter or a track). */
export function resetEntries(progress: Progress, levelIds: readonly string[]): Progress {
  const drop = new Set(levelIds)
  return { ...progress, levels: Object.fromEntries(Object.entries(progress.levels).filter(([id]) => !drop.has(id))) }
}

/**
 * The entry you typed in most recently; null when you have not played anything. A backup can hold ids this version does
 * not know (kept for forward compatibility): pass `isKnown` so they never win Continue.
 */
export function lastPlayed(progress: Progress, isKnown: (levelId: string) => boolean = () => true): LastPlayed | null {
  let latest: LastPlayed | null = null
  for (const [levelId, entry] of Object.entries(progress.levels)) {
    if (!isKnown(levelId)) continue
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
  const entries = ids.map(id => entryOf(progress, id)).filter(entry => entry !== undefined)
  return { solved: entries.filter(entry => entry.solved).length, practiseAgain: entries.filter(entry => entry.practiseAgain).length }
}

export function serializeProgress(progress: Progress): string {
  return JSON.stringify(progress)
}

/** A backup's `lastPlayed` may be at most this far ahead of now (clock skew between devices); further out is made up. */
export const MAX_FUTURE_MS = 24 * 60 * 60 * 1000

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
/** A stored run; `reloads` is kept when it is a count and left out otherwise (git runs never have one). */
const asRun = (value: unknown): Run | null => isObject(value) && isCount(value.commands) && isCount(value.hints)
  ? { commands: value.commands, hints: value.hints, ...(isCount(value.reloads) ? { reloads: value.reloads } : {}) }
  : null

/**
 * A version 3 entry; a broken field falls back to its blank value, an entry without `solved` is dropped. `fewestHints`
 * (missing in data from before it existed) is never above what the stored runs show, and only a solved entry has one.
 */
function readEntry(value: unknown, now: number): LevelProgress | null {
  if (!isObject(value) || typeof value.solved !== 'boolean') return null
  const best = asRun(value.best)
  const latest = asRun(value.latest)
  const entry: LevelProgress = {
    solved: value.solved,
    best,
    latest,
    practiseAgain: value.solved && value.practiseAgain === true,
    lastPlayed: isCount(value.lastPlayed) && value.lastPlayed <= now + MAX_FUTURE_MS ? value.lastPlayed : null,
    fewestHints: value.solved ? fewest(isCount(value.fewestHints) ? value.fewestHints : null, best?.hints, latest?.hints) : null
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
    lastPlayed: null,
    fewestHints: value.hintsUsed
  }
}

export type ReadResult
  = | { ok: true, progress: Progress }
    | { ok: false, error: 'json' | 'shape' | 'version' }

/**
 * Reads progress text strictly: broken JSON, a foreign shape or an unknown version is an error (the backup upload
 * shows it and changes nothing). Inside valid data, malformed entries are dropped and broken fields fall back to blank.
 */
export function readProgress(text: string, now = Date.now()): ReadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'json' }
  }
  if (!isObject(data) || !isObject(data.levels)) return { ok: false, error: 'shape' }
  if (data.version !== 1 && data.version !== 2 && data.version !== PROGRESS_VERSION) return { ok: false, error: 'version' }

  // no prototype, and `__proto__` is never an id: a key from a file must not reach Object.prototype
  const levels: Record<string, LevelProgress> = Object.create(null)
  const read = data.version === PROGRESS_VERSION ? (value: unknown) => readEntry(value, now) : migrateEntry
  for (const [id, value] of Object.entries(data.levels)) {
    if (id === '' || id === '__proto__') continue
    const entry = read(value)
    if (entry) levels[id] = entry
  }
  // version 2 kept the last played level beside the entries
  const last = data.lastPlayed
  if (data.version === 2 && isObject(last) && typeof last.levelId === 'string' && last.levelId !== '' && last.levelId !== '__proto__' && isCount(last.at) && last.at <= now + MAX_FUTURE_MS) {
    levels[last.levelId] = { ...(Object.hasOwn(levels, last.levelId) ? levels[last.levelId]! : blankEntry()), lastPlayed: last.at }
  }
  return { ok: true, progress: { version: PROGRESS_VERSION, levels } }
}

/** Reads stored progress; anything missing or unreadable gives empty progress (the app never fails on its storage). */
export function parseProgress(text: string | null | undefined): Progress {
  if (!text) return emptyProgress()
  const result = readProgress(text)
  return result.ok ? result.progress : emptyProgress()
}
