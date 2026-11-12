// git stash: put staged and unstaged changes (with -u also untracked files) on a shelf and get them back later.
// Entries live on the repo (`repo.stash`, newest first), not as commits, so the graph and `log --all` leave them out.
// Applying is a three-way merge of the stashed working tree onto the current index; it refuses instead of writing
// conflict markers. Like git without --index, staged changes come back unstaged (new files come back staged).
import { parseArgs } from '../args'
import { ignoreMatcher } from '../ignore'
import { createCommit, subject } from '../objects/commit'
import { shortId } from '../objects/hash'
import { done, err, fail, out } from '../output'
import { mergeTrees } from '../merge3'
import { headId, withEntry, without } from '../state'
import { moveTrees, treesEqual, union } from '../worktree'
import type { Command, CommandResult, GitState, OutputLine, Repo, StashEntry, Tree } from '../types'
import { notARepo, withRepo } from './common'
import { statusLines } from './status'

const branchLabel = (repo: Repo) => repo.head.type === 'branch' ? repo.head.name : '(no branch)'

/** Untracked files that no .gitignore names (what `git stash -u` takes along). */
function untrackedFiles(repo: Repo, workdir: Tree): Tree {
  const ignored = ignoreMatcher(workdir)
  return Object.fromEntries(Object.entries(workdir).filter(([path]) => repo.index[path] === undefined && !ignored(path)))
}

const push = (state: GitState, repo: Repo, argv: string[]): CommandResult => {
  const parsed = parseArgs('stash', argv, { flags: ['-u'], values: ['-m'], alias: { '--include-untracked': '-u', '--message': '-m' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args
  if (positionals.length) return fail(state, [err('git stash push: stashing only some paths is not in this trainer yet')])

  const unmerged = Object.keys(repo.unmerged).sort()
  if (unmerged.length) {
    return fail(state, [...unmerged.map(path => err(`${path}: needs merge`)), err('error: could not save the stash: you have unmerged files')])
  }
  const head = headId(repo)
  if (!head) return fail(state, [err('You do not have the initial commit yet')])
  const headCommit = repo.commits[head]!

  const tracked: Tree = Object.fromEntries(Object.keys(repo.index).flatMap(path => state.workdir[path] === undefined ? [] : [[path, state.workdir[path]!]]))
  const untracked = flags.has('-u') ? untrackedFiles(repo, state.workdir) : {}
  const changed = !treesEqual(headCommit.tree, repo.index) || !treesEqual(repo.index, tracked) || Object.keys(untracked).length > 0
  if (!changed) return done(state, [out('No local changes to save')])

  const message = values['-m']
    ? `On ${branchLabel(repo)}: ${values['-m'].join('\n\n')}`
    : `WIP on ${branchLabel(repo)}: ${shortId(head)} ${subject(headCommit)}`
  // a commit object only for a deterministic id; it is not stored with the commits
  const created = createCommit(state, { parents: [head], tree: { ...untracked, ...tracked }, message })
  const entry: StashEntry = { id: created.commit.id, base: head, message, index: repo.index, workdir: tracked, untracked }

  // back to HEAD: tracked files as committed, staged new files gone, the untracked ones taken along removed
  let workdir = state.workdir
  for (const path of union(repo.index, headCommit.tree)) workdir = withEntry(workdir, path, headCommit.tree[path])
  for (const path of Object.keys(untracked)) workdir = without(workdir, path)
  const next: Repo = { ...repo, index: headCommit.tree, stash: [entry, ...repo.stash] }
  return done({ ...withRepo(created.state, next), workdir }, [out(`Saved working directory and index state ${message}`)])
}

/** The entry an argument names (`stash@{1}` or `1`, the newest by default), or the error. */
function pick(state: GitState, repo: Repo, arg: string | undefined): { index: number, name: string } | CommandResult {
  if (!repo.stash.length) return fail(state, [err('No stash entries found.')])
  if (arg === undefined) return { index: 0, name: 'refs/stash@{0}' }
  const match = /^(?:stash@\{(\d+)\}|(\d+))$/.exec(arg)
  const index = match ? Number(match[1] ?? match[2]) : -1
  if (index < 0 || index >= repo.stash.length) return fail(state, [err(`error: ${arg} is not a valid reference`)])
  return { index, name: `stash@{${index}}` }
}

const dropped = (entry: StashEntry, name: string) => out(`Dropped ${name} (${entry.id})`)

const apply = (state: GitState, repo: Repo, argv: string[], pop: boolean): CommandResult => {
  const command = pop ? 'pop' : 'apply'
  const parsed = parseArgs(`stash ${command}`, argv, {})
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const picked = pick(state, repo, parsed.args.positionals[0])
  if ('state' in picked) return picked
  const entry = repo.stash[picked.index]!
  const kept: OutputLine[] = pop ? [err('The stash entry is kept in case you need it again.')] : []

  if (Object.keys(repo.unmerged).length || repo.operation?.type === 'merge') {
    return fail(state, [err('error: cannot apply a stash in the middle of a merge'), ...kept])
  }
  const existing = Object.keys(entry.untracked).filter(path => state.workdir[path] !== undefined)
  if (existing.length) {
    return fail(state, [...existing.map(path => err(`${path} already exists, no checkout`)), err('error: could not restore untracked files from stash'), ...kept])
  }

  const merged = mergeTrees(repo.commits[entry.base]!.tree, repo.index, entry.workdir, { ours: 'Updated upstream', theirs: 'Stashed changes' })
  if (merged.conflicts.length) {
    const paths = merged.conflicts.map(conflict => conflict.path).join(', ')
    return fail(state, [err(`error: this stash conflicts with ${paths}; applying a stash with conflicts is not in this trainer yet`), ...kept])
  }
  const moved = moveTrees(repo, state.workdir, repo.index, merged.index, 'merge')
  if (!moved.ok) return fail(state, [...moved.output, ...kept])

  // the index stays as it was, except that new files come back staged (git without --index)
  let index = repo.index
  for (const path of Object.keys(merged.index)) if (index[path] === undefined) index = { ...index, [path]: merged.index[path]! }
  const workdir = { ...moved.workdir, ...entry.untracked }
  const stash = pop ? repo.stash.filter((_, i) => i !== picked.index) : repo.stash
  const next: Repo = { ...repo, index, stash }
  return done({ ...withRepo(state, next), workdir }, [...statusLines(next, workdir), ...(pop ? [dropped(entry, picked.name)] : [])])
}

const NOT_YET = ['show', 'save', 'branch', 'create', 'store']

export const stash: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const [sub, ...rest] = argv
  if (sub === undefined || sub.startsWith('-')) return push(state, repo, argv)

  switch (sub) {
    case 'push':
      return push(state, repo, rest)
    case 'list':
      return done(state, repo.stash.map((entry, i) => out(`stash@{${i}}: ${entry.message}`)))
    case 'apply':
      return apply(state, repo, rest, false)
    case 'pop':
      return apply(state, repo, rest, true)
    case 'drop': {
      const picked = pick(state, repo, rest[0])
      if ('state' in picked) return picked
      const entry = repo.stash[picked.index]!
      return done(withRepo(state, { ...repo, stash: repo.stash.filter((_, i) => i !== picked.index) }), [dropped(entry, picked.name)])
    }
    case 'clear':
      return done(withRepo(state, { ...repo, stash: [] }))
    default:
      if (NOT_YET.includes(sub)) return fail(state, [err(`git stash ${sub} is not in this trainer yet`)])
      return fail(state, [err(`fatal: subcommand wasn't specified; 'push' can't be assumed due to unexpected token '${sub}'`)], 128)
  }
}
