// The Network panel's entries (docs/features/ui.md, "Network"): each request the app sent to the fake backend, as the
// bridge reported it, and its answer once it arrived; how the panel names, words and colours them. Pure: the panel only
// draws these, always as text (a body is never rendered as HTML).
import type { HeaderPair, RequestFailure, RequestMessage, ResponseMessage } from './messages'
import { SHOP_ORIGIN } from './sandbox'
import { mapFrames, parseStack } from './trace'
import type { SourceMapping } from './trace'
import type { SourceLine } from './types'

/** What arrived for a request: an answer, or how it failed. */
export interface NetworkResponse {
  status: number | null
  statusText: string
  headers: HeaderPair[]
  body: string | null
  failure: RequestFailure | null
  time: number
}

/** One row of the Network panel. */
export interface NetworkEntry {
  id: number
  method: string
  url: string
  /** What the list shows, like the browser's Network panel: the last part of the path, with the query ('search?q=cro'). */
  name: string
  requestHeaders: HeaderPair[]
  requestBody: string | null
  /** The line that sent it (the first frame in the level's files), like the browser's Initiator column. */
  initiator: SourceLine | null
  /** null while the request is on its way. */
  response: NetworkResponse | null
}

const SHOP = new URL(SHOP_ORIGIN).origin

/**
 * The name of a request in the list, as the browser's Network panel has it: the last part of its path with the query
 * ('search?q=cro', 'menu'; the host when the path is empty). The full address is in the details and the row's label.
 */
export function requestName(url: string): string {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/')
    const last = parts.at(-1) || (parts.length > 2 ? `${parts.at(-2)}/` : parsed.host)
    return last + parsed.search
  } catch {
    return url
  }
}

/** A request's address: its path (and query) on the shop, its whole address anywhere else (the tests' tables use it). */
export function requestAddress(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin === SHOP ? parsed.pathname + parsed.search : parsed.href
  } catch {
    return url
  }
}

/** A request as the panel lists it, with no answer yet. */
export function requestEntry(message: RequestMessage, mapping: SourceMapping): NetworkEntry {
  const frame = mapFrames(parseStack(message.stack), mapping)[0]
  return {
    id: message.id,
    method: message.method,
    url: message.url,
    name: requestName(message.url),
    requestHeaders: message.headers,
    requestBody: message.body,
    initiator: frame ? { path: frame.path, line: frame.line } : null,
    response: null
  }
}

/** The entries with this answer on its request (the others stay the same objects). */
export function withResponse(entries: readonly NetworkEntry[], message: ResponseMessage): NetworkEntry[] {
  const { status, statusText, headers, body, failure, time } = message
  // an answer to a request that isn't listed (past the cap) changes nothing: the same array, so nothing redraws
  if (!entries.some(entry => entry.id === message.id)) return entries as NetworkEntry[]
  return entries.map(entry => entry.id === message.id ? { ...entry, response: { status, statusText, headers, body, failure, time } } : entry)
}

const FAILED: Record<RequestFailure, string> = { cors: 'CORS error', network: 'failed', aborted: 'canceled' }

/** The status column: the code, or why there is none the app could read (as the browser's panel words it). */
export function statusLabel(entry: NetworkEntry): string {
  const response = entry.response
  if (!response) return 'pending'
  if (response.failure) return FAILED[response.failure]
  return String(response.status)
}

export type StatusTone = 'pending' | 'success' | 'neutral' | 'error'

/** The status's colour: 2xx success, 4xx/5xx and failures error, the rest neutral. */
export function statusTone(entry: NetworkEntry): StatusTone {
  const response = entry.response
  if (!response) return 'pending'
  if (response.failure === 'aborted') return 'neutral'
  if (response.failure) return 'error'
  const status = response.status ?? 0
  if (status >= 200 && status < 300) return 'success'
  return status >= 400 ? 'error' : 'neutral'
}

/** A request's time: ms, seconds from one second. */
export function durationText(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

const isJsonType = (headers: readonly HeaderPair[]) => headers.some(([name, value]) => name.toLowerCase() === 'content-type' && /\bjson\b/i.test(value))

/** A body as the panel shows it: JSON indented (a JSON type, or text that is a JSON object or list), anything else as it came. */
export function bodyView(body: string, headers: readonly HeaderPair[]): string {
  const trimmed = body.trim()
  if (!trimmed || (!isJsonType(headers) && !/^[[{]/.test(trimmed))) return body
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return body
  }
}
