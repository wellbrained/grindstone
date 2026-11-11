import { tick } from '../state'
import type { Author, Commit, GitState, Tree } from '../types'
import { commitId } from './hash'

export interface NewCommit {
  parents: string[]
  tree: Tree
  message: string
  author?: Author
}

/** Builds a commit with a deterministic id; advances the logical clock. Does not store it anywhere. */
export function createCommit(state: GitState, fields: NewCommit): { state: GitState, commit: Commit } {
  const { state: next, timestamp } = tick(state)
  const author = fields.author ?? state.user
  const data = { parents: fields.parents, tree: fields.tree, message: fields.message, author, timestamp }
  return { state: next, commit: { id: commitId(data), ...data } }
}

export const subject = (commit: Commit) => commit.message.split('\n')[0] ?? ''

export function authorFor(name: string | Author): Author {
  return typeof name === 'string' ? { name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com` } : name
}
