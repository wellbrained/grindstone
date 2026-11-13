// The skill radar (ADR 0007, docs/features/levels.md "Skill radar"): one axis per chapter of a track, the share of its
// levels you solved. A level counts 1 once a solve did without its last hint (the one that gives the answer away), 0.5
// while every solve revealed it, 0 unsolved. Replays can raise an axis, nothing lowers it (`fewestHints` only goes down).
import { entryOf } from './progress'
import type { LevelProgress, Progress } from './progress'
import type { Chapter, Track } from './track'

export interface RadarAxis {
  chapter: Chapter
  /** The credit of the chapter's levels: 4.5 means four clean solves and one that needed the last hint. */
  value: number
  /** Levels in the chapter, both kinds; 0 for a coming chapter. */
  total: number
  /** Solved levels, both kinds (the plain count, for the screen reader list). */
  solved: number
  /** value / total, 0 to 1; 0 for a coming chapter. */
  share: number
  /** No levels yet: drawn as a dashed axis. */
  coming: boolean
}

/** What one level adds to its axis: 1, 0.5 (every solve needed the last hint, or unknown how) or 0 (unsolved). */
export function levelCredit(level: { hints: readonly string[] }, entry: LevelProgress | null | undefined): 0 | 0.5 | 1 {
  if (entry?.solved !== true) return 0
  return entry.fewestHints !== null && entry.fewestHints < level.hints.length ? 1 : 0.5
}

/** The track's radar: an axis per chapter, in chapter order (drawn clockwise from the top). */
export function trackRadar(track: Track, progress: Progress): RadarAxis[] {
  return track.chapters.map((chapter): RadarAxis => {
    const total = chapter.levels.length
    let value = 0
    let solved = 0
    for (const level of chapter.levels) {
      const entry = entryOf(progress, level.id)
      value += levelCredit(level, entry)
      if (entry?.solved === true) solved++
    }
    return { chapter, value, total, solved, share: total === 0 ? 0 : value / total, coming: total === 0 }
  })
}

/** Nothing solved in the track: the radar shows only its outline. */
export const isRadarEmpty = (axes: readonly RadarAxis[]) => axes.every(axis => axis.value === 0)

export interface RadarGain {
  chapter: Chapter
  from: number
  to: number
  total: number
}

/** How a chapter's axis changed between two radars of the same track; null when it did not (or is not there). */
export function radarGain(before: readonly RadarAxis[], after: readonly RadarAxis[], chapterId: string): RadarGain | null {
  const old = before.find(axis => axis.chapter.id === chapterId)
  const now = after.find(axis => axis.chapter.id === chapterId)
  if (!old || !now || old.value === now.value) return null
  return { chapter: now.chapter, from: old.value, to: now.value, total: now.total }
}

/** An axis value as text: 4.5, 5 (never 5.0). */
export const formatCredit = (value: number) => String(Math.round(value * 2) / 2)
