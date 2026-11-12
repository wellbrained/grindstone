// What the track page and the home page draw for a track, from the track and the progress: pure, so it is tested on the
// real track and on the 58-level fixture (test/unit/ui/track-view.test.ts). The components only render it.
import { chapterProgress, levelCommands, nextUp, trackPlaces, trackProgress } from '../../shared/levels'
import type { Chapter, Count, LevelPlace, Progress, Track } from '../../shared/levels'

/** solved: filled commit dot; next: the first unsolved level (ember ring); open: hollow. */
export type LevelState = 'solved' | 'next' | 'open'

/** A stretch of the chapter's lane between two level dots: solid between two solved levels, dim otherwise. */
export type LaneState = 'solid' | 'dim'

export interface LevelRowView {
  place: LevelPlace
  state: LevelState
  /** The git commands the level practises (from its solution). */
  commands: string[]
  /** The lane from the level above into this dot, and from this dot down to the next; null at a chapter's ends. */
  lane: { in: LaneState | null, out: LaneState | null }
}

/** A chapter's dot in the rail and its heading: like a level's, plus dashed for a chapter without levels. */
export type ChapterState = LevelState | 'coming'

export interface ChapterView {
  chapter: Chapter
  count: Count
  /** No levels yet: the chapter is shown with its description and "Coming". */
  coming: boolean
  /** solved: every level solved; next: holds the next up level; open: anything else. */
  state: ChapterState
  rows: LevelRowView[]
}

export interface TrackView {
  track: Track
  count: Count
  /** Chapters with levels; the coming ones are not counted. */
  liveChapters: number
  nextUp: LevelPlace | null
  chapters: ChapterView[]
}

export function trackView(track: Track, progress: Progress): TrackView {
  const next = nextUp(track, progress)
  const places = trackPlaces(track)
  const stateOf = (place: LevelPlace): LevelState => {
    if (progress.levels[place.level.id]?.solved === true) return 'solved'
    return place.level.id === next?.level.id ? 'next' : 'open'
  }
  const chapters = track.chapters.map((chapter): ChapterView => {
    const count = chapterProgress(chapter, progress)
    const coming = chapter.levels.length === 0
    const state: ChapterState = coming
      ? 'coming'
      : count.solved === count.total ? 'solved' : next?.chapter.id === chapter.id ? 'next' : 'open'
    return {
      chapter,
      count,
      coming,
      state,
      rows: withLanes(places
        .filter(place => place.chapter.id === chapter.id)
        .map(place => ({ place, state: stateOf(place), commands: levelCommands(place.level) })))
    }
  })
  return {
    track,
    count: trackProgress(track, progress),
    liveChapters: chapters.filter(chapter => !chapter.coming).length,
    nextUp: next,
    chapters
  }
}

function withLanes(rows: Omit<LevelRowView, 'lane'>[]): LevelRowView[] {
  const between = (a?: Omit<LevelRowView, 'lane'>, b?: Omit<LevelRowView, 'lane'>): LaneState | null => {
    if (!a || !b) return null
    return a.state === 'solved' && b.state === 'solved' ? 'solid' : 'dim'
  }
  return rows.map((row, i) => ({ ...row, lane: { in: between(rows[i - 1], row), out: between(row, rows[i + 1]) } }))
}

/** What the primary button of a track's home card does. */
export type TrackCardAction
  = | { kind: 'start', place: LevelPlace }
    | { kind: 'continue', place: LevelPlace }
    | { kind: 'open' }

/**
 * The home card's primary action, so it never repeats the Continue card: the track the Continue card already points at
 * (or a track with every level solved) gets "Open the track"; a track with progress continues at its next level; an
 * untouched one starts at its first.
 */
export function trackCardAction(track: Track, progress: Progress, continueTrackId: string | null): TrackCardAction {
  const next = nextUp(track, progress)
  if (!next || track.id === continueTrackId) return { kind: 'open' }
  return trackProgress(track, progress).solved > 0 ? { kind: 'continue', place: next } : { kind: 'start', place: next }
}

/** Width of a progress bar, '0%' ... '100%'; an empty count is 0%. */
export function percent(count: Count): string {
  return count.total === 0 ? '0%' : `${Math.round((count.solved / count.total) * 100)}%`
}

/** The first paragraph of a level's story, for the Continue card. */
export function storyLead(story: string): string {
  return story.split(/\n{2,}/)[0] ?? ''
}
