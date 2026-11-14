// What the bridge in the sealed frame posts, read on Grindstone's side (docs/features/ui.md, "Sandbox and bridge").
// The bridge talks to the page over a port of its own, which it hands over in its first message (`isBridgeHello`, with
// the load's token) before any of the app's code runs, so the page reads a load's messages from that port only and
// nothing else in the frame can post them. Everything from the frame is still untrusted: `readBridgeMessage` keeps
// only well-formed messages and only plain strings and numbers; the page shows them as text, never as HTML. From the
// messages come the Console's entries (`consoleEntry`) and what a check run saw (`observe`), which the goals read.
// Pure: no DOM.
import { MAX_CSS_RULES } from './css'
import { MAX_DOM_NODES } from './elements'
import type { BoxModel, DomNode, Inspected, InspectedLevel, InspectedMatch, ScrollSize, Sides } from './elements'
import type { ServerLogMessage } from './logs'
import { readProfile } from './profile'
import type { Profile } from './profile'
import { readSteps } from './recording'
import type { RecordedStep } from './recording'
import type { RecordEndReason } from './recorder'
import { mapFrames, parseStack, sourceOf } from './trace'
import type { SourceMapping } from './trace'
import type { Observation, ObservedError, ProbeValue, SourceLine, TraceFrame } from './types'

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export type BridgeMessage
  /** Which blob URL is which file of the level (sent first). */
  = | { type: 'files', urls: Record<string, string> }
  /** A console call: its arguments as one-line previews and the stack (an Error argument's, else where it was called). */
    | { type: 'console', level: ConsoleLevel, args: string[], stack: string }
  /** An uncaught error or an unhandled rejection; a syntax error has no frames, only where it was found (url, line). */
    | { type: 'error', kind: 'error' | 'rejection', name: string | null, message: string, stack: string | null, url: string | null, line: number | null, column: number | null }
  /** The app has loaded. */
    | { type: 'ready' }
  /** A check run's probe: its value, or why it could not run. */
    | { type: 'probe', id: string, ok: boolean, value: ProbeValue, error: string | null }
  /** A check run is through every probe. */
    | { type: 'done' }
  /** The answer to Console input: a preview of the value, or the error it threw. */
    | { type: 'result', id: number, ok: true, value: string }
    | { type: 'result', id: number, ok: false, name: string | null, message: string, stack: string | null }
  /** The app sent a request (the fake backend answers it): what it sent, and where from (the stack at `fetch`). */
    | RequestMessage
  /** The backend's answer to a request, or how it failed. */
    | ResponseMessage
  /** The browser's own Console line for a failed request (`GET … 404 (Not Found)`, a CORS refusal), with where it was sent from. */
    | { type: 'netlog', text: string, stack: string }
  /** The Elements panel: a snapshot of the app's DOM (in document order), cut at MAX_DOM_NODES. */
    | { type: 'dom', nodes: DomNode[], truncated: boolean }
  /** The Elements panel: the selected element's matching rules, box and computed values (`seq`: which request it answers). */
    | InspectedMessage
  /** Pick mode: the element under the pointer (-1: none), the one clicked, or pick mode ended without a click. */
    | { type: 'hovered', node: number }
    | { type: 'picked', node: number }
    | { type: 'pickEnd' }
  /** A recorded load (chapter 5): a batch of steps, checked by `readSteps`. */
    | { type: 'steps', steps: RecordedStep[] }
  /** The recording ended: the page's Stop, the step cap or values too slow to read; how many steps it posted. */
    | { type: 'recordEnd', reason: RecordEndReason, count: number }
  /** A recorded profile (chapter 6), at Stop or at its cap: checked by `readProfile`. */
    | { type: 'profile', profile: Profile }
  /** While a profile records: the work counted so far and how many actions. */
    | { type: 'profileTick', work: number, actions: number }
  /** Chapter 7: the shop's server answered a request (numbers only; the Logs panel's lines come from the level's data). */
    | ServerLogMessage

export interface InspectedMessage extends Inspected {
  type: 'inspected'
  seq: number
}

/** A header as name and value (names lower case, in the order they were sent). */
export type HeaderPair = [name: string, value: string]

export interface RequestMessage {
  type: 'request'
  id: number
  method: string
  url: string
  headers: HeaderPair[]
  body: string | null
  stack: string
}

/** How a request failed without an answer the app can read: refused by CORS, no connection, cancelled. */
export type RequestFailure = 'cors' | 'network' | 'aborted'

export interface ResponseMessage {
  type: 'response'
  id: number
  /** null when no answer arrived (no connection, cancelled, a refused preflight). */
  status: number | null
  statusText: string
  headers: HeaderPair[]
  /** null without a body the page may show (a failure, a 204). */
  body: string | null
  failure: RequestFailure | null
  /** Milliseconds from sending to the answer. */
  time: number
}

const MAX_TEXT = 10_000
const MAX_ARGS = 50
const MAX_FILES = 200
const MAX_HEADERS = 50
const MAX_ATTRS = 12
const MAX_ATTR_TEXT = 200
const MAX_CHAIN = 64
const MAX_COMPUTED = 30
const LEVELS: readonly ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug']
const FAILURES: readonly RequestFailure[] = ['cors', 'network', 'aborted']
const RECORD_ENDS: readonly RecordEndReason[] = ['stopped', 'steps', 'slow', 'work']

const text = (value: unknown): string | null => typeof value === 'string' ? value.slice(0, MAX_TEXT) : null
const textOrNull = (value: unknown): string | null | undefined => value === null ? null : text(value) ?? undefined
const count = (value: unknown): number | null | undefined => {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const whole = (value: unknown, max: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined

/** Header pairs of plain text (at most MAX_HEADERS); null when they are not that. */
function headerPairs(value: unknown): HeaderPair[] | null {
  if (!Array.isArray(value)) return null
  const pairs: HeaderPair[] = []
  for (const pair of value.slice(0, MAX_HEADERS)) {
    if (!Array.isArray(pair) || pair.length !== 2) return null
    const name = text(pair[0])
    const content = text(pair[1])
    if (name === null || content === null) return null
    pairs.push([name, content])
  }
  return pairs
}

const cut = (value: unknown, max: number): string | null => typeof value === 'string' ? value.slice(0, max) : null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
/** A whole number from -1 (none) up. */
const nodeId = (value: unknown): number | undefined => value === -1 ? -1 : whole(value, Number.MAX_SAFE_INTEGER)
const record = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Pairs of plain text, at most `max`, each cut at `length`; null when they are not that. */
function textPairs(value: unknown, max: number, length: number): [string, string][] | null {
  if (!Array.isArray(value)) return null
  const pairs: [string, string][] = []
  for (const pair of value.slice(0, max)) {
    if (!Array.isArray(pair) || pair.length !== 2) return null
    const name = cut(pair[0], length)
    const content = cut(pair[1], length)
    if (name === null || content === null) return null
    pairs.push([name, content])
  }
  return pairs
}

/** A snapshot element: plain data, its id its place in the list, its parent before it. */
function domNode(value: unknown, index: number): DomNode | null {
  const raw = record(value)
  if (!raw || raw.id !== index) return null
  const parent = nodeId(raw.parent)
  const tag = typeof raw.tag === 'string' && /^[a-z][a-z0-9-]{0,63}$/i.test(raw.tag) ? raw.tag.toLowerCase() : null
  const attrs = textPairs(raw.attrs, MAX_ATTRS, MAX_ATTR_TEXT)
  const text = raw.text === null ? null : cut(raw.text, MAX_ATTR_TEXT)
  if (parent === undefined || parent >= index || tag === null || attrs === null || (raw.text !== null && text === null)) return null
  if (attrs.some(([name]) => !/^[^\s"'<>/=]{1,64}$/.test(name))) return null
  if (typeof raw.shown !== 'boolean' || typeof raw.overflows !== 'boolean') return null
  return { id: index, parent, tag, attrs, text, shown: raw.shown, overflows: raw.overflows }
}

/** A list of whole numbers (at most `max`); null when it is not one. */
function wholes(value: unknown, max: number): number[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const list = value.map(each => whole(each, Number.MAX_SAFE_INTEGER))
  return list.some(each => each === undefined) ? null : list as number[]
}

function sides(value: unknown): Sides | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const [top, right, bottom, left] = value as unknown[]
  return finite(top) && finite(right) && finite(bottom) && finite(left) ? [top, right, bottom, left] : null
}

function boxModel(value: unknown): BoxModel | null | undefined {
  if (value === null) return null
  const raw = record(value)
  if (!raw || !finite(raw.width) || !finite(raw.height)) return undefined
  const padding = sides(raw.padding)
  const border = sides(raw.border)
  const margin = sides(raw.margin)
  return padding && border && margin ? { width: raw.width, height: raw.height, padding, border, margin } : undefined
}

function scrollSize(value: unknown): ScrollSize | null | undefined {
  if (value === null) return null
  const raw = record(value)
  if (!raw) return undefined
  const { scrollWidth, clientWidth, scrollHeight, clientHeight } = raw
  if (!finite(scrollWidth) || !finite(clientWidth) || !finite(scrollHeight) || !finite(clientHeight)) return undefined
  return { scrollWidth, clientWidth, scrollHeight, clientHeight }
}

function inspectedLevel(value: unknown): InspectedLevel | null {
  const raw = record(value)
  if (!raw || !Array.isArray(raw.matches) || raw.matches.length > MAX_CSS_RULES) return null
  const node = nodeId(raw.node)
  const label = cut(raw.label, MAX_ATTR_TEXT)
  const inline = raw.inline === null ? null : text(raw.inline)
  if (node === undefined || label === null || (raw.inline !== null && inline === null)) return null
  const matches: InspectedMatch[] = []
  for (const each of raw.matches) {
    const match = record(each)
    const rule = whole(match?.rule, Number.MAX_SAFE_INTEGER)
    const selectors = wholes(match?.selectors, 64)
    if (rule === undefined || selectors === null) return null
    matches.push({ rule, selectors })
  }
  return { node, label, inline, matches }
}

function inspectedMessage(raw: Record<string, unknown>): InspectedMessage | null {
  const seq = whole(raw.seq, Number.MAX_SAFE_INTEGER)
  const node = nodeId(raw.node)
  const box = boxModel(raw.box)
  const scroll = scrollSize(raw.scroll)
  const computed = textPairs(raw.computed, MAX_COMPUTED, MAX_ATTR_TEXT)
  if (seq === undefined || node === undefined || typeof raw.found !== 'boolean' || box === undefined || scroll === undefined || computed === null) return null
  if (!Array.isArray(raw.chain) || raw.chain.length > MAX_CHAIN || !Array.isArray(raw.invalid) || raw.invalid.length > MAX_CSS_RULES) return null
  const chain = raw.chain.map(inspectedLevel)
  if (chain.some(level => level === null)) return null
  const invalid: Inspected['invalid'] = []
  for (const each of raw.invalid) {
    const entry = record(each)
    const rule = whole(entry?.rule, Number.MAX_SAFE_INTEGER)
    const declarations = wholes(entry?.declarations, 500)
    if (rule === undefined || declarations === null) return null
    invalid.push({ rule, declarations })
  }
  return { type: 'inspected', seq, node, found: raw.found, chain: chain as InspectedLevel[], invalid, box, computed, scroll }
}

/** What the bridge's first message says (it carries the ports the load's messages come over). */
export const BRIDGE_HELLO = 'grindstone:bridge'

/** The bridge's first message of the load with this token: the page takes its two ports (to the page, to the bridge). */
export function isBridgeHello(data: unknown, token: string): boolean {
  if (typeof data !== 'object' || data === null) return false
  const raw = data as Record<string, unknown>
  return raw.type === BRIDGE_HELLO && typeof raw.token === 'string' && raw.token === token
}

/** The message as plain data when it is a well-formed bridge message (read from the load's own port); null for anything else. */
export function readBridgeMessage(data: unknown): BridgeMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const raw = data as Record<string, unknown>
  switch (raw.type) {
    case 'files': {
      if (typeof raw.urls !== 'object' || raw.urls === null) return null
      const urls: Record<string, string> = {}
      for (const [url, path] of Object.entries(raw.urls).slice(0, MAX_FILES)) {
        if (url.startsWith('blob:') && typeof path === 'string') urls[url] = path
      }
      return { type: 'files', urls }
    }
    case 'console': {
      const level = LEVELS.find(each => each === raw.level)
      const stack = text(raw.stack)
      if (!level || stack === null || !Array.isArray(raw.args)) return null
      const args = raw.args.slice(0, MAX_ARGS).map(text)
      if (args.some(arg => arg === null)) return null
      return { type: 'console', level, args: args as string[], stack }
    }
    case 'error': {
      const message = text(raw.message)
      const name = textOrNull(raw.name)
      const stack = textOrNull(raw.stack)
      const url = textOrNull(raw.url)
      const line = count(raw.line)
      const column = count(raw.column)
      if ((raw.kind !== 'error' && raw.kind !== 'rejection') || message === null || [name, stack, url, line, column].includes(undefined)) return null
      return { type: 'error', kind: raw.kind, name: name!, message, stack: stack!, url: url!, line: line!, column: column! }
    }
    case 'ready':
    case 'done':
      return { type: raw.type }
    case 'probe': {
      const id = text(raw.id)
      const value = typeof raw.value === 'string' ? text(raw.value) : count(raw.value)
      const error = textOrNull(raw.error)
      if (id === null || typeof raw.ok !== 'boolean' || value === undefined || error === undefined) return null
      return { type: 'probe', id, ok: raw.ok, value, error }
    }
    case 'result': {
      if (typeof raw.id !== 'number') return null
      if (raw.ok === true) {
        const value = text(raw.value)
        return value === null ? null : { type: 'result', id: raw.id, ok: true, value }
      }
      const message = text(raw.message)
      const name = textOrNull(raw.name)
      const stack = textOrNull(raw.stack)
      if (raw.ok !== false || message === null || name === undefined || stack === undefined) return null
      return { type: 'result', id: raw.id, ok: false, name, message, stack }
    }
    case 'request': {
      const id = whole(raw.id, Number.MAX_SAFE_INTEGER)
      const method = typeof raw.method === 'string' && /^[A-Za-z]{1,16}$/.test(raw.method) ? raw.method : null
      const url = text(raw.url)
      const headers = headerPairs(raw.headers)
      const body = textOrNull(raw.body)
      const stack = text(raw.stack)
      if (id === undefined || method === null || url === null || headers === null || body === undefined || stack === null) return null
      return { type: 'request', id, method, url, headers, body, stack }
    }
    case 'response': {
      const id = whole(raw.id, Number.MAX_SAFE_INTEGER)
      const status = raw.status === null ? null : whole(raw.status, 999)
      const statusText = text(raw.statusText)
      const headers = headerPairs(raw.headers)
      const body = textOrNull(raw.body)
      const failure = raw.failure === null ? null : FAILURES.find(each => each === raw.failure)
      const time = whole(raw.time, Number.MAX_SAFE_INTEGER)
      if (id === undefined || status === undefined || statusText === null || headers === null || body === undefined || failure === undefined || time === undefined) return null
      return { type: 'response', id, status, statusText, headers, body, failure, time }
    }
    case 'netlog': {
      const message = text(raw.text)
      const stack = text(raw.stack)
      if (message === null || stack === null) return null
      return { type: 'netlog', text: message, stack }
    }
    case 'dom': {
      if (!Array.isArray(raw.nodes) || typeof raw.truncated !== 'boolean') return null
      const nodes = raw.nodes.slice(0, MAX_DOM_NODES).map(domNode)
      if (nodes.some(node => node === null)) return null
      return { type: 'dom', nodes: nodes as DomNode[], truncated: raw.truncated || raw.nodes.length > MAX_DOM_NODES }
    }
    case 'inspected':
      return inspectedMessage(raw)
    case 'hovered': {
      const node = nodeId(raw.node)
      return node === undefined ? null : { type: 'hovered', node }
    }
    case 'picked': {
      const node = whole(raw.node, Number.MAX_SAFE_INTEGER)
      return node === undefined ? null : { type: 'picked', node }
    }
    case 'pickEnd':
      return { type: 'pickEnd' }
    case 'steps': {
      const steps = readSteps(raw.steps)
      return steps ? { type: 'steps', steps } : null
    }
    case 'profile': {
      const profile = readProfile(raw)
      return profile ? { type: 'profile', profile } : null
    }
    case 'profileTick': {
      const work = whole(raw.work, Number.MAX_SAFE_INTEGER)
      const actions = whole(raw.actions, Number.MAX_SAFE_INTEGER)
      return work !== undefined && actions !== undefined ? { type: 'profileTick', work, actions } : null
    }
    case 'serverlog': {
      const id = whole(raw.id, Number.MAX_SAFE_INTEGER)
      const route = raw.route === -1 ? -1 : whole(raw.route, 9999)
      const answer = raw.answer === -1 ? -1 : whole(raw.answer, 9999)
      const status = whole(raw.status, 999)
      const at = whole(raw.at, 1e9)
      const time = whole(raw.time, 1e9)
      if (id === undefined || route === undefined || answer === undefined || status === undefined || at === undefined || time === undefined) return null
      return { type: 'serverlog', id, route, answer, status, at, time }
    }
    case 'recordEnd': {
      const reason = RECORD_ENDS.find(each => each === raw.reason)
      const total = whole(raw.count, Number.MAX_SAFE_INTEGER)
      return reason && total !== undefined ? { type: 'recordEnd', reason, count: total } : null
    }
    default:
      return null
  }
}

/** What one Console line shows: its level (input and result for the Console input), text, source link and trace. */
export interface ConsoleEntryBody {
  level: ConsoleLevel | 'input' | 'result'
  text: string
  /** Where it came from in the level's files: the link on the right. */
  source: SourceLine | null
  /** An error's stack in the level's files, top first (the bridge and the browser left out). */
  frames: TraceFrame[]
}

const errorText = (name: string | null, message: string) => name ? (message ? `${name}: ${message}` : name) : message

/** A message that names a module by its blob URL (Firefox: "The requested module 'blob:null/…'") names the file instead. */
const withFileNames = (text: string, mapping: SourceMapping) =>
  text.includes('blob:') ? text.replace(/blob:[^\s'"`)]+/g, url => mapping.urls[url] ?? url) : text

const lineOf = (frame: TraceFrame | undefined): SourceLine | null => frame ? { path: frame.path, line: frame.line } : null

/** The Console line for a message; null for the bridge's own messages (files, ready, probes, done) and the Network panel's. */
export function consoleEntry(message: BridgeMessage, mapping: SourceMapping): ConsoleEntryBody | null {
  switch (message.type) {
    case 'console': {
      const frames = mapFrames(parseStack(message.stack), mapping)
      return { level: message.level, text: withFileNames(message.args.join(' '), mapping), source: lineOf(frames[0]), frames: message.level === 'error' ? frames : [] }
    }
    case 'error': {
      const frames = message.stack ? mapFrames(parseStack(message.stack), mapping) : []
      return {
        level: 'error',
        text: withFileNames(`${message.kind === 'rejection' ? 'Uncaught (in promise)' : 'Uncaught'} ${errorText(message.name, message.message)}`, mapping),
        source: lineOf(frames[0]) ?? sourceOf(message.url, message.line, mapping),
        frames
      }
    }
    case 'netlog':
      // the browser's line links the code that sent the request (its initiator); it has no trace of its own
      return { level: 'error', text: message.text, source: lineOf(mapFrames(parseStack(message.stack), mapping)[0]), frames: [] }
    case 'result': {
      if (message.ok) return { level: 'result', text: message.value, source: null, frames: [] }
      const frames = message.stack ? mapFrames(parseStack(message.stack), mapping) : []
      return { level: 'error', text: withFileNames(`Uncaught ${errorText(message.name, message.message)}`, mapping), source: lineOf(frames[0]), frames }
    }
    default:
      return null
  }
}

/** What a check run saw, from all its messages: the goals read this. */
export function observe(messages: readonly BridgeMessage[], bridgeLine: number): Observation {
  const mapping: SourceMapping = { urls: {}, bridgeLine }
  const observation: Observation = { finished: false, errors: [], probes: {}, probeErrors: {}, logs: [] }
  const errors: ObservedError[] = observation.errors
  for (const message of messages) {
    if (message.type === 'files') mapping.urls = { ...mapping.urls, ...message.urls }
    else if (message.type === 'done') observation.finished = true
    else if (message.type === 'probe') {
      if (message.ok) observation.probes[message.id] = message.value
      else observation.probeErrors[message.id] = message.error ?? 'The probe could not run'
    } else if (message.type === 'error' || message.type === 'console' || message.type === 'netlog') {
      const entry = consoleEntry(message, mapping)!
      if (message.type === 'error') errors.push({ kind: message.kind, text: entry.text, source: entry.source })
      else if (message.type === 'netlog') errors.push({ kind: 'network', text: entry.text, source: entry.source })
      else if (message.level === 'error') errors.push({ kind: 'console', text: entry.text, source: entry.source })
      else if (message.level === 'log' || message.level === 'info') observation.logs.push(entry.text)
    }
  }
  return observation
}

/**
 * One observation from the frames of a check run at several widths (checkFrames): it finished when all did; each error
 * once (loading the app in two frames reports the same error twice); every probe; the first frame's logs.
 */
export function mergeObservations(observations: readonly Observation[]): Observation {
  const [first, ...others] = observations
  if (!first || !others.length) return first ?? { finished: false, errors: [], probes: {}, probeErrors: {}, logs: [] }
  const seen = new Set<string>()
  const errors = observations.flatMap(observation => observation.errors).filter((error) => {
    const key = JSON.stringify([error.kind, error.text, error.source])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    finished: observations.every(observation => observation.finished),
    errors,
    probes: Object.assign({}, ...observations.map(observation => observation.probes)),
    probeErrors: Object.assign({}, ...observations.map(observation => observation.probeErrors)),
    logs: first.logs
  }
}
