import { parseArgs } from '../args'
import { isAncestor } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, ref } from '../output'
import { dropLog, logBranch, logHead, renameLog } from '../reflog'
import { isValidBranchName, resolveRev, trackingRef } from '../refs'
import { headId, own, withEntry, without } from '../state'
import type { Command, CommandResult, GitState, OutputLine, Repo } from '../types'
import { fatal, notARepo, withRepo } from './common'

export const branchExistsError = (state: GitState, name: string) => fatal(state, `fatal: a branch named '${name}' already exists`)
export const invalidNameError = (state: GitState, name: string) => fatal(state, `fatal: '${name}' is not a valid branch name`)

/**
 * Why a new branch cannot be created, or null: the name is taken, or it clashes with another branch as file and
 * folder (`a` next to `a/b`), which git's ref store cannot hold.
 */
export function creationError(state: GitState, repo: Repo, name: string): CommandResult | null {
  if (own(repo.branches, name)) return branchExistsError(state, name)
  const clash = Object.keys(repo.branches).find(other => other.startsWith(`${name}/`) || name.startsWith(`${other}/`))
  if (!clash) return null
  return fatal(state, `fatal: cannot lock ref 'refs/heads/${name}': 'refs/heads/${clash}' exists; cannot create 'refs/heads/${name}'`)
}

/** If `start` names a remote-tracking ref, the branch on origin it tracks. */
export function trackedBy(repo: Repo, start: string): string | null {
  const name = start.replace(/^remotes\//, '')
  if (!name.startsWith('origin/') || own(repo.branches, name)) return null
  const branch = name.slice('origin/'.length)
  return own(repo.remoteBranches, branch) ? branch : null
}

export const trackingLine = (branch: string, upstream: string) =>
  out('branch \'', ref(branch), '\' set up to track \'', ref(trackingRef(upstream)), '\'.')

/** The branch HEAD belongs to, also while a rebase has detached it. */
export function activeBranch(repo: Repo): string | null {
  if (repo.head.type === 'branch') return repo.head.name
  return repo.operation?.type === 'rebase' ? repo.operation.branch : null
}

function list(repo: Repo, local: boolean, remote: boolean): OutputLine[] {
  const lines: OutputLine[] = []
  if (local) {
    if (repo.head.type === 'detached') {
      const rebasing = repo.operation?.type === 'rebase' ? repo.operation.branch : null
      lines.push(out(rebasing ? `* (no branch, rebasing ${rebasing})` : `* (HEAD detached at ${shortId(repo.head.commit)})`))
    }
    for (const name of Object.keys(repo.branches).sort()) {
      const current = repo.head.type === 'branch' && repo.head.name === name
      lines.push(out(current ? '* ' : '  ', ref(name)))
    }
  }
  if (remote) {
    for (const name of Object.keys(repo.remoteBranches).sort()) {
      lines.push(out('  ', local ? 'remotes/' : '', ref(trackingRef(name))))
    }
  }
  return lines
}

/** `git branch -m [<old>] <new>` (`-M`: `force` over an existing name). Silent on success, like git. */
function rename(state: GitState, repo: Repo, names: string[], force: boolean): CommandResult {
  if (!names.length) return fatal(state, 'fatal: branch name required')
  if (names.length > 2) return fatal(state, 'fatal: too many arguments for a rename operation')
  const current = repo.head.type === 'branch' ? repo.head.name : null
  if (names.length === 1 && !current) {
    const rebasing = activeBranch(repo)
    return rebasing ? fatal(state, `fatal: branch ${rebasing} is being rebased at ${state.cwd}`) : fatal(state, 'fatal: cannot rename the current branch while not on any')
  }
  const [from, to] = names.length === 2 ? names as [string, string] : [current!, names[0]!]
  // the branch you are on may still be unborn (no commit yet): then only HEAD changes
  if (!own(repo.branches, from) && from !== current) return fatal(state, `fatal: no branch named '${from}'`)
  if (repo.operation?.type === 'rebase' && repo.operation.branch === from) return fatal(state, `fatal: branch ${from} is being rebased at ${state.cwd}`)
  if (!isValidBranchName(to)) return invalidNameError(state, to)
  if (from !== to && own(repo.branches, to)) {
    if (!force) return branchExistsError(state, to)
    if (to === current) return fatal(state, `fatal: cannot force update the branch '${to}' used by worktree at '${state.cwd}'`)
  }
  if (from === to) return done(state)

  const tip = own(repo.branches, from)
  const branches = without(repo.branches, from)
  const upstream = without(repo.upstream, from)
  let next: Repo = renameLog({
    ...repo,
    branches: tip ? { ...branches, [to]: tip } : branches,
    upstream: withEntry(upstream, to, own(repo.upstream, from)),
    head: from === current ? { type: 'branch', name: to } : repo.head
  }, from, to)
  // git notes the rename in the branch's log, and in HEAD's when it is the branch you are on
  const message = `Branch: renamed refs/heads/${from} to refs/heads/${to}`
  if (tip) next = from === current ? logHead(next, message) : logBranch(next, to, message)
  return done(withRepo(state, next))
}

export const branch: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('branch', argv, {
    flags: ['-d', '-D', '-a', '-r', '-m', '-M', '--list'],
    values: ['-u'],
    alias: { '--delete': '-d', '--all': '-a', '--remotes': '-r', '--move': '-m', '--set-upstream-to': '-u' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args

  if (flags.has('-m') || flags.has('-M')) return rename(state, repo, positionals, flags.has('-M'))

  if (flags.has('-d') || flags.has('-D')) {
    if (!positionals.length) return fatal(state, 'fatal: branch name required')
    let next = repo
    const output: OutputLine[] = []
    for (const name of positionals) {
      const tip = own(next.branches, name)
      if (!tip) return fail(withRepo(state, next), [...output, err(`error: branch '${name}' not found`)])
      if (activeBranch(next) === name) {
        return fail(withRepo(state, next), [...output, err(`error: cannot delete branch '${name}' used by worktree at '${state.cwd}'`)])
      }
      const upstream = own(next.upstream, name)
      const upstreamTip = upstream ? own(next.remoteBranches, upstream) : undefined
      const head = headId(next)
      const merged = (head && isAncestor(next.commits, tip, head)) || (upstreamTip && isAncestor(next.commits, tip, upstreamTip))
      if (!flags.has('-D') && !merged) {
        return fail(withRepo(state, next), [
          ...output,
          err(`error: the branch '${name}' is not fully merged`),
          hint(`hint: If you are sure you want to delete it, run 'git branch -D ${name}'`),
          hint('hint: Disable this message with "git config set advice.forceDeleteBranch false"')
        ])
      }
      const { [name]: _deleted, ...branches } = next.branches
      const { [name]: _upstream, ...upstreams } = next.upstream
      next = dropLog({ ...next, branches, upstream: upstreams }, name)
      output.push(out('Deleted branch ', ref(name), ` (was ${shortId(tip)}).`))
    }
    return done(withRepo(state, next), output)
  }

  if (values['-u']) {
    const target = values['-u'][0]!
    const name = positionals[0] ?? activeBranch(repo)
    if (!name || !own(repo.branches, name)) return fatal(state, `fatal: branch '${name ?? 'HEAD'}' does not exist`)
    const upstream = trackedBy(repo, target)
    if (!upstream) return fatal(state, `fatal: the requested upstream branch '${target}' does not exist`)
    return done(withRepo(state, { ...repo, upstream: { ...repo.upstream, [name]: upstream } }), [trackingLine(name, upstream)])
  }

  if (!positionals.length || flags.has('--list') || flags.has('-a') || flags.has('-r')) {
    return done(state, list(repo, !flags.has('-r'), flags.has('-a') || flags.has('-r')))
  }

  const [name, given] = positionals as [string, string?]
  const start = given ?? 'HEAD'
  if (!isValidBranchName(name)) return invalidNameError(state, name)
  const clash = creationError(state, repo, name)
  if (clash) return clash
  const at = resolveRev(repo, start)
  if (!at) return fatal(state, `fatal: not a valid object name: '${start === 'HEAD' && repo.head.type === 'branch' ? repo.head.name : start}'`)
  const upstream = trackedBy(repo, start)
  const next: Repo = logBranch({
    ...repo,
    branches: { ...repo.branches, [name]: at },
    upstream: upstream ? { ...repo.upstream, [name]: upstream } : repo.upstream
  // without a start point git names the branch HEAD is on
  }, name, `branch: Created from ${given === undefined && repo.head.type === 'branch' ? repo.head.name : start}`)
  return done(withRepo(state, next), upstream ? [trackingLine(name, upstream)] : [])
}
