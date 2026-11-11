// Teammates act only on origin. The teammate engine (later) decides when; this does the what.
import { authorFor, createCommit } from './objects/commit'
import { normalizePath, withEntry } from './state'
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
