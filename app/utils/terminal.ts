// What the terminal shows around a command: the prompt, and the names Tab completion knows. Pure.
import { currentBranch, headCommit, operationInProgress, shortId, tagNames } from '../../shared/git'
import type { GitState } from '../../shared/git'
import type { CompletionContext } from './completion'

export interface Prompt {
  /** The branch (or `HEAD detached at <id>`) shown in brackets; null outside a repository. */
  branch: string | null
  /** The name the branch colour comes from. */
  colorKey: string
  /** A merge, rebase or cherry-pick in progress, shown after the branch like git's own prompt does. */
  operation: string | null
}

export function promptOf(state: GitState): Prompt {
  if (!state.repo) return { branch: null, colorKey: 'HEAD', operation: null }
  const branch = currentBranch(state)
  const operation = operationInProgress(state)
  const label = operation === 'merge' ? 'MERGING' : operation === 'rebase' ? 'REBASING' : operation === 'cherry-pick' ? 'CHERRY-PICKING' : null
  if (branch) return { branch, colorKey: branch, operation: label }
  const head = headCommit(state)
  return { branch: `HEAD detached at ${head ? shortId(head.id) : '?'}`, colorKey: 'HEAD', operation: label }
}

/** Branch names for completion: local branches, `origin/<name>` and the plain names on origin (`git switch <name>` creates a tracking branch). */
export function branchNames(state: GitState): string[] {
  if (!state.repo) return []
  const remote = Object.keys(state.repo.remoteBranches)
  return [...new Set([...Object.keys(state.repo.branches), ...remote.map(name => `origin/${name}`), ...remote])]
}

export function fileNames(state: GitState): string[] {
  return Object.keys(state.workdir).sort()
}

export function completionContextOf(
  state: GitState,
  commands: Pick<CompletionContext, 'trainerCommands' | 'gitCommands' | 'shellCommands'>
): CompletionContext {
  // tags go wherever a revision goes
  return { ...commands, branches: branchNames(state), tags: state.repo ? tagNames(state.repo.tags) : [], files: fileNames(state) }
}
