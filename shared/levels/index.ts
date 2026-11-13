// Public API of the levels: the shared core (track-agnostic) and its environments, git and Debugging
// (docs/features/levels.md).
// The core modules (types, engine, progress, track, radar) never import an environment; this barrel and the registry
// (tracks.ts) are where the tracks come together.
export type * from './types'
export type * from './git/types'
export type * from './debugging/types'
export type { BridgeMessage, ConsoleEntryBody, ConsoleLevel, HeaderPair, InspectedMessage, RequestFailure, RequestMessage, ResponseMessage } from './debugging/messages'
export type { CssCondition, CssDeclaration, CssRule, CssSheet, Specificity } from './debugging/css'
export type { BoxModel, DeclarationStatus, DeclarationView, DomNode, ElementStyles, InheritedView, Inspected, InspectedLevel, InspectedMatch, RuleView, ScrollSize, Sides, TreeMove, TreeRow } from './debugging/elements'
export type { NetworkEntry, NetworkResponse, StatusTone } from './debugging/network'
export type { BackendConfig, BackendRuntime } from './debugging/backend'
export type { RawFrame, SourceMapping } from './debugging/trace'
export type { CheckFrame, ElementsConfig, SandboxDocument, SandboxOptions } from './debugging/sandbox'
export type { CheckRun } from './debugging/engine'
export type { Breakpoint, ConditionCheck, Hit, RecordedFrame, RecordedObject, RecordedStep, RecordedValue, RecordingMap, ScopeEntries } from './debugging/recording'
export type { CountingLimits, RecordEndReason, RecordLimits } from './debugging/recorder'
export type { ActionKind, ChangedLine, FunctionCount, FunctionPlace, FunctionRow, LineChange, Profile, ProfileAction, ProfileEnd, ProfileMap, ProfileSummary, RenderCount, RenderRow, RequestRow, RequestTime } from './debugging/profile'
export type { ProbeExpectation } from './debugging/checks'
export type { LogEntry, LogFilter, LogFrame, LoggedRequest, ServerLogMessage } from './debugging/logs'
export type { DeploySpec, DiffHunk, DiffLine, FileChange } from './debugging/deploys'
export type { FunctionInfo, Instrumented, ScopeKind, ScopeView, SkipReason, StepPoint } from './debugging/instrument'
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
export { deployVerdict, editedText, pickDeploy, pickLine, pickVerdict, playSolution, playStep as playDebugStep, reload, restoreFiles, rollback, saveFile as saveDebugFile, startDebugLevel } from './debugging/engine'
export { LOG_LEVELS, MAX_LOG_HISTORY, MAX_LOG_LINES, accessLevel, checkLogs, clockText, filterLogs, historyEntries, liveEntries, requestLabel } from './debugging/logs'
export { MAX_DEPLOYS, deployById, deployChanges, deployHistory, differingPaths, filesBefore, lineIn, liveFiles, versionOf } from './debugging/deploys'
export { isDebugLevel } from './debugging/types'
export { consoleEntry, mergeObservations, observe, readBridgeMessage } from './debugging/messages'
export { mapFrames, parseStack, sourceOf } from './debugging/trace'
export { CHECK_VIEWPORT, SANDBOX_CSP, SHOP_ORIGIN, checkFrames, sandboxDocument } from './debugging/sandbox'
export { MAX_CSS_RULES, compareSpecificity, cssRules, isInherited, longhandsOf, parseCss, parseDeclarations, specificity, splitSelectorList, styleSheets } from './debugging/css'
export { COMPUTED_PROPERTIES, MAX_DOM_NODES, boxNumber, elementStyles, nodeAtPath, nodeLabel, nodePath, startExpanded, treeMove, treeRows, withAncestors } from './debugging/elements'
export { DEFAULT_DELAY_MS, STATUS_TEXT, backendConfig } from './debugging/backend'
export { MAX_PROBE_WAIT_MS } from './debugging/bridge'
export { PROFILE_LIMITS, RECORD_LIMITS, RECORDER_GLOBAL, countingLimits } from './debugging/recorder'
export { fittingProfile, functionRows, needsCounting, profileLines, profileSummary, readProfile, renderRows, requestRows, timelineEnd, withUncounted } from './debugging/profile'
export { meets } from './debugging/checks'
export {
  atBreakpoint,
  fittingSteps,
  frameStep,
  hitCounts,
  isExpandable,
  nextHit,
  previousHit,
  readSteps,
  recordedLines,
  scopeAt,
  scopeValues,
  stepBack,
  stepInto,
  stepLine,
  stepOut,
  stepOver,
  valueChildren,
  valuePreview,
  valueTone,
  withoutInstrumentation
} from './debugging/recording'
export { bodyView, durationText, requestAddress, requestEntry, requestName, statusLabel, statusTone, withResponse } from './debugging/network'
export { debuggingLevels, debuggingTrack } from './debugging'
