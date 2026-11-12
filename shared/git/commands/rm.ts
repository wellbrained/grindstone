// git rm [--cached] [-f] [-r] [-q] [--] <paths>: stop tracking files; without --cached they leave the working tree too.
// Refuses, like git, when that would lose changes git has nowhere else (docs/features/git-model.md, "git rm").
import { parseArgs } from '../args'
import { done, err, fail, out } from '../output'
import { headTree, normalizePath, without } from '../state'
import type { Command, OutputLine } from '../types'
import { matchPathspec } from './add'
import { fatal, notARepo, withRepo } from './common'

const FORCE_HINT = '(use -f to force removal)'
const CACHED_HINT = '(use --cached to keep the file, or -f to force removal)'

/** git's `error: the following file has ...:` block with the paths indented and the hint after them. */
function refusal(paths: string[], one: string, many: string, hintText: string): OutputLine[] {
  if (!paths.length) return []
  const [first, ...more] = (paths.length === 1 ? one : many).split('\n')
  return [err(`error: ${first}`), ...more.map(text => err(text)), ...paths.map(path => err(`    ${path}`)), err(hintText)]
}

export const rm: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('rm', argv, { flags: ['--cached', '-f', '-r', '-q'], alias: { '--force': '-f', '--quiet': '-q' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  if (!positionals.length) return fatal(state, 'fatal: No pathspec was given. Which files should I remove?')
  const cached = flags.has('--cached')

  const known = [...new Set([...Object.keys(repo.index), ...Object.keys(repo.unmerged)])].sort()
  const paths = new Set<string>()
  for (const spec of positionals) {
    const matched = matchPathspec(spec, known)
    if (!matched.length) return fatal(state, `fatal: pathspec '${spec}' did not match any files`)
    const path = normalizePath(spec)
    // a folder (or '.') needs -r; a glob or a file name does not
    if (!flags.has('-r') && !spec.includes('*') && matched.some(candidate => candidate !== path)) {
      return fatal(state, `fatal: not removing '${spec}' recursively without -r`)
    }
    for (const candidate of matched) paths.add(candidate)
  }
  const sorted = [...paths].sort()

  if (!flags.has('-f')) {
    // git's check: staged = the index differs from HEAD (a new file always does), local = the file differs from the index
    const head = headTree(repo)
    const both: string[] = []
    const staged: string[] = []
    const local: string[] = []
    for (const path of sorted) {
      if (repo.unmerged[path] !== undefined) continue
      const isStaged = head[path] === undefined || head[path] !== repo.index[path]
      const isLocal = state.workdir[path] !== undefined && state.workdir[path] !== repo.index[path]
      if (isStaged && isLocal) both.push(path)
      else if (!cached) {
        if (isStaged) staged.push(path)
        if (isLocal) local.push(path)
      }
    }
    const errors = [
      ...refusal(both, 'the following file has staged content different from both the\nfile and the HEAD:', 'the following files have staged content different\nfrom both the file and the HEAD:', FORCE_HINT),
      ...refusal(staged, 'the following file has changes staged in the index:', 'the following files have changes staged in the index:', CACHED_HINT),
      ...refusal(local, 'the following file has local modifications:', 'the following files have local modifications:', CACHED_HINT)
    ]
    if (errors.length) return fail(state, errors)
  }

  let index = repo.index
  let unmerged = repo.unmerged
  let workdir = state.workdir
  for (const path of sorted) {
    index = without(index, path)
    unmerged = without(unmerged, path)
    if (!cached) workdir = without(workdir, path)
  }
  const output = flags.has('-q') ? [] : sorted.map(path => out(`rm '${path}'`))
  return done({ ...withRepo(state, { ...repo, index, unmerged }), workdir }, output)
}
