// The Debugging environment's level types (ADR 0007, docs/features/levels.md "The Debugging environment"): a level is a
// small real app (index.html, CSS, plain JavaScript modules) that runs in a sealed frame. The level's state is its files
// as saved, what the check run behind the last reload saw, and (find tasks) the line you clicked. Goals read only that,
// so they check what the app does, never the code's text. Registers Debugging in the core's `Environments`.
import type { ActResult } from '../engine'
import type { Level, PracticeTask, Scenario, Session } from '../types'

/** A line in one of the app's files (1-based). */
export interface SourceLine {
  path: string
  line: number
}

/** One frame of a stack trace, mapped back to the level's files. */
export interface TraceFrame extends SourceLine {
  /** The function as the browser names it ("addToCart", "HTMLButtonElement.<anonymous>"); "(anonymous)" when it has none. */
  fn: string
  column: number | null
}

/** What a probe reads: a text, a count, or null when it only clicks. */
export type ProbeValue = string | number | null

/** One scripted step of a probe, run inside the app after it loaded. */
export type ProbeStep
  /** Clicks the first element that matches (like a customer would), then lets the app react. */
  = | { click: string }
  /** Reads the text of the first element that matches (whitespace collapsed). */
    | { text: string }
  /** Counts the elements that match. */
    | { count: string }

/** A scripted look at the app that goals read: steps run in order; its value is what the last read step read. */
export interface Probe {
  id: string
  steps: readonly ProbeStep[]
}

/** An error the check run saw: an uncaught error, an unhandled rejection or a `console.error` call. */
export interface ObservedError {
  kind: 'error' | 'rejection' | 'console'
  text: string
  source: SourceLine | null
}

/** What the check run behind a reload saw: the app loaded, then every probe ran. Goals read only this. */
export interface Observation {
  /** The run got through loading and every probe (false: it did not finish in time). */
  finished: boolean
  errors: ObservedError[]
  /** Each probe's value by id; a probe that could not run (nothing matched) is missing here and in `probeErrors`. */
  probes: Record<string, ProbeValue>
  /** Why a probe could not run, by id. */
  probeErrors: Record<string, string>
  /** `console.log` and `console.info` texts, in order. */
  logs: string[]
}

export interface DebugState {
  /** The app's files as saved, by path ('index.html', 'cart.js'); a reload runs these. */
  files: Record<string, string>
  /** What the check run of the last reload saw; null before the first reload. */
  observed: Observation | null
  /** Find tasks: the line you clicked last (in the editor or in a stack trace). */
  picked: SourceLine | null
}

/** One counted action: a saved file, a reload, a clicked line (find tasks). */
export type DebugRecord
  = | { kind: 'save', path: string }
    | { kind: 'reload' }
    | { kind: 'pick', path: string, line: number }

/**
 * One step of a solution: save a file with one text replaced (the first occurrence; the tests fail when it is not
 * there), reload the app, or click a line (find tasks).
 */
export type DebugStep
  = | 'reload'
    | { save: string, replace: readonly [string, string] }
    | { pick: string, line: number }

/** A find task's answer: any of these lines counts; a wrong click is told why it is not it. */
export interface FindTarget {
  path: string
  lines: readonly number[]
  /** Why a click on another line is not it, by 'path:line' (e.g. 'app.js:22'). */
  wrong: Readonly<Record<string, string>>
  /** For any other wrong line. */
  otherwise: string
}

/** How the level's app runs: the page in the address bar, the file that opens first, the probes, a find task's answer. */
export interface SandboxSpec {
  /** Shown in the address bar after the shop's host, e.g. '/order'. */
  page: string
  /** The file the editor opens first. */
  open: string
  probes: readonly Probe[]
  /** A find task: clicking a line is the answer (the editor is read-only). */
  find?: FindTarget
}

/** What a Debugging level adds to the shared level fields. */
export interface DebugFields {
  sandbox: SandboxSpec
  /** A scenario: the error it teaches you to read, shown as its tag on the track page ('TypeError'). */
  teaches?: string
}

declare module '../types' {
  interface Environments {
    debugging: { state: DebugState, record: DebugRecord, step: DebugStep, fields: DebugFields }
  }
}

export type DebugLevel = Level<'debugging'>
export type DebugScenario = Scenario<'debugging'>
export type DebugPracticeTask = PracticeTask<'debugging'>
export type DebugSession = Session<'debugging'>

/** A level of the Debugging track (the play page picks DebuggingPlay for it). */
export const isDebugLevel = (level: Pick<Level, 'track'>): level is DebugLevel => level.track === 'debugging'

/** What a click on a line says in a find task. */
export interface PickVerdict {
  right: boolean
  /** Why it is not that one (a wrong click); null for the right one. */
  why: string | null
}

/** What an action reports besides the new session: a find task's verdict on a click. */
export interface DebugOutput {
  verdict: PickVerdict | null
}

export type DebugResult = ActResult<DebugState, DebugRecord, DebugOutput>
