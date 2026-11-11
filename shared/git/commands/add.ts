import { parseArgs } from '../args'
import { done, err, fail, hint } from '../output'
import { normalizePath, withEntry, without } from '../state'
import type { Command, Repo, Tree } from '../types'
import { fatal, notARepo, withRepo } from './common'

/** Paths matched by a pathspec: exact file, directory prefix, '.' for everything, or a simple * glob. */
export function matchPathspec(spec: string, paths: string[]): string[] {
  const path = normalizePath(spec)
  if (path === '') return paths
  if (path.includes('*')) {
    const pattern = new RegExp(`^${path.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
    return paths.filter(candidate => pattern.test(candidate) || pattern.test(candidate.split('/').pop()!))
  }
  return paths.filter(candidate => candidate === path || candidate.startsWith(`${path}/`))
}

/** Stages the given paths from the working tree (deleted files are removed from the index). */
export function stage(repo: Repo, workdir: Tree, paths: string[]): Repo {
  let index = repo.index
  let unmerged = repo.unmerged
  for (const path of paths) {
    index = withEntry(index, path, workdir[path])
    unmerged = without(unmerged, path)
  }
  return { ...repo, index, unmerged }
}

export const add: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('add', argv, { flags: ['-A'], alias: { '--all': '-A' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const specs = parsed.args.flags.has('-A') ? ['.', ...parsed.args.positionals] : parsed.args.positionals

  if (!specs.length) {
    return done(state, [err('Nothing specified, nothing added.'), hint('hint: Maybe you wanted to say \'git add .\'?')])
  }

  const known = [...new Set([...Object.keys(state.workdir), ...Object.keys(repo.index), ...Object.keys(repo.unmerged)])].sort()
  const paths = new Set<string>()
  for (const spec of specs) {
    const matched = matchPathspec(spec, known)
    if (!matched.length && normalizePath(spec) !== '') return fatal(state, `fatal: pathspec '${spec}' did not match any files`)
    for (const path of matched) paths.add(path)
  }
  return done(withRepo(state, stage(repo, state.workdir, [...paths])))
}
