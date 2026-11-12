// Public API of the level engine (docs/features/levels.md).
export type * from './types'
export type { LastPlayed, LevelProgress, Progress } from './progress'
export type { Chapter, ChapterColour, ChapterDefinition, ContinueTarget, Count, LevelPlace, Track, TrackDefinition, TrackStatus } from './track'

export { MAX_SNAPSHOTS, TRAINER_COMMANDS, saveFile, startLevel, submit } from './engine'
export { PROGRESS_VERSION, emptyProgress, parseProgress, recordPlay, recordSolve, serializeProgress } from './progress'
export { chapterProgress, continueTarget, defineTrack, nextUp, placeIn, trackLevels, trackPlaces, trackProgress } from './track'
export { chapterOf, hasProgress, levelById, levelNumber, levelPlace, levels, nextLevel, trackById, trackToContinue, tracks } from './tracks'
export { gitSubcommands, levelCommands } from './commands'
export { gitLevels, gitTrack } from './git'
