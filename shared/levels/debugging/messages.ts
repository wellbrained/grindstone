// What the bridge in the sealed frame posts, read on Grindstone's side (docs/features/ui.md, "Sandbox and bridge").
// Everything from the frame is untrusted: `readBridgeMessage` keeps only well-formed messages of the current load (its
// token) and only plain strings and numbers; the page shows them as text, never as HTML. From the messages come the
// Console's entries (`consoleEntry`) and what a check run saw (`observe`), which the goals read. Pure: no DOM.
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

const MAX_TEXT = 10_000
const MAX_ARGS = 50
const MAX_FILES = 200
const LEVELS: readonly ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug']

const text = (value: unknown): string | null => typeof value === 'string' ? value.slice(0, MAX_TEXT) : null
const textOrNull = (value: unknown): string | null | undefined => value === null ? null : text(value) ?? undefined
const count = (value: unknown): number | null | undefined => {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The message as plain data when it is a well-formed bridge message of this load; null for anything else. */
export function readBridgeMessage(data: unknown, token: string): BridgeMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const raw = data as Record<string, unknown>
  if (raw.grindstone !== token) return null
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

/** The Console line for a message; null for the bridge's own messages (files, ready, probes, done). */
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
    } else if (message.type === 'error' || message.type === 'console') {
      const entry = consoleEntry(message, mapping)!
      if (message.type === 'error') errors.push({ kind: message.kind, text: entry.text, source: entry.source })
      else if (message.level === 'error') errors.push({ kind: 'console', text: entry.text, source: entry.source })
      else if (message.level === 'log' || message.level === 'info') observation.logs.push(entry.text)
    }
  }
  return observation
}
