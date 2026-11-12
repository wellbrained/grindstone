import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { range } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, plural, ref } from '../output'
import { logHead } from '../reflog'
import { isValidBranchName, resolveRev } from '../refs'
import { headId, headTree, normalizePath, own, withEntry } from '../state'
import { moveTrees, union } from '../worktree'
import type { Command, CommandResult, GitState, Head, OutputLine, Repo } from '../types'
import { matchPathspec } from './add'
import { creationError, invalidNameError, trackedBy, trackingLine } from './branch'
import { blockedBy, fatal, moveRef, notARepo, trackingInfo, withRepo } from './common'
import { conflictSide, sideOf } from './restore'
import type { ConflictSide } from './restore'

type Target
  = | { kind: 'branch', name: string }
    | { kind: 'new', name: string, start: string | null, upstream: string | null }
    // `advice`: git explains the detached HEAD state unless --detach was asked for
    | { kind: 'detach', commit: string, label: string, advice: boolean }

/** Warns about commits only reachable from the detached HEAD we are leaving (nothing to say when we land on the same commit). */
function leftBehind(repo: Repo, next: Repo): OutputLine[] {
  if (repo.head.type !== 'detached' || headId(next) === repo.head.commit) return []
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
  const blocked = blockedBy(state, 'switch')
  if (blocked) return blocked

  if (target.kind === 'branch' && repo.head.type === 'branch' && repo.head.name === target.name) {
    // git still counts it as a move: a reflog entry, and `-` leads back to the same branch
    const same = logHead({ ...repo, previous: repo.head }, `checkout: moving from ${target.name} to ${target.name}`, { branch: false })
    return done(withRepo(state, same), [out('Already on \'', ref(target.name), '\''), ...trackingInfo(repo, target.name)])
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
  // HEAD staying on the very same detached commit is no move: `-` still leads back to where it was before
  const unchanged = repo.head.type === 'detached' && target.kind === 'detach' && repo.head.commit === commit
  let next: Repo = { ...repo, head, index: moved.index, previous: unchanged ? repo.previous : repo.head }
  const output: OutputLine[] = []
  if (target.kind === 'new') {
    next = moveRef(next, { branch: target.name }, commit, { log: `branch: Created from ${target.start ?? 'HEAD'}` })
    if (target.upstream) {
      next = { ...next, upstream: { ...next.upstream, [target.name]: target.upstream } }
      output.push(trackingLine(target.name, target.upstream))
    }
  }
  // git names where HEAD came from by branch, or by full id when it was detached
  const from = repo.head.type === 'branch' ? repo.head.name : repo.head.commit
  // ... and git writes no reflog entry for it
  if (!unchanged) next = logHead(next, `checkout: moving from ${from} to ${target.kind === 'detach' ? target.label : target.name}`, { branch: false })
  output.unshift(...leftBehind(repo, next))
  output.push(...moved.carried)

  if (target.kind === 'detach') {
    // the advice comes when a branch is left for a commit, not when moving between detached positions
    if (target.advice && repo.head.type === 'branch') {
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
        hint(''),
        hint('Or undo this operation with:'),
        hint(''),
        hint('  git switch -'),
        hint(''),
        hint('Turn off this advice by setting config variable advice.detachedHead to false'),
        out('')
      )
    }
    output.push(out(`HEAD is now at ${shortId(commit)} ${subject(next.commits[commit]!)}`))
  } else {
    output.push(out(target.kind === 'new' ? 'Switched to a new branch \'' : 'Switched to branch \'', ref(target.name), '\''))
    output.push(...trackingInfo(next, target.name))
  }
  return done({ ...withRepo(state, next), workdir: moved.workdir }, output)
}

function newBranch(state: GitState, repo: Repo, name: string, start: string | undefined): Target | CommandResult {
  if (!isValidBranchName(name)) return invalidNameError(state, name)
  const clash = creationError(state, repo, name)
  if (clash) return clash
  if (start !== undefined && !resolveRev(repo, start)) return fatal(state, `fatal: invalid reference: ${start}`)
  return { kind: 'new', name, start: start ?? null, upstream: start ? trackedBy(repo, start) : null }
}

/** `git switch <branch>` also creates a tracking branch when only origin/<branch> exists. */
function existingOrRemote(repo: Repo, name: string): Target | null {
  if (own(repo.branches, name)) return { kind: 'branch', name }
  if (own(repo.remoteBranches, name)) return { kind: 'new', name, start: `origin/${name}`, upstream: name }
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
  // git names a detached position by its full id
  if (previous.type === 'detached') {
    return detach ? { kind: 'detach', commit: previous.commit, label: previous.commit, advice: false } : { kind: 'commit', commit: previous.commit }
  }
  if (detach) {
    const commit = own(repo.branches, previous.name)
    return commit ? { kind: 'detach', commit, label: previous.name, advice: false } : null
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
  // --detach without a commit detaches at HEAD
  const name = positionals[0] ?? (flags.has('--detach') ? 'HEAD' : undefined)
  if (!name) return fatal(state, 'fatal: missing branch or commit argument')
  if (name === '-') {
    const target = previousTarget(repo, flags.has('--detach'))
    if (!target) return fatal(state, 'fatal: invalid reference: @{-1}')
    return target.kind === 'commit' ? branchExpected(state, target.commit) : switchTo(state, target)
  }
  if (flags.has('--detach')) {
    const commit = resolveRev(repo, name)
    if (!commit) return fatal(state, `fatal: invalid reference: ${name}`)
    return switchTo(state, { kind: 'detach', commit, label: name, advice: false })
  }
  const target = existingOrRemote(repo, name)
  if (target) return switchTo(state, target)
  if (trackedBy(repo, name)) {
    return fail(state, [err(`fatal: a branch is expected, got remote branch '${name}'`)], 128)
  }
  if (resolveRev(repo, name)) return branchExpected(state, name)
  return fatal(state, `fatal: invalid reference: ${name}`)
}

/**
 * `git checkout [--ours|--theirs] [--] <paths>`: files from the index; with a side, unmerged files from that side
 * (they stay unmerged until `git add`).
 */
function restorePaths(state: GitState, repo: Repo, specs: string[], side: ConflictSide | null): CommandResult {
  const known = union(repo.index, repo.unmerged)
  const paths = new Set<string>()
  for (const spec of specs) {
    const matched = matchPathspec(spec, known)
    if (!matched.length) return fail(state, [err(`error: pathspec '${normalizePath(spec) || spec}' did not match any file(s) known to git`)])
    for (const path of matched) paths.add(path)
  }
  const unmerged = [...paths].filter(path => own(repo.unmerged, path) !== undefined)
  const errors = side
    ? unmerged.filter(path => conflictSide(repo, path, side) === undefined).map(path => err(`error: path '${path}' does not have ${side === 'ours' ? 'our' : 'their'} version`))
    : unmerged.map(path => err(`error: path '${path}' is unmerged`))
  if (errors.length) return fail(state, errors)

  let workdir = state.workdir
  let updated = 0
  for (const path of paths) {
    const content = side && own(repo.unmerged, path) ? conflictSide(repo, path, side) : own(repo.index, path)
    // git always writes (and counts) a side of an unmerged file; other files only when they differ
    if (!(side && own(repo.unmerged, path)) && own(workdir, path) === content) continue
    workdir = withEntry(workdir, path, content)
    updated++
  }
  return done({ ...state, workdir }, [out(`Updated ${plural(updated, 'path')} from the index`)])
}

export const checkout: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('checkout', argv, { flags: ['--detach', '--ours', '--theirs'], values: ['-b'] })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals, separator } = parsed.args
  const side = sideOf(argv)

  if (side && !separator) {
    // without `--`, a name that is a branch or commit means switching, which a side cannot do
    const name = positionals[0]
    const isRev = name !== undefined && (name === '-' || existingOrRemote(repo, name) || resolveRev(repo, name))
    // a tree-ish followed by paths is "checking out of a tree", a lone one is a switch
    if (!values['-b'] && isRev && positionals.length > 1) {
      return fatal(state, 'fatal: \'--merge\', \'--ours\', or \'--theirs\' cannot be used when checking out of a tree')
    }
    if (values['-b'] || isRev) {
      return fatal(state, 'fatal: \'--ours/--theirs\' cannot be used with switching branches')
    }
    if (!name) return fatal(state, 'fatal: \'--ours/--theirs\' needs the paths to check out')
    return restorePaths(state, repo, positionals, side)
  }
  if (values['-b']) {
    const target = newBranch(state, repo, values['-b'][0]!, positionals[0])
    return 'kind' in target ? switchTo(state, target) : target
  }
  if (separator) return restorePaths(state, repo, positionals, side)
  const name = positionals[0] ?? (flags.has('--detach') ? 'HEAD' : undefined)
  if (!name) return fatal(state, 'fatal: you must specify a branch to checkout')
  if (name === '-') {
    // `-` is git's @{-1}; without a previous position git takes it as a path (and finds no such file)
    const target = previousTarget(repo, flags.has('--detach'))
    if (target) return switchTo(state, target.kind === 'commit' ? { kind: 'detach', commit: target.commit, label: target.commit, advice: true } : target)
  }
  // `git checkout HEAD` stays where it is
  if (!flags.has('--detach') && (name === 'HEAD' || name === '@') && positionals.length === 1) return done(state)

  const target = flags.has('--detach') ? null : existingOrRemote(repo, name)
  if (target) return switchTo(state, target)
  const commit = resolveRev(repo, name)
  if (commit) return switchTo(state, { kind: 'detach', commit, label: name, advice: !flags.has('--detach') })
  return restorePaths(state, repo, positionals, null)
}
