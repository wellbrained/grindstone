// A recorded run (chapter 5, ADR 0007 "Breakpoints"; docs/features/levels.md, "The recording"): the steps the recorder
// posted, read on Grindstone's side, and the stepping model the Debugger panel moves through them with. Nothing is
// paused: a step is a moment of the run that already happened, with the call stack and the values of that moment, so the
// panel can go forward and back (Step over, into, out, back, Resume to the next or previous breakpoint, a scrubber).
// Everything from the frame is untrusted: `readSteps` keeps only well-formed steps (plain numbers, strings and the
// recorder's value shapes, with caps on size and depth) and never throws. Pure: no DOM.
import type { FunctionInfo, ScopeKind, StepPoint } from './instrument'

/** A value as it was at a step (recorder.ts makes these; `readSteps` checks them). */
export type RecordedValue
  = | { t: 'undefined' | 'uninitialized' | 'null' | 'getter' | 'promise' }
    | { t: 'boolean', v: boolean }
    | { t: 'number', v: number }
    /** `full`: the string's length when it was cut to RECORD_LIMITS.maxString characters. */
    | { t: 'string', v: string, full?: number }
    /** One line: a bigint, a symbol, a function (`ƒ name(a, b)`), an element (`button.add`), an error, a date, a regexp. */
    | { t: 'bigint' | 'symbol' | 'function' | 'element' | 'error' | 'date' | 'regexp', v: string }
    /**
     * An object: its id in this recording, class name ('' for a plain object), length or size (arrays, maps, sets), the
     * entries shown (null: not opened, it was too deep) and how many more there are.
     */
    | { t: 'object', id: number, c: string, n: number | null, e: [key: string, value: RecordedValue][] | null, more: number }
    /** An object that contains itself: the one with this id further up. */
    | { t: 'ref', id: number }

export type RecordedObject = Extract<RecordedValue, { t: 'object' }>

/** One frame of a step's call stack: the call, its function, the statement it was at. */
export interface RecordedFrame {
  inv: number
  fn: number
  /** -1: it had not reached a statement yet. */
  point: number
  /** A frame of the call that started an async function now back from an `await` (Chrome's async stack). */
  async: boolean
}

/** One moment of the run: the statement about to run, the call running it, the call stack (top first) and the values it could see. */
export interface RecordedStep {
  point: number
  inv: number
  frames: RecordedFrame[]
  /** In the order of the point's scopes and their names. */
  values: RecordedValue[]
}

/** The most steps one message may carry (the recorder sends RECORD_LIMITS.batch). */
const MAX_BATCH = 500
/** Values a step may hold in all (the recorder stops opening objects after RECORD_LIMITS.maxNodes). */
const MAX_STEP_NODES = 1200
const MAX_DEPTH = 6
const MAX_ENTRIES = 64
const MAX_TEXT = 500
const MAX_FRAMES = 40
const MAX_VALUES = 80

const SIMPLE = new Set(['undefined', 'uninitialized', 'null', 'getter', 'promise'])
const LINES = new Set(['bigint', 'symbol', 'function', 'element', 'error', 'date', 'regexp'])

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
const plain = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

/** A recorded value as plain data, or null when it is not one (or it is too big or too deep). */
function recordedValue(raw: unknown, depth: number, left: { nodes: number }): RecordedValue | null {
  if (--left.nodes < 0 || depth > MAX_DEPTH) return null
  const value = plain(raw)
  if (!value || typeof value.t !== 'string') return null
  const t = value.t
  if (SIMPLE.has(t)) return { t } as RecordedValue
  if (t === 'boolean') return typeof value.v === 'boolean' ? { t, v: value.v } : null
  if (t === 'number') return typeof value.v === 'number' ? { t, v: value.v } : null
  if (t === 'string') {
    if (typeof value.v !== 'string' || (value.full !== undefined && !whole(value.full))) return null
    const v = value.v.slice(0, MAX_TEXT)
    return value.full === undefined && v.length === value.v.length ? { t, v } : { t, v, full: whole(value.full) ? value.full : value.v.length }
  }
  if (LINES.has(t)) return typeof value.v === 'string' ? { t, v: value.v.slice(0, MAX_TEXT) } as RecordedValue : null
  if (t === 'ref') return whole(value.id) ? { t, id: value.id } : null
  if (t !== 'object') return null
  const { id, c, n, e, more } = value
  if (!whole(id) || typeof c !== 'string' || !(n === null || whole(n)) || !whole(more)) return null
  if (e === null) return { t, id, c: c.slice(0, 80), n, e: null, more }
  if (!Array.isArray(e) || e.length > MAX_ENTRIES) return null
  const entries: [string, RecordedValue][] = []
  for (const pair of e) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') return null
    const inner = recordedValue(pair[1], depth + 1, left)
    if (!inner) return null
    entries.push([pair[0].slice(0, 200), inner])
  }
  return { t, id, c: c.slice(0, 80), n, e: entries, more }
}

/** One posted step (`[point, call, frames, asyncAt, values]`) as plain data, or null. */
function recordedStep(raw: unknown): RecordedStep | null {
  if (!Array.isArray(raw) || raw.length !== 5) return null
  const [point, inv, rawFrames, asyncAt, rawValues] = raw as unknown[]
  if (!whole(point) || !whole(inv) || !Array.isArray(rawFrames) || rawFrames.length > MAX_FRAMES) return null
  if (typeof asyncAt !== 'number' || !Number.isInteger(asyncAt) || asyncAt < -1 || asyncAt > rawFrames.length) return null
  if (!Array.isArray(rawValues) || rawValues.length > MAX_VALUES) return null
  const frames: RecordedFrame[] = []
  for (const [index, frame] of rawFrames.entries()) {
    if (!Array.isArray(frame) || frame.length !== 3) return null
    const [call, fn, at] = frame as unknown[]
    if (!whole(call) || !whole(fn) || !(at === -1 || whole(at))) return null
    frames.push({ inv: call, fn, point: at as number, async: asyncAt >= 0 && index >= asyncAt })
  }
  const left = { nodes: MAX_STEP_NODES }
  const values: RecordedValue[] = []
  for (const each of rawValues) {
    const value = recordedValue(each, 0, left)
    if (!value) return null
    values.push(value)
  }
  return { point, inv, frames, values }
}

/** The steps of one `steps` message, or null when it is not a well-formed one (it is dropped whole). Never throws. */
export function readSteps(raw: unknown): RecordedStep[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_BATCH) return null
  const steps: RecordedStep[] = []
  for (const each of raw) {
    const step = recordedStep(each)
    if (!step) return null
    steps.push(step)
  }
  return steps
}

/** What the recording knows about the code it ran (from the instrumentation of the recorded files). */
export interface RecordingMap {
  points: readonly StepPoint[]
  functions: readonly FunctionInfo[]
}

/** The steps that belong to this instrumentation: their points, functions and values all fit (anything else is dropped). */
export function fittingSteps(steps: readonly RecordedStep[], map: RecordingMap): RecordedStep[] {
  const fits = (point: number) => point < map.points.length
  return steps.filter((step) => {
    const point = map.points[step.point]
    if (!point || step.values.length !== point.scopes.reduce((sum, scope) => sum + scope.names.length, 0)) return false
    return step.frames.every(frame => frame.fn < map.functions.length && (frame.point === -1 || fits(frame.point)))
  })
}

/** A scope at a step, with its values. */
export interface ScopeEntries {
  kind: ScopeKind
  name: string | null
  entries: [name: string, value: RecordedValue][]
}

/** The scopes a step could see, innermost first, with the values they held just before its statement ran. */
export function scopeAt(points: readonly StepPoint[], step: RecordedStep): ScopeEntries[] {
  const point = points[step.point]
  if (!point) return []
  let index = 0
  return point.scopes.map(scope => ({
    kind: scope.kind,
    name: scope.name,
    entries: scope.names.map(name => [name, step.values[index++] ?? { t: 'undefined' }] as [string, RecordedValue])
  }))
}

/** Every name a step could see and its value (the innermost scope wins): what a breakpoint's condition reads. */
export function scopeValues(points: readonly StepPoint[], step: RecordedStep): Map<string, RecordedValue> {
  const values = new Map<string, RecordedValue>()
  for (const scope of scopeAt(points, step)) {
    for (const [name, value] of scope.entries) if (!values.has(name)) values.set(name, value)
  }
  return values
}

// --- moving through the recording -----------------------------------------------------------------------------------

const onStack = (step: RecordedStep, call: number) => step.frames.some(frame => !frame.async && frame.inv === call)
const last = (steps: readonly RecordedStep[]) => Math.max(steps.length - 1, 0)

/** Step into: the very next step, wherever it is (into a call the line makes, or on). */
export function stepInto(steps: readonly RecordedStep[], at: number): number {
  return Math.min(at + 1, last(steps))
}

/** Step back: the step before. */
export function stepBack(at: number): number {
  return Math.max(at - 1, 0)
}

/**
 * Step over: the next step of the same call (past the calls this line makes; after an `await`, where the function goes
 * on once it is back), or, when the call has no more steps, the first step after it ended. The end when there is none.
 */
export function stepOver(steps: readonly RecordedStep[], at: number): number {
  const call = steps[at]?.inv
  if (call === undefined) return at
  for (let k = at + 1; k < steps.length; k++) if (steps[k]!.inv === call) return k
  for (let k = at + 1; k < steps.length; k++) if (!onStack(steps[k]!, call)) return k
  return last(steps)
}

/** Step out: the first step after the current call ended (or paused at an `await`), back in its caller or on. */
export function stepOut(steps: readonly RecordedStep[], at: number): number {
  const call = steps[at]?.inv
  if (call === undefined) return at
  for (let k = at + 1; k < steps.length; k++) if (!onStack(steps[k]!, call)) return k
  return last(steps)
}

/** A breakpoint on a line, with an optional condition ('' for none). */
export interface Breakpoint {
  path: string
  line: number
  condition: string
}

/** Where a step's statement is. */
export function stepLine(points: readonly StepPoint[], step: RecordedStep): { path: string, line: number } | null {
  const point = points[step.point]
  return point ? { path: point.path, line: point.line } : null
}

/**
 * The step is where the breakpoint's line starts running: on that line, and not a second statement of that line in the
 * same call right after the first (`if (a) return b`), so a line is hit once each time it runs. A `for` line stops at
 * its test, every round (round 0 too, with the loop's variables in the Scope), never at the statement itself.
 */
export function atBreakpoint(steps: readonly RecordedStep[], points: readonly StepPoint[], index: number, breakpoint: Pick<Breakpoint, 'path' | 'line'>): boolean {
  const step = steps[index]!
  const here = stepLine(points, step)
  if (!here || here.path !== breakpoint.path || here.line !== breakpoint.line || points[step.point]!.testFollows) return false
  /** The step at k is a statement of this line, in this call. */
  const sameLine = (k: number) => {
    const other = steps[k]
    if (!other || other.inv !== step.inv) return false
    const there = stepLine(points, other)
    return there !== null && there.path === here.path && there.line === here.line
  }
  // the for statement right before its round-0 test stands aside: the line started with whatever ran before it
  let before = index - 1
  if (sameLine(before) && points[steps[before]!.point]!.testFollows) before--
  return !sameLine(before)
}

/** Whether a breakpoint's condition holds at a step (always true without one). */
export type ConditionCheck = (breakpoint: Breakpoint, step: RecordedStep) => boolean

/** A step a breakpoint stops at, and which one. */
export interface Hit {
  index: number
  breakpoint: Breakpoint
}

function hitAt(steps: readonly RecordedStep[], points: readonly StepPoint[], index: number, breakpoints: readonly Breakpoint[], holds: ConditionCheck): Hit | null {
  for (const breakpoint of breakpoints) {
    if (atBreakpoint(steps, points, index, breakpoint) && holds(breakpoint, steps[index]!)) return { index, breakpoint }
  }
  return null
}

/** Resume: the next step a breakpoint stops at (its condition holding), or null when none comes before the end. */
export function nextHit(steps: readonly RecordedStep[], points: readonly StepPoint[], at: number, breakpoints: readonly Breakpoint[], holds: ConditionCheck): Hit | null {
  if (!breakpoints.length) return null
  for (let k = at + 1; k < steps.length; k++) {
    const hit = hitAt(steps, points, k, breakpoints, holds)
    if (hit) return hit
  }
  return null
}

/** Back to the previous step a breakpoint stops at, or null when none comes after the start. */
export function previousHit(steps: readonly RecordedStep[], points: readonly StepPoint[], at: number, breakpoints: readonly Breakpoint[], holds: ConditionCheck): Hit | null {
  if (!breakpoints.length) return null
  for (let k = at - 1; k >= 0; k--) {
    const hit = hitAt(steps, points, k, breakpoints, holds)
    if (hit) return hit
  }
  return null
}

/** How often each breakpoint stops in the recording (its condition holding). */
export function hitCounts(steps: readonly RecordedStep[], points: readonly StepPoint[], breakpoints: readonly Breakpoint[], holds: ConditionCheck): number[] {
  return breakpoints.map((breakpoint) => {
    let count = 0
    for (let k = 0; k < steps.length; k++) if (atBreakpoint(steps, points, k, breakpoint) && holds(breakpoint, steps[k]!)) count++
    return count
  })
}

/** The step whose values a frame of the stack shows: the top frame's is the step itself, a caller's its last step up to it. */
export function frameStep(steps: readonly RecordedStep[], at: number, frame: number): number | null {
  const step = steps[at]
  const call = step?.frames[frame]?.inv
  if (!step || call === undefined) return null
  if (frame === 0) return at
  for (let k = at; k >= 0; k--) if (steps[k]!.inv === call) return k
  return null
}

/** The lines a recording ran a statement on, by file (the gutter can tell a breakpoint that will never stop). */
export function recordedLines(steps: readonly RecordedStep[], points: readonly StepPoint[]): Map<string, Set<number>> {
  const lines = new Map<string, Set<number>>()
  for (const step of steps) {
    const point = points[step.point]
    if (!point) continue
    if (!lines.has(point.path)) lines.set(point.path, new Set())
    lines.get(point.path)!.add(point.line)
  }
  return lines
}

// --- showing values -------------------------------------------------------------------------------------------------

const MAX_PREVIEW = 160

const shorten = (text: string) => text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1)}…` : text
const numberText = (value: number) => Object.is(value, -0) ? '-0' : String(value)

/** An object in one short word, as a preview inside another shows it: `{…}`, `Array(3)`, `Map(1)`, `Cart`. */
function objectWord(value: RecordedObject): string {
  if (value.c === 'Array') return `Array(${value.n ?? 0})`
  if (value.n !== null) return `${value.c || 'Object'}(${value.n})`
  return value.c && value.c !== 'Object' ? value.c : '{…}'
}

/** A value inside a preview: primitives in full (strings in single quotes), objects as one word. */
function innerPreview(value: RecordedValue): string {
  switch (value.t) {
    case 'string':
      return `'${value.v}${value.full === undefined ? '' : '…'}'`
    case 'object':
      return objectWord(value)
    case 'ref':
      return '[Circular]'
    case 'function':
      return 'ƒ'
    default:
      return valuePreview(value)
  }
}

/**
 * A value as the Scope shows it on one line, like the browser's: `"Butter croissant"`, `24.999999999999996`,
 * `(3) [{…}, {…}, {…}]`, `{id: 'croissant', price: 2.4}`, `Map(1) {'croissant' => 2.4}`, `ƒ applyDiscount(total)`.
 */
export function valuePreview(value: RecordedValue): string {
  switch (value.t) {
    case 'undefined':
    case 'null':
      return value.t
    case 'uninitialized':
      return '<uninitialized>'
    case 'getter':
      return '(...)'
    case 'promise':
      return 'Promise'
    case 'boolean':
      return String(value.v)
    case 'number':
      return numberText(value.v)
    case 'string':
      return shorten(`"${value.v}${value.full === undefined ? '' : '…'}"`)
    case 'bigint':
      return `${value.v}n`
    case 'ref':
      return '[Circular]'
    case 'object': {
      if (value.e === null) return objectWord(value)
      const items = value.e.map(([key, inner]) => value.c === 'Array' || value.c === 'Set' ? innerPreview(inner) : value.c === 'Map' ? `${key} => ${innerPreview(inner)}` : `${key}: ${innerPreview(inner)}`)
      if (value.more > 0) items.push('…')
      if (value.c === 'Array') return shorten(`(${value.n ?? 0}) [${items.join(', ')}]`)
      const head = value.n !== null ? `${value.c || 'Object'}(${value.n}) ` : value.c && value.c !== 'Object' ? `${value.c} ` : ''
      return shorten(`${head}{${items.join(', ')}}`)
    }
    default:
      return value.v
  }
}

/** The rows an expanded value shows: its entries (an array also its length) and how many more it had. */
export function valueChildren(value: RecordedValue): { entries: [string, RecordedValue][], more: number } {
  if (value.t !== 'object' || value.e === null) return { entries: [], more: 0 }
  const entries = [...value.e]
  if (value.c === 'Array' && value.n !== null) entries.push(['length', { t: 'number', v: value.n }])
  return { entries, more: value.more }
}

/** The value can be opened in the Scope (it has entries to show). */
export function isExpandable(value: RecordedValue): boolean {
  return value.t === 'object' && value.e !== null && (value.e.length > 0 || value.more > 0 || value.c === 'Array')
}

/** The kind of a value, for its colour: strings, numbers and booleans, null and undefined, functions, anything else. */
export function valueTone(value: RecordedValue): 'string' | 'number' | 'empty' | 'function' | 'other' {
  if (value.t === 'string') return 'string'
  if (value.t === 'number' || value.t === 'boolean' || value.t === 'bigint') return 'number'
  if (value.t === 'undefined' || value.t === 'null' || value.t === 'uninitialized' || value.t === 'getter') return 'empty'
  if (value.t === 'function') return 'function'
  return 'other'
}

// --- the instrumentation, taken out of text -------------------------------------------------------------------------

const STEP = String.raw`__gs\$\.on&&__gs\$\.s\(\d+,__gs\$[fm],\[[^\]]*\]\)`
/** Where a wrapper started whose closing bracket has to go too: a braceless body, a loop's test, an await or yield. */
const BODY = '\u0001'
const TEST = '\u0002'
const WAIT = '\u0003'

type Open = '(' | '{' | 'template' | 'body' | 'test' | 'wait'

/** After one of these a `/` starts a regex literal; after anything else (a name, a number, `)`, `]`, a string) it divides. */
const BEFORE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '/', '%', '<', '>', '~', '^'])
/** Words after which a `/` starts a regex literal too (`return /x/`), unless they are a property (`a.return / 2`). */
const REGEX_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])
const isWordChar = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$')
const isSpace = (c: string) => c <= ' ' || c === '\u00a0' || c === '\u2028' || c === '\u2029' || c === '\ufeff'

/**
 * Drops the closing brackets of the wrappers the markers stand for, in one pass: a small lexer keeps strings, template
 * text, regex literals and comments apart from code and a stack of the open brackets; a bracket that closes a wrapper
 * goes (an await or yield closes twice: its value, then the call that marks the function back). A `/` starts a regex
 * literal where a value may start (after `(`, `=`, `return` …) and divides after a value. Linear in the text.
 */
function dropClosers(text: string): string {
  const stack: Open[] = []
  let out = ''
  let state: 'code' | '\'' | '"' | 'template' | 'line' | 'block' | 'regex' | 'class' = 'code'
  // the last character of code that was not a space ('' at the start; ')' after a string, template or regex), and when
  // it ends a word, that word (kept to keyword length) and whether a `.` came before it
  let prev = ''
  let word = ''
  let property = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const next = text[i + 1]
    if (state === 'code') {
      if (c === BODY || c === TEST || c === WAIT) {
        if (c === BODY) stack.push('body')
        else if (c === TEST) stack.push('test')
        else stack.push('wait', 'wait')
        // what follows a wrapper's start is where a value may start
        prev = '('
        continue
      }
      if (c === '}' && stack.at(-1) === 'template') {
        stack.pop()
        state = 'template'
        out += c
        continue
      }
      if (c === ')' || c === '}') {
        const open = stack.pop()
        if (open !== 'body' && open !== 'test' && open !== 'wait') out += c
        prev = c
        continue
      }
      out += c
      if (c === '(' || c === '{') stack.push(c)
      if (c === '\'' || c === '"') state = c
      else if (c === '`') state = 'template'
      else if (c === '/' && next === '/') state = 'line'
      else if (c === '/' && next === '*') state = 'block'
      else if (c === '/' && (BEFORE_REGEX.has(prev) || (isWordChar(prev) && !property && REGEX_WORDS.has(word)))) state = 'regex'
      else if (isWordChar(c)) {
        if (isWordChar(text[i - 1])) word = word.length < 10 ? word + c : '#'
        else {
          property = prev === '.'
          word = c
        }
        prev = c
      } else if (!isSpace(c)) {
        prev = c
      }
      continue
    }
    out += c
    if (state === 'line') {
      if (c === '\n') state = 'code'
    } else if (state === 'block') {
      if (c === '*' && next === '/') {
        out += next
        i++
        state = 'code'
      }
    } else if (c === '\\') {
      if (next !== undefined) out += next
      i++
    } else if (state === 'template') {
      if (c === '`') {
        state = 'code'
        prev = ')'
      } else if (c === '$' && next === '{') {
        out += next
        i++
        stack.push('template')
        state = 'code'
        prev = '{'
      }
    } else if (state === 'regex' || state === 'class') {
      // a regex ends at its line at the latest (a cut-off fragment); `/` inside a class `[…]` does not end it
      if (c === '\n' || c === '\r') state = 'code'
      else if (state === 'class') {
        if (c === ']') state = 'regex'
      } else if (c === '[') {
        state = 'class'
      } else if (c === '/') {
        state = 'code'
        prev = ')'
      }
    } else if (c === state) {
      state = 'code'
      prev = ')'
    }
  }
  return out
}

/**
 * Code as written, from code as instrumented (instrument.ts): what Firefox and Safari quote in an error message during a
 * recording ("(In 'slots.map(slot => {const __gs$f=…')"), or a function's source in the Console. Exact for whole files
 * (the tests round-trip every level); a cut-off fragment loses at most a bracket. Text without the recorder's name comes
 * back as it is. Linear, never throws.
 */
export function withoutInstrumentation(text: string): string {
  if (!text.includes('__gs$')) return text
  const marked = text
    .replaceAll(BODY, '')
    .replaceAll(TEST, '')
    .replaceAll(WAIT, '')
    .replace(/var __gs\$m=__gs\$\.e\(\d+,1\);/g, '')
    .replace(new RegExp(String.raw`\{const __gs\$f=__gs\$\.e\(\d+,0\);try\{${STEP};return \(`, 'g'), '')
    .replace(/\)\}finally\{__gs\$\.x\(__gs\$f\)\}\}/g, '')
    .replace(/const __gs\$f=__gs\$\.e\(\d+,0\);try\{/g, '')
    .replace(/\}finally\{__gs\$\.x\(__gs\$f\)\}/g, '')
    .replace(new RegExp(String.raw`\{${STEP};`, 'g'), BODY)
    .replace(new RegExp(String.raw`\(${STEP},`, 'g'), TEST)
    .replace(new RegExp(`${STEP};`, 'g'), '')
    .replace(/__gs\$\.r\(__gs\$[fm],yield __gs\$\.w\(__gs\$[fm],undefined\)\)/g, 'yield')
    .replace(/__gs\$\.r\(__gs\$[fm],(await|yield\*?) __gs\$\.w\(__gs\$[fm],/g, `$1 ${WAIT}`)
  return dropClosers(marked)
}
