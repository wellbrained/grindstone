// Teammates act only on origin. The teammate engine (later) decides when; this does the what.
import { mergeTrees } from './merge3'
import { authorFor, createCommit } from './objects/commit'
import { isAncestor, mergeBase } from './objects/graph'
import { normalizePath, withEntry, without } from './state'
import type { Author, GitState, Tree } from './types'

export interface TeammateChange {
  author: string | Author
  message: string
  /** path -> new content; null deletes the file. */
  files: Record<string, string | null>
  /** Branch on origin; defaults to origin's default branch. A new branch starts from the default branch. */
  branch?: string
}

/** Commits a change onto a branch of origin, as if a teammate had pushed it. */
export function teammateCommit(state: GitState, change: TeammateChange): GitState {
  const origin = state.origin
  if (!origin) throw new Error('teammateCommit needs an origin (setup: .origin())')
  const branch = change.branch ?? origin.defaultBranch
  const parent = origin.branches[branch] ?? origin.branches[origin.defaultBranch]
  let tree: Tree = parent ? origin.commits[parent]!.tree : {}
  for (const [path, content] of Object.entries(change.files)) {
    tree = withEntry(tree, normalizePath(path), content ?? undefined)
  }

  const created = createCommit(state, {
    parents: parent ? [parent] : [],
    tree,
    message: change.message,
    author: authorFor(change.author)
  })
  return {
    ...created.state,
    origin: {
      ...origin,
      commits: { ...origin.commits, [created.commit.id]: created.commit },
      branches: { ...origin.branches, [branch]: created.commit.id }
    }
  }
}

export interface TeammateMerge {
  author: string | Author
  /** The branch on origin to merge (the pull request's branch). */
  branch: string
  /** Where it goes; origin's default branch by default. */
  into?: string
  message: string
  /** Delete the merged branch on origin afterwards, like the button after a merged pull request. */
  deleteBranch?: boolean
}

/**
 * A teammate merges a branch on origin with a merge commit, as a pull request does. Null when there is nothing to merge
 * (the branch is missing or already merged) or the merge would conflict (a pull request would refuse it too).
 */
export function teammateMerge(state: GitState, merge: TeammateMerge): GitState | null {
  const origin = state.origin
  if (!origin) throw new Error('teammateMerge needs an origin (setup: .origin())')
  const into = merge.into ?? origin.defaultBranch
  const theirs = origin.branches[merge.branch]
  const ours = origin.branches[into]
  if (!theirs || !ours || isAncestor(origin.commits, theirs, ours)) return null
  const base = mergeBase(origin.commits, ours, theirs)
  const merged = mergeTrees(base ? origin.commits[base]!.tree : {}, origin.commits[ours]!.tree, origin.commits[theirs]!.tree, { ours: into, theirs: merge.branch })
  if (merged.conflicts.length) return null

  const created = createCommit(state, { parents: [ours, theirs], tree: merged.tree, message: merge.message, author: authorFor(merge.author) })
  const kept = merge.deleteBranch ? without(origin.branches, merge.branch) : origin.branches
  const branches = { ...kept, [into]: created.commit.id }
  return {
    ...created.state,
    origin: { ...origin, commits: { ...origin.commits, [created.commit.id]: created.commit }, branches }
  }
}
