// Tab completion for the terminal: trainer commands, git subcommands, shell commands, branch names and file names.
// Pure: the caller passes the names it knows (see docs/features/ui.md).

export interface CompletionContext {
  trainerCommands: readonly string[]
  gitCommands: readonly string[]
  shellCommands: readonly string[]
  /** Local branches, `origin/<name>` refs and the names on origin. */
  branches: readonly string[]
  /** Files in the working tree. */
  files: readonly string[]
}

export interface CompletionResult {
  /** The input after completing: unchanged when nothing matches. */
  input: string
  /** Every match, for listing when completing made no progress. */
  candidates: string[]
}

/** git subcommands that take a branch (or a revision, or `origin`). */
const BRANCH_ARGS = new Set(['switch', 'checkout', 'merge', 'rebase', 'branch', 'log', 'push', 'pull', 'fetch', 'diff', 'reset', 'revert'])
/** git subcommands that take a file. */
const FILE_ARGS = new Set(['add', 'checkout', 'diff', 'commit', 'restore', 'reset'])
/** `git stash <subcommand>`. */
const STASH_SUBCOMMANDS = ['push', 'list', 'pop', 'apply', 'drop', 'clear']
/** shell and trainer commands that take a file. */
const FILE_COMMANDS = new Set(['cat', 'edit', 'rm', 'touch', 'ls'])
const REMOTE_ARGS = new Set(['push', 'pull', 'fetch'])

function commonPrefix(words: string[]): string {
  let prefix = words[0] ?? ''
  for (const word of words) {
    while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  return prefix
}

function candidatesFor(words: string[], word: string, context: CompletionContext): string[] {
  const [first, second] = words
  if (words.length === 0) return [...context.trainerCommands, 'git', ...context.shellCommands]
  if (word.startsWith('-')) return []
  if (first === 'git') {
    if (words.length === 1) return [...context.gitCommands]
    if (!second) return []
    if (second === 'stash') return words.length === 2 ? STASH_SUBCOMMANDS : []
    return [
      ...REMOTE_ARGS.has(second) ? ['origin'] : [],
      ...BRANCH_ARGS.has(second) ? context.branches : [],
      ...FILE_ARGS.has(second) ? context.files : []
    ]
  }
  if (first && FILE_COMMANDS.has(first)) return [...context.files]
  return []
}

export function complete(input: string, context: CompletionContext): CompletionResult {
  const match = /^(.*?)(\S*)$/s.exec(input)
  const head = match?.[1] ?? ''
  const word = match?.[2] ?? ''
  const words = head.split(/\s+/).filter(Boolean)
  const candidates = [...new Set(candidatesFor(words, word, context))]
    .filter(candidate => candidate.startsWith(word))
    .sort()
  if (!candidates.length) return { input, candidates: [] }
  if (candidates.length === 1) return { input: `${head}${candidates[0]} `, candidates }
  return { input: `${head}${commonPrefix(candidates)}`, candidates }
}
