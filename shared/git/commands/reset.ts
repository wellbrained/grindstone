// git reset: move HEAD (its branch) to a commit and, depending on the mode, the index and the working tree with it.
// `reset [<commit>] [--] <paths>` unstages paths instead. Refused during a rebase (a trainer simplification).
import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { shortId } from '../objects/hash'
import { done, err, fail, out } from '../output'
import { resolveRev } from '../refs'
import { headId, headTree, withEntry, without } from '../state'
import { union } from '../worktree'
import type { Command, CommandResult, GitState, OutputLine, Repo, Tree } from '../types'
import { matchPathspec } from './add'
import { fatal, moveRef, notARepo, withRepo } from './common'

const MODES = ['--soft', '--mixed', '--hard'] as const
type Mode = typeof MODES[number]

const ambiguous = (state: GitState, arg: string) => fatal(state, [
  `fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.`,
  'Use \'--\' to separate paths from revisions, like this:',
  '\'git <command> [<revision>...] -- [<file>...]\''
].join('\n'))

/** "Unstaged changes after reset:" and an M or D line per tracked file that differs from the new index. */
function unstagedAfterReset(index: Tree, workdir: Tree): OutputLine[] {
  const rows = Object.keys(index).sort()
    .filter(path => workdir[path] !== index[path])
    .map(path => out(`${workdir[path] === undefined ? 'D' : 'M'}\t${path}`))
  return rows.length ? [out('Unstaged changes after reset:'), ...rows] : []
}

/** `git reset <paths>`: the index entries of these paths from `target`, the working tree untouched. */
function resetPaths(state: GitState, repo: Repo, target: Tree, paths: string[]): CommandResult {
  let index = repo.index
  let unmerged = repo.unmerged
  for (const path of paths) {
    index = withEntry(index, path, target[path])
    unmerged = without(unmerged, path)
  }
  return done(withRepo(state, { ...repo, index, unmerged }), unstagedAfterReset(index, state.workdir))
}

export const reset: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const separator = argv.indexOf('--')
  const before = separator === -1 ? argv : argv.slice(0, separator)
  const after = separator === -1 ? [] : argv.slice(separator + 1)
  const parsed = parseArgs('reset', before, { flags: [...MODES] })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  // like git, the last mode given wins
  const mode: Mode = [...before].reverse().find((arg): arg is Mode => (MODES as readonly string[]).includes(arg)) ?? '--mixed'
  const positionals = parsed.args.positionals

  // the first argument is a commit when it resolves to one; everything else is a path
  let rev = 'HEAD'
  let specs = positionals
  if (positionals[0] !== undefined && resolveRev(repo, positionals[0])) {
    rev = positionals[0]
    specs = positionals.slice(1)
  } else if (separator !== -1 && positionals[0] !== undefined) {
    return ambiguous(state, positionals[0])
  }

  if (repo.operation?.type === 'rebase') {
    return fatal(state, 'fatal: git reset during a rebase is not in this trainer yet; use "git rebase --abort" or finish the rebase first')
  }

  const head = headId(repo)
  const id = resolveRev(repo, rev)
  // before the first commit, a plain `git reset` still unstages (there is no HEAD to move)
  if (!id && !(rev === 'HEAD' && !head && mode === '--mixed')) return ambiguous(state, rev)
  const target: Tree = id ? repo.commits[id]!.tree : {}

  const known = union(repo.index, target, headTree(repo), repo.unmerged)
  const paths = new Set<string>()
  for (const spec of specs) {
    const matched = matchPathspec(spec, known)
    if (!matched.length) return ambiguous(state, spec)
    for (const path of matched) paths.add(path)
  }
  for (const spec of after) for (const path of matchPathspec(spec, known)) paths.add(path)
  if (specs.length || after.length) {
    if (mode !== '--mixed') return fatal(state, `fatal: Cannot do ${mode.slice(2)} reset with paths.`)
    return resetPaths(state, repo, target, [...paths])
  }

  if (repo.operation?.type === 'merge' && mode === '--soft') return fatal(state, 'fatal: Cannot do a soft reset in the middle of a merge.')
  // a real move (not the unborn plain reset) is recorded in the reflog and sets ORIG_HEAD, like git
  const moved = id ? moveRef(repo, 'HEAD', id, { log: `reset: moving to ${rev}`, origHead: head }) : repo
  if (mode === '--soft') return done(withRepo(state, moved))

  // mixed and hard reset the index (and end a merge, like git)
  const next: Repo = { ...moved, index: target, unmerged: {}, operation: null }
  if (mode === '--mixed') return done(withRepo(state, next), unstagedAfterReset(target, state.workdir))

  // hard: every tracked file (in the old index, the old HEAD or the target) matches the target; untracked files stay
  let workdir = state.workdir
  for (const path of known) workdir = withEntry(workdir, path, target[path])
  return done({ ...withRepo(state, next), workdir }, [out(`HEAD is now at ${shortId(id!)} ${subject(repo.commits[id!]!)}`)])
}
