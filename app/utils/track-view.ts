// What the track page and the home page draw for a track, from the track and the progress: pure, so it is tested on the
// real track and on the 58-level fixture (test/unit/ui/track-view.test.ts). The components only render it.
import { chapterProgress, levelCommands, nextUp, trackPlaces, trackProgress } from '../../shared/levels'
import type { Chapter, Count, LevelPlace, LevelProgress, Progress, Track } from '../../shared/levels'

/** solved: filled commit dot; next: the first unsolved level (ember ring); open: hollow. */
export type LevelState = 'solved' | 'next' | 'open'

/** A stretch of a lane between two dots: solid between two solved entries, dim otherwise. */
export type LaneState = 'solid' | 'dim'

/**
 * The lanes of one row (preview G2): the chapter's main line runs through the scenario dots; a scenario with practice
 * tasks forks a short side branch to the right, and its practice dots sit on that branch. Null where nothing is drawn.
 */
export interface RowLanes {
  /** Main line from the scenario above into this scenario's dot. */
  in: LaneState | null
  /** Main line from this scenario's dot down towards the next scenario. */
  out: LaneState | null
  /** A practice row: the main line passing by on its way to the next scenario. */
  through: LaneState | null
  /** A scenario row: the curve from its dot to its side branch. */
  fork: LaneState | null
  /** A practice row: the side branch from above into its dot. */
  sideIn: LaneState | null
  /** A practice row: the side branch on to the next practice task of the same scenario. */
  sideOut: LaneState | null
}

export interface LevelRowView {
  place: LevelPlace
  state: LevelState
  /** The stored progress (best run, "practise again"), or null. */
  progress: LevelProgress | null
  /** The git commands the level practises (from its solution). */
  commands: string[]
  lane: RowLanes
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
        .map(place => ({
          place,
          state: stateOf(place),
          progress: progress.levels[place.level.id] ?? null,
          commands: levelCommands(place.level)
        })))
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

type Row = Omit<LevelRowView, 'lane'>

const between = (a: Row | undefined, b: Row | undefined): LaneState | null => {
  if (!a || !b) return null
  return a.state === 'solved' && b.state === 'solved' ? 'solid' : 'dim'
}

function withLanes(rows: Row[]): LevelRowView[] {
  const isScenario = (row: Row | undefined) => row?.place.level.kind === 'scenario'
  // the scenario a row belongs to (itself for a scenario) and the next scenario after it
  const scenarioAt = (i: number) => {
    let j = i
    while (j >= 0 && !isScenario(rows[j])) j--
    return rows[j]
  }
  const nextScenarioAfter = (i: number) => rows.slice(i + 1).find(isScenario)

  return rows.map((row, i): LevelRowView => {
    const own = scenarioAt(i)
    const main = between(own, nextScenarioAfter(i))
    if (isScenario(row)) {
      const previous = [...rows.slice(0, i)].reverse().find(isScenario)
      const fork = rows[i + 1] && !isScenario(rows[i + 1]) ? between(row, rows[i + 1]) : null
      return { ...row, lane: { in: between(previous, row), out: main, through: null, fork, sideIn: null, sideOut: null } }
    }
    const above = rows[i - 1]
    const below = rows[i + 1] && !isScenario(rows[i + 1]) ? rows[i + 1] : undefined
    return { ...row, lane: { in: null, out: null, through: main, fork: null, sideIn: between(above, row), sideOut: between(row, below) } }
  })
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

/** The first paragraph of a level's story (or a practice task's task), for the Continue card. */
export function storyLead(story: string): string {
  return story.split(/\n{2,}/)[0] ?? ''
}

/** The estimated time as a short label: '~30 s' below a minute, else '~5 min'. */
export function timeLabel(minutes: number): { value: number, unit: 's' | 'min' } {
  return minutes < 1 ? { value: Math.round(minutes * 60), unit: 's' } : { value: Math.round(minutes), unit: 'min' }
}
