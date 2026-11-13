// The Debugging environment on the shared level core (docs/features/levels.md, "The Debugging environment"): Save, Reload
// and (find tasks) a click on a line are the counted actions; a reload also counts in `reloads`, the measure of the best
// run after hints. The app itself runs in the browser: the page runs the check behind a reload and hands its Observation
// to `reload`. Pure and immutable, like the core.
import { act, startSession } from '../engine'
import type { DebugLevel, DebugOutput, DebugResult, DebugSession, DebugStep, Observation, PickVerdict, SourceLine } from './types'

const NOTHING: DebugOutput = { verdict: null }

const quiet = (session: DebugSession): DebugResult => ({ session, output: NOTHING, notices: [], solvedNow: false })

/** A fresh session: the level's files as they start, nothing observed, nothing picked. */
export const startDebugLevel = (level: DebugLevel): DebugSession => startSession(level)

/** Saves a file from the editor (counted); a file the level does not have changes nothing. */
export function saveFile(session: DebugSession, level: DebugLevel, path: string, content: string): DebugResult {
  if (!Object.hasOwn(session.state.files, path)) return quiet(session)
  return act(session, level, {
    commands: [`save ${path}`],
    execute: state => ({ state: { ...state, files: { ...state.files, [path]: content } }, record: { kind: 'save', path }, output: NOTHING })
  })
}

/** A reload: the app restarted from the saved files, and what its check run saw. Counted, also in `reloads`. */
export function reload(session: DebugSession, level: DebugLevel, observed: Observation): DebugResult {
  return act(session, level, {
    commands: ['reload'],
    reload: true,
    execute: state => ({ state: { ...state, observed }, record: { kind: 'reload' }, output: NOTHING })
  })
}

/** What a click on a line says in a find task (null outside one): right, or why it is not that one. */
export function pickVerdict(level: DebugLevel, pick: SourceLine): PickVerdict | null {
  const find = level.sandbox.find
  if (!find) return null
  if (pick.path === find.path && find.lines.includes(pick.line)) return { right: true, why: null }
  return { right: false, why: find.wrong[`${pick.path}:${pick.line}`] ?? find.otherwise }
}

/** A click on a line in the editor or a stack trace, in a find task (counted); outside one it changes nothing. */
export function pickLine(session: DebugSession, level: DebugLevel, pick: SourceLine): DebugResult {
  const verdict = pickVerdict(level, pick)
  if (!verdict) return quiet(session)
  return act(session, level, {
    commands: ['pick'],
    execute: state => ({ state: { ...state, picked: { path: pick.path, line: pick.line } }, record: { kind: 'pick', path: pick.path, line: pick.line }, output: { verdict } })
  })
}

/** The text a solution's save step writes: the file with the first occurrence replaced. Throws when it is not there. */
export function editedText(files: Readonly<Record<string, string>>, step: { save: string, replace: readonly [string, string] }): string {
  const text = files[step.save]
  const [from, to] = step.replace
  if (text === undefined) throw new Error(`no file ${step.save}`)
  if (!text.includes(from)) throw new Error(`${step.save} does not contain ${JSON.stringify(from)}`)
  return text.replace(from, () => to)
}

/** Runs a check of the app on these files (in a real browser) and says what it saw. */
export type CheckRun = (files: Readonly<Record<string, string>>) => Promise<Observation>

/** Plays one solution step; a reload runs the check on the saved files first. */
export async function playStep(session: DebugSession, level: DebugLevel, step: DebugStep, run: CheckRun): Promise<DebugResult> {
  if (step === 'reload') return reload(session, level, await run(session.state.files))
  if ('pick' in step) return pickLine(session, level, { path: step.pick, line: step.line })
  return saveFile(session, level, step.save, editedText(session.state.files, step))
}

/** Replays the level's solution from a fresh session (the tests prove with it that every level is solvable). */
export async function playSolution(level: DebugLevel, run: CheckRun): Promise<DebugResult[]> {
  const results: DebugResult[] = []
  let session = startDebugLevel(level)
  for (const step of level.solution) {
    const result = await playStep(session, level, step, run)
    results.push(result)
    session = result.session
  }
  return results
}
