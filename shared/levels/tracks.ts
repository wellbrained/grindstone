// The track registry: every track, live and coming, in the order the home page lists them.
// The lookups take the registry as a parameter (default: the real one), so tests can run them on a 58-level fixture.
import { gitTrack } from './git'
import { lastPlayed } from './progress'
import { defineTrack, placeIn, trackLevels, trackProgress } from './track'
import type { Chapter, LevelPlace, Track } from './track'
import type { Progress } from './progress'
import type { Level } from './types'

export const tracks: readonly Track[] = [
  gitTrack,
  defineTrack({
    id: 'ai',
    title: 'Working with AI',
    scope: 'Lead the AI instead of letting it do the work, and review the code it writes.',
    description: 'Lead an AI assistant instead of letting it do the work, and review AI-written code before it ships.',
    status: 'coming'
  }),
  defineTrack({
    id: 'web',
    title: 'Web fundamentals',
    scope: 'CORS, auth, the event loop, performance and accessibility.',
    description: 'The parts of the web platform that bite in production: CORS, auth, the event loop, performance and accessibility.',
    status: 'coming'
  }),
  defineTrack({
    id: 'debugging',
    title: 'Debugging',
    scope: 'DevTools and incidents: track a bug down to its cause.',
    description: 'DevTools and incidents: track a bug down to its cause.',
    status: 'coming'
  }),
  defineTrack({
    id: 'frameworks',
    title: 'Framework deep dives',
    scope: 'How a framework works inside, starting with Vue reactivity.',
    description: 'How a framework works inside, starting with Vue reactivity.',
    status: 'coming'
  })
]

export function trackById(id: string, all: readonly Track[] = tracks): Track | null {
  return all.find(track => track.id === id) ?? null
}

/** Every level of every track, in play order. */
export const levels: Level[] = tracks.flatMap(trackLevels)

export function levelById(id: string): Level | null {
  return levels.find(level => level.id === id) ?? null
}

/** Track, chapter, position and number ("3.2") of a level; null for an unknown id. */
export function levelPlace(id: string, all: readonly Track[] = tracks): LevelPlace | null {
  for (const track of all) {
    const place = placeIn(track, id)
    if (place) return place
  }
  return null
}

/** A scenario's number ("3.2"); null for a practice task or an unknown id. */
export function levelNumber(id: string, all: readonly Track[] = tracks): string | null {
  return levelPlace(id, all)?.number ?? null
}

export function chapterOf(id: string, all: readonly Track[] = tracks): Chapter | null {
  return levelPlace(id, all)?.chapter ?? null
}

/**
 * The level after `id` in its track's play order, across chapter boundaries: a scenario, then its practice tasks, then
 * the next scenario. Null after the last one (or an unknown id).
 */
export function nextLevel(id: string, all: readonly Track[] = tracks): Level | null {
  const place = levelPlace(id, all)
  return place ? trackLevels(place.track)[place.index + 1] ?? null : null
}

/** True once you solved a level or typed a command in one. */
export function hasProgress(progress: Progress): boolean {
  return Object.values(progress.levels).some(entry => entry.solved || entry.lastPlayed !== null)
}

/**
 * The track "Continue" on the home page points at: the live track of the level you last played, else the first live
 * track with a solved level; null without progress.
 */
export function trackToContinue(progress: Progress, all: readonly Track[] = tracks): Track | null {
  const live = all.filter(track => track.status === 'live')
  const last = lastPlayed(progress)
  const played = last ? live.find(track => placeIn(track, last.levelId)) : undefined
  return played ?? live.find(track => trackProgress(track, progress).solved > 0) ?? null
}
