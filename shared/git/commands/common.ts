// Helpers shared by the git commands.
import { countChanges } from '../diff'
import { range } from '../objects/graph'
import { err, fail, hint, out, plural, ref } from '../output'
import { logBranch, logHead } from '../reflog'
import { trackingRef } from '../refs'
import { headId, headTree, own, withEntry } from '../state'
import { changedPaths, treesEqual, union } from '../worktree'
import type { Commit, CommandResult, GitState, Operation, OutputLine, Repo, Snapshot, Tree } from '../types'

export const notARepo = (state: GitState) =>
  fail(state, [err('fatal: not a git repository (or any of the parent directories): .git')], 128)

export const fatal = (state: GitState, message: string, code = 128) =>
  fail(state, message.split('\n').map(text => err(text)), code)

/** The last line of git's conflict hints. */
export const ADVICE_OFF = 'hint: Disable this message with "git config set advice.mergeConflict false"'

/** The commands that refuse to start while a merge, rebase or cherry-pick is in progress. */
export type BlockedCommand = 'merge' | 'pull' | 'rebase' | 'revert' | 'cherry-pick' | 'switch'

const REBASING = 'fatal: You are in the middle of a rebase; finish it with "git rebase --continue" or "git rebase --abort" first.'

const ALREADY_REBASING = [
  'fatal: It seems that there is already a rebase-merge directory, and',
  'I wonder if you are in the middle of another rebase.  If that is the',
  'case, please try',
  '\tgit rebase (--continue | --abort | --skip)'
].join('\n')

const SWITCHING: Record<Operation['type'], string> = { 'merge': 'merging', 'rebase': 'rebasing', 'cherry-pick': 'cherry-picking' }

/** `You have not concluded your merge (MERGE_HEAD exists).`, with merge's and pull's own request to commit first. */
function notConcluded(what: string, command: BlockedCommand): string {
  const ask = command === 'merge' ? '\nPlease, commit your changes before you merge.' : command === 'pull' ? '\nPlease, commit your changes before merging.' : ''
  return `fatal: You have not concluded your ${what}.${ask}`
}

/** git's refusal of `command` while an operation is in progress (in its words for that command), or null when none is. */
export function blockedBy(state: GitState, command: BlockedCommand): CommandResult | null {
  const operation = state.repo?.operation
  if (!operation) return null
  if (command === 'switch') {
    return fatal(state, `fatal: cannot switch branch while ${SWITCHING[operation.type]}\nConsider "git ${operation.type} --quit" or "git worktree add".`)
  }
  if (operation.type === 'merge') return fatal(state, notConcluded('merge (MERGE_HEAD exists)', command))
  if (operation.type === 'rebase') return fatal(state, command === 'rebase' ? ALREADY_REBASING : REBASING)
  if (command === 'revert' || command === 'cherry-pick') {
    return fail(state, [err('error: cherry-pick is already in progress'), hint('hint: try "git cherry-pick (--continue | --abort | --quit)"'), err(`fatal: ${command} failed`)], 128)
  }
  return fatal(state, notConcluded('cherry-pick (CHERRY_PICK_HEAD exists)', command))
}

/** cherry-pick's and revert's refusal while the index differs from HEAD, or null. */
export function refuseDirtyIndex(state: GitState, command: 'cherry-pick' | 'revert'): CommandResult | null {
  const repo = state.repo!
  if (treesEqual(headTree(repo), repo.index)) return null
  return fail(state, [
    err(`error: your local changes would be overwritten by ${command}.`),
    hint('hint: commit your changes or stash them to proceed.'),
    err(`fatal: ${command} failed`)
  ], 128)
}

/** The options part of the usage text revert and cherry-pick share. */
export const SEQUENCER_OPTIONS = [
  '',
  '    --quit                end revert or cherry-pick sequence',
  '    --continue            resume revert or cherry-pick sequence',
  '    --abort               cancel revert or cherry-pick sequence',
  '    --skip                skip current commit and continue',
  '    --[no-]cleanup <mode> how to strip spaces and #comments from message',
  '    -n, --no-commit       don\'t automatically commit',
  '    --commit              opposite of --no-commit',
  '    -e, --[no-]edit       edit the commit message',
  '    -s, --[no-]signoff    add a Signed-off-by trailer',
  '    -m, --[no-]mainline <parent-number>',
  '                          select mainline parent',
  '    --[no-]rerere-autoupdate',
  '                          update the index with reused conflict resolution if possible',
  '    --[no-]strategy <strategy>',
  '                          merge strategy',
  '    -X, --[no-]strategy-option <option>',
  '                          option for merge strategy',
  '    -S, --[no-]gpg-sign[=<key-id>]',
  '                          GPG sign commit'
]

/**
 * The working tree after an aborted operation, like git's `reset --merge`: every file the operation could have touched
 * (tracked now, tracked before, or in HEAD) goes back to how `before` had it, and untracked files that were not part of
 * it stay.
 */
export function restoreTracked(repo: Repo, workdir: Tree, before: Snapshot): Tree {
  const paths = new Set([...Object.keys(repo.index), ...Object.keys(repo.unmerged), ...Object.keys(headTree(repo)), ...Object.keys(before.index)])
  let restored = workdir
  for (const path of paths) restored = withEntry(restored, path, own(before.workdir, path))
  return restored
}

/**
 * The working tree with every tracked file (in the index, unmerged, or in HEAD) as HEAD has it, like `reset --hard`
 * leaves it; untracked files stay.
 */
export function resetWorkdirToHead(repo: Repo, workdir: Tree): Tree {
  const tree = headTree(repo)
  return union(repo.index, repo.unmerged, tree).reduce((files, path) => withEntry(files, path, own(tree, path)), workdir)
}

/** The tree of a commit's first parent (empty for a root commit): what its change is measured against. */
export const parentTree = (repo: Repo, commit: Commit): Tree => commit.parents[0] ? repo.commits[commit.parents[0]]!.tree : {}

export const withRepo = (state: GitState, repo: Repo): GitState => ({ ...state, repo })

export function storeCommit(repo: Repo, commit: Commit): Repo {
  return { ...repo, commits: { ...repo.commits, [commit.id]: commit } }
}

/** What moveRef moves: HEAD (through its branch when it is on one), HEAD detached at the commit, or one branch. */
export type RefTarget = 'HEAD' | 'detached' | { branch: string }

/**
 * Points `target` at `id` and records the move in the reflog as `log`: HEAD's log, and the branch's too when the move
 * goes through it (like git's symref update); a branch target only gets its own. `origHead` also sets ORIG_HEAD.
 */
export function moveRef(repo: Repo, target: RefTarget, id: string, options: { log: string, origHead?: string | null }): Repo {
  const base = options.origHead ? { ...repo, origHead: options.origHead } : repo
  if (typeof target === 'object') return logBranch({ ...base, branches: { ...base.branches, [target.branch]: id } }, target.branch, options.log)
  const moved: Repo = target === 'HEAD' && repo.head.type === 'branch'
    ? { ...base, branches: { ...base.branches, [repo.head.name]: id } }
    : { ...base, head: { type: 'detached', commit: id } }
  return logHead(moved, options.log)
}

/** " 2 files changed, 3 insertions(+), 1 deletion(-)" plus the create/delete mode lines. */
export function summary(from: Tree, to: Tree): OutputLine[] {
  const paths = changedPaths(from, to)
  if (!paths.length) return []
  let insertions = 0
  let deletions = 0
  for (const path of paths) {
    const counts = countChanges(own(from, path), own(to, path))
    insertions += counts.insertions
    deletions += counts.deletions
  }
  let text = ` ${plural(paths.length, 'file')} changed`
  if (insertions || !deletions) text += `, ${insertions} insertion${insertions === 1 ? '' : 's'}(+)`
  if (deletions || !insertions) text += `, ${deletions} deletion${deletions === 1 ? '' : 's'}(-)`
  return [
    out(text),
    ...paths.flatMap((path) => {
      if (own(from, path) === undefined) return [out(` create mode 100644 ${path}`)]
      if (own(to, path) === undefined) return [out(` delete mode 100644 ${path}`)]
      return []
    })
  ]
}

/** Per-file diffstat (" app.txt | 2 +-") followed by the summary, as merge and pull print it. */
export function diffstat(from: Tree, to: Tree): OutputLine[] {
  const paths = changedPaths(from, to)
  const counts = paths.map(path => countChanges(own(from, path), own(to, path)))
  const width = Math.max(0, ...paths.map(path => path.length))
  const digits = Math.max(1, ...counts.map(count => String(count.insertions + count.deletions).length))
  const biggest = Math.max(0, ...counts.map(count => count.insertions + count.deletions))
  const scale = biggest > 50 ? 50 / biggest : 1
  const rows = paths.map((path, i) => {
    const { insertions, deletions } = counts[i]!
    const bar = '+'.repeat(Math.ceil(insertions * scale)) + '-'.repeat(Math.ceil(deletions * scale))
    return out(` ${path.padEnd(width)} | ${String(insertions + deletions).padStart(digits)} ${bar}`.trimEnd())
  })
  return [...rows, ...summary(from, to)]
}

export function aheadBehind(repo: Repo, local: string, upstream: string) {
  return {
    ahead: range(repo.commits, [local], [upstream]).length,
    behind: range(repo.commits, [upstream], [local]).length
  }
}

/** "Your branch is ahead of 'origin/main' by 1 commit." and friends, for status and switch. */
export function trackingInfo(repo: Repo, branch: string): OutputLine[] {
  const upstream = own(repo.upstream, branch)
  const local = own(repo.branches, branch)
  if (!upstream || !local) return []
  const name = trackingRef(upstream)
  const remote = own(repo.remoteBranches, upstream)
  if (!remote) {
    return [
      out('Your branch is based on \'', ref(name), '\', but the upstream is gone.'),
      hint('  (use "git branch --unset-upstream" to fixup)')
    ]
  }
  const { ahead, behind } = aheadBehind(repo, local, remote)
  if (!ahead && !behind) return [out('Your branch is up to date with \'', ref(name), '\'.')]
  if (!behind) {
    return [
      out('Your branch is ahead of \'', ref(name), `' by ${plural(ahead, 'commit')}.`),
      hint('  (use "git push" to publish your local commits)')
    ]
  }
  if (!ahead) {
    return [
      out('Your branch is behind \'', ref(name), `' by ${plural(behind, 'commit')}, and can be fast-forwarded.`),
      hint('  (use "git pull" to update your local branch)')
    ]
  }
  return [
    out('Your branch and \'', ref(name), '\' have diverged,'),
    out(`and have ${ahead} and ${behind} different commits each, respectively.`),
    hint('  (use "git pull" if you want to integrate the remote branch with yours)')
  ]
}

export function requireCommit(state: GitState, repo: Repo): string | CommandResult {
  const id = headId(repo)
  if (id) return id
  const name = repo.head.type === 'branch' ? repo.head.name : 'HEAD'
  return fatal(state, `fatal: your current branch '${name}' does not have any commits yet`)
}

/** The "on branch" label used in commit and rebase output: the branch name, or "detached HEAD". */
export const headLabel = (repo: Repo) => repo.head.type === 'branch' ? ref(repo.head.name) : 'detached HEAD'
