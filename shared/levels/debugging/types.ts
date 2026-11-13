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
  /**
   * Types into the first field that matches letter by letter, like a customer: per letter a `keydown`, the letter added
   * to its value with an `input` event (unless the keydown was prevented), a `keyup`, then `gap` ms (default 80) before
   * the next. No `change`, and the focus is never taken. Answers are not waited for.
   */
    | { keys: string, value: string, gap?: number }
  /**
   * Presses a key in the first element that matches: a `keydown` and a `keyup`; Enter in an `<input>` also commits it
   * (a `change`, unless the keydown was prevented), as in the browser. No form is submitted: the sealed frame has none.
   */
    | { press: string, key: string }
  /**
   * Performance levels (chapter 6): how many nodes of the page the app changed inside the first element that matches
   * since this probe started (elements and text added or removed, attributes and texts changed), from a MutationObserver.
   */
    | { changes: string }
  /**
   * Performance levels whose check run counts work (the code runs instrumented, counting only): the statements the app's
   * code ran, while it loaded (`'load'`: until the page was quiet, before the first probe) or since this probe started.
   */
    | { work: 'load' | 'here' }
  /**
   * Performance levels: the server time the customer waited, in the fake backend's scripted delays (a clock that moves
   * only when an answer arrives): until the loaded page was quiet (`'load'`), or since this probe started.
   */
    | { waited: 'load' | 'here' }

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

/** Chapter 7 find tasks: a deploy you named as the answer ("this one broke it"). */
export interface DeployPick {
  deploy: string
}

/** A find task's answer: a line, or (chapter 7) a deploy. */
export type Picked = SourceLine | DeployPick

export interface DebugState {
  /** The app's files as saved, by path ('index.html', 'cart.js'); a reload runs these. */
  files: Record<string, string>
  /** What the check run of the last reload saw; null before the first reload. */
  observed: Observation | null
  /** Find tasks: the line you clicked last (in the editor or in a stack trace), or the deploy you named (chapter 7). */
  picked: Picked | null
  /**
   * The files the last reload ran (absent before the first reload). Colleague events read it (chapter 7): "after a fix
   * that did not work" is a reload of changed code whose check failed, not a save after it.
   */
  checked?: Readonly<Record<string, string>>
}

/** One counted action: a saved file, a reload, a clicked line or deploy (find tasks), a rollback (chapter 7). */
export type DebugRecord
  = | { kind: 'save', path: string }
    | { kind: 'reload' }
    | { kind: 'pick', path: string, line: number }
    | { kind: 'pickDeploy', deploy: string }
    | { kind: 'rollback', to: string }
    | { kind: 'restore' }

/**
 * One step of a solution: save a file with one text replaced (the first occurrence; the tests fail when it is not
 * there), reload the app, click a line (find tasks), or in chapter 7 roll the code back to a deploy or name a deploy
 * as a find task's answer.
 */
export type DebugStep
  = | 'reload'
    | { save: string, replace: readonly [string, string] }
    | { pick: string, line: number }
    | { rollback: string }
    | { pickDeploy: string }

/** A find task's answer: any of these lines counts (or, in chapter 7, one of these deploys); a wrong click is told why it is not it. */
export interface FindTarget {
  path: string
  lines: readonly number[]
  /** Chapter 7: the deploys that count as the answer ("this one broke it"), by id. */
  deploys?: readonly string[]
  /** Why a click on another line is not it, by 'path:line' (e.g. 'app.js:22'), or on another deploy, by 'deploy:<id>'. */
  wrong: Readonly<Record<string, string>>
  /** For any other wrong line (or deploy). */
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
  /**
   * The level uses the Performance panel (chapter 6): Record reloads the app with its code instrumented to count (no
   * values read), and the panel shows how often each function ran and its work, what the code changed on the page, and
   * the requests over the server's time. Its check runs watch the page's changes and the server's time, and count work
   * (instrumented, counting only) when a probe reads it.
   */
  performance?: true
  /**
   * Chapter 7: the server's logs (the Logs panel): what it logged before you came (the incident so far) and, for each
   * request the app sends, its access line and the lines its answer scripts (`BackendReply.log`). Needs a backend.
   */
  logs?: LogsSpec
  /** Chapter 7: the shop's last deploys (the Deploys panel), each with its diff and a Roll back; the level's files are the live one's. */
  deploys?: DeployHistory
}

/** How bad a server log line is. */
export type LogLevel = 'info' | 'warn' | 'error'

/**
 * A line the server logs when it gives an answer (before its access line): `{body}` in the message becomes the
 * request's body (cut), `{query}` its query. A stack is lines like `at createOrder (server/orders.js:18:17)`; a frame in
 * one of the app's files (`at submit (order.js:14:9)`, an error a customer's browser reported) links its line.
 */
export interface ScriptedLog {
  level: LogLevel
  message: string
  stack?: readonly string[]
}

/** A line the server logged before you opened the level: the incident so far. */
export interface PastLogLine extends ScriptedLog {
  /** The server's time, 'HH:MM:SS.mmm'. */
  at: string
  /** 'POST /api/orders'; '' for a line of the server itself (a deploy going live). */
  route: string
  /** The request's id ('req-4093'), or null. */
  request: string | null
}

/** The server's logs of a chapter 7 level. */
export interface LogsSpec {
  /** The server's clock when the app loads ('09:41:00.000'); a load's lines are this plus the scripted delays. */
  now: string
  /** The id of a load's first request (4127 gives 'req-4127'); each request after it counts up. */
  firstRequest: number
  /** What the server logged before, oldest first (at most MAX_LOG_HISTORY lines). */
  history: readonly PastLogLine[]
}

/** One deploy of the shop: who, when, why, and the files as they were after it. */
export interface Deploy {
  /** A short commit id, 7 hex digits ('b7e41d0'). */
  id: string
  author: string
  /** When it went live, as the team says it ('Today 08:02', 'Yesterday 17:40'). */
  at: string
  message: string
  /** Every file of the app as this deploy left it. */
  files: Readonly<Record<string, string>>
}

/** The shop's last deploys, oldest first: the files before the first of them, and each deploy's files. */
export interface DeployHistory {
  base: Readonly<Record<string, string>>
  list: readonly Deploy[]
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
  /** Chapter 7: what the server logs while it answers (before its access line), in the Logs panel. */
  log?: readonly ScriptedLog[]
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

/** A colleague's message (chapter 7): the incident report a scenario opens with. */
export interface ColleagueMessage {
  author: string
  text: string
}

/** What a Debugging level adds to the shared level fields. */
export interface DebugFields {
  sandbox: SandboxSpec
  /** A scenario: the error or status it teaches you to read, shown as its tag on the track page ('TypeError', '404'). */
  teaches?: string
  /**
   * Chapter 7: the colleague who reports the incident, shown first in the level's messages; later messages are the
   * level's colleague events (`teammates`, fired by generic triggers after a counted action, never on a timer).
   */
  report?: ColleagueMessage
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
