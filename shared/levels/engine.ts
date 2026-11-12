// The level engine: one submitted line in, a new session out (docs/features/levels.md).
// Pure and immutable: never mutates a session, never reads the clock; sessions are plain JSON.
import { gitCommandNames, run, shellCommandNames, submitEditor, tokenize, waitingEditor, writeFile } from '../git'
import type { GitState, OutputLine } from '../git'
import type { CommandRecord, Level, Notice, Session, SessionSnapshot, SolutionStep, SubmitResult, TeammateEvent, TerminalLine } from './types'

/** Undo depth; older snapshots are dropped. */
export const MAX_SNAPSHOTS = 200

export const TRAINER_COMMANDS = ['undo', 'reset', 'hint', 'help', 'clear', 'edit'] as const

const out = (text: string): OutputLine => ({ kind: 'out', text })
const hintLine = (text: string): OutputLine => ({ kind: 'hint', text })

function goalsOf(level: Level, state: GitState, history: CommandRecord[]): Record<string, boolean> {
  return Object.fromEntries(level.goals.map(goal => [goal.id, goal.check({ state, history })]))
}

const allMet = (goals: Record<string, boolean>) => Object.values(goals).every(Boolean)

export function startLevel(level: Level): Session {
  const state = level.setup()
  return {
    levelId: level.id,
    state,
    history: [],
    snapshots: [],
    firedEvents: [],
    hintsUsed: 0,
    goalsMet: goalsOf(level, state, []),
    solved: false,
    commandCount: 0
  }
}

/** Collapses whitespace, so `git   push` and `git push` match the same trigger. */
const normalize = (line: string) => line.trim().replace(/\s+/g, ' ')

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

const matchesPrefix = (command: string, prefix: string) => {
  const wanted = normalize(prefix)
  return command === wanted || command.startsWith(`${wanted} `)
}

/** Applies events whose trigger matches, in level order; each fires once per timeline. */
function fire(level: Level, state: GitState, fired: string[], shouldFire: (event: TeammateEvent) => boolean) {
  let next = state
  const firedNow: string[] = []
  const notices: Notice[] = []
  for (const event of level.teammates ?? []) {
    if (fired.includes(event.id) || !shouldFire(event)) continue
    next = event.apply(next)
    firedNow.push(event.id)
    notices.push({ eventId: event.id, author: event.author, text: event.notice })
  }
  return { state: next, fired: [...fired, ...firedNow], notices }
}

/**
 * The shared path of every counted command: snapshot, before-events, execute, record, after-events, goals.
 * `line` is what the history records and what `beforeCommand` triggers match against.
 */
function counted(session: Session, level: Level, line: string, execute: (state: GitState) => { state: GitState, output: OutputLine[], exitCode: number }): SubmitResult {
  const snapshot: SessionSnapshot = { state: session.state, history: session.history, firedEvents: session.firedEvents }
  const snapshots = [...session.snapshots, snapshot].slice(-MAX_SNAPSHOTS)

  const commands = commandsIn(line)
  const before = fire(level, session.state, session.firedEvents, ({ trigger }) =>
    'beforeCommand' in trigger && commands.some(command => matchesPrefix(command, trigger.beforeCommand)))

  const result = execute(before.state)
  const history = [...session.history, { line, exitCode: result.exitCode }]

  const after = fire(level, result.state, before.fired, ({ trigger }) =>
    'afterCommands' in trigger && history.length >= trigger.afterCommands)

  const goalsMet = goalsOf(level, after.state, history)
  const solvedNow = !session.solved && allMet(goalsMet)
  return {
    session: {
      ...session,
      state: after.state,
      history,
      snapshots,
      firedEvents: after.fired,
      goalsMet,
      solved: session.solved || solvedNow,
      commandCount: session.commandCount + 1
    },
    output: result.output,
    notices: [...before.notices, ...after.notices],
    solvedNow
  }
}

const quiet = (session: Session, output: TerminalLine[]): SubmitResult => ({ session, output, notices: [], solvedNow: false })

function undo(session: Session, level: Level): SubmitResult {
  const snapshot = session.snapshots.at(-1)
  if (!snapshot) return quiet(session, [out('Nothing to undo.')])
  const undone = session.history.at(-1)
  const restored: Session = {
    ...session,
    state: snapshot.state,
    history: snapshot.history,
    firedEvents: snapshot.firedEvents,
    snapshots: session.snapshots.slice(0, -1),
    goalsMet: goalsOf(level, snapshot.state, snapshot.history)
  }
  return quiet(restored, [out(undone ? `Undid: ${undone.line}` : 'Undid the last command.')])
}

/** Back to the setup as a new attempt. Revealed hints stay revealed (and counted). */
function reset(session: Session, level: Level): SubmitResult {
  return quiet({ ...startLevel(level), hintsUsed: session.hintsUsed }, [out('Level reset to its starting point.')])
}

function hint(session: Session, level: Level): SubmitResult {
  const total = level.hints.length
  if (session.hintsUsed >= total) {
    return quiet(session, [hintLine(`Hint ${total}/${total}: ${level.hints[total - 1]}`), out('No more hints. `undo` steps back, `reset` starts over.')])
  }
  const hintsUsed = session.hintsUsed + 1
  return quiet({ ...session, hintsUsed }, [hintLine(`Hint ${hintsUsed}/${total}: ${level.hints[hintsUsed - 1]}`)])
}

function help(session: Session): SubmitResult {
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

function trainerCommand(session: Session, level: Level, line: string): SubmitResult | null {
  const [word = '', ...rest] = normalize(line).split(' ')
  const name = word.toLowerCase()
  if (name === 'edit') {
    const tokenized = tokenize(line)
    const args = tokenized.ok ? tokenized.tokens.slice(1) : []
    if (args.length !== 1 || args[0]!.type !== 'word') return quiet(session, [{ kind: 'err', text: 'usage: edit <file>' }])
    return quiet(session, [{ kind: 'edit', path: args[0]!.value }])
  }
  if (rest.length) return null
  if (name === 'undo') return undo(session, level)
  if (name === 'reset') return reset(session, level)
  if (name === 'hint') return hint(session, level)
  if (name === 'help') return help(session)
  if (name === 'clear') return quiet(session, [{ kind: 'clear' }])
  return null
}

/** Runs one terminal line: a trainer command, or a counted git/shell line. */
export function submit(session: Session, level: Level, line: string): SubmitResult {
  if (!line.trim()) return quiet(session, [])
  return trainerCommand(session, level, line)
    ?? counted(session, level, line.trim(), state => run(state, line))
}

/** Saves a file from the editor panel; counts like a command (`edit <path>` in the history) and can be undone. */
export function saveFile(session: Session, level: Level, path: string, content: string): SubmitResult {
  return counted(session, level, `edit ${path}`, state => ({ state: writeFile(state, path, content), output: [], exitCode: 0 }))
}

/**
 * Saves the file git waits for in the editor (`git rebase -i`: the todo list or a commit message) and lets git go on.
 * Counts like a command (`edit <path>` in the history) and can be undone. Nothing waiting: an error, not counted.
 */
export function saveEditor(session: Session, level: Level, text: string): SubmitResult {
  const wait = waitingEditor(session.state)
  if (!wait) return quiet(session, [{ kind: 'err', text: 'error: git is not waiting for a file in the editor' }])
  return counted(session, level, `edit ${wait.path}`, state => submitEditor(state, text))
}

/** Plays one solution step: a terminal line through `submit`, `{ save }` through `saveEditor`. */
export function playStep(session: Session, level: Level, step: SolutionStep): SubmitResult {
  return typeof step === 'string' ? submit(session, level, step) : saveEditor(session, level, step.save)
}
