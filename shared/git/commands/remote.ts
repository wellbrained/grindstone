// fetch, pull and push against the simulated origin.
import { parseArgs } from '../args'
import { isAncestor, reachable } from '../objects/graph'
import type { Commits } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, ref } from '../output'
import { tagNames, trackingRef } from '../refs'
import { own, without } from '../state'
import { hasUnmerged } from '../worktree'
import type { Command, CommandResult, GitState, OutputLine, Remote, Repo } from '../types'
import { activeBranch, trackingLine } from './branch'
import { unresolvedConflict } from './commit'
import { blockedBy, fatal, notARepo, withRepo } from './common'
import { mergeInto } from './merge'
import { startRebase } from './rebase'

const SUMMARY_WIDTH = 17
const REF_WIDTH = 10

const noRemote = (state: GitState, name = 'origin') => fail(state, [
  err(`fatal: '${name}' does not appear to be a git repository`),
  err('fatal: Could not read from remote repository.'),
  err(''),
  err('Please make sure you have the correct access rights'),
  err('and the repository exists.')
], 128)

/** Copies every commit reachable from `tips` from one object store into another. */
function copyCommits(from: Commits, to: Commits, tips: string[]): Commits {
  const missing = [...reachable(from, tips)].filter(id => !to[id])
  if (!missing.length) return to
  const merged = { ...to }
  for (const id of missing) merged[id] = from[id]!
  return merged
}

const refLine = (flag: string, summary: string, from: string, to: string, width: number, suffix = '') =>
  out(` ${flag} ${summary.padEnd(SUMMARY_WIDTH)} `, ref(from), `${' '.repeat(Math.max(0, width - from.length))} -> `, ref(to), suffix)

/** Updates origin/* from origin. Returns the new state and git's "From <url>" report. */
export function fetchOrigin(state: GitState, only?: string): { state: GitState, output: OutputLine[] } {
  const repo = state.repo!
  const origin = state.origin!
  const names = Object.keys(origin.branches).filter(name => only === undefined || name === only).sort()
  const remoteBranches = { ...repo.remoteBranches }
  // tags come along (git's auto-following); a tag you already have, even a different one, stays as it is
  const newTags = tagNames(origin.tags).filter(name => !own(repo.tags, name))
  // the ref column is as wide as the longest name shown, at least REF_WIDTH
  const shown = [...names.filter(name => only !== undefined || own(repo.remoteBranches, name) !== own(origin.branches, name)), ...newTags]
  const width = Math.max(REF_WIDTH, ...shown.map(name => name.length))
  const output: OutputLine[] = []

  for (const name of names) {
    const tip = origin.branches[name]!
    const old = own(repo.remoteBranches, name)
    if (only !== undefined) output.push(refLine('*', 'branch', name, 'FETCH_HEAD', width))
    if (old === tip) continue
    remoteBranches[name] = tip
    if (!old) output.push(refLine('*', '[new branch]', name, trackingRef(name), width))
    else if (isAncestor(origin.commits, old, tip)) output.push(refLine(' ', `${shortId(old)}..${shortId(tip)}`, name, trackingRef(name), width))
    else output.push(refLine('+', `${shortId(old)}...${shortId(tip)}`, name, trackingRef(name), width, '  (forced update)'))
  }

  const tags = { ...repo.tags }
  for (const name of newTags) {
    tags[name] = origin.tags[name]!
    output.push(refLine('*', '[new tag]', name, name, width))
  }

  const tips = [...names.map(name => origin.branches[name]!), ...newTags.map(name => tags[name]!.commit)]
  const next: Repo = {
    ...repo,
    commits: copyCommits(origin.commits, repo.commits, tips),
    remoteBranches,
    ...(newTags.length ? { tags } : {})
  }
  return { state: withRepo(state, next), output: output.length ? [out(`From ${origin.url}`), ...output] : [] }
}

export const fetch: Command = (state, argv) => {
  if (!state.repo) return notARepo(state)
  const parsed = parseArgs('fetch', argv, { flags: ['--all', '--prune'], alias: { '-p': '--prune' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const [remote = 'origin', branch] = parsed.args.positionals
  // without any remote configured and none named, there is simply nothing to fetch
  if (!state.origin && parsed.args.positionals.length === 0) return done(state)
  if (!state.origin || remote !== 'origin') return noRemote(state, remote)
  if (branch !== undefined && !own(state.origin.branches, branch)) return fatal(state, `fatal: couldn't find remote ref ${branch}`)

  const fetched = fetchOrigin(state, branch)
  if (!parsed.args.flags.has('--prune')) return done(fetched.state, fetched.output)

  const repo = fetched.state.repo!
  const stale = Object.keys(repo.remoteBranches).filter(name => !own(state.origin!.branches, name)).sort()
  if (!stale.length) return done(fetched.state, fetched.output)
  const remoteBranches = stale.reduce(without, repo.remoteBranches)
  const lines = stale.map(name => refLine('-', '[deleted]', '(none)', trackingRef(name), REF_WIDTH))
  const output = fetched.output.length ? [...fetched.output, ...lines] : [out(`From ${state.origin.url}`), ...lines]
  return done(withRepo(fetched.state, { ...repo, remoteBranches }), output)
}

const withoutGit = (url: string) => url.replace(/\.git$/, '')

export const pull: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('pull', argv, { flags: ['--rebase', '--no-rebase', '--ff-only', '--no-ff'], alias: { '-r': '--rebase' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  const [remote = 'origin', named] = positionals
  if (!state.origin && positionals.length === 0) {
    const current = activeBranch(repo)
    return fail(state, [
      out(current ? 'There is no tracking information for the current branch.' : 'You are not currently on a branch.'),
      out('Please specify which branch you want to merge with.'),
      out('See git-pull(1) for details.'),
      out(''),
      out('    git pull <remote> <branch>'),
      ...(current
        ? [
            out(''),
            out('If you wish to set tracking information for this branch you can do so with:'),
            out(''),
            out(`    git branch --set-upstream-to=<remote>/<branch> ${current}`),
            out('')
          ]
        : [])
    ])
  }
  if (!state.origin || remote !== 'origin') return noRemote(state, remote)
  if (hasUnmerged(repo)) return unresolvedConflict(state, 'Pulling')
  const blocked = blockedBy(state, 'pull')
  if (blocked) return blocked

  const current = activeBranch(repo)
  const branch = named ?? (current ? own(repo.upstream, current) : undefined)
  if (!branch) {
    return fail(state, [
      out(current ? 'There is no tracking information for the current branch.' : 'You are not currently on a branch.'),
      out('Please specify which branch you want to merge with.'),
      out('See git-pull(1) for details.'),
      out(''),
      out('    git pull <remote> <branch>'),
      ...(current
        ? [
            out(''),
            out('If you wish to set tracking information for this branch you can do so with:'),
            out(''),
            out(`    git branch --set-upstream-to=origin/<branch> ${current}`),
            out('')
          ]
        : [])
    ])
  }
  if (!own(state.origin.branches, branch)) return fatal(state, `fatal: couldn't find remote ref ${branch}`, 1)

  const fetched = fetchOrigin(state, named === undefined ? undefined : branch)
  const theirs = own(fetched.state.repo!.remoteBranches, branch)!
  const label = trackingRef(branch)
  const into = current && current !== 'main' && current !== 'master' ? ` into ${current}` : ''
  // git names the reflog entries after the whole command line: `pull: Fast-forward`, `pull --rebase (finish): ...`
  const action = ['pull', ...argv].join(' ')
  const result = flags.has('--rebase')
    ? startRebase(fetched.state, theirs, { action, upstream: theirs })
    : mergeInto(fetched.state, theirs, label, {
        reflog: action,
        message: `Merge branch '${branch}' of ${withoutGit(state.origin.url)}${into}`,
        ffOnly: flags.has('--ff-only'),
        noFf: flags.has('--no-ff')
      })
  // a failed merge or rebase still keeps what fetch brought in (result.state builds on fetched.state)
  return { state: result.state, output: [...fetched.output, ...result.output], exitCode: result.exitCode }
}

function rejected(state: GitState, url: string, line: OutputLine, hints: string[]): CommandResult {
  return fail(state, [out(`To ${url}`), line, err(`error: failed to push some refs to '${url}'`), ...hints.map(text => hint(text))])
}

const FETCH_FIRST = [
  'hint: Updates were rejected because the remote contains work that you do not',
  'hint: have locally. This is usually caused by another repository pushing to',
  'hint: the same ref. If you want to integrate the remote changes, use',
  'hint: \'git pull\' before pushing again.',
  'hint: See the \'Note about fast-forwards\' in \'git push --help\' for details.'
]

const NON_FAST_FORWARD = [
  'hint: Updates were rejected because the tip of your current branch is behind',
  'hint: its remote counterpart. If you want to integrate the remote changes,',
  'hint: use \'git pull\' before pushing again.',
  'hint: See the \'Note about fast-forwards\' in \'git push --help\' for details.'
]

const pushLine = (flag: string, summary: string, src: string, dst: string, suffix = '') =>
  out(` ${flag} ${summary.padEnd(SUMMARY_WIDTH)} `, ref(src), ' -> ', ref(dst), suffix)

const tagLine = (flag: string, summary: string, name: string, suffix = '') => out(` ${flag} ${summary.padEnd(SUMMARY_WIDTH)} ${name} -> ${name}${suffix}`)

/** `git push origin <tag>` and `git push --tags`: tags origin doesn't have yet; a different one there is only replaced with force. */
function pushTags(state: GitState, names: string[], force: boolean): CommandResult {
  const repo = state.repo!
  const origin = state.origin!
  const tags = { ...origin.tags }
  const lines: OutputLine[] = []
  const rejected: string[] = []
  for (const name of names) {
    const local = repo.tags[name]!
    const there = own(tags, name)
    const target = (tag: typeof local) => tag.annotation?.id ?? tag.commit
    if (there && target(there) === target(local)) continue
    if (there && !force) {
      rejected.push(name)
      continue
    }
    lines.push(there ? tagLine('+', `${shortId(target(there))}...${shortId(target(local))}`, name, ' (forced update)') : tagLine('*', '[new tag]', name))
    tags[name] = local
  }
  if (!lines.length && !rejected.length) return done(state, [out('Everything up-to-date')])
  const nextOrigin: Remote = {
    ...origin,
    commits: copyCommits(repo.commits, origin.commits, Object.values(tags).map(tag => tag.commit)),
    tags
  }
  const next = lines.length ? { ...state, origin: nextOrigin } : state
  if (!rejected.length) return done(next, [out(`To ${origin.url}`), ...lines])
  return fail(next, [
    out(`To ${origin.url}`),
    ...lines,
    ...rejected.map(name => tagLine('!', '[rejected]', name, ' (already exists)')),
    err(`error: failed to push some refs to '${origin.url}'`),
    hint('hint: Updates were rejected because the tag already exists in the remote.')
  ])
}

export const push: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('push', argv, {
    flags: ['-u', '--force', '--force-with-lease', '--tags'],
    alias: { '--set-upstream': '-u', '-f': '--force' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals } = parsed.args
  const origin = state.origin
  if (!origin) {
    return fail(state, [
      err('fatal: No configured push destination.'),
      err('Either specify the URL from the command-line or configure a remote repository using'),
      err(''),
      err('    git remote add <name> <url>'),
      err(''),
      err('and then push using the remote name'),
      err(''),
      err('    git push <name>'),
      err(''),
      err('To push to multiple remotes at once, configure a remote group using'),
      err(''),
      err('    git config remotes.<groupname> "<remote1> <remote2>"'),
      err(''),
      err('and then push using the group name'),
      err(''),
      err('    git push <groupname>'),
      err('')
    ], 128)
  }
  const [remote = 'origin', refspec] = positionals
  if (remote !== 'origin') return noRemote(state, remote)
  if (positionals.length > 2) return fail(state, [err('git push: pushing several branches at once is not in this trainer yet')])
  if (refspec?.includes(':')) return fail(state, [err('git push: <src>:<dst> refspecs are not in this trainer yet')])
  const force = flags.has('--force') || flags.has('--force-with-lease')
  if (flags.has('--tags')) {
    if (refspec !== undefined) return fail(state, [err('git push: pushing --tags together with a branch is not in this trainer yet')])
    return pushTags(state, tagNames(repo.tags), force)
  }
  if (refspec !== undefined && !own(repo.branches, refspec) && own(repo.tags, refspec.replace(/^refs\/tags\//, ''))) {
    return pushTags(state, [refspec.replace(/^refs\/tags\//, '')], force)
  }

  const current = activeBranch(repo)
  const src = refspec === undefined || refspec === 'HEAD' ? current : refspec
  if (!src || (repo.head.type === 'detached' && refspec === undefined)) {
    return fatal(state, [
      'fatal: You are not currently on a branch.',
      'To push the history leading to the current (detached HEAD)',
      'state now, use',
      '',
      '    git push origin HEAD:<name-of-remote-branch>'
    ].join('\n'))
  }
  const local = own(repo.branches, src)
  if (!local) {
    return fail(state, [err(`error: src refspec ${src} does not match any`), err(`error: failed to push some refs to '${origin.url}'`)])
  }
  const dst = refspec === undefined ? own(repo.upstream, src) : src
  if (!dst) {
    return fatal(state, [
      `fatal: The current branch ${src} has no upstream branch.`,
      'To push the current branch and set the remote as upstream, use',
      '',
      `    git push --set-upstream origin ${src}`,
      '',
      'To have this happen automatically for branches without a tracking',
      'upstream, see \'push.autoSetupRemote\' in \'git help config\'.'
    ].join('\n'))
  }

  const remoteTip = own(origin.branches, dst)
  const setUpstream = flags.has('-u')
  const upstreamLines = setUpstream ? [trackingLine(src, dst)] : []
  const withUpstream = (next: Repo): Repo => setUpstream ? { ...next, upstream: { ...next.upstream, [src]: dst } } : next

  if (remoteTip === local) {
    return done(withRepo(state, withUpstream({ ...repo, remoteBranches: { ...repo.remoteBranches, [dst]: local } })), [out('Everything up-to-date'), ...upstreamLines])
  }

  if (remoteTip && flags.has('--force-with-lease') && !flags.has('--force') && own(repo.remoteBranches, dst) !== remoteTip) {
    return rejected(state, origin.url, pushLine('!', '[rejected]', src, dst, ' (stale info)'), [])
  }

  let line: OutputLine
  if (!remoteTip) {
    line = pushLine('*', '[new branch]', src, dst)
  } else if (isAncestor(repo.commits, remoteTip, local)) {
    line = pushLine(' ', `${shortId(remoteTip)}..${shortId(local)}`, src, dst)
  } else {
    const forced = pushLine('+', `${shortId(remoteTip)}...${shortId(local)}`, src, dst, ' (forced update)')
    if (flags.has('--force') || flags.has('--force-with-lease')) {
      line = forced
    } else if (!repo.commits[remoteTip]) {
      return rejected(state, origin.url, pushLine('!', '[rejected]', src, dst, ' (fetch first)'), FETCH_FIRST)
    } else {
      return rejected(state, origin.url, pushLine('!', '[rejected]', src, dst, ' (non-fast-forward)'), NON_FAST_FORWARD)
    }
  }

  const nextOrigin: Remote = {
    ...origin,
    commits: copyCommits(repo.commits, origin.commits, [local]),
    branches: { ...origin.branches, [dst]: local }
  }
  const nextRepo = withUpstream({ ...repo, remoteBranches: { ...repo.remoteBranches, [dst]: local } })
  return done({ ...withRepo(state, nextRepo), origin: nextOrigin }, [out(`To ${origin.url}`), line, ...upstreamLines])
}

const REMOTE_SUBCOMMANDS = ['add', 'rename', 'remove', 'rm', 'set-head', 'set-branches', 'get-url', 'set-url', 'show', 'prune', 'update']

/** `git remote` and `git remote -v`: the one remote there is, if any. */
export const remote: Command = (state, argv) => {
  if (!state.repo) return notARepo(state)
  const parsed = parseArgs('remote', argv, { flags: ['-v'], alias: { '--verbose': '-v' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const [sub] = parsed.args.positionals
  if (sub !== undefined) {
    if (REMOTE_SUBCOMMANDS.includes(sub)) return fail(state, [err(`git remote ${sub} is not in this trainer yet`)])
    return fail(state, [err(`error: unknown subcommand: \`${sub}'`)], 129)
  }
  const origin = state.origin
  if (!origin) return done(state, [])
  if (!parsed.args.flags.has('-v')) return done(state, [out(origin.name)])
  return done(state, [out(`${origin.name}\t${origin.url} (fetch)`), out(`${origin.name}\t${origin.url} (push)`)])
}
