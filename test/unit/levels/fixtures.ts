// Test fixtures for the track helpers: a big track (58 levels in 8 chapters) built from a real level, so the helpers and
// the numbering are tested at the size the track structure has to hold (docs/features/levels.md, "Tracks and chapters").
import { firstCommit } from '../../../shared/levels/git/01-first-commit'
import { defineTrack } from '../../../shared/levels'
import type { ChapterColour, Level, Progress, Track } from '../../../shared/levels'

/** Chapter sizes of the big fixture: 58 levels, the last chapter empty (coming). */
export const BIG_CHAPTER_SIZES = [8, 7, 8, 8, 9, 7, 11, 0]

const fakeLevel = (chapter: number, position: number): Level => ({
  ...firstCommit,
  id: `big-${chapter}-${position}`,
  title: `Level ${chapter}.${position}`
})

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
      levels: Array.from({ length: size }, (_, position) => fakeLevel(index + 1, position + 1))
    }))
  })
}

/** Progress with these level ids solved. */
export function solvedProgress(ids: string[], lastPlayed: Progress['lastPlayed'] = null): Progress {
  return {
    version: 2,
    levels: Object.fromEntries(ids.map(id => [id, { solved: true, hintsUsed: 0, commands: 3, bestCommands: 3 }])),
    lastPlayed
  }
}
