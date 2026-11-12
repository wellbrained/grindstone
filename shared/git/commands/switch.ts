import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { range } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, plural, ref } from '../output'
import { isValidBranchName, resolveRev } from '../refs'
import { headId, headTree, normalizePath } from '../state'
import { moveTrees } from '../worktree'
import type { Command, CommandResult, GitState, Head, OutputLine, Repo } from '../types'
import { matchPathspec } from './add'
import { branchExistsError, invalidNameError, trackedBy, trackingLine } from './branch'
import { fatal, notARepo, trackingInfo, withRepo } from './common'

type Target
  = | { kind: 'branch', name: string }
    | { kind: 'new', name: string, start: string | null, upstream: string | null }
    | { kind: 'detach', commit: string, label: string }

function busy(state: GitState, repo: Repo): CommandResult | null {
  if (repo.operation?.type === 'merge') return fatal(state, 'fatal: cannot switch branch while merging\nConsider "git merge --quit" or "git worktree add".')
  if (repo.operation?.type === 'rebase') return fatal(state, 'fatal: cannot switch branch while rebasing\nConsider "git rebase --quit" or "git worktree add".')
  return null
}

/** Warns about commits only reachable from the detached HEAD we are leaving. */
function leftBehind(repo: Repo, next: Repo): OutputLine[] {
  if (repo.head.type !== 'detached') return []
  const old = repo.head.commit
  const kept = [...Object.values(next.branches), ...Object.values(next.remoteBranches)]
  const lost = range(repo.commits, [old], kept)
  const position = repo.commits[old]!
  if (!lost.length) return [out(`Previous HEAD position was ${shortId(old)} ${subject(position)}`)]
  return [
    err(`Warning: you are leaving ${plural(lost.length, 'commit')} behind, not connected to`),
    err('any of your branches:'),
    err(''),
    ...lost.slice(0, 4).map(commit => err(`  ${shortId(commit.id)} ${subject(commit)}`)),
    err(''),
    hint('If you want to keep it by creating a new branch, this may be a good time'),
    hint('to do so with:'),
    hint(''),
    hint(` git branch <new-branch-name> ${shortId(old)}`)
  ]
}

function switchTo(state: GitState, target: Target): CommandResult {
  const repo = state.repo!
  const blocked = busy(state, repo)
  if (blocked) return blocked

  if (target.kind === 'branch' && repo.head.type === 'branch' && repo.head.name === target.name) {
    return done(state, [out('Already on \'', ref(target.name), '\''), ...trackingInfo(repo, target.name)])
  }

  // creating a branch before the first commit just renames the unborn branch
  if (target.kind === 'new' && target.start === null && !headId(repo)) {
    return done(withRepo(state, { ...repo, head: { type: 'branch', name: target.name } }), [out('Switched to a new branch \'', ref(target.name), '\'')])
  }

  const commit = target.kind === 'branch'
    ? repo.branches[target.name]!
    : target.kind === 'new' ? resolveRev(repo, target.start ?? 'HEAD')! : target.commit
  const moved = moveTrees(repo, state.workdir, headTree(repo), repo.commits[commit]!.tree, 'checkout')
  if (!moved.ok) return fail(state, moved.output)

  const head: Head = target.kind === 'detach' ? { type: 'detached', commit } : { type: 'branch', name: target.name }
  let next: Repo = { ...repo, head, index: moved.index, previous: repo.head }
  const output: OutputLine[] = []
  if (target.kind === 'new') {
    next = { ...next, branches: { ...next.branches, [target.name]: commit } }
    if (target.upstream) {
      next = { ...next, upstream: { ...next.upstream, [target.name]: target.upstream } }
      output.push(trackingLine(target.name, target.upstream))
    }
  }
  output.unshift(...leftBehind(repo, next))
  output.push(...moved.carried)

  if (target.kind === 'detach') {
    output.push(
      out(`Note: switching to '${target.label}'.`),
      out(''),
      hint('You are in \'detached HEAD\' state. You can look around, make experimental'),
      hint('changes and commit them, and you can discard any commits you make in this'),
      hint('state without impacting any branches by switching back to a branch.'),
      hint(''),
      hint('If you want to create a new branch to retain commits you create, you may'),
      hint('do so (now or later) by using -c with the switch command. Example:'),
      hint(''),
      hint('  git switch -c <new-branch-name>'),
      out(''),
      out(`HEAD is now at ${shortId(commit)} ${subject(next.commits[commit]!)}`)
    )
  } else {
    output.push(out(target.kind === 'new' ? 'Switched to a new branch \'' : 'Switched to branch \'', ref(target.name), '\''))
    output.push(...trackingInfo(next, target.name))
  }
  return done({ ...withRepo(state, next), workdir: moved.workdir }, output)
}

function newBranch(state: GitState, repo: Repo, name: string, start: string | undefined): Target | CommandResult {
  if (!isValidBranchName(name)) return invalidNameError(state, name)
  if (repo.branches[name]) return branchExistsError(state, name)
  if (start !== undefined && !resolveRev(repo, start)) return fatal(state, `fatal: invalid reference: ${start}`)
  return { kind: 'new', name, start: start ?? null, upstream: start ? trackedBy(repo, start) : null }
}

/** `git switch <branch>` also creates a tracking branch when only origin/<branch> exists. */
function existingOrRemote(repo: Repo, name: string): Target | null {
  if (repo.branches[name]) return { kind: 'branch', name }
  if (repo.remoteBranches[name]) return { kind: 'new', name, start: `origin/${name}`, upstream: name }
  return null
}

const branchExpected = (state: GitState, name: string) => fail(state, [
  err(`fatal: a branch is expected, got commit '${name}'`),
  hint('hint: If you want to detach HEAD at the commit, try again with the --detach option.')
], 128)

/**
 * Where `-` (git's `@{-1}`) leads: the previous branch (detached at its tip with `detach`), or the previous detached
 * commit (a `commit` result without `detach`: switch refuses it, checkout detaches). Null when there is no previous
 * position or its branch is gone.
 */
function previousTarget(repo: Repo, detach: boolean): Target | { kind: 'commit', commit: string } | null {
  const previous = repo.previous
  if (!previous) return null
  if (previous.type === 'detached') {
    const label = shortId(previous.commit)
    return detach ? { kind: 'detach', commit: previous.commit, label } : { kind: 'commit', commit: previous.commit }
  }
  if (detach) {
    const commit = repo.branches[previous.name]
    return commit ? { kind: 'detach', commit, label: previous.name } : null
  }
  return existingOrRemote(repo, previous.name)
}

export const switchCommand: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('switch', argv, { flags: ['--detach'], values: ['-c'], alias: { '--create': '-c', '-d': '--detach' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args

  if (values['-c']) {
    const target = newBranch(state, repo, values['-c'][0]!, positionals[0])
    return 'kind' in target ? switchTo(state, target) : target
  }
  const name = positionals[0]
  if (!name) return fatal(state, 'fatal: missing branch or commit argument')
  if (name === '-') {
    const target = previousTarget(repo, flags.has('--detach'))
    if (!target) return fatal(state, 'fatal: invalid reference: @{-1}')
    return target.kind === 'commit' ? branchExpected(state, shortId(target.commit)) : switchTo(state, target)
  }
  if (flags.has('--detach')) {
    const commit = resolveRev(repo, name)
    if (!commit) return fatal(state, `fatal: invalid reference: ${name}`)
    return switchTo(state, { kind: 'detach', commit, label: name })
  }
  const target = existingOrRemote(repo, name)
  if (target) return switchTo(state, target)
  if (trackedBy(repo, name)) {
    return fail(state, [err(`fatal: a branch is expected, got remote branch '${name}'`)], 128)
  }
  if (resolveRev(repo, name)) return branchExpected(state, name)
  return fatal(state, `fatal: invalid reference: ${name}`)
}

function restorePaths(state: GitState, repo: Repo, specs: string[]): CommandResult {
  const known = Object.keys(repo.index).sort()
  const paths = new Set<string>()
  for (const spec of specs) {
    const matched = matchPathspec(spec, known)
    if (!matched.length) return fail(state, [err(`error: pathspec '${normalizePath(spec) || spec}' did not match any file(s) known to git`)])
    for (const path of matched) paths.add(path)
  }
  const workdir = { ...state.workdir }
  for (const path of paths) workdir[path] = repo.index[path]!
  return done({ ...state, workdir }, [out(`Updated ${plural(paths.size, 'path')} from the index`)])
}

export const checkout: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('checkout', argv, { flags: ['--detach'], values: ['-b'] })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals, separator } = parsed.args

  if (values['-b']) {
    const target = newBranch(state, repo, values['-b'][0]!, positionals[0])
    return 'kind' in target ? switchTo(state, target) : target
  }
  if (separator) return restorePaths(state, repo, positionals)
  const name = positionals[0]
  if (!name) return fatal(state, 'fatal: you must specify a branch to checkout')
  if (name === '-') {
    // `-` is git's @{-1}; without a previous position git takes it as a path (and finds no such file)
    const target = previousTarget(repo, flags.has('--detach'))
    if (target) return switchTo(state, target.kind === 'commit' ? { kind: 'detach', commit: target.commit, label: shortId(target.commit) } : target)
  }

  const target = flags.has('--detach') ? null : existingOrRemote(repo, name)
  if (target) return switchTo(state, target)
  const commit = resolveRev(repo, name)
  if (commit) return switchTo(state, { kind: 'detach', commit, label: name })
  return restorePaths(state, repo, positionals)
}
