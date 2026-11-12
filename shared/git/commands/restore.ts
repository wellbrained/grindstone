// git restore: files in the working tree from the index, or (--staged) the index from HEAD. Silent on success, like git.
// During a conflict, --ours / --theirs write one side of an unmerged file (shared with `git checkout --ours|--theirs`).
import { parseArgs } from '../args'
import { done, err, fail } from '../output'
import { headTree, normalizePath, own, withEntry, without } from '../state'
import type { Command, Repo } from '../types'
import { matchPathspec } from './add'
import { fatal, notARepo, withRepo } from './common'

export type ConflictSide = 'ours' | 'theirs'

/** `--ours` or `--theirs`, whichever comes last before a `--` (git keeps the last one); null without either. */
export function sideOf(argv: string[]): ConflictSide | null {
  const end = argv.includes('--') ? argv.indexOf('--') : argv.length
  const options = argv.slice(0, end)
  const ours = options.lastIndexOf('--ours')
  const theirs = options.lastIndexOf('--theirs')
  if (ours === -1 && theirs === -1) return null
  return ours > theirs ? 'ours' : 'theirs'
}

/**
 * One side of an unmerged path, like git's index stages 2 and 3: "ours" is HEAD, "theirs" the commit being merged in
 * (in a rebase, the commit being replayed). Undefined when that side has no such file (it deleted it).
 */
export function conflictSide(repo: Repo, path: string, side: ConflictSide): string | undefined {
  if (side === 'ours') return headTree(repo)[path]
  const operation = repo.operation
  const commit = operation?.type === 'merge'
    ? operation.theirs
    : operation?.type === 'rebase' ? operation.stopped?.commit ?? null : operation?.type === 'cherry-pick' ? operation.current : null
  return commit ? own(repo.commits[commit]!.tree, path) : undefined
}

export const restore: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('restore', argv, { flags: ['-S', '-W', '--ours', '--theirs'], alias: { '--staged': '-S', '--worktree': '-W' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  const side = sideOf(argv)
  if (side && flags.has('-S')) return fatal(state, 'fatal: \'--ours\' or \'--theirs\' cannot be used with --staged')
  if (!positionals.length) return fatal(state, 'fatal: you must specify path(s) to restore')

  const staged = flags.has('-S')
  const worktree = flags.has('-W') || !staged
  const head = headTree(repo)
  // the working tree comes from the index; with --staged, the index (and with --worktree too, the file) from HEAD
  const source = staged ? head : repo.index
  const known = [...new Set([
    ...Object.keys(repo.index),
    ...Object.keys(repo.unmerged),
    ...(staged ? Object.keys(head) : [])
  ])].sort()

  const paths = new Set<string>()
  for (const spec of positionals) {
    const matched = matchPathspec(spec, known)
    if (!matched.length) return fail(state, [err(`error: pathspec '${normalizePath(spec) || spec}' did not match any file(s) known to git`)])
    for (const path of matched) paths.add(path)
  }
  if (!staged && !side) {
    const unmerged = [...paths].find(path => own(repo.unmerged, path) !== undefined)
    if (unmerged) return fail(state, [err(`error: path '${unmerged}' is unmerged`)])
  }

  let index = repo.index
  let unmerged = repo.unmerged
  let workdir = state.workdir
  for (const path of paths) {
    if (staged) {
      index = withEntry(index, path, own(head, path))
      unmerged = without(unmerged, path)
    }
    // like git, a side that deleted the file removes it (`git checkout --ours` refuses instead)
    if (side && own(repo.unmerged, path)) workdir = withEntry(workdir, path, conflictSide(repo, path, side))
    else if (worktree) workdir = withEntry(workdir, path, source[path])
  }
  return done({ ...withRepo(state, { ...repo, index, unmerged }), workdir })
}
