// What the track page and the home page draw for a track, from the track and the progress: pure, so it is tested on the
// real track and on the 58-level fixture (test/unit/ui/track-view.test.ts). The components only render it.
import { chapterProgress, entryOf, levelCommands, nextUp, trackPlaces, trackProgress } from '../../shared/levels'
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
    if (entryOf(progress, place.level.id)?.solved === true) return 'solved'
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
          progress: entryOf(progress, place.level.id) ?? null,
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

const isScenario = (row: Pick<Row, 'place'> | undefined) => row?.place.level.kind === 'scenario'

/** Index of the last scenario at or before row i; -1 when there is none. */
function scenarioAtOrBefore(rows: readonly Pick<Row, 'place'>[], i: number): number {
  while (i >= 0 && !isScenario(rows[i])) i--
  return i
}

/** Index of the first scenario after row i; rows.length when there is none. */
function scenarioAfter(rows: readonly Pick<Row, 'place'>[], i: number): number {
  let j = i + 1
  while (j < rows.length && !isScenario(rows[j])) j++
  return j
}

function withLanes(rows: Row[]): LevelRowView[] {
  // the scenario a row belongs to (itself for a scenario), the one before that, and the next scenario after the row
  let own: Row | undefined
  let previous: Row | undefined
  let next = -1
  return rows.map((row, i): LevelRowView => {
    if (isScenario(row)) {
      previous = own
      own = row
    }
    if (next <= i) next = scenarioAfter(rows, i)
    const main = between(own, rows[next])
    const below = rows[i + 1] && !isScenario(rows[i + 1]) ? rows[i + 1] : undefined
    if (isScenario(row)) {
      return { ...row, lane: { in: between(previous, row), out: main, through: null, fork: below ? between(row, below) : null, sideIn: null, sideOut: null } }
    }
    return { ...row, lane: { in: null, out: null, through: main, fork: null, sideIn: between(rows[i - 1], row), sideOut: between(row, below) } }
  })
}

/** When each lane part of a row draws in (a step 0...3), for the lane of a just solved entry. */
export type LaneDraw = Partial<Record<keyof RowLanes, number>>

/**
 * The lane of the entry at row `at` (just solved) draws top-down in four steps: into it from above (0), into its dot
 * (1), out of its dot (2), on to the next dot (3). A scenario's line runs on the main lane past its practice tasks; a
 * practice task's on its side branch. Keyed by row index; empty when `at` is -1.
 */
export function drawSteps(rows: readonly Pick<Row, 'place'>[], at: number): Map<number, LaneDraw> {
  const steps = new Map<number, LaneDraw>()
  if (at < 0 || at >= rows.length) return steps
  const add = (index: number, draw: LaneDraw) => {
    if (index >= 0 && index < rows.length) steps.set(index, { ...steps.get(index), ...draw })
  }

  if (!isScenario(rows[at])) {
    add(at - 1, isScenario(rows[at - 1]) ? { fork: 0 } : { sideOut: 0 })
    add(at, { sideIn: 1, sideOut: 2 })
    add(at + 1, { sideIn: 3 })
    return steps
  }
  const previous = scenarioAtOrBefore(rows, at - 1)
  // the first scenario has nothing above it: start with its own lower half
  const shift = previous === -1 ? 2 : 0
  if (previous !== -1) {
    add(previous, { out: 0 })
    for (let i = previous + 1; i < at; i++) add(i, { through: 0 })
    add(at, { in: 1 })
  }
  add(at, { out: 2 - shift, fork: 2 - shift })
  const next = scenarioAfter(rows, at)
  for (let i = at + 1; i < next; i++) add(i, i === at + 1 ? { through: 3 - shift, sideIn: 3 - shift } : { through: 3 - shift })
  add(next, { in: 3 - shift })
  return steps
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

/** The estimated time as text through i18n: short for the eye (track.time), long for screen readers (track.timeLong). */
export function timeText(t: (key: string, named: Record<string, unknown>) => string, minutes: number, form: 'short' | 'long' = 'short'): string {
  const { value, unit } = timeLabel(minutes)
  return t(`track.${form === 'short' ? 'time' : 'timeLong'}.${unit}`, { n: value })
}
