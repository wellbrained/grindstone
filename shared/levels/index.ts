// Public API of the levels: the shared core (track-agnostic) and its environments, git and Debugging
// (docs/features/levels.md).
// The core modules (types, engine, progress, track, radar) never import an environment; this barrel and the registry
// (tracks.ts) are where the tracks come together.
export type * from './types'
export type * from './git/types'
export type * from './debugging/types'
export type { BridgeMessage, ConsoleEntryBody, ConsoleLevel, HeaderPair, RequestFailure, RequestMessage, ResponseMessage } from './debugging/messages'
export type { NetworkEntry, NetworkResponse, StatusTone } from './debugging/network'
export type { BackendConfig, BackendRuntime } from './debugging/backend'
export type { RawFrame, SourceMapping } from './debugging/trace'
export type { SandboxDocument, SandboxOptions } from './debugging/sandbox'
export type { CheckRun } from './debugging/engine'
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

// the Debugging environment
export { editedText, pickLine, pickVerdict, playSolution, playStep as playDebugStep, reload, saveFile as saveDebugFile, startDebugLevel } from './debugging/engine'
export { isDebugLevel } from './debugging/types'
export { consoleEntry, observe, readBridgeMessage } from './debugging/messages'
export { mapFrames, parseStack, sourceOf } from './debugging/trace'
export { SANDBOX_CSP, SHOP_ORIGIN, sandboxDocument } from './debugging/sandbox'
export { DEFAULT_DELAY_MS, STATUS_TEXT, backendConfig } from './debugging/backend'
export { bodyView, durationText, requestEntry, requestName, statusLabel, statusTone, withResponse } from './debugging/network'
export { debuggingLevels, debuggingTrack } from './debugging'
