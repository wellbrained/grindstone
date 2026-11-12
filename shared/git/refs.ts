// Ref names, revision parsing and log decorations.
import { ref } from './output'
import type { Part } from './output'
import { resolveSelector } from './reflog'
import { headId, own } from './state'
import type { Repo } from './types'

/** A simplified `git check-ref-format --branch`. */
export function isValidBranchName(name: string): boolean {
  if (!name || name === '@' || name === 'HEAD') return false
  if (name.startsWith('-') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false
  if (name.split('/').some(part => part.startsWith('.'))) return false
  // eslint-disable-next-line no-control-regex
  return !/[\s~^:?*[\\\u0000-\u001F\u007F]/.test(name)
}

/** Remote-tracking ref name for a branch on origin. */
export const trackingRef = (branch: string) => `origin/${branch}`

function resolveBase(repo: Repo, name: string): string | null {
  if (name === 'HEAD' || name === '@') return headId(repo)
  if (name === 'ORIG_HEAD') return repo.origHead ?? null
  if (name.includes('@{')) return resolveSelector(repo, name)
  const local = own(repo.branches, name.replace(/^refs\/heads\//, ''))
  if (local) return local
  const remote = name.replace(/^refs\/remotes\//, '').replace(/^remotes\//, '')
  const tracking = remote.startsWith('origin/') ? own(repo.remoteBranches, remote.slice(7)) : undefined
  if (tracking) return tracking
  const tag = own(repo.tags, name.replace(/^refs\/tags\//, ''))
  if (tag) return tag.commit
  if (/^[0-9a-f]{4,40}$/.test(name)) {
    const matches = Object.keys(repo.commits).filter(id => id.startsWith(name))
    if (matches.length === 1) return matches[0]!
  }
  return null
}

/** Resolves HEAD, ORIG_HEAD, branches, origin/<branch>, tags, (short) ids, reflog entries (`HEAD@{2}`, `main@{1}`) and ~n / ^n suffixes to a commit id. */
export function resolveRev(repo: Repo, rev: string): string | null {
  const match = /^(.+?)((?:[~^]\d*)*)$/.exec(rev)
  if (!match) return null
  let id = resolveBase(repo, match[1]!)
  for (const [, op, digits] of match[2]!.matchAll(/([~^])(\d*)/g)) {
    if (!id) return null
    const count = digits === '' ? 1 : Number(digits)
    if (op === '~') {
      for (let i = 0; i < count && id; i++) id = repo.commits[id]?.parents[0] ?? null
    } else if (count > 0) {
      id = repo.commits[id]?.parents[count - 1] ?? null
    }
  }
  return id && repo.commits[id] ? id : null
}

/** Tag names, sorted like git (byte order: v1.10 before v1.9). */
export const tagNames = (tags: Record<string, unknown>) => Object.keys(tags).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)

/**
 * The ` (HEAD -> main, tag: v1.0, origin/main, feature)` part of a log line, or nothing. Tags are plain text (no branch
 * colour). git lists HEAD first, then tags, remote-tracking branches and local branches, each group in reverse name order.
 */
export function decorations(repo: Repo, id: string): Part[] {
  const parts: Part[][] = []
  const current = repo.head.type === 'branch' ? repo.head.name : null
  if (headId(repo) === id) parts.push(current ? [ref('HEAD'), ' -> ', ref(current)] : [ref('HEAD')])
  for (const name of tagNames(repo.tags).reverse()) {
    if (repo.tags[name]!.commit === id) parts.push([`tag: ${name}`])
  }
  for (const name of Object.keys(repo.remoteBranches).sort().reverse()) {
    if (repo.remoteBranches[name] === id) parts.push([ref(trackingRef(name))])
  }
  for (const name of Object.keys(repo.branches).sort().reverse()) {
    if (repo.branches[name] === id && !(name === current && headId(repo) === id)) parts.push([ref(name)])
  }
  if (!parts.length) return []
  return [' (', ...parts.flatMap((part, i) => i ? [', ', ...part] : part), ')']
}
