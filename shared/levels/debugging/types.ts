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
  /**
   * Clicks the first element that matches (like a customer would; `times` clicks back to back, a double click), then
   * lets the app react: 20 ms, and with a backend until every request it sent is answered. `settle: false` goes on after
   * the 20 ms, while the answers are still on their way (a customer who clicks on: a race).
   */
  = | { click: string, times?: number, settle?: false }
  /**
   * Types into the first field that matches, like a customer: its value becomes `value` (an `input` event, then a
   * `change`), then the app gets 20 ms. The answers to what it sent are not waited for: the customer types on.
   */
    | { type: string, value: string }
  /** A customer's pause: the app runs on for this many milliseconds (at most MAX_PROBE_WAIT_MS); nothing is waited for. */
    | { wait: number }
  /** Waits until every request the app sent is answered (at most 3 s), then 20 ms: what a customer sees once the page is quiet. */
    | { settle: true }
  /** Reads the text of the first element that matches (whitespace collapsed). */
    | { text: string }
  /** Counts the elements that match. */
    | { count: string }
  /** Counts the requests the app sent so far to `'METHOD /path'` (the shop's own address) or `'METHOD https://host/path'`. */
    | { requests: string }
  /** Reads the body of the last request sent there (null: none, or no body); with `json`, the value at that path ('items.0.quantity'). */
    | { sent: string, json?: string }
  /**
   * Taps the first element that matches where a finger would: at its centre (scrolled into view), on whatever is on top
   * there. Something covering it gets the tap instead, like for a customer; then the app gets 20 ms to react.
   */
    | { tap: string }
  /** Reads a computed style of the first element that matches ('display' → 'none', 'color' → 'rgb(255, 255, 255)'). */
    | { style: string, property: string }
  /**
   * Whether the first element that matches can be seen: 'visible', or why not: 'display: none' (also 'display: none on
   * section.summary' for an ancestor), 'visibility: hidden', 'opacity: 0' (or on an ancestor), 'no size', 'off screen'.
   */
    | { visible: string }
  /**
   * What a tap at the centre of the first element that matches lands on: 'itself' (it or something inside it), else the
   * element on top ('div.toast-area'); 'no box', 'off screen' or 'nothing' when there is nothing to tap.
   */
    | { hit: string }
  /** Whether the first element that matches is wider inside than its box: 'overflows' or 'fits' (`html`: the page scrolls sideways). */
    | { overflows: string }
  /** The contrast ratio of the first matching element's text against the background behind it (1 to 21, two decimals). */
    | { contrast: string }

/** A scripted look at the app that goals read: steps run in order; its value is what the last read step read. */
export interface Probe {
  id: string
  steps: readonly ProbeStep[]
  /** The width of the check run's frame for this probe (default CHECK_VIEWPORT, a phone); each width gets a frame of its own. */
  width?: number
}

/** An error the check run saw: an uncaught error, an unhandled rejection or a `console.error` call. */
export interface ObservedError {
  /** `network`: the browser's own line for a failed request (`GET … 404 (Not Found)`, a CORS refusal). */
  kind: 'error' | 'rejection' | 'console' | 'network'
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
  /** The scripted backend that answers the app's requests (and the Network panel that shows them); none: requests are blocked. */
  backend?: BackendSpec
  /** The level uses the Elements panel (chapter 3): the app's DOM tree, the styles that apply and pick mode. */
  elements?: true
  /**
   * The level uses the Debugger panel (chapter 5): Record reloads the app with its code instrumented, then breakpoints,
   * stepping, the Scope and the Call stack go through the recorded run. Other levels never run instrumented code.
   */
  debugger?: true
}

/** A value a JSON body can hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** What the fake backend answers: a status with a JSON or text body (and headers), after a delay. */
export interface BackendReply {
  status: number
  json?: JsonValue
  text?: string
  headers?: Readonly<Record<string, string>>
  /** Milliseconds before the answer arrives (default DEFAULT_DELAY_MS). */
  delay?: number
}

/** No answer at all: the connection fails (`TypeError: Failed to fetch`). */
export interface BackendFailure {
  fail: 'network'
  delay?: number
}

export type BackendAnswer = BackendReply | BackendFailure

/** One thing the fake backend answers. */
export interface BackendRoute {
  /** Default GET. */
  method?: HttpMethod
  /** '/api/menu' on the shop's own address, or a whole URL on another one ('https://api.cornerbakery.shop/specials'). */
  path: string
  /** Only requests whose body matches this pattern (a regular expression's source) take this route. */
  body?: string
  /** Only requests whose query (as sent, without `?`: 'q=cro') matches this pattern take this route; routing otherwise ignores it. */
  query?: string
  /** The answer; a list answers call by call, and its last answer repeats. */
  respond: BackendAnswer | readonly BackendAnswer[]
}

/**
 * The level's scripted backend: it answers the app's `fetch` inside the frame (nothing leaves it). Another origin is
 * refused by CORS unless its answer allows the shop (`Access-Control-Allow-Origin`), like a browser would.
 */
export interface BackendSpec {
  routes: readonly BackendRoute[]
}

/** What a Debugging level adds to the shared level fields. */
export interface DebugFields {
  sandbox: SandboxSpec
  /** A scenario: the error or status it teaches you to read, shown as its tag on the track page ('TypeError', '404'). */
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
