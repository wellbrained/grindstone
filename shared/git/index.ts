// Public API of the git model (docs/features/git-model.md).
import { GIT_COMMANDS } from './commands'
import { SHELL_COMMANDS } from './shell'

export type * from './types'
export type { Token, TokenizeResult } from './tokenize'
export type { StateOptions } from './state'
export type { TeammateChange } from './teammate'

export { run, runArgv } from './run'
export { tokenize } from './tokenize'
export { createState, writeFile, DEFAULT_ORIGIN_URL } from './state'
export { SetupBuilder, folder, repo } from './setup'
export { teammateCommit } from './teammate'
export { blobId, shortId } from './objects/hash'
export { formatDate } from './commands/log'
export {
  aheadBehind,
  branchExists,
  commitsOf,
  conflictsInProgress,
  currentBranch,
  fileContent,
  hasConflictMarkers,
  hasMergeCommits,
  headCommit,
  isAncestor,
  isWorkingTreeClean,
  operationInProgress,
  remoteBranchHead,
  remoteCommitsOf,
  resolve,
  trackingBranchHead,
  unmergedPaths,
  upstreamOf
} from './queries'

/** Names for Tab completion in the terminal. */
export const gitCommandNames = Object.keys(GIT_COMMANDS)
export const shellCommandNames = Object.keys(SHELL_COMMANDS)
