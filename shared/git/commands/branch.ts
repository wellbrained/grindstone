import { parseArgs } from '../args'
import { isAncestor } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, ref } from '../output'
import { isValidBranchName, resolveRev, trackingRef } from '../refs'
import { headId, withEntry, without } from '../state'
import type { Command, CommandResult, GitState, OutputLine, Repo } from '../types'
import { fatal, notARepo, withRepo } from './common'

export const branchExistsError = (state: GitState, name: string) => fatal(state, `fatal: a branch named '${name}' already exists`)
export const invalidNameError = (state: GitState, name: string) => fatal(state, `fatal: '${name}' is not a valid branch name`)

/** If `start` names a remote-tracking ref, the branch on origin it tracks. */
export function trackedBy(repo: Repo, start: string): string | null {
  const name = start.replace(/^remotes\//, '')
  if (!name.startsWith('origin/') || repo.branches[name]) return null
  const branch = name.slice('origin/'.length)
  return repo.remoteBranches[branch] ? branch : null
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
  if (!repo.branches[from] && from !== current) return fatal(state, `fatal: no branch named '${from}'`)
  if (repo.operation?.type === 'rebase' && repo.operation.branch === from) return fatal(state, `fatal: branch ${from} is being rebased at ${state.cwd}`)
  if (!isValidBranchName(to)) return invalidNameError(state, to)
  if (from !== to && repo.branches[to]) {
    if (!force) return branchExistsError(state, to)
    if (to === current) return fatal(state, `fatal: cannot force update the branch '${to}' used by worktree at '${state.cwd}'`)
  }
  if (from === to) return done(state)

  const tip = repo.branches[from]
  const branches = without(repo.branches, from)
  const upstream = without(repo.upstream, from)
  const next: Repo = {
    ...repo,
    branches: tip ? { ...branches, [to]: tip } : branches,
    upstream: withEntry(upstream, to, repo.upstream[from]),
    head: from === current ? { type: 'branch', name: to } : repo.head
  }
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
      const tip = next.branches[name]
      if (!tip) return fail(withRepo(state, next), [...output, err(`error: branch '${name}' not found`)])
      if (activeBranch(next) === name) {
        return fail(withRepo(state, next), [...output, err(`error: cannot delete branch '${name}' used by worktree at '${state.cwd}'`)])
      }
      const upstream = next.upstream[name]
      const upstreamTip = upstream ? next.remoteBranches[upstream] : undefined
      const head = headId(next)
      const merged = (head && isAncestor(next.commits, tip, head)) || (upstreamTip && isAncestor(next.commits, tip, upstreamTip))
      if (!flags.has('-D') && !merged) {
        return fail(withRepo(state, next), [
          ...output,
          err(`error: the branch '${name}' is not fully merged`),
          hint(`hint: If you are sure you want to delete it, run 'git branch -D ${name}'`)
        ])
      }
      const { [name]: _deleted, ...branches } = next.branches
      const { [name]: _upstream, ...upstreams } = next.upstream
      next = { ...next, branches, upstream: upstreams }
      output.push(out('Deleted branch ', ref(name), ` (was ${shortId(tip)}).`))
    }
    return done(withRepo(state, next), output)
  }

  if (values['-u']) {
    const target = values['-u'][0]!
    const name = positionals[0] ?? activeBranch(repo)
    if (!name || !repo.branches[name]) return fatal(state, `fatal: branch '${name ?? 'HEAD'}' does not exist`)
    const upstream = trackedBy(repo, target)
    if (!upstream) return fatal(state, `fatal: the requested upstream branch '${target}' does not exist`)
    return done(withRepo(state, { ...repo, upstream: { ...repo.upstream, [name]: upstream } }), [trackingLine(name, upstream)])
  }

  if (!positionals.length || flags.has('--list') || flags.has('-a') || flags.has('-r')) {
    return done(state, list(repo, !flags.has('-r'), flags.has('-a') || flags.has('-r')))
  }

  const [name, start = 'HEAD'] = positionals as [string, string?]
  if (!isValidBranchName(name)) return invalidNameError(state, name)
  if (repo.branches[name]) return branchExistsError(state, name)
  const at = resolveRev(repo, start)
  if (!at) return fatal(state, `fatal: not a valid object name: '${start === 'HEAD' && repo.head.type === 'branch' ? repo.head.name : start}'`)
  const upstream = trackedBy(repo, start)
  const next: Repo = {
    ...repo,
    branches: { ...repo.branches, [name]: at },
    upstream: upstream ? { ...repo.upstream, [name]: upstream } : repo.upstream
  }
  return done(withRepo(state, next), upstream ? [trackingLine(name, upstream)] : [])
}
