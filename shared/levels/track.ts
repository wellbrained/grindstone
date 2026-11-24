// Tracks and chapters (docs/features/levels.md, "Tracks and chapters"): pure data and helpers over it.
// Play order, chapter numbers and scenario numbers ("3.2") are derived from the chapter lists, never written by hand.
// A practice task is listed right after the scenario it trains (after that scenario's other practice tasks) and has no
// number of its own.
import { entryOf, fewestCommands, lastPlayed } from './progress'
import type { Progress, RunMeasure } from './progress'
import type { Level, Scenario, TrackId } from './types'

export type TrackStatus = 'live' | 'coming'

/** A slot of the branch palette (`--branch-N` in main.css); a chapter's dot, rail marker, progress bar and level dots. */
export type ChapterColour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface Chapter {
  /** Unique within its track, e.g. 'merging'; also the section anchor on the track page. */
  id: string
  trackId: TrackId
  /** 1-based, from the chapter's place in the track. */
  number: number
  title: string
  /** One line: what the chapter covers. */
  description: string
  colour: ChapterColour
  /** In play order: each scenario followed by its practice tasks. Empty: the chapter is coming. */
  levels: readonly Level[]
}

export interface Track {
  id: TrackId
  title: string
  /** One line: what the track covers. */
  scope: string
  /** One short line that sells the track, shown large on its home page card; empty for none. */
  tagline: string
  /** A short paragraph (the pitch) for the track card on the home page. */
  description: string
  status: TrackStatus
  /** Path of the track's cheat sheet (e.g. '/git/cheat-sheet'), or null when it has none. */
  cheatSheet: string | null
  /** How its best run is chosen: Git fewest commands (then hints), Debugging fewest hints (then reloads). */
  bestRun: RunMeasure
  /** Empty for a coming track. */
  chapters: readonly Chapter[]
}

export interface ChapterDefinition {
  id: string
  title: string
  description: string
  colour: ChapterColour
  levels: readonly Level[]
}

export interface TrackDefinition {
  id: TrackId
  title: string
  scope: string
  tagline?: string
  description: string
  status: TrackStatus
  cheatSheet?: string
  /** Default: fewest commands, then fewest hints. */
  bestRun?: RunMeasure
  chapters?: readonly ChapterDefinition[]
}

/** Throws unless every practice task sits right after its scenario (or after that scenario's other practice tasks). */
function checkPracticePlacement(chapter: ChapterDefinition) {
  let scenario: Scenario | null = null
  for (const level of chapter.levels) {
    if (level.kind === 'scenario') scenario = level
    else if (!scenario) throw new Error(`${level.id} starts chapter ${chapter.id}: list it right after ${level.practises}`)
    else if (scenario.id !== level.practises) throw new Error(`${level.id} practises ${level.practises} but is listed after ${scenario.id}`)
  }
}

/**
 * Builds a track from its definition: numbers the chapters and checks that every level belongs here exactly once and
 * that every practice task follows its scenario.
 */
export function defineTrack(definition: TrackDefinition): Track {
  const seen = new Set<string>()
  const chapters = (definition.chapters ?? []).map((chapter, index): Chapter => {
    for (const level of chapter.levels) {
      if (level.track !== definition.id) throw new Error(`${level.id} is a ${level.track} level, not ${definition.id}`)
      if (seen.has(level.id)) throw new Error(`${level.id} is listed twice in ${definition.id}`)
      seen.add(level.id)
    }
    checkPracticePlacement(chapter)
    return { ...chapter, trackId: definition.id, number: index + 1 }
  })
  if (definition.status === 'coming' && seen.size > 0) throw new Error(`${definition.id} is coming but has levels`)
  return {
    id: definition.id,
    title: definition.title,
    scope: definition.scope,
    tagline: definition.tagline ?? '',
    description: definition.description,
    status: definition.status,
    cheatSheet: definition.cheatSheet ?? null,
    bestRun: definition.bestRun ?? fewestCommands,
    chapters
  }
}

/** Where a level sits: its track, chapter and number. */
export interface LevelPlace {
  track: Track
  chapter: Chapter
  level: Level
  /** 1-based position in the chapter, both kinds counted. */
  position: number
  /** 0-based index in the track's play order. */
  index: number
  /** A scenario's chapter.position, counting scenarios only, e.g. '3.2'; null for a practice task. */
  number: string | null
  /** A practice task's scenario with its number; null for a scenario. */
  scenario: { level: Scenario, number: string } | null
}

export interface Count {
  solved: number
  total: number
}

/** Every level of the track in play order: chapter by chapter. */
export function trackLevels(track: Track): Level[] {
  return track.chapters.flatMap(chapter => chapter.levels)
}

/** Places and the place of each level id, worked out once per track (tracks do not change after defineTrack). */
const placesCache = new WeakMap<Track, { places: readonly LevelPlace[], byId: ReadonlyMap<string, LevelPlace> }>()

function placesOf(track: Track) {
  let cached = placesCache.get(track)
  if (!cached) {
    const places = buildPlaces(track)
    const byId = new Map<string, LevelPlace>()
    for (const place of places) if (!byId.has(place.level.id)) byId.set(place.level.id, place)
    cached = { places, byId }
    placesCache.set(track, cached)
  }
  return cached
}

function buildPlaces(track: Track): LevelPlace[] {
  let index = 0
  return track.chapters.flatMap((chapter) => {
    let scenarios = 0
    let scenario: LevelPlace['scenario'] = null
    return chapter.levels.map((level, i): LevelPlace => {
      const base = { track, chapter, level, position: i + 1, index: index++ }
      if (level.kind === 'practice') return { ...base, number: null, scenario }
      const number = `${chapter.number}.${++scenarios}`
      scenario = { level, number }
      return { ...base, number, scenario: null }
    })
  })
}

/** Every level of the track with its place, in play order. */
export const trackPlaces = (track: Track): readonly LevelPlace[] => placesOf(track).places

/** How a place is named in text: "3.2 Merge conflict" for a scenario, the title alone for a practice task. */
export const placeName = (place: Pick<LevelPlace, 'number' | 'level'>) => place.number ? `${place.number} ${place.level.title}` : place.level.title

export function placeIn(track: Track, levelId: string): LevelPlace | null {
  return placesOf(track).byId.get(levelId) ?? null
}

const isSolvedIn = (progress: Progress, levelId: string) => entryOf(progress, levelId)?.solved === true
const isFlagged = (progress: Progress, levelId: string) => entryOf(progress, levelId)?.practiseAgain === true

function count(levels: readonly Level[], progress: Progress): Count {
  return { solved: levels.filter(level => isSolvedIn(progress, level.id)).length, total: levels.length }
}

/** Solved entries of a chapter, scenarios and practice tasks alike. */
export function chapterProgress(chapter: Chapter, progress: Progress): Count {
  return count(chapter.levels, progress)
}

/** Solved entries of a track, scenarios and practice tasks alike. */
export function trackProgress(track: Track, progress: Progress): Count {
  return count(trackLevels(track), progress)
}

/** The first unsolved entry in play order (a scenario or a practice task); null when everything is solved. */
export function nextUp(track: Track, progress: Progress): LevelPlace | null {
  return trackPlaces(track).find(place => !isSolvedIn(progress, place.level.id)) ?? null
}

/** The first entry of the chapter flagged "practise again", in play order; null when none is. */
export function practiseAgainIn(chapter: Chapter, progress: Progress): Level | null {
  return chapter.levels.find(level => isFlagged(progress, level.id)) ?? null
}

/** resume: the entry you last played, still unsolved; next: next up; practise: nothing unsolved left, a flagged entry. */
export type ContinueReason = 'resume' | 'next' | 'practise'

export interface ContinueTarget {
  place: LevelPlace
  reason: ContinueReason
  /** When you last played it (ms since epoch), only when resuming. */
  at: number | null
}

/**
 * What "Continue" opens: the entry you last played while it is unsolved, else next up; with nothing unsolved left in
 * the track, the first entry flagged "practise again". Null when everything is solved and nothing is flagged.
 */
export function continueTarget(track: Track, progress: Progress): ContinueTarget | null {
  const last = lastPlayed(progress, id => placeIn(track, id) !== null)
  if (last && !isSolvedIn(progress, last.levelId)) {
    const place = placeIn(track, last.levelId)
    if (place) return { place, reason: 'resume', at: last.at }
  }
  const next = nextUp(track, progress)
  if (next) return { place: next, reason: 'next', at: null }
  const flagged = trackPlaces(track).find(place => isFlagged(progress, place.level.id))
  return flagged ? { place: flagged, reason: 'practise', at: null } : null
}
