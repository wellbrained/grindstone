// git restore: files in the working tree from the index, or (--staged) the index from HEAD. Silent on success, like git.
import { parseArgs } from '../args'
import { done, err, fail } from '../output'
import { headTree, normalizePath, withEntry, without } from '../state'
import type { Command } from '../types'
import { matchPathspec } from './add'
import { fatal, notARepo, withRepo } from './common'

export const restore: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('restore', argv, { flags: ['-S', '-W'], alias: { '--staged': '-S', '--worktree': '-W' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
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
  if (!staged) {
    const unmerged = [...paths].find(path => repo.unmerged[path] !== undefined)
    if (unmerged) return fail(state, [err(`error: path '${unmerged}' is unmerged`)])
  }

  let index = repo.index
  let unmerged = repo.unmerged
  let workdir = state.workdir
  for (const path of paths) {
    if (staged) {
      index = withEntry(index, path, head[path])
      unmerged = without(unmerged, path)
    }
    if (worktree) workdir = withEntry(workdir, path, source[path])
  }
  return done({ ...withRepo(state, { ...repo, index, unmerged }), workdir })
}
