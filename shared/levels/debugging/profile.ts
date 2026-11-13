// A recorded profile (chapter 6, ADR 0007 "Performance"; docs/features/levels.md, "The profile"): what the counting
// recorder posts at Stop, read on Grindstone's side, and what the Performance panel shows of it. Nothing here is a
// clock: work is counted (one unit per statement of the app's code that ran), renders are calls of a function that
// changed the page, and a request's times are the fake backend's scripted delays on the server's clock (it moves only
// when an answer arrives), so the same run shows the same numbers in every browser. Everything from the frame is
// untrusted: `readProfile` keeps only a well-formed profile (whole numbers, short texts, capped tables) or drops it
// whole, and never throws. Pure: no DOM.
import { PROFILE_LIMITS } from './recorder'
import type { FunctionInfo, SkipReason, StepPoint } from './instrument'
import type { NetworkEntry } from './network'
import type { Observation, Probe, SourceLine } from './types'

/** What started an action: the page's load, or what the customer did (a click, typing, a change, Enter, a form). */
export type ActionKind = 'load' | 'click' | 'input' | 'change' | 'keydown' | 'submit'

/** How often a function ran in an action and its work: its own statements (self), and with what it called (total). */
export interface FunctionCount {
  fn: number
  calls: number
  self: number
  total: number
}

/** A statement that changed the page: how often (updates) and how many nodes it added, removed or changed. */
export interface LineChange {
  point: number
  updates: number
  nodes: number
}

/** A function's renders in an action: its calls that changed the page, and the nodes they changed. */
export interface RenderCount {
  fn: number
  renders: number
  nodes: number
}

/** One action of a recording: the page's load, then each thing the customer did, with what it cost. */
export interface ProfileAction {
  kind: ActionKind
  /** The element it happened on (`button.add`); '' for the load. */
  target: string
  /** What the customer saw or typed: a button's text, a field's value, 'checked', 'Enter'. */
  label: string
  /** When it started on the server's clock (ms). */
  at: number
  work: number
  /** Actions past the cap, counted into this one. */
  more: number
  fns: FunctionCount[]
  dom: LineChange[]
  renders: RenderCount[]
  /** The requests sent during it (the backend's ids), in order. */
  requests: number[]
}

/** A request on the server's clock: sent at `start`, answered (or cancelled) at `end`; null while on its way. */
export interface RequestTime {
  id: number
  start: number
  end: number | null
}

/** Why counting ended: the page's Stop, or the work cap. */
export type ProfileEnd = 'stopped' | 'work'

export interface Profile {
  ended: ProfileEnd
  work: number
  actions: ProfileAction[]
  requests: RequestTime[]
}

const KINDS: readonly ActionKind[] = ['load', 'click', 'input', 'change', 'keydown', 'submit']
const ENDS: readonly ProfileEnd[] = ['stopped', 'work']
/** The largest number a count or a time may be (anything bigger is not from the recorder). */
const MAX_NUMBER = 1e9

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_NUMBER
const plain = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Rows of whole numbers, `size` each, at most `max`; null when they are not that. */
function rows(value: unknown, size: number, max: number): number[][] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const list: number[][] = []
  for (const each of value) {
    if (!Array.isArray(each) || each.length !== size || !each.every(whole)) return null
    list.push(each as number[])
  }
  return list
}

function profileAction(value: unknown): ProfileAction | null {
  const raw = plain(value)
  if (!raw) return null
  const kind = KINDS.find(each => each === raw.kind)
  const { target, label, at, work, more } = raw
  if (!kind || typeof target !== 'string' || typeof label !== 'string' || !whole(at) || !whole(work) || !whole(more)) return null
  const fns = rows(raw.fns, 4, PROFILE_LIMITS.maxRows)
  const dom = rows(raw.dom, 3, PROFILE_LIMITS.maxRows)
  const renders = rows(raw.renders, 3, PROFILE_LIMITS.maxRows)
  const requests = Array.isArray(raw.requests) && raw.requests.length <= PROFILE_LIMITS.maxRequests && raw.requests.every(whole) ? raw.requests as number[] : null
  if (!fns || !dom || !renders || !requests) return null
  return {
    kind,
    target: target.slice(0, 120),
    label: label.slice(0, 60),
    at,
    work,
    more,
    fns: fns.map(([fn, calls, self, total]) => ({ fn: fn!, calls: calls!, self: self!, total: total! })),
    dom: dom.map(([point, updates, nodes]) => ({ point: point!, updates: updates!, nodes: nodes! })),
    renders: renders.map(([fn, count, nodes]) => ({ fn: fn!, renders: count!, nodes: nodes! })),
    requests: [...requests]
  }
}

/** A `profile` message's profile, or null when it is not a well-formed one (it is dropped whole). Never throws. */
export function readProfile(raw: Record<string, unknown>): Profile | null {
  const ended = ENDS.find(each => each === raw.reason)
  if (!ended || !whole(raw.work) || !Array.isArray(raw.actions) || raw.actions.length > PROFILE_LIMITS.maxActions || !Array.isArray(raw.requests)) return null
  if (raw.requests.length > PROFILE_LIMITS.maxRequests) return null
  const actions: ProfileAction[] = []
  for (const each of raw.actions) {
    const action = profileAction(each)
    if (!action) return null
    actions.push(action)
  }
  // a request is sent once, in one action, and the recorder keeps at most maxRequests of them: anything else is forged
  // (and would make the timeline's lookups slow)
  const sent = new Set<number>()
  for (const id of actions.flatMap(action => action.requests)) {
    if (sent.has(id) || sent.size >= PROFILE_LIMITS.maxRequests) return null
    sent.add(id)
  }
  const requests: RequestTime[] = []
  const timed = new Set<number>()
  for (const each of raw.requests) {
    if (!Array.isArray(each) || each.length !== 3) return null
    const [id, start, end] = each as unknown[]
    if (!whole(id) || !whole(start) || !(end === -1 || whole(end)) || timed.has(id)) return null
    timed.add(id)
    requests.push({ id, start, end: end === -1 ? null : end as number })
  }
  return { ended, work: raw.work, actions, requests }
}

/** What the profile knows about the code it counted (from the instrumentation of the recorded files). */
export interface ProfileMap {
  points: readonly StepPoint[]
  functions: readonly FunctionInfo[]
}

/** The profile with only the rows that fit this instrumentation (a function or a point it has); anything else is dropped. */
export function fittingProfile(profile: Profile, map: ProfileMap): Profile {
  const fn = (index: number) => index < map.functions.length
  const point = (index: number) => index < map.points.length
  return {
    ...profile,
    actions: profile.actions.map(action => ({
      ...action,
      fns: action.fns.filter(row => fn(row.fn)),
      dom: action.dom.filter(row => point(row.point)),
      renders: action.renders.filter(row => fn(row.fn))
    }))
  }
}

/** The actions a view covers: one (by its index), or all of them (null). */
const chosen = (profile: Profile, action: number | null): ProfileAction[] =>
  action === null ? profile.actions : profile.actions[action] ? [profile.actions[action]] : []

/** A function's line and name as the panel shows them; `module`: a file's top level (it runs as the file loads). */
export interface FunctionPlace extends SourceLine {
  fn: number
  name: string
  module: boolean
}

function placeOf(map: ProfileMap, fn: number): FunctionPlace {
  const info = map.functions[fn]!
  return { fn, name: info.name, path: info.path, line: info.line, module: info.module === true }
}

/** By a number (biggest first), then by file and line, so the order never depends on the browser. */
const byPlace = (a: SourceLine, b: SourceLine) => a.path.localeCompare(b.path) || a.line - b.line

/** One row of the Functions table: how often it ran in the view's actions, its own work and its total. */
export interface FunctionRow extends FunctionPlace {
  calls: number
  self: number
  total: number
}

/** The functions that ran in the view (one action, or all), the most total work first (then self, then where they are). */
export function functionRows(profile: Profile, map: ProfileMap, action: number | null): FunctionRow[] {
  const sums = new Map<number, { calls: number, self: number, total: number }>()
  for (const each of chosen(profile, action)) {
    for (const row of each.fns) {
      const sum = sums.get(row.fn) ?? { calls: 0, self: 0, total: 0 }
      sums.set(row.fn, { calls: sum.calls + row.calls, self: sum.self + row.self, total: sum.total + row.total })
    }
  }
  return [...sums.entries()]
    .filter(([fn]) => map.functions[fn] !== undefined)
    .map(([fn, sum]) => ({ ...placeOf(map, fn), ...sum }))
    .sort((a, b) => b.total - a.total || b.self - a.self || byPlace(a, b))
}

/** A line that changed the page, with how often and how many nodes. */
export interface ChangedLine extends SourceLine {
  updates: number
  nodes: number
}

/** One row of the Renders table: a function whose calls changed the page, and the lines of it that did. */
export interface RenderRow extends FunctionPlace {
  renders: number
  nodes: number
  lines: ChangedLine[]
}

/** The functions that changed the page in the view, the most nodes first, each with its lines that did. */
export function renderRows(profile: Profile, map: ProfileMap, action: number | null): RenderRow[] {
  const renders = new Map<number, { renders: number, nodes: number }>()
  const lines = new Map<number, Map<number, ChangedLine>>()
  for (const each of chosen(profile, action)) {
    for (const row of each.renders) {
      const sum = renders.get(row.fn) ?? { renders: 0, nodes: 0 }
      renders.set(row.fn, { renders: sum.renders + row.renders, nodes: sum.nodes + row.nodes })
    }
    for (const row of each.dom) {
      const point = map.points[row.point]
      if (!point) continue
      const own = lines.get(point.fn) ?? new Map<number, ChangedLine>()
      lines.set(point.fn, own)
      const line = own.get(point.line) ?? { path: point.path, line: point.line, updates: 0, nodes: 0 }
      own.set(point.line, { ...line, updates: line.updates + row.updates, nodes: line.nodes + row.nodes })
    }
  }
  return [...renders.entries()]
    .filter(([fn]) => map.functions[fn] !== undefined)
    .map(([fn, sum]) => ({
      ...placeOf(map, fn),
      ...sum,
      lines: [...(lines.get(fn)?.values() ?? [])].sort((a, b) => b.nodes - a.nodes || byPlace(a, b))
    }))
    .sort((a, b) => b.nodes - a.nodes || b.renders - a.renders || byPlace(a, b))
}

/** One row of the Requests timeline: the request, its action and its times on the server's clock (from the view's start). */
export interface RequestRow {
  id: number
  /** The Network panel's entry (method, address, status, Sent from); null when it was not listed (past its cap). */
  entry: NetworkEntry | null
  action: number
  start: number
  /** null: still on its way when the recording ended. */
  end: number | null
  /**
   * In the same action, sent the moment this request's answer arrived (a waterfall: it waited for it); null when
   * nothing of its action had just answered.
   */
  after: number | null
  /** The same request was sent before (same method, address and body): the earlier one's id. */
  repeats: number | null
}

const sameRequest = (a: NetworkEntry, b: NetworkEntry) => a.method === b.method && a.url === b.url && a.requestBody === b.requestBody

/**
 * The requests of the view in the order sent, with their times from the view's start (an action's start, or the
 * recording's), what each was sent after (the answer that had just arrived, when one had: a waterfall) and whether it
 * repeats an earlier request of the recording.
 */
export function requestRows(profile: Profile, entries: readonly NetworkEntry[], action: number | null): RequestRow[] {
  const times = new Map(profile.requests.map(each => [each.id, each]))
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const base = action === null ? 0 : profile.actions[action]?.at ?? 0
  const all: { id: number, action: number, start: number, end: number | null }[] = []
  profile.actions.forEach((each, index) => {
    for (const id of each.requests) {
      const time = times.get(id)
      if (time) all.push({ id, action: index, start: time.start, end: time.end })
    }
  })
  const shown = action === null ? all : all.filter(each => each.action === action)
  return shown.map((each) => {
    const entry = byId.get(each.id) ?? null
    // within its action only: a request the customer's next action sends is not waiting for an answer of the last one
    const answered = all.find(other => other.action === each.action && other.id !== each.id && other.end === each.start && other.start < each.start)
    const earlier = entry ? all.find(other => other.id < each.id && byId.has(other.id) && sameRequest(byId.get(other.id)!, entry)) : undefined
    return {
      id: each.id,
      entry,
      action: each.action,
      start: each.start - base,
      end: each.end === null ? null : each.end - base,
      after: answered?.id ?? null,
      repeats: earlier?.id ?? null
    }
  })
}

/** Where the timeline's axis ends: the last answer (or a request still on its way) of the rows, at least 1 ms. */
export function timelineEnd(rows: readonly RequestRow[]): number {
  return Math.max(1, ...rows.map(row => row.end ?? row.start))
}

/** The view's totals: work, renders and the nodes they changed, requests, and the server time until the last answer. */
export interface ProfileSummary {
  work: number
  renders: number
  nodes: number
  requests: number
  /** From the view's start to its last answer, on the server's clock; null without a request that was answered. */
  serverTime: number | null
}

export function profileSummary(profile: Profile, entries: readonly NetworkEntry[], action: number | null): ProfileSummary {
  const actions = chosen(profile, action)
  const requests = requestRows(profile, entries, action)
  const ends = requests.flatMap(row => row.end === null ? [] : [row.end])
  return {
    work: actions.reduce((sum, each) => sum + each.work, 0),
    renders: actions.reduce((sum, each) => sum + each.renders.reduce((inner, row) => inner + row.renders, 0), 0),
    nodes: actions.reduce((sum, each) => sum + each.renders.reduce((inner, row) => inner + row.nodes, 0), 0),
    requests: requests.length,
    serverTime: ends.length ? Math.max(...ends) : null
  }
}

/** Every line the panel links for a profile (functions, the lines that changed the page, Sent from): find tasks are answered there. */
export function profileLines(profile: Profile, map: ProfileMap, entries: readonly NetworkEntry[]): string[] {
  const lines = new Set<string>()
  const add = (line: SourceLine | null) => line && lines.add(`${line.path}:${line.line}`)
  for (const row of functionRows(profile, map, null)) add(row)
  for (const row of renderRows(profile, map, null)) row.lines.forEach(add)
  for (const row of requestRows(profile, entries, null)) add(row.entry?.initiator ?? null)
  return [...lines]
}

// --- the check run's work probes ----------------------------------------------------------------------------------

/** The probes read the app's work, so its check run counts (the code runs instrumented, counting only). */
export function needsCounting(probes: readonly Probe[]): boolean {
  return probes.some(probe => probe.steps.some(step => 'work' in step))
}

/** Why work can't be counted when a file ran as written. */
const UNCOUNTED: Record<SkipReason, string> = {
  syntax: 'could not be read (a syntax error)',
  size: 'is too long to count',
  nesting: 'is nested too deeply to count',
  names: 'uses the recorder\'s own name',
  points: 'has more statements than can be counted',
  clash: 'declares a function twice, or a var with a function\'s name, in one function'
}

/**
 * A counting check run where a file ran as written (instrument.ts skipped it) did not count all the work: every probe
 * that reads work has no value then, only why (so no goal passes on a count that left code out).
 */
export function withUncounted(observation: Observation, probes: readonly Probe[], skipped: readonly { path: string, reason: SkipReason }[]): Observation {
  const first = skipped[0]
  if (!first) return observation
  const why = `${first.path} ${UNCOUNTED[first.reason]}, so it ran without counting: its work is not known`
  const counting = new Set(probes.filter(probe => probe.steps.some(step => 'work' in step)).map(probe => probe.id))
  const probeValues = Object.fromEntries(Object.entries(observation.probes).filter(([id]) => !counting.has(id)))
  const probeErrors = { ...observation.probeErrors, ...Object.fromEntries([...counting].map(id => [id, why])) }
  return { ...observation, probes: probeValues, probeErrors }
}
