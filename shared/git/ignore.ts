// .gitignore support (docs/features/git-model.md, "Ignored files"): which untracked paths git leaves out of
// `status` and `add`. Patterns come from every .gitignore in the working tree; a file in a subfolder applies to that
// folder and wins over the ones above it. Tracked files are never ignored (the callers check the index first).
import type { Tree } from './types'

export interface IgnoreRule {
  /** The folder of the .gitignore the rule comes from ('' for the root). */
  base: string
  /** `!pattern`: re-include what an earlier rule ignored. */
  negate: boolean
  /** `pattern/`: only directories match. */
  dirOnly: boolean
  /** A slash at the start or in the middle: matched against the path from `base`, else against the name. */
  anchored: boolean
  regex: RegExp
}

const escape = (char: string) => char.replace(/[.+^${}()|[\]\\]/g, '\\$&')

/** A gitignore glob as a regex source: `*` and `?` never cross a slash, `**` does, `[...]` is a character class. */
function globSource(glob: string): string {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!
    if (char === '*' && glob[i + 1] === '*') {
      const atStart = i === 0
      const slashAfter = glob[i + 2] === '/'
      i++
      if (slashAfter && (atStart || glob[i - 2] === '/')) {
        // "**/" : zero or more folders
        source += '(?:.*/)?'
        i++
      } else {
        source += '.*'
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else if (char === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end === -1) {
        source += '\\['
      } else {
        source += `[${glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`
        i = end
      }
    } else if (char === '\\' && i + 1 < glob.length) {
      source += escape(glob[++i]!)
    } else {
      source += escape(char)
    }
  }
  return source
}

/** The rules of one .gitignore file; blank lines and `#` comments are skipped. */
export function parseIgnore(text: string, base = ''): IgnoreRule[] {
  const rules: IgnoreRule[] = []
  for (const raw of text.split('\n')) {
    // trailing spaces do not count unless escaped
    let pattern = raw.replace(/\r$/, '').replace(/(?<!\\)\s+$/, '')
    if (!pattern || pattern.startsWith('#')) continue
    let negate = false
    if (pattern.startsWith('!')) {
      negate = true
      pattern = pattern.slice(1)
    } else if (pattern.startsWith('\\#') || pattern.startsWith('\\!')) {
      pattern = pattern.slice(1)
    }
    const dirOnly = pattern.endsWith('/')
    if (dirOnly) pattern = pattern.replace(/\/+$/, '')
    if (!pattern) continue
    const anchored = pattern.includes('/')
    pattern = pattern.replace(/^\//, '')
    rules.push({ base, negate, dirOnly, anchored, regex: new RegExp(`^${globSource(pattern)}$`) })
  }
  return rules
}

/** Every rule of every .gitignore in the working tree, outer folders first (so deeper files win: the last match counts). */
export function ignoreRules(workdir: Tree): IgnoreRule[] {
  const files = Object.keys(workdir)
    .filter(path => path === '.gitignore' || path.endsWith('/.gitignore'))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  return files.flatMap(path => parseIgnore(workdir[path]!, path.slice(0, -'.gitignore'.length).replace(/\/$/, '')))
}

/** Whether `path` itself (not its folders) is ignored: the last rule that matches decides. */
function matches(rules: IgnoreRule[], path: string, isDir: boolean): boolean {
  let ignored = false
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    if (rule.base && !path.startsWith(`${rule.base}/`)) continue
    const relative = rule.base ? path.slice(rule.base.length + 1) : path
    const subject = rule.anchored ? relative : relative.slice(relative.lastIndexOf('/') + 1)
    if (rule.regex.test(subject)) ignored = !rule.negate
  }
  return ignored
}

/** The topmost ignored part of a path ('dist' for 'dist/app.js' when dist/ is ignored), or null when it is not ignored. */
export function ignoredAs(rules: IgnoreRule[], path: string): string | null {
  if (!rules.length) return null
  const parts = path.split('/')
  // like git: a file inside an ignored folder cannot be re-included
  for (let depth = 1; depth < parts.length; depth++) {
    const folder = parts.slice(0, depth).join('/')
    if (matches(rules, folder, true)) return folder
  }
  return matches(rules, path, false) ? path : null
}

/** A check for one working tree: is this (untracked) path ignored? */
export function ignoreMatcher(workdir: Tree): (path: string) => boolean {
  const rules = ignoreRules(workdir)
  return path => ignoredAs(rules, path) !== null
}
