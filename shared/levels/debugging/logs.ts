// The server's logs (ADR 0007, chapter 7; docs/features/levels.md "The logs"): the Logs panel's lines. What the server
// logged before you came is level data (`LogsSpec.history`); while the app you see runs, the fake backend posts a
// `serverlog` message for each request to the shop's own server it answered, with numbers only (which route and answer,
// the status, when on the server's clock), and the page builds the lines from the level's own data: the lines that
// answer scripts (`BackendReply.log`, the request's body filled in) and the access line. The report itself carries no
// text; what the request sent (method, path and query, body) comes from the frame through the request message the
// Network panel already has, cut at LOG_BODY_LENGTH. Text only: a stack frame in one of the app's files links its line,
// nothing else does. Pure.
import { STATUS_TEXT } from './backend'
import type { BackendAnswer, BackendSpec, LogLevel, LogsSpec, ScriptedLog, SourceLine } from './types'

export const LOG_LEVELS: readonly LogLevel[] = ['info', 'warn', 'error']

/** The most lines a level's history may have. */
export const MAX_LOG_HISTORY = 200
/** The most lines one load of the app adds to the panel (a fetch in a loop); later ones are not shown. */
export const MAX_LOG_LINES = 500
/** The most lines of a stack, and the longest message, a level may script. */
export const MAX_STACK_LINES = 12
export const MAX_LOG_MESSAGE = 2000
/** How much of a request's body a `{body}` shows. */
export const LOG_BODY_LENGTH = 300

/** One line of a stack in a log line: its text, and its place when it is one of the app's files. */
export interface LogFrame {
  text: string
  source: SourceLine | null
}

/** One line of the Logs panel. */
export interface LogEntry {
  key: string
  /** The server's time, 'HH:MM:SS.mmm'. */
  time: string
  level: LogLevel
  /** 'POST /api/orders'; '' for the server's own lines. */
  route: string
  /** The request's id as the server names it ('req-4127'), or null. */
  request: string | null
  /** The Network panel's id of that request (this load's requests only), or null. */
  requestId: number | null
  message: string
  stack: LogFrame[]
  /** A line of this load (false: from before you came). */
  live: boolean
}

/** What the fake backend posts when it answered a request to the shop: numbers only (read by `readBridgeMessage`). */
export interface ServerLogMessage {
  type: 'serverlog'
  /** The request's id (the Network panel's). */
  id: number
  /** Which route of the level's backend answered, and which of its answers (-1: none, an unknown path's 404). */
  route: number
  answer: number
  status: number
  /** When the answer went out, in ms on the server's clock since the app loaded. */
  at: number
  /** How long the server took (the answer's delay), in ms. */
  time: number
}

/** The request a `serverlog` is about, as the Network panel has it. */
export interface LoggedRequest {
  method: string
  url: string
  body: string | null
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{3})$/
const ROUTE = /^[A-Z]{3,7} \/\S*$/
const REQUEST = /^req-(\d{1,9})$/

/** The server's name for a load's request: `req-<firstRequest + id - 1>`. */
export const requestLabel = (logs: LogsSpec, id: number): string => `req-${logs.firstRequest + id - 1}`

/** How an access line is logged: a 5xx is an error, a 4xx a warning, the rest info. */
export const accessLevel = (status: number): LogLevel => status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

const pad = (value: number, size = 2) => String(value).padStart(size, '0')

/** The server's clock as text: `start` ('09:41:00.000') plus `ms`, past midnight it starts again. */
export function clockText(start: string, ms: number): string {
  const match = TIME.exec(start)
  const base = match ? ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]) : 0
  const day = 24 * 60 * 60 * 1000
  const total = ((base + Math.max(0, Math.floor(ms))) % day + day) % day
  return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`
}

function checkLine(line: ScriptedLog, where: string) {
  if (!LOG_LEVELS.includes(line.level)) throw new Error(`${where}: ${String(line.level)} is not a log level`)
  if (!line.message || line.message.length > MAX_LOG_MESSAGE) throw new Error(`${where}: a message has 1 to ${MAX_LOG_MESSAGE} characters`)
  if ((line.stack?.length ?? 0) > MAX_STACK_LINES || line.stack?.some(frame => frame.length > 300)) throw new Error(`${where}: a stack has at most ${MAX_STACK_LINES} lines of 300 characters`)
}

const answersOf = (respond: BackendAnswer | readonly BackendAnswer[]): readonly BackendAnswer[] => 'length' in respond ? respond : [respond]

/** Checks a level's logs and the lines its backend scripts; throws for what a level cannot mean (the tests load every level). */
export function checkLogs(logs: LogsSpec, backend: BackendSpec | undefined): void {
  if (!TIME.test(logs.now)) throw new Error(`logs: now ${logs.now} is not HH:MM:SS.mmm`)
  if (!Number.isInteger(logs.firstRequest) || logs.firstRequest < 1 || logs.firstRequest > 99_999_999) throw new Error('logs: the first request is a whole number from 1')
  if (!backend) throw new Error('logs: a level with logs needs a backend')
  if (logs.history.length > MAX_LOG_HISTORY) throw new Error(`logs: at most ${MAX_LOG_HISTORY} lines of history`)
  let last = ''
  logs.history.forEach((line, index) => {
    const where = `logs: line ${index + 1}`
    if (!TIME.test(line.at)) throw new Error(`${where}: ${line.at} is not HH:MM:SS.mmm`)
    if (line.at < last) throw new Error(`${where}: the history is oldest first`)
    if (line.at > logs.now) throw new Error(`${where}: ${line.at} is after now (${logs.now})`)
    last = line.at
    if (line.route !== '' && !ROUTE.test(line.route)) throw new Error(`${where}: the route ${line.route} is not 'METHOD /path'`)
    if (line.request !== null) {
      const number = REQUEST.exec(line.request)
      if (!number) throw new Error(`${where}: a request id is req-<number>`)
      if (Number(number[1]) >= logs.firstRequest) throw new Error(`${where}: ${line.request} is not before the first request of a load`)
    }
    checkLine(line, where)
  })
  backend.routes.forEach((route, index) => answersOf(route.respond).forEach((answer, at) => {
    if ('log' in answer) for (const line of answer.log ?? []) checkLine(line, `route ${index + 1}, answer ${at + 1}`)
  }))
}

// a frame of a stack: "at fn (file.js:14:9)" or "at file.js:14:9"
const FRAME = /(?:\(|at )([\w./-]+):(\d+):(\d+)\)?\s*$/

/** A stack's lines, trimmed, each linked when it is a place in one of the app's files. */
function framesOf(stack: readonly string[] | undefined, files: Readonly<Record<string, string>>): LogFrame[] {
  return (stack ?? []).slice(0, MAX_STACK_LINES).map((raw) => {
    const text = raw.trim()
    const match = FRAME.exec(text)
    const path = match?.[1]
    return { text, source: match && path && Object.hasOwn(files, path) ? { path, line: Number(match[2]) } : null }
  })
}

/** The lines the server logged before you came. */
export function historyEntries(logs: LogsSpec, files: Readonly<Record<string, string>>): LogEntry[] {
  return logs.history.slice(0, MAX_LOG_HISTORY).map((line, index) => ({
    key: `h${index}`,
    time: line.at,
    level: line.level,
    route: line.route,
    request: line.request,
    requestId: null,
    message: line.message,
    stack: framesOf(line.stack, files),
    live: false
  }))
}

/** Text from the frame, cut at LOG_BODY_LENGTH. */
const cut = (text: string) => text.length > LOG_BODY_LENGTH ? `${text.slice(0, LOG_BODY_LENGTH)}…` : text
const cutBody = (body: string | null) => body === null ? '(no body)' : cut(body)

/** The path and query of a request on the shop ('/api/nope?x=1'). */
function pathOf(url: string): { path: string, query: string } {
  try {
    const parsed = new URL(url)
    return { path: parsed.pathname, query: parsed.search }
  } catch {
    return { path: url, query: '' }
  }
}

/** The lines the server logged for one request of this load: what its answer scripts, then its access line. */
export function liveEntries(message: Omit<ServerLogMessage, 'type'>, request: LoggedRequest, logs: LogsSpec, backend: BackendSpec, files: Readonly<Record<string, string>>): LogEntry[] {
  const { path, query } = pathOf(request.url)
  const route = `${request.method} ${cut(path)}`
  const time = clockText(logs.now, message.at)
  const label = requestLabel(logs, message.id)
  const own = backend.routes[message.route]
  const answer = own ? answersOf(own.respond)[message.answer] : undefined
  const scripted = answer && 'log' in answer ? answer.log ?? [] : []
  const fill = (text: string) => text.split('{body}').map(part => part.split('{query}').join(cut(query.slice(1)))).join(cutBody(request.body))
  const line = (level: LogLevel, text: string, stack: readonly string[] | undefined, index: number): LogEntry => ({
    key: `r${message.id}-${index}`,
    time,
    level,
    route,
    request: label,
    requestId: message.id,
    message: text,
    stack: framesOf(stack, files),
    live: true
  })
  const statusText = STATUS_TEXT[message.status] ?? ''
  return [
    ...scripted.map((each, index) => line(each.level, fill(each.message), each.stack, index)),
    line(accessLevel(message.status), `${request.method} ${cut(path + query)} ${message.status}${statusText ? ` ${statusText}` : ''} · ${message.time} ms`, undefined, scripted.length)
  ]
}

/** Which lines a filter keeps: every level, warnings and errors, or errors only. */
export type LogFilter = 'all' | 'warn' | 'error'

const RANK: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 }
const MIN: Record<LogFilter, number> = { all: 0, warn: 1, error: 2 }

/** The lines of that level or worse that hold the text (any case) in their time, route, request, message or stack. */
export function filterLogs(entries: readonly LogEntry[], level: LogFilter, text: string): LogEntry[] {
  const wanted = text.trim().toLowerCase()
  return entries.filter((entry) => {
    if (RANK[entry.level] < MIN[level]) return false
    if (!wanted) return true
    if (entry.message.toLowerCase().includes(wanted) || entry.route.toLowerCase().includes(wanted) || entry.time.includes(wanted)) return true
    if (entry.request?.toLowerCase().includes(wanted)) return true
    return entry.stack.some(frame => frame.text.toLowerCase().includes(wanted))
  })
}
