// Public API of the level engine (docs/features/levels.md).
export type * from './types'
export type { LastPlayed, LevelProgress, Progress, ProgressSummary, ReadResult, Run } from './progress'
export type { Chapter, ChapterColour, ChapterDefinition, ContinueReason, ContinueTarget, Count, LevelPlace, Track, TrackDefinition, TrackStatus } from './track'

export { MAX_SNAPSHOTS, TRAINER_COMMANDS, playStep, saveEditor, saveFile, startLevel, submit } from './engine'
export { isTerminalStep, levelIntro } from './types'
export {
  MAX_FUTURE_MS,
  PROGRESS_VERSION,
  emptyProgress,
  entryOf,
  isBetterRun,
  lastPlayed,
  parseProgress,
  readProgress,
  recordPlay,
  recordSolve,
  resetEntries,
  serializeProgress,
  setPractiseAgain,
  summarizeProgress
} from './progress'
export { chapterProgress, continueTarget, defineTrack, nextUp, placeIn, placeName, practiseAgainIn, trackLevels, trackPlaces, trackProgress } from './track'
export { chapterOf, hasProgress, levelById, levelNumber, levelPlace, levels, nextLevel, trackById, trackToContinue, tracks } from './tracks'
export { gitSubcommands, levelCommands } from './commands'
export { gitLevels, gitTrack } from './git'
