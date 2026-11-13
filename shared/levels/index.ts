// Public API of the levels: the shared core (track-agnostic) and the git environment (docs/features/levels.md).
// The core modules (types, engine, progress, track, radar) never import an environment; this barrel and the registry
// (tracks.ts) are where the tracks come together.
export type * from './types'
export type * from './git/types'
export type { Action, ActResult, HintShown, Outcome } from './engine'
export type { Attempt, LastPlayed, LevelProgress, Progress, ProgressSummary, ReadResult, Run, RunCounter, RunMeasure } from './progress'
export type { RadarAxis, RadarGain } from './radar'
export type { Chapter, ChapterColour, ChapterDefinition, ContinueReason, ContinueTarget, Count, LevelPlace, Track, TrackDefinition, TrackStatus } from './track'

// the shared core
export { MAX_SNAPSHOTS, act, restart, startSession, takeHint, undoLast } from './engine'
export { levelIntro } from './types'
export {
  MAX_FUTURE_MS,
  PROGRESS_VERSION,
  emptyProgress,
  entryOf,
  fewestCommands,
  fewestHintsThenReloads,
  isBetterRun,
  lastPlayed,
  parseProgress,
  readProgress,
  recordPlay,
  recordSolve,
  resetEntries,
  runOf,
  serializeProgress,
  setPractiseAgain,
  summarizeProgress
} from './progress'
export { chapterProgress, continueTarget, defineTrack, nextUp, placeIn, placeName, practiseAgainIn, trackLevels, trackPlaces, trackProgress } from './track'
export { formatCredit, isRadarEmpty, levelCredit, radarGain, trackRadar } from './radar'
export { chapterOf, hasProgress, levelById, levelNumber, levelPlace, levels, nextLevel, trackById, trackToContinue, tracks } from './tracks'

// the git environment
export { TRAINER_COMMANDS, playStep, saveEditor, saveFile, startLevel, submit } from './git/engine'
export { isGitLevel, isTerminalStep } from './git/types'
export { gitSubcommands, levelCommands } from './git/commands'
export { gitLevels, gitTrack } from './git'
