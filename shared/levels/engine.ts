// The shared level core: sessions, counted actions, teammate events, goals, hints, undo and reset, for any environment
// (docs/features/levels.md, "Engine rules"). Each environment turns its own input into counted actions (git: a terminal
// line, shared/levels/git/engine.ts) and words what these functions report.
// Pure and immutable: never mutates a session, never reads the clock; sessions are plain JSON. Never imports an environment.
import type { LevelOf, Notice, SessionOf, SessionSnapshot, TeammateEvent } from './types'

/** Undo depth; older snapshots are dropped. */
export const MAX_SNAPSHOTS = 200

/** The level fields the core reads. */
type AnyLevel<S, R> = LevelOf<S, R, unknown>

function goalsOf<S, R>(level: AnyLevel<S, R>, state: S, history: R[]): Record<string, boolean> {
  return Object.fromEntries(level.goals.map(goal => [goal.id, goal.check({ state, history })]))
}

const allMet = (goals: Record<string, boolean>) => Object.values(goals).every(Boolean)

/** A fresh attempt on the level's setup. */
export function startSession<S, R>(level: AnyLevel<S, R>): SessionOf<S, R> {
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
export const normalize = (line: string) => line.trim().replace(/\s+/g, ' ')

const matchesPrefix = (command: string, prefix: string) => {
  const wanted = normalize(prefix)
  return command === wanted || command.startsWith(`${wanted} `)
}

/** Applies events whose trigger matches, in level order; each fires once per timeline. */
function fire<S, R>(level: AnyLevel<S, R>, state: S, fired: string[], shouldFire: (event: TeammateEvent<S>, state: S) => boolean) {
  let next = state
  const firedNow: string[] = []
  const notices: Notice[] = []
  for (const event of level.teammates ?? []) {
    if (fired.includes(event.id) || !shouldFire(event, next)) continue
    next = event.apply(next)
    firedNow.push(event.id)
    notices.push({ eventId: event.id, author: event.author, text: event.notice })
  }
  return { state: next, fired: [...fired, ...firedNow], notices }
}

/** What a counted action did: the new state, what the history records, and the environment's output. */
export interface Outcome<S, R, O> {
  state: S
  record: R
  output: O
}

/** One counted action (git: a terminal line, an editor save). */
export interface Action<S, R, O> {
  /** The commands it runs, as normalized words ('git push -u origin x'); `beforeCommand` triggers match against them. */
  commands: readonly string[]
  execute: (state: S) => Outcome<S, R, O>
  /** A reload of the level's app (Debugging): counted in `reloads` as well. */
  reload?: boolean
}

export interface ActResult<S, R, O> {
  session: SessionOf<S, R>
  output: O
  notices: Notice[]
  /** True only for the action that first made every goal pass. */
  solvedNow: boolean
}

/** The path of every counted action: snapshot, before-events, execute, record, after-events, goals. */
export function act<S, R, O>(session: SessionOf<S, R>, level: AnyLevel<S, R>, action: Action<S, R, O>): ActResult<S, R, O> {
  const snapshot: SessionSnapshot<S, R> = { state: session.state, history: session.history, firedEvents: session.firedEvents }
  const snapshots = [...session.snapshots, snapshot].slice(-MAX_SNAPSHOTS)

  const before = fire(level, session.state, session.firedEvents, ({ trigger }) =>
    'beforeCommand' in trigger && action.commands.some(command => matchesPrefix(command, trigger.beforeCommand)))

  const result = action.execute(before.state)
  const history = [...session.history, result.record]

  const after = fire(level, result.state, before.fired, ({ trigger }, state) =>
    ('afterCommands' in trigger && history.length >= trigger.afterCommands) || ('when' in trigger && trigger.when(state)))

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
      commandCount: session.commandCount + 1,
      ...(action.reload ? { reloads: (session.reloads ?? 0) + 1 } : {})
    },
    output: result.output,
    notices: [...before.notices, ...after.notices],
    solvedNow
  }
}

/**
 * Restores the previous snapshot (state, history, fired events); the counts of the attempt stay. Null when there is
 * nothing to undo; `undone` is the history entry it took back.
 */
export function undoLast<S, R>(session: SessionOf<S, R>, level: AnyLevel<S, R>): { session: SessionOf<S, R>, undone: R | undefined } | null {
  const snapshot = session.snapshots.at(-1)
  if (!snapshot) return null
  return {
    session: {
      ...session,
      state: snapshot.state,
      history: snapshot.history,
      firedEvents: snapshot.firedEvents,
      snapshots: session.snapshots.slice(0, -1),
      goalsMet: goalsOf(level, snapshot.state, snapshot.history)
    },
    undone: session.history.at(-1)
  }
}

/** Back to the setup as a new attempt. Revealed hints stay revealed (and counted). */
export function restart<S, R>(session: SessionOf<S, R>, level: AnyLevel<S, R>): SessionOf<S, R> {
  return { ...startSession(level), hintsUsed: session.hintsUsed }
}

/** A hint as shown: its number (1-based), the level's hint count and its text. */
export interface HintShown<S, R> {
  session: SessionOf<S, R>
  number: number
  total: number
  text: string
  /** False when every hint was already revealed: the last one is shown again and nothing is counted. */
  revealed: boolean
}

/** Reveals the next hint and counts it; after the last one it shows that one again, uncounted. */
export function takeHint<S, R>(session: SessionOf<S, R>, level: AnyLevel<S, R>): HintShown<S, R> {
  const total = level.hints.length
  if (session.hintsUsed >= total) return { session, number: total, total, text: level.hints[total - 1]!, revealed: false }
  const hintsUsed = session.hintsUsed + 1
  return { session: { ...session, hintsUsed }, number: hintsUsed, total, text: level.hints[hintsUsed - 1]!, revealed: true }
}
