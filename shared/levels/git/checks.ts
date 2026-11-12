// Reusable checks for git level goals, and the helpers git levels are written with.
import { hasConflictMarkers, headCommit, operationInProgress, resolve, tokenize, unmergedPaths } from '../../git'
import type { GitState, Tree } from '../../git'
import type { CommandRecord, PracticeTask } from '../types'

/** A git practice task: difficulty 1 and about half a minute unless it says otherwise. */
export const practice = (task: Omit<PracticeTask, 'track' | 'kind' | 'difficulty' | 'minutes'> & Partial<Pick<PracticeTask, 'difficulty' | 'minutes'>>): PracticeTask =>
  ({ track: 'git', kind: 'practice', difficulty: 1, minutes: 0.5, ...task })

/**
 * `make()` on the first call, the same value after that: for ids read from a level's setup, built on first use instead
 * of at import (setups are deterministic, so the ids are the same every time).
 */
export function once<T>(make: () => T): () => T {
  let made: { value: T } | undefined
  return () => (made ??= { value: make() }).value
}

export const treeHasConflictMarkers = (tree: Tree) => Object.values(tree).some(hasConflictMarkers)

/** Two trees hold the same files with the same contents. */
export function sameTree(a: Tree | null | undefined, b: Tree | null | undefined): boolean {
  if (!a || !b) return false
  const paths = Object.keys(a)
  return paths.length === Object.keys(b).length && paths.every(path => a[path] === b[path])
}

/** Two lists hold the same items in the same order; false when `a` is missing. */
export function sameList<T>(a: readonly T[] | null | undefined, b: readonly T[]): boolean {
  return !!a && a.length === b.length && a.every((item, i) => item === b[i])
}

/** A file as HEAD's commit has it, or undefined. */
export const committedFile = (state: GitState, path: string) => headCommit(state)?.tree[path]

/** A file as the staging area has it, or undefined. */
export const stagedFile = (state: GitState, path: string) => state.repo?.index[path]

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

/** `rev` is a merge commit with exactly these two parents (commit ids), first parent first. */
export function isMergeOf(state: GitState, rev: string, first: string, second: string): boolean {
  const id = resolve(state, rev)
  const parents = id ? state.repo!.commits[id]!.parents : []
  return parents.length === 2 && parents[0] === first && parents[1] === second
}

/** A successful `git <command>` comes after the last successful `git <after>` (e.g. a `git log` after the merge). */
export function ranAfter(history: CommandRecord[], command: string, after: string, matches: (args: string[]) => boolean = () => true): boolean {
  const calls = gitInvocations(history).filter(call => call.exitCode === 0)
  const last = calls.map(call => call.args[0]).lastIndexOf(after)
  return last !== -1 && calls.slice(last + 1).some(call => call.args[0] === command && matches(call.args))
}

/** A successful git command that matches, before the first successful `git <before...>` (or with none of them yet). */
export function ranBefore(history: CommandRecord[], before: string[], matches: (args: string[]) => boolean): boolean {
  const calls = gitInvocations(history).filter(call => call.exitCode === 0)
  const stop = calls.findIndex(call => before.includes(call.args[0]!))
  return calls.slice(0, stop === -1 ? undefined : stop).some(call => matches(call.args))
}

/** The revisions a `git log ...` lists (`include`) and leaves out (`exclude`), as typed: `a..b`, `^a`; an empty side is HEAD. */
export function logRevisions(args: string[]): { include: string[], exclude: string[] } {
  const include: string[] = []
  const exclude: string[] = []
  const rest = args.slice(1)
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '-n' || arg === '--max-count') i++
    else if (arg.startsWith('-')) continue
    else if (arg.includes('..')) {
      const [from, to] = arg.split('..')
      exclude.push(from || 'HEAD')
      include.push(to || 'HEAD')
    } else if (arg.startsWith('^')) exclude.push(arg.slice(1))
    else include.push(arg)
  }
  return { include, exclude }
}

/** A `git log` that lists the commits on one of `on` but not on `notOn` (`git log origin/main..main`, `^origin/main HEAD`). */
export function logsOnlyOn(args: string[], on: string[], notOn: string[]): boolean {
  if (args[0] !== 'log') return false
  const { include, exclude } = logRevisions(args)
  return include.length > 0 && include.every(rev => on.includes(rev)) && exclude.length > 0 && exclude.every(rev => notOn.includes(rev))
}

/**
 * Whether HEAD's reflog shows commit `id` made while `branch` was checked out: the nearest `checkout: moving from ...
 * to <branch>` before the commit's entry. Still works once the branch is deleted (HEAD's reflog keeps it, like git's).
 */
export function committedOn(state: GitState, id: string, branch: string): boolean {
  const log = state.repo?.reflog.HEAD ?? []
  const at = log.findIndex(entry => entry.id === id && entry.message.startsWith('commit'))
  if (at === -1) return false
  const checkout = log.slice(at + 1).find(entry => entry.message.startsWith('checkout: moving from '))
  return !!checkout && checkout.message.endsWith(` to ${branch}`)
}
