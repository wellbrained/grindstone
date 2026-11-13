// Test fixtures for the track helpers: a big track (58 levels in 8 chapters) built from a real level, so the helpers and
// the numbering are tested at the size the track structure has to hold (docs/features/levels.md, "Tracks and chapters").
import { firstCommit } from '../../../shared/levels/git/01-first-commit'
import { stageOneFile } from '../../../shared/levels/git/practice/basics'
import { defineTrack } from '../../../shared/levels'
import type { ChapterColour, Level, LevelProgress, PracticeTask, Progress, Scenario, Track } from '../../../shared/levels'

/** Chapter sizes of the big fixture: 58 levels, the last chapter empty (coming). */
export const BIG_CHAPTER_SIZES = [8, 7, 8, 8, 9, 7, 11, 0]

const fakeLevel = (chapter: number, position: number): Scenario => ({
  ...firstCommit,
  id: `big-${chapter}-${position}`,
  title: `Level ${chapter}.${position}`
})

export const fakePractice = (id: string, practises: string): PracticeTask => ({ ...stageOneFile, id, practises, title: `Practice ${id}` })

export function bigTrack(): Track {
  return defineTrack({
    id: 'git',
    title: 'Big',
    scope: 'A fixture track',
    description: 'Fixture.',
    status: 'live',
    chapters: BIG_CHAPTER_SIZES.map((size, index) => ({
      id: `chapter-${index + 1}`,
      title: `Chapter ${index + 1}`,
      description: `Chapter ${index + 1} of the fixture.`,
      colour: index as ChapterColour,
      levels: Array.from({ length: size }, (_, position): Level => fakeLevel(index + 1, position + 1))
    }))
  })
}

/**
 * A small track with practice tasks: chapter A is s1 (with practice p1a, p1b), s2, s3 (with p3a); chapter B is t1
 * (with q1a).
 */
export function practiceTrack(): Track {
  const s = (id: string) => ({ ...fakeLevel(0, 0), id, title: `Scenario ${id}` })
  return defineTrack({
    id: 'git',
    title: 'Practice',
    scope: 'A fixture track with practice tasks',
    description: 'Fixture.',
    status: 'live',
    chapters: [
      { id: 'a', title: 'A', description: 'A.', colour: 0, levels: [s('s1'), fakePractice('p1a', 's1'), fakePractice('p1b', 's1'), s('s2'), s('s3'), fakePractice('p3a', 's3')] },
      { id: 'b', title: 'B', description: 'B.', colour: 1, levels: [s('t1'), fakePractice('q1a', 't1')] }
    ]
  })
}

const solvedEntry = (overrides: Partial<LevelProgress> = {}): LevelProgress => ({
  solved: true,
  best: { commands: 3, hints: 0 },
  latest: { commands: 3, hints: 0 },
  practiseAgain: false,
  lastPlayed: null,
  fewestHints: 0,
  ...overrides
})

/** Progress with these level ids solved, and optionally one entry last played (solved or not). */
export function solvedProgress(ids: string[], last: { levelId: string, at: number } | null = null, flagged: string[] = []): Progress {
  const levels: Record<string, LevelProgress> = Object.fromEntries(ids.map(id => [id, solvedEntry({ practiseAgain: flagged.includes(id) })]))
  if (last) {
    levels[last.levelId] = { ...(levels[last.levelId] ?? { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: null, fewestHints: null }), lastPlayed: last.at }
  }
  return { version: 3, levels }
}
