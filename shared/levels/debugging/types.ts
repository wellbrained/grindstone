// The Debugging environment's level types (ADR 0007, docs/features/levels.md "The Debugging environment"): a level is a
// small real app (index.html, CSS, plain JavaScript modules) that runs in a sealed frame. The level's state is its files
// as saved, what the check run behind the last reload saw, and (find tasks) the line you clicked. Goals read only that,
// so they check what the app does, never the code's text. Registers Debugging in the core's `Environments`.
import type { ActResult } from '../engine'
import type { Level, LevelOf, PracticeTask, Scenario, Session } from '../types'
import type { WebSpec } from '../web/backend'
import type { PredictionAnswer } from '../web/types'

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
   * the 20 ms, while the answers are still on their way (a customer who clicks on: a race). In an event loop level
   * (chapter 5) a customer's tap: it lands on what is on top at the element's centre, 5 ms after a frame, its listeners
   * each followed by the microtasks, then the page runs on for 500 ms of the scripted clock (`wait` and `settle` move
   * that clock too).
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
   * section.summary' for an ancestor), 'in a closed details' (since 0.4.6: browsers keep its boxes), 'visibility: hidden',
   * 'opacity: 0' (or on an ancestor), 'no size', 'off screen'.
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
  /**
   * Web fundamentals: how many answers from `'METHOD https://host/path'` the app read the body of (`json()`, `text()`):
   * a page that shows text it wrote itself, or got an opaque answer, read none.
   */
    | { read: string }
  /** Web fundamentals: how many requests to `'METHOD https://host/path'` reached server.js (a refused preflight's never do). */
    | { arrived: string }
  /**
   * Web fundamentals: a request as a page on another origin would send it (nothing in the Network panel): 'read' (an
   * answer from 200 to 299 that page may read), 'refused' (one of 400 and up it may read), 'blocked' (CORS) or 'failed'.
   */
    | { fetchFrom: string, request: string, credentials?: 'omit' | 'same-origin' | 'include', headers?: Readonly<Record<string, string>>, body?: Readonly<Record<string, string>> }
  /**
   * Web fundamentals (chapter 7): the next XSS, markup an attacker gets into the page some other day, asked of the page's
   * policies as the browser asks them (Chrome's line in the Console when refused): an inline event handler (`code`), an
   * inline script (`code`; `nonce`, or `'seen'`: the first nonce of a page server.js gave the attacker a moment ago), a
   * script from an address (`src`), an image or a request of the page's script to there (`src`). 'ran' (allowed: a
   * handler or script then runs), 'refused', or 'failed' (allowed, but it never arrived).
   */
    | { inject: 'handler' | 'inline' | 'src' | 'img' | 'connect', code?: string, nonce?: string, src?: string }
  /** Web fundamentals (chapter 7): how often a script from this address ran in the load (the page loader's record: the page can't add to it). */
    | { ran: string }
  /**
   * Framework deep dives: how many reactions Vue made since this probe started, of a kind ('render', 'computed',
   * 'watch', 'effect') or of a component's renders ('render Basket').
   */
    | { reactions: string }
  /**
   * Web fundamentals (chapter 2): Lena opens another site of the level (`sandbox.web.sites`): what its page does runs in
   * the panels, then the app gets 20 ms (and its answers). The value: the status of the last thing the page did (a form's,
   * a link's), or 'blocked' / 'failed'.
   */
    | { visit: string }
  /**
   * Web fundamentals: a top-level navigation from a page on `from` (a link, nothing in the panels): its status, or
   * 'failed'. `credentials: 'omit'`: a browser without Lena's cookies.
   */
    | { navigate: string, from: string, credentials?: 'omit' }
  /** Web fundamentals: how many requests to `'METHOD https://host/path'` carried a cookie of this name. */
    | { carried: string, cookie: string }
  /** Web fundamentals: how many requests to another site than the page's carried this text (address, a header, the body). */
    | { leaked: string }
  /** Web fundamentals: 1 when a script on the page's origin can read a cookie of this name (on any of its paths), else 0. */
    | { readable: string }
  /**
   * Web fundamentals: a script on the page reads every cookie it can (document.cookie, on any path of the page's origin)
   * and an attacker replays them from elsewhere as the Cookie header of `'METHOD https://host/path'`: the status (200:
   * the stolen cookies are a session), or 'failed'. Name- and value-blind: renaming a cookie hides nothing.
   */
    | { stolen: string }
  /**
   * Web fundamentals (chapter 3): the scripted clock moves on this many minutes (Lena's laptop sleeps): cookies expire,
   * tokens run out, the page's and server.js's Date tell the new time; timers set in the page don't fire early.
   */
    | { later: number }
  /**
   * Web fundamentals (chapter 3): the thief keeps a copy under a name (`as`, default the kind): `'script'`, what a script
   * on the page could take now (document.cookie, the page's storage, the headers and query of every request the page's
   * code sent, every answer it could read), or `'browser'`, the browser's cookies for the API, HttpOnly ones too (a HAR
   * file, an extension on a shared computer).
   */
    | { copy: 'script' | 'browser', as?: string }
  /**
   * Web fundamentals (chapter 3): what a sign-in (`'POST https://…/login'` with this form body) answered `ago` minutes
   * earlier (its cookies and the strings of its body), kept as a copy named `as`: an old token, issued by this server.js.
   */
    | { issued: string, body: Readonly<Record<string, string>>, ago: number, as: string }
  /**
   * Web fundamentals (chapter 3): the thief sends `'METHOD https://host/path'` from outside the browser (no CORS, no
   * SameSite), exactly as the shop's page sends a request to the API (the same headers in the same order, its Origin and
   * cross-origin Referer, the cookies the browser would send there in its order, no body), so only what it took
   * decides, with what it has: `using` a copy's name,
   * `'script'` (what a script on the page could take now) or another site's origin (what reached that site's server).
   * It tries each piece (the cookies, each header set, each string as a Bearer token): the status of the first answer from
   * 200 to 299, else of the last, or 'failed'. Name- and value-blind. `show`: the Server panel says who sent it.
   * `forge`: each token it has made up without the secret (its exp 30 days on; its old signature, or alg none).
   */
    | { replay: string, using: string, show?: boolean, forge?: boolean }
  /** Web fundamentals (chapter 4): how many of the page's requests to `'METHOD https://host/path'` the browser answered from its cache, without asking. */
    | { fromCache: string }
  /** Web fundamentals (chapter 4): how many of the page's requests to there were revalidated and answered 304 (the copy was still good). */
    | { notModified: string }
  /** Web fundamentals (chapter 4): how many of the page's requests to there the network answered in full (a 2xx with its body: no copy, no 304); an address ending in / counts every path below it. */
    | { whole: string }
  /** Web fundamentals (chapter 4): how many requests to there, from anyone (Lena, another customer, a probe), reached server.js past the CDN. */
    | { reached: string }
  /**
   * Web fundamentals (chapter 4): another customer's browser (its own empty cache, its own `cookie`) sends `request` from a
   * page on `from` (default: the shop's; null: an app, no CORS), through the CDN: the status, a field of its JSON (`json`)
   * when it may read it, 'blocked' (CORS) or 'failed'. `like`: exactly as the page's last request to that address (its
   * query and the headers its code set), so a page that hides its request in a query hides nothing. Only the CDN's log
   * shows it.
   */
    | { other: string, request: string, from?: string | null, cookie?: string, like?: boolean, json?: string, body?: Readonly<Record<string, string>>, headers?: Readonly<Record<string, string>> }
  /**
   * Web fundamentals (chapter 5, a level with `sandbox.web.loop`): how many frames painted since this probe started showed
   * a watched element whose snapshot starts with this ('spinner', 'status: Thank you', 'progress: Importing'). `within`
   * (ms): only frames painted that soon after the probe's tap (the first since it started, else the last before), so a
   * spinner painted after the work, or a bar moved after the import, doesn't count. `rising`: only frames whose item's
   * first number is more than the last one counted (steps of a progress, not frames that repeat one).
   */
    | { painted: string, within?: number, rising?: boolean }
  /**
   * Chapter 5: ms from the probe's tap (the first since it started, else the last before) to the first frame at or after
   * it that painted an item starting with this (null when there is none).
   */
    | { when: string }
  /**
   * Chapter 5: the longest wait in ms between painted frames from the probe's tap to the first frame that painted an
   * item starting with this (the tap to the first frame counts too; null when there is none): a page that renders
   * nothing for a while shows it.
   */
    | { longestGap: string }
  /**
   * Chapter 5: how many watched elements that keep their opacity, first painted at or after the probe's tap, faded in
   * where a customer can see it (each first painted at an opacity of at most 0.05, then a frame between 0.05 and 0.95,
   * then, 96 ms or more after its first frame and painted every frame in between, a frame at 1); 0 when one of them
   * didn't, so a decoy can't stand in for the toast.
   */
    | { faded: string }
  /** Chapter 5: the layouts the page's code forced (a size or position read after a change) since this probe started ('here') or in the whole load ('load'). */
    | { forced: 'here' | 'load' }
  /**
   * Chapter 5: how many transitions and animations started since this probe started on an element that matches, changing
   * this CSS property (its first and last keyframe differ: a fade from 0 to 1, not a dummy animation).
   */
    | { animated: string, property: string }
  /**
   * Web fundamentals (chapter 6, a level with `sandbox.web.a11y`): keys on the modelled keyboard, on whatever has focus
   * ('Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', an arrow; `times` in a row): keydown, what the browser does by
   * default (Tab moves focus, Enter clicks a button or a link, Space a button or a checkbox, Escape closes a modal
   * dialog) unless the page prevented it, keyup; then the app gets 20 ms.
   */
    | { keyboard: string, times?: number }
  /** Chapter 6: Tab until the first element that matches has focus (the value: how many presses); the probe fails when Tab never gets there. */
    | { tabTo: string }
  /** Chapter 6: focus on the first element that matches, as a click or a script would put it there; the probe fails when it can't take focus. */
    | { focusOn: string }
  /** Chapter 6: back to a fresh page: nothing has focus, the next Tab starts at the top. */
    | { focusTop: true }
  /** Chapter 6: 1 when the element with focus matches the selector, else 0. */
    | { focused: string }
  /**
   * Chapter 6: what a screen reader says for the first element that matches ('Add Butter croissant, button'; null when
   * it is hidden from it); with `has`, 1 when that text is in it (any case), else 0.
   */
    | { reads: string, has?: string }
  /** Chapter 6: the accessible name of the first element that matches (null when hidden); with `has`, 1 when that text is in it (any case). */
    | { name: string, has?: string }
  /** Chapter 6: the computed role of the first element that matches ('button'), 'hidden' when it is left out of the tree. */
    | { role: string }
  /** Chapter 6: a state of the first element that matches: 'true', 'false', 'mixed', or null when it doesn't have it. */
    | { state: string, of: 'checked' | 'expanded' | 'pressed' | 'selected' | 'disabled' | 'invalid' | 'required' }
  /**
   * Chapter 6: how many lines the screen reader said since this probe started that include this text (focus, states,
   * live regions); `after: 'Enter'`: only lines that followed that modelled key (the last one pressed before them;
   * typing, a click or a focus move ends what follows a key); `scene: true`: the scene's lines instead (what was said
   * before the probes), so the first try is checked too.
   */
    | { heard: string, after?: string, scene?: true }
  /** Chapter 6: the same, counting only what live regions announced. */
    | { announced: string }
  /** Chapter 6: from the top of the page, how many Tab stops there are before Tab leaves it (or comes round again). */
    | { tabStops: true }

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
  /**
   * Web fundamentals (ADR 0009): the answers to the level's prediction so far, in question order (absent before the
   * first; Debugging levels never have one).
   */
  predicted?: readonly PredictionAnswer[]
}

/** One counted action: a saved file, a reload, a clicked line or deploy (find tasks), a rollback (chapter 7). */
export type DebugRecord
  = | { kind: 'save', path: string }
    | { kind: 'reload' }
    | { kind: 'pick', path: string, line: number }
    | { kind: 'pickDeploy', deploy: string }
    | { kind: 'rollback', to: string }
    | { kind: 'restore' }
  /** Web fundamentals: an answer to a question of the prediction, and whether it was right. */
    | { kind: 'predict', question: number, right: boolean }

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
  /**
   * Web fundamentals (ADR 0009): the page talks to an API on another origin, answered by the level's own `server.js`
   * through the CORS model (web/backend.ts); the Network panel shows preflights and refusals, the Server panel what
   * server.js did.
   */
  web?: WebSpec
  /**
   * Framework deep dives (ADR 0010): real Vue runs in the frame (the module `vue`, a facade over its development build
   * that reports every reaction for the Reactivity panel and the `reactions` probes).
   */
  vue?: true
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

/**
 * A level that runs in the sandbox, whatever its track: Debugging's, or Web fundamentals' (the same state and records,
 * plus a prediction). Debugging's engine and play page take these.
 */
export type SandboxLevel = LevelOf<DebugState, DebugRecord, unknown> & DebugFields

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
