import { parseArgs } from '../args'
import { createCommit } from '../objects/commit'
import { isAncestor, mergeBase } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, out } from '../output'
import { mergeTrees } from '../merge3'
import type { TreeMergeResult } from '../merge3'
import { logHead } from '../reflog'
import { resolveRev } from '../refs'
import { headId, headTree, withEntry } from '../state'
import { moveTrees } from '../worktree'
import type { Command, CommandResult, GitState, OutputLine, Repo, Tree, UnmergedKind } from '../types'
import { activeBranch } from './branch'
import { commit as commitCommand } from './commit'
import { diffstat, fatal, moveHead, notARepo, storeCommit, withRepo } from './common'

/** Applies a tree merge to index and working tree; conflicted paths keep their marker content. */
export function applyMerge(repo: Repo, workdir: Tree, from: Tree, merged: TreeMergeResult, verb: 'merge' | 'checkout' = 'merge') {
  const moved = moveTrees(repo, workdir, from, merged.tree, verb)
  if (!moved.ok) return moved
  let index = moved.index
  const unmerged: Record<string, UnmergedKind> = {}
  for (const conflict of merged.conflicts) {
    unmerged[conflict.path] = conflict.kind
    index = withEntry(index, conflict.path, merged.index[conflict.path])
  }
  return { ...moved, index, unmerged }
}

/** "Auto-merging x" and "CONFLICT ..." lines in path order, as git prints them. */
export function conflictReport(merged: TreeMergeResult): OutputLine[] {
  const paths = [...new Set([...merged.autoMerged, ...merged.conflicts.map(conflict => conflict.path)])].sort()
  return paths.flatMap(path => [
    ...(merged.autoMerged.includes(path) ? [out(`Auto-merging ${path}`)] : []),
    ...merged.conflicts.filter(conflict => conflict.path === path).map(conflict => out(conflict.message))
  ])
}

export function defaultMergeMessage(repo: Repo, label: string): string {
  const current = activeBranch(repo)
  const into = current && current !== 'main' && current !== 'master' ? ` into ${current}` : ''
  if (repo.branches[label]) return `Merge branch '${label}'${into}`
  if (label.startsWith('origin/')) return `Merge remote-tracking branch '${label}'${into}`
  return `Merge commit '${label}'${into}`
}

export interface MergeOptions {
  message: string
  noFf?: boolean
  ffOnly?: boolean
  /** The reflog's name for this merge: `merge <label>` by default, `pull ...` for a pull. */
  reflog?: string
}

/** Merges commit `theirs` (named `label` in conflict markers) into HEAD. Used by merge and pull. */
export function mergeInto(state: GitState, theirs: string, label: string, options: MergeOptions): CommandResult {
  const repo = state.repo!
  const head = headId(repo)
  const theirsTree = repo.commits[theirs]!.tree

  if (head && isAncestor(repo.commits, theirs, head)) return done(state, [out('Already up to date.')])
  const action = options.reflog ?? `merge ${label}`
  // git sets ORIG_HEAD to where HEAD was before every merge
  const origHead = head ? { origHead: head } : {}

  if (!head || (isAncestor(repo.commits, head, theirs) && !options.noFf)) {
    const lines = head ? [out(`Updating ${shortId(head)}..${shortId(theirs)}`)] : []
    const moved = moveTrees(repo, state.workdir, headTree(repo), theirsTree, 'merge')
    if (!moved.ok) return fail(state, [...lines, ...moved.output])
    const next = logHead({ ...moveHead({ ...repo, index: moved.index }, theirs), ...origHead }, `${action}: Fast-forward`)
    return done({ ...withRepo(state, next), workdir: moved.workdir }, [...lines, out('Fast-forward'), ...diffstat(headTree(repo), theirsTree)])
  }
  if (options.ffOnly) return fatal(state, 'fatal: Not possible to fast-forward, aborting.')

  const base = mergeBase(repo.commits, head, theirs)
  const oursTree = headTree(repo)
  const merged = mergeTrees(base ? repo.commits[base]!.tree : {}, oursTree, theirsTree, { ours: 'HEAD', theirs: label })
  const applied = applyMerge(repo, state.workdir, oursTree, merged)
  if (!applied.ok) return fail(state, applied.output)
  const report = conflictReport(merged)

  if (merged.conflicts.length) {
    const next: Repo = {
      ...repo,
      ...origHead,
      index: applied.index,
      unmerged: applied.unmerged,
      operation: { type: 'merge', theirs, message: options.message, before: { index: repo.index, workdir: state.workdir } }
    }
    return fail({ ...withRepo(state, next), workdir: applied.workdir }, [
      ...report,
      out('Automatic merge failed; fix conflicts and then commit the result.')
    ])
  }

  const created = createCommit(state, { parents: [head, theirs], tree: merged.index, message: options.message })
  const next = logHead(moveHead(storeCommit({ ...repo, ...origHead, index: applied.index }, created.commit), created.commit.id), `${action}: Merge made by the 'ort' strategy.`)
  return done({ ...withRepo(created.state, next), workdir: applied.workdir }, [
    ...report,
    out('Merge made by the \'ort\' strategy.'),
    ...diffstat(oursTree, merged.index)
  ])
}

export const merge: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('merge', argv, {
    flags: ['--no-ff', '--ff-only', '--abort', '--continue', '--no-edit', '--ff'],
    values: ['-m'],
    alias: { '--message': '-m' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args
  const operation = repo.operation

  if (flags.has('--abort')) {
    if (operation?.type !== 'merge') return fatal(state, 'fatal: There is no merge to abort (MERGE_HEAD missing).')
    const next: Repo = { ...repo, index: operation.before.index, unmerged: {}, operation: null }
    return done({ ...withRepo(state, next), workdir: operation.before.workdir })
  }
  if (flags.has('--continue')) {
    if (operation?.type !== 'merge') return fatal(state, 'fatal: There is no merge in progress (MERGE_HEAD missing).')
    return commitCommand(state, [])
  }
  if (operation?.type === 'merge') {
    return fatal(state, 'fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.')
  }
  if (operation?.type === 'rebase') return fatal(state, 'fatal: You are in the middle of a rebase; finish it with "git rebase --continue" or "git rebase --abort" first.')

  let name = positionals[0]
  if (!name) {
    const current = activeBranch(repo)
    const upstream = current ? repo.upstream[current] : undefined
    if (!upstream) return fatal(state, 'fatal: No remote for the current branch.')
    name = `origin/${upstream}`
  }
  if (positionals.length > 1) return fail(state, [err('git merge: merging several branches at once is not in this trainer yet')])
  const theirs = resolveRev(repo, name)
  if (!theirs) return fail(state, [err(`merge: ${name} - not something we can merge`)])

  return mergeInto(state, theirs, name, {
    message: values['-m']?.join('\n\n') ?? defaultMergeMessage(repo, name),
    noFf: flags.has('--no-ff'),
    ffOnly: flags.has('--ff-only')
  })
}
