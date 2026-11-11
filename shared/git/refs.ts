// Ref names, revision parsing and log decorations.
import { ref } from './output'
import type { Part } from './output'
import { headId } from './state'
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
  const local = repo.branches[name.replace(/^refs\/heads\//, '')]
  if (local) return local
  const remote = name.replace(/^refs\/remotes\//, '').replace(/^remotes\//, '')
  if (remote.startsWith('origin/') && repo.remoteBranches[remote.slice(7)]) return repo.remoteBranches[remote.slice(7)]!
  if (/^[0-9a-f]{4,40}$/.test(name)) {
    const matches = Object.keys(repo.commits).filter(id => id.startsWith(name))
    if (matches.length === 1) return matches[0]!
  }
  return null
}

/** Resolves HEAD, branches, origin/<branch>, (short) ids and ~n / ^n suffixes to a commit id. */
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

/** The ` (HEAD -> main, feature, origin/main)` part of a log line, or nothing. */
export function decorations(repo: Repo, id: string): Part[] {
  const parts: Part[][] = []
  const current = repo.head.type === 'branch' ? repo.head.name : null
  if (headId(repo) === id) parts.push(current ? [ref('HEAD'), ' -> ', ref(current)] : [ref('HEAD')])
  for (const name of Object.keys(repo.branches).sort()) {
    if (repo.branches[name] === id && !(name === current && headId(repo) === id)) parts.push([ref(name)])
  }
  for (const name of Object.keys(repo.remoteBranches).sort()) {
    if (repo.remoteBranches[name] === id) parts.push([ref(trackingRef(name))])
  }
  if (!parts.length) return []
  return [' (', ...parts.flatMap((part, i) => i ? [', ', ...part] : part), ')']
}
