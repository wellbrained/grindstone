// Entry point: one command line in, new state and output lines out. Never throws on user input.
import { git } from './commands'
import { done, err, fail } from './output'
import { SHELL_COMMANDS, SHELL_ELSEWHERE, redirect } from './shell'
import { tokenize } from './tokenize'
import type { Operator, Token } from './tokenize'
import type { CommandResult, GitState, OutputLine } from './types'

/** Runs one parsed command (argv[0] is the program). */
export function runArgv(state: GitState, argv: string[]): CommandResult {
  const [program, ...args] = argv
  if (!program) return done(state)
  if (program === 'git') return git(state, args)
  const shell = SHELL_COMMANDS[program]
  if (shell) return shell(state, args)
  if (SHELL_ELSEWHERE.includes(program)) return fail(state, [err(`${program}: not in this trainer yet`)])
  return fail(state, [err(`${program}: command not found`)], 127)
}

interface Segment {
  /** How this segment joins the previous one. */
  joiner: '&&' | ';' | null
  tokens: Token[]
}

function segments(tokens: Token[]): Segment[] {
  const result: Segment[] = [{ joiner: null, tokens: [] }]
  for (const token of tokens) {
    if (token.type === 'op' && (token.value === '&&' || token.value === ';')) result.push({ joiner: token.value, tokens: [] })
    else result[result.length - 1]!.tokens.push(token)
  }
  return result
}

const syntaxError = (state: GitState, near: string) =>
  fail(state, [err(`bash: syntax error near unexpected token \`${near}'`)], 2)

function runSegment(state: GitState, tokens: Token[]): CommandResult {
  const argv: string[] = []
  let target: { path: string, append: boolean } | null = null
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.type === 'word') {
      argv.push(token.value)
      continue
    }
    if (token.value === '|') return fail(state, [err('pipes (|) are not in this trainer yet')])
    const next = tokens[i + 1]
    if (!next || next.type !== 'word') return syntaxError(state, next ? next.value : 'newline')
    target = { path: next.value, append: (token.value as Operator) === '>>' }
    i++
  }

  const result = runArgv(state, argv)
  if (!target) return result
  const written = result.output.filter(line => line.kind === 'out')
  const rest = result.output.filter(line => line.kind !== 'out')
  const text = written.length ? `${written.map(line => line.text).join('\n')}\n` : ''
  const redirected = redirect(result.state, target.path, text, target.append)
  if (redirected.error) return fail(result.state, [...rest, redirected.error])
  return { ...result, state: redirected.state, output: rest }
}

/**
 * Runs a terminal line: tokenizes (quotes, escapes, > >> && ;) and dispatches to git or the shell.
 * Errors come back as output lines with a non-zero exit code; the state is then unchanged.
 */
export function run(state: GitState, commandLine: string): CommandResult {
  const tokenized = tokenize(commandLine)
  if (!tokenized.ok) return fail(state, [err(`bash: ${tokenized.error}`)], 2)
  if (!tokenized.tokens.length) return done(state)

  const parts = segments(tokenized.tokens)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]!.tokens.length) continue
    const last = i === parts.length - 1
    if (last && parts[i]!.joiner === ';') continue // a trailing ; is fine
    return syntaxError(state, last ? 'newline' : parts[i + 1]!.joiner!)
  }

  let current = state
  let exitCode = 0
  const output: OutputLine[] = []
  for (const part of parts) {
    if (!part.tokens.length) continue
    if (part.joiner === '&&' && exitCode !== 0) continue
    const result = runSegment(current, part.tokens)
    current = result.state
    exitCode = result.exitCode
    output.push(...result.output)
  }
  return { state: current, output, exitCode }
}
