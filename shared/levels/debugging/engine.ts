// The Debugging environment on the shared level core (docs/features/levels.md, "The Debugging environment"): Save, Reload
// and (find tasks) a click on a line are the counted actions, and in chapter 7 Roll back and naming a deploy; a reload
// also counts in `reloads`, the measure of the best run after hints. The app itself runs in the browser: the page runs
// the check behind a reload and hands its Observation to `reload`. Pure and immutable, like the core.
import { act, startSession } from '../engine'
import { deployById } from './deploys'
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

/**
 * A reload: the app restarted from the saved files, and what its check run saw. Counted, also in `reloads`. `ran` is
 * the files the check ran (default: the saved files); a save made while it ran is not what it checked.
 */
export function reload(session: DebugSession, level: DebugLevel, observed: Observation, ran?: Readonly<Record<string, string>>): DebugResult {
  return act(session, level, {
    commands: ['reload'],
    reload: true,
    execute: state => ({ state: { ...state, observed, checked: ran ?? state.files }, record: { kind: 'reload' }, output: NOTHING })
  })
}

/**
 * Roll back (chapter 7): the files become a deploy's, saved (the newest deploy's is "back to live"). Counted like a
 * save, not a reload: Reload runs them. An unknown deploy, or a level without deploys, changes nothing.
 */
export function rollback(session: DebugSession, level: DebugLevel, deployId: string): DebugResult {
  const history = level.sandbox.deploys
  const deploy = history ? deployById(history, deployId) : null
  if (!deploy) return quiet(session)
  return act(session, level, {
    commands: [`rollback ${deploy.id}`],
    execute: state => ({ state: { ...state, files: { ...deploy.files } }, record: { kind: 'rollback', to: deploy.id }, output: NOTHING })
  })
}

/** What a click on a line says in a find task (null outside one): right, or why it is not that one. */
export function pickVerdict(level: DebugLevel, pick: SourceLine): PickVerdict | null {
  const find = level.sandbox.find
  if (!find) return null
  if (pick.path === find.path && find.lines.includes(pick.line)) return { right: true, why: null }
  return { right: false, why: find.wrong[`${pick.path}:${pick.line}`] ?? find.otherwise }
}

/**
 * Undo roll back (chapter 7): the saved files from before a rollback come back (counted, like a save). Only a file set
 * with exactly the app's files counts; one that is what is saved already changes nothing.
 */
export function restoreFiles(session: DebugSession, level: DebugLevel, files: Readonly<Record<string, string>>): DebugResult {
  const current = session.state.files
  const paths = Object.keys(current)
  const same = Object.keys(files).length === paths.length && paths.every(path => typeof files[path] === 'string')
  if (!same || paths.every(path => files[path] === current[path])) return quiet(session)
  return act(session, level, {
    commands: ['restore'],
    execute: state => ({ state: { ...state, files: { ...files } }, record: { kind: 'restore' }, output: NOTHING })
  })
}

/** What naming a deploy says in a find task whose answer can be a deploy (null otherwise): right, or why not. */
export function deployVerdict(level: DebugLevel, deployId: string): PickVerdict | null {
  const find = level.sandbox.find
  if (!find?.deploys) return null
  if (find.deploys.includes(deployId)) return { right: true, why: null }
  return { right: false, why: find.wrong[`deploy:${deployId}`] ?? find.otherwise }
}

/** Naming a deploy as the answer ("this one broke it"), in a chapter 7 find task (counted); elsewhere it changes nothing. */
export function pickDeploy(session: DebugSession, level: DebugLevel, deployId: string): DebugResult {
  const verdict = deployVerdict(level, deployId)
  if (!verdict) return quiet(session)
  return act(session, level, {
    commands: ['pick'],
    execute: state => ({ state: { ...state, picked: { deploy: deployId } }, record: { kind: 'pickDeploy', deploy: deployId }, output: { verdict } })
  })
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
  if ('rollback' in step) return rollback(session, level, step.rollback)
  if ('pickDeploy' in step) return pickDeploy(session, level, step.pickDeploy)
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
