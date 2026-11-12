// Tracks and chapters (docs/features/levels.md, "Tracks and chapters"): pure data and helpers over it.
// Play order, chapter numbers and level numbers ("3.2") are derived from the chapter lists, never written by hand.
import type { Progress } from './progress'
import type { Level, TrackId } from './types'

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
  /** In play order. Empty: the chapter is coming. */
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
  chapters?: readonly ChapterDefinition[]
}

/** Builds a track from its definition: numbers the chapters and checks that every level belongs here exactly once. */
export function defineTrack(definition: TrackDefinition): Track {
  const seen = new Set<string>()
  const chapters = (definition.chapters ?? []).map((chapter, index): Chapter => {
    for (const level of chapter.levels) {
      if (level.track !== definition.id) throw new Error(`${level.id} is a ${level.track} level, not ${definition.id}`)
      if (seen.has(level.id)) throw new Error(`${level.id} is listed twice in ${definition.id}`)
      seen.add(level.id)
    }
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
    chapters
  }
}

/** Where a level sits: its track, chapter and number. */
export interface LevelPlace {
  track: Track
  chapter: Chapter
  level: Level
  /** 1-based position in the chapter. */
  position: number
  /** 0-based index in the track's play order. */
  index: number
  /** chapter.position, e.g. '3.2'. */
  number: string
}

export interface Count {
  solved: number
  total: number
}

/** Every level of the track in play order: chapter by chapter. */
export function trackLevels(track: Track): Level[] {
  return track.chapters.flatMap(chapter => chapter.levels)
}

/** Every level of the track with its place, in play order. */
export function trackPlaces(track: Track): LevelPlace[] {
  let index = 0
  return track.chapters.flatMap(chapter => chapter.levels.map((level, i) => ({
    track,
    chapter,
    level,
    position: i + 1,
    index: index++,
    number: `${chapter.number}.${i + 1}`
  })))
}

export function placeIn(track: Track, levelId: string): LevelPlace | null {
  return trackPlaces(track).find(place => place.level.id === levelId) ?? null
}

const isSolvedIn = (progress: Progress, levelId: string) => progress.levels[levelId]?.solved === true

function count(levels: readonly Level[], progress: Progress): Count {
  return { solved: levels.filter(level => isSolvedIn(progress, level.id)).length, total: levels.length }
}

export function chapterProgress(chapter: Chapter, progress: Progress): Count {
  return count(chapter.levels, progress)
}

export function trackProgress(track: Track, progress: Progress): Count {
  return count(trackLevels(track), progress)
}

/** The first unsolved level in play order; null when every level is solved (or the track has none). */
export function nextUp(track: Track, progress: Progress): LevelPlace | null {
  return trackPlaces(track).find(place => !isSolvedIn(progress, place.level.id)) ?? null
}

export interface ContinueTarget {
  place: LevelPlace
  /** True: the last level you played, still unsolved. False: next up. */
  resume: boolean
  /** When you last played it (ms since epoch), only when `resume`. */
  at: number | null
}

/**
 * What "Continue" opens: the last level you played while it is unsolved, else next up.
 * Null when every level of the track is solved.
 */
export function continueTarget(track: Track, progress: Progress): ContinueTarget | null {
  const last = progress.lastPlayed
  if (last && !isSolvedIn(progress, last.levelId)) {
    const place = placeIn(track, last.levelId)
    if (place) return { place, resume: true, at: last.at }
  }
  const next = nextUp(track, progress)
  return next ? { place: next, resume: false, at: null } : null
}
