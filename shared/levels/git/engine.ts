// The git environment on the shared level core: one submitted terminal line in, a new session out (docs/features/levels.md).
// Trainer commands (undo, reset, hint, help, clear, edit) are words in the terminal here; the core does the work.
// Pure and immutable: never mutates a session, never reads the clock; sessions are plain JSON.
import { gitCommandNames, run, shellCommandNames, submitEditor, tokenize, waitingEditor, writeFile } from '../../git'
import type { CommandResult, GitState } from '../../git'
import { err, hint as hintLine, out } from '../../git/output'
import { act, normalize, restart, startSession, takeHint, undoLast } from '../engine'
import { isTerminalStep } from './types'
import type { GitLevel, GitSession, SolutionStep, SubmitResult, TerminalLine } from './types'

export const TRAINER_COMMANDS = ['undo', 'reset', 'hint', 'help', 'clear', 'edit'] as const

/** A fresh session on the level's setup. */
export const startLevel = (level: GitLevel): GitSession => startSession(level)

/** The commands inside a line (split at && and ;), as normalized words. Redirect targets are dropped. */
function commandsIn(line: string): string[] {
  const tokenized = tokenize(line)
  if (!tokenized.ok) return [normalize(line)]
  const commands: string[][] = [[]]
  let skipNext = false
  for (const token of tokenized.tokens) {
    if (token.type === 'op' && (token.value === '&&' || token.value === ';')) commands.push([])
    else if (token.type === 'op') skipNext = token.value === '>' || token.value === '>>'
    else if (skipNext) skipNext = false
    else commands[commands.length - 1]!.push(token.value)
  }
  return commands.filter(words => words.length).map(words => words.join(' '))
}

/** A counted command: `line` is what the history records and what `beforeCommand` triggers match against. */
function counted(session: GitSession, level: GitLevel, line: string, execute: (state: GitState) => CommandResult): SubmitResult {
  return act(session, level, {
    commands: commandsIn(line),
    execute: (state) => {
      const result = execute(state)
      return { state: result.state, output: result.output, record: { line, exitCode: result.exitCode } }
    }
  })
}

const quiet = (session: GitSession, output: TerminalLine[]): SubmitResult => ({ session, output, notices: [], solvedNow: false })

function undo(session: GitSession, level: GitLevel): SubmitResult {
  const undone = undoLast(session, level)
  if (!undone) return quiet(session, [out('Nothing to undo.')])
  return quiet(undone.session, [out(undone.undone ? `Undid: ${undone.undone.line}` : 'Undid the last command.')])
}

function hint(session: GitSession, level: GitLevel): SubmitResult {
  const shown = takeHint(session, level)
  const line = hintLine(`Hint ${shown.number}/${shown.total}: ${shown.text}`)
  return quiet(shown.session, shown.revealed ? [line] : [line, out('No more hints. `undo` steps back, `reset` starts over.')])
}

function help(session: GitSession): SubmitResult {
  return quiet(session, [
    out('Trainer commands:'),
    out('  hint             show the next hint'),
    out('  undo             take back your last command'),
    out('  reset            start the level over'),
    out('  edit <file>      open a file in the editor'),
    out('  clear            clear the terminal'),
    out(''),
    out('Git commands:'),
    out(`  ${gitCommandNames.map(name => `git ${name}`).join(', ')}`),
    out(''),
    out('Shell commands:'),
    out(`  ${shellCommandNames.join(', ')}`)
  ])
}

function trainerCommand(session: GitSession, level: GitLevel, line: string): SubmitResult | null {
  const [word = '', ...rest] = normalize(line).split(' ')
  const name = word.toLowerCase()
  if (name === 'edit') {
    const tokenized = tokenize(line)
    const args = tokenized.ok ? tokenized.tokens.slice(1) : []
    if (args.length !== 1 || args[0]!.type !== 'word') return quiet(session, [err('usage: edit <file>')])
    return quiet(session, [{ kind: 'edit', path: args[0]!.value }])
  }
  if (rest.length) return null
  if (name === 'undo') return undo(session, level)
  if (name === 'reset') return quiet(restart(session, level), [out('Level reset to its starting point.')])
  if (name === 'hint') return hint(session, level)
  if (name === 'help') return help(session)
  if (name === 'clear') return quiet(session, [{ kind: 'clear' }])
  return null
}

/** Runs one terminal line: a trainer command, or a counted git/shell line. */
export function submit(session: GitSession, level: GitLevel, line: string): SubmitResult {
  if (!line.trim()) return quiet(session, [])
  return trainerCommand(session, level, line)
    ?? counted(session, level, line.trim(), state => run(state, line))
}

/** Saves a file from the editor panel; counts like a command (`edit <path>` in the history) and can be undone. */
export function saveFile(session: GitSession, level: GitLevel, path: string, content: string): SubmitResult {
  return counted(session, level, `edit ${path}`, state => ({ state: writeFile(state, path, content), output: [], exitCode: 0 }))
}

/**
 * Saves the file git waits for in the editor (`git rebase -i`: the todo list or a commit message) and lets git go on.
 * Counts like a command (`edit <path>` in the history) and can be undone. Nothing waiting: an error, not counted.
 */
export function saveEditor(session: GitSession, level: GitLevel, text: string): SubmitResult {
  const wait = waitingEditor(session.state)
  if (!wait) return quiet(session, [err('error: git is not waiting for a file in the editor')])
  return counted(session, level, `edit ${wait.path}`, state => submitEditor(state, text))
}

/** Plays one solution step: a terminal line through `submit`, `{ save }` through `saveEditor`. */
export function playStep(session: GitSession, level: GitLevel, step: SolutionStep): SubmitResult {
  return isTerminalStep(step) ? submit(session, level, step) : saveEditor(session, level, step.save)
}
