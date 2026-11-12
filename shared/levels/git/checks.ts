// Reusable checks for git level goals.
import { hasConflictMarkers, operationInProgress, resolve, tokenize, unmergedPaths } from '../../git'
import type { GitState, Tree } from '../../git'
import type { CommandRecord } from '../types'

export const treeHasConflictMarkers = (tree: Tree) => Object.values(tree).some(hasConflictMarkers)

/** The tree of a local revision, or null. */
export function treeOf(state: GitState, rev: string): Tree | null {
  const id = resolve(state, rev)
  return id ? state.repo!.commits[id]!.tree : null
}

/** No merge or rebase in progress, no unmerged paths, and no conflict markers in the working tree or in `rev`. */
export function conflictFullyResolved(state: GitState, rev: string): boolean {
  if (!state.repo || operationInProgress(state) || unmergedPaths(state).length) return false
  const tree = treeOf(state, rev)
  return !!tree && !treeHasConflictMarkers(tree) && !treeHasConflictMarkers(state.workdir)
}

export interface GitInvocation {
  /** Arguments after `git`, e.g. ['push', '--force-with-lease']. */
  args: string[]
  /** Exit code of the whole line it was part of. */
  exitCode: number
}

/** Every `git ...` command in the history, including those chained with && or ;. */
export function gitInvocations(history: CommandRecord[]): GitInvocation[] {
  const found: GitInvocation[] = []
  for (const record of history) {
    const tokenized = tokenize(record.line)
    if (!tokenized.ok) continue
    let words: string[] = []
    const flush = () => {
      if (words[0] === 'git') found.push({ args: words.slice(1), exitCode: record.exitCode })
      words = []
    }
    for (const token of tokenized.tokens) {
      if (token.type === 'op' && (token.value === '&&' || token.value === ';')) flush()
      else if (token.type === 'word') words.push(token.value)
    }
    flush()
  }
  return found
}

/** `--force` or `-f` (also bundled, e.g. `-uf`); `--force-with-lease` is not a bare force. */
export const isBareForcePush = (args: string[]) =>
  args[0] === 'push' && args.slice(1).some(arg => arg === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(arg))

export const isLeasePush = (args: string[]) => args[0] === 'push' && args.includes('--force-with-lease')

/** The paths a commit changed against its first parent (everything, for a root commit); null when `rev` does not resolve. */
export function changedIn(state: GitState, rev: string): string[] | null {
  const id = resolve(state, rev)
  if (!id) return null
  const commit = state.repo!.commits[id]!
  const parent = commit.parents[0] ? state.repo!.commits[commit.parents[0]]!.tree : {}
  return [...new Set([...Object.keys(parent), ...Object.keys(commit.tree)])].filter(path => parent[path] !== commit.tree[path]).sort()
}

/** Whether a git command line in the args has this flag, also bundled (`-am` has `-a`) or spelled long. */
export function hasFlag(args: string[], short: string, long?: string): boolean {
  return args.slice(1).some(arg => arg === long || arg === `-${short}` || (/^-[a-zA-Z]+$/.test(arg) && arg.includes(short)))
}

/** Whether a successful `git <command> ...` in the history matches. */
export function ran(history: CommandRecord[], command: string, matches: (args: string[]) => boolean = () => true): boolean {
  return gitInvocations(history).some(({ args, exitCode }) => exitCode === 0 && args[0] === command && matches(args))
}
