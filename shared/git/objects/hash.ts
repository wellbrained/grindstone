// Deterministic, dependency-free hashing. Not cryptographic: it only has to look like git and stay stable.
import type { Author, Tree } from '../types'

function fnv1a(input: string, seed: number): string {
  let hash = (0x811C9DC5 ^ seed) >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  // final avalanche so neighbouring inputs differ in every digit
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85EBCA6B) >>> 0
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xC2B2AE35) >>> 0
  hash ^= hash >>> 16
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** A 40 character hex digest of `input`. */
export function hashString(input: string): string {
  let digest = ''
  for (let round = 0; round < 5; round++) digest += fnv1a(input, Math.imul(round + 1, 0x9E3779B1))
  return digest
}

export function shortId(id: string): string {
  return id.slice(0, 7)
}

export function blobId(content: string): string {
  return hashString(`blob\0${content}`)
}

export interface CommitFields {
  parents: string[]
  tree: Tree
  message: string
  author: Author
  timestamp: number
}

export function commitId(fields: CommitFields): string {
  const tree = Object.keys(fields.tree).sort().map(path => `${path}\0${blobId(fields.tree[path]!)}`).join('\n')
  return hashString([
    'commit',
    fields.parents.join(' '),
    tree,
    `${fields.author.name} <${fields.author.email}> ${fields.timestamp}`,
    fields.message
  ].join('\n\0'))
}

export interface TagFields {
  commit: string
  name: string
  message: string
  tagger: Author
  timestamp: number
}

/** The id of an annotated tag's own object. */
export function tagId(fields: TagFields): string {
  return hashString(['tag', fields.commit, fields.name, `${fields.tagger.name} <${fields.tagger.email}> ${fields.timestamp}`, fields.message].join('\n\0'))
}
