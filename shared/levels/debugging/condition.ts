// A conditional breakpoint's condition (chapter 5; docs/features/levels.md, "The recording"): read with a real parser
// (acorn, already loaded for the recording) and evaluated by Grindstone on the values the recording kept at a step. The
// app's code never runs again: there are no calls but a few pure built-ins (`isNaN`, `Number.isNaN`, `Math.round`,
// `name.startsWith(…)` …), no assignments, no `new`, no functions, and a getter is never called. What the recording did
// not keep (an object too deep, a cut string, a name a step can't see) makes the condition fail at that step, with why.
// Never throws. Lazily loaded with the instrumentation.
import { parseExpressionAt } from 'acorn'
import type { RecordedObject, RecordedValue } from './recording'

/** The longest condition (characters). */
export const MAX_CONDITION_LENGTH = 300
/** How deep a condition's expression may nest. */
const MAX_DEPTH = 40

export type ConditionResult = { ok: true, value: unknown } | { ok: false, error: string }

export type CompiledCondition
  = | { ok: true, evaluate: (scope: ReadonlyMap<string, RecordedValue>) => ConditionResult }
    | { ok: false, error: string }

interface Expr {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

/** A condition stops being evaluated at this step, and says why. */
class Unavailable extends Error {}
/** An optional chain (`a?.b`) met null or undefined: the whole chain is undefined. */
class ShortCircuit extends Error {}

/** An object of the recording (by its id: `a === b` is identity). */
class Kept {
  constructor(readonly value: RecordedObject) {}
}
/** A value the recording kept as one line only (a function, an element, a promise, a cycle). */
class Opaque {
  constructor(readonly value: RecordedValue) {}
}

const NODES = new Set([
  'Identifier', 'Literal', 'ThisExpression', 'MemberExpression', 'ChainExpression', 'UnaryExpression', 'BinaryExpression',
  'LogicalExpression', 'ConditionalExpression', 'TemplateLiteral', 'TemplateElement', 'ArrayExpression', 'CallExpression'
])
const UNARY = new Set(['!', '-', '+', '~', 'typeof', 'void'])
const BINARY = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', '**', '&', '|', '^', '<<', '>>', '>>>'])
const FORBIDDEN = new Set(['constructor', '__proto__', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'])

type Primitive = string | number | boolean | null | undefined
const isPrimitive = (value: unknown): value is Primitive => value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)

const primitive = (value: unknown, what: string): Primitive => {
  if (isPrimitive(value)) return value
  throw new Unavailable(`${what} needs a plain value, not an object`)
}

/** Built-ins a condition may call: pure, on plain values only. */
const GLOBAL_FUNCTIONS: Record<string, (...args: Primitive[]) => unknown> = {
  isNaN: value => Number.isNaN(Number(value)),
  isFinite: value => Number.isFinite(Number(value)),
  Number: value => Number(value),
  String: value => String(value),
  Boolean: value => Boolean(value),
  parseInt: (value, radix) => Number.parseInt(String(value), radix === undefined ? undefined : Number(radix)),
  parseFloat: value => Number.parseFloat(String(value))
}
const STATIC_FUNCTIONS: Record<string, Record<string, (...args: Primitive[]) => unknown>> = {
  Number: {
    isNaN: value => Number.isNaN(value),
    isInteger: value => Number.isInteger(value),
    isFinite: value => Number.isFinite(value)
  },
  Math: {
    abs: value => Math.abs(Number(value)),
    round: value => Math.round(Number(value)),
    floor: value => Math.floor(Number(value)),
    ceil: value => Math.ceil(Number(value)),
    trunc: value => Math.trunc(Number(value)),
    sign: value => Math.sign(Number(value)),
    min: (...values) => Math.min(...values.map(Number)),
    max: (...values) => Math.max(...values.map(Number))
  },
  // answered from the recording (an array of the app is an object the recording kept)
  Array: { isArray: () => false }
}
const STRING_METHODS = new Set(['startsWith', 'endsWith', 'includes', 'indexOf', 'toLowerCase', 'toUpperCase', 'trim', 'slice', 'at', 'charAt'])
const LIST_METHODS = new Set(['includes', 'indexOf', 'at'])
const METHODS = new Set([...STRING_METHODS, ...LIST_METHODS, 'toFixed'])

const child = (node: Expr, key: string) => node[key] as Expr
const list = (node: Expr, key: string) => node[key] as (Expr | null)[]
const keyName = (node: Expr): string | null => node.computed ? null : child(node, 'property').type === 'Identifier' ? child(node, 'property').name as string : null

/** Checks the expression only uses what a condition may: throws Unavailable with why not. */
function vet(node: Expr | null, depth: number) {
  if (!node) return
  if (depth > MAX_DEPTH) throw new Unavailable('The condition is nested too deeply')
  if (!NODES.has(node.type)) {
    throw new Unavailable(node.type === 'AssignmentExpression' || node.type === 'UpdateExpression'
      ? 'A condition can\'t change values: use === to compare'
      : node.type === 'SequenceExpression' ? 'A condition is one expression' : 'A condition can only compare and read values')
  }
  switch (node.type) {
    case 'Literal':
      if (node.regex || node.bigint) throw new Unavailable('A condition can only compare and read values')
      return
    case 'UnaryExpression':
      if (!UNARY.has(node.operator as string)) throw new Unavailable('A condition can\'t change values')
      break
    case 'BinaryExpression':
      if (!BINARY.has(node.operator as string)) throw new Unavailable(`${String(node.operator)} can't be used in a condition`)
      break
    case 'MemberExpression': {
      const name = keyName(node)
      if (name !== null && FORBIDDEN.has(name)) throw new Unavailable(`${name} can't be read in a condition`)
      break
    }
    case 'ArrayExpression':
      if (list(node, 'elements').some(element => element === null || element.type === 'SpreadElement')) throw new Unavailable('A condition can only compare and read values')
      break
    case 'CallExpression': {
      const callee = child(node, 'callee')
      const name = callee.type === 'MemberExpression' ? keyName(callee) : null
      const allowed = callee.type === 'Identifier'
        ? Object.hasOwn(GLOBAL_FUNCTIONS, callee.name as string)
        : name !== null && (METHODS.has(name) || (child(callee, 'object').type === 'Identifier' && Object.hasOwn(STATIC_FUNCTIONS[child(callee, 'object').name as string] ?? {}, name)))
      if (!allowed || list(node, 'arguments').some(argument => argument?.type === 'SpreadElement')) {
        throw new Unavailable('A condition can\'t call functions of the app; it may use isNaN, Number, Math.round, .includes and a few more')
      }
      break
    }
  }
  for (const key of Object.keys(node)) {
    const value = node[key]
    for (const each of Array.isArray(value) ? value : [value]) {
      if (each && typeof each === 'object' && typeof (each as Expr).type === 'string') vet(each as Expr, depth + 1)
    }
  }
}

/** A value of the recording as the condition sees it. */
function fromRecorded(value: RecordedValue, name: string): unknown {
  switch (value.t) {
    case 'undefined':
      return undefined
    case 'null':
      return null
    case 'boolean':
    case 'number':
      return value.v
    case 'string':
      if (value.full !== undefined) throw new Unavailable(`${name} is longer than the recording kept`)
      return value.v
    case 'uninitialized':
      throw new Unavailable(`${name} is not initialized yet at this step`)
    case 'getter':
      throw new Unavailable(`${name} is a getter: the recording did not call it`)
    case 'object':
      return new Kept(value)
    default:
      return new Opaque(value)
  }
}

const describeValue = (value: unknown) => value === null ? 'null' : 'undefined'

function read(object: unknown, key: unknown): unknown {
  if (object === null || object === undefined) throw new Unavailable(`Cannot read properties of ${describeValue(object)} (reading '${String(key)}')`)
  const name = typeof key === 'number' ? String(key) : String(primitive(key, 'A property name'))
  if (FORBIDDEN.has(name)) throw new Unavailable(`${name} can't be read in a condition`)
  if (typeof object === 'string') return name === 'length' ? object.length : /^\d+$/.test(name) ? object[Number(name)] : undefined
  if (Array.isArray(object)) return name === 'length' ? object.length : /^\d+$/.test(name) ? object[Number(name)] : undefined
  if (isPrimitive(object)) return undefined
  if (!(object instanceof Kept)) throw new Unavailable('The recording kept that value as one line only')
  const kept = object.value
  if (kept.n !== null && (name === 'length' || name === 'size')) return kept.n
  if (kept.e === null) throw new Unavailable(`The recording did not keep what is inside this ${kept.c || 'object'} (it was too deep)`)
  const entry = kept.e.find(([each]) => each === name)
  if (entry) return fromRecorded(entry[1], name)
  if (kept.more > 0) throw new Unavailable(`The recording did not keep ${name} of this ${kept.c || 'object'}`)
  return undefined
}

const identical = (a: unknown, b: unknown) => {
  if (a instanceof Kept && b instanceof Kept) return a.value.id === b.value.id
  if (a instanceof Kept || b instanceof Kept || a instanceof Opaque || b instanceof Opaque) return a === b
  return a === b
}

/** The items of a list the recording kept in full (an array of the app, or one written in the condition). */
function items(list: unknown): unknown[] | null {
  if (Array.isArray(list)) return list
  if (!(list instanceof Kept) || list.value.c !== 'Array') return null
  if (list.value.e === null || list.value.more > 0) throw new Unavailable('The recording did not keep every item of this array')
  return list.value.e.map(([key, value]) => fromRecorded(value, key))
}

function callMethod(receiver: unknown, name: string, args: unknown[]): unknown {
  if (typeof receiver === 'string' && STRING_METHODS.has(name)) {
    const method = String.prototype[name as 'slice'] as (...values: Primitive[]) => unknown
    return method.apply(receiver, args.map(arg => primitive(arg, name)))
  }
  if (typeof receiver === 'number' && name === 'toFixed') return receiver.toFixed(Number(primitive(args[0], name) ?? 0))
  const all = LIST_METHODS.has(name) ? items(receiver) : null
  if (all) {
    if (name === 'at') {
      const at = Math.trunc(Number(primitive(args[0], name)))
      return all[at < 0 ? all.length + at : at]
    }
    const index = all.findIndex(item => identical(item, args[0]))
    return name === 'includes' ? index >= 0 : index
  }
  if (receiver === null || receiver === undefined) throw new Unavailable(`Cannot read properties of ${describeValue(receiver)} (reading '${name}')`)
  throw new Unavailable(`${name} can't be used on this value in a condition`)
}

function evaluate(node: Expr, scope: ReadonlyMap<string, RecordedValue>): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value
    case 'Identifier': {
      const name = node.name as string
      const value = scope.get(name)
      if (value) return fromRecorded(value, name)
      if (name === 'undefined') return undefined
      if (name === 'NaN') return Number.NaN
      if (name === 'Infinity') return Number.POSITIVE_INFINITY
      throw new Unavailable(`${name} is not defined at this step`)
    }
    case 'ThisExpression': {
      const value = scope.get('this')
      if (!value) throw new Unavailable('this is not defined at this step')
      return fromRecorded(value, 'this')
    }
    case 'TemplateLiteral': {
      const quasis = list(node, 'quasis') as Expr[]
      const expressions = list(node, 'expressions') as Expr[]
      return quasis.map((quasi, index) => {
        const cooked = (quasi.value as { cooked: string | null }).cooked ?? ''
        return index < expressions.length ? cooked + String(primitive(evaluate(expressions[index]!, scope), 'A template')) : cooked
      }).join('')
    }
    case 'ArrayExpression':
      return (list(node, 'elements') as Expr[]).map(element => evaluate(element, scope))
    case 'ChainExpression':
      try {
        return evaluate(child(node, 'expression'), scope)
      } catch (error) {
        if (error instanceof ShortCircuit) return undefined
        throw error
      }
    case 'MemberExpression': {
      const object = evaluate(child(node, 'object'), scope)
      if (node.optional && (object === null || object === undefined)) throw new ShortCircuit()
      const key = node.computed ? evaluate(child(node, 'property'), scope) : keyName(node)
      return read(object, key)
    }
    case 'CallExpression': {
      const callee = child(node, 'callee')
      const args = (list(node, 'arguments') as Expr[]).map(argument => evaluate(argument, scope))
      if (callee.type === 'Identifier') return GLOBAL_FUNCTIONS[callee.name as string]!(...args.map(arg => primitive(arg, callee.name as string)))
      const name = keyName(callee)!
      const owner = child(callee, 'object')
      const statics = owner.type === 'Identifier' && !scope.has(owner.name as string) ? STATIC_FUNCTIONS[owner.name as string] : undefined
      if (statics && Object.hasOwn(statics, name)) {
        if (owner.name === 'Array') return Array.isArray(args[0]) || (args[0] instanceof Kept && args[0].value.c === 'Array')
        return statics[name]!(...args.map(arg => primitive(arg, name)))
      }
      const receiver = evaluate(owner, scope)
      if (callee.optional && (receiver === null || receiver === undefined)) throw new ShortCircuit()
      return callMethod(receiver, name, args)
    }
    case 'UnaryExpression': {
      const argument = child(node, 'argument')
      if (node.operator === 'typeof') {
        if (argument.type === 'Identifier' && !scope.has(argument.name as string) && !['undefined', 'NaN', 'Infinity'].includes(argument.name as string)) return 'undefined'
        const value = evaluate(argument, scope)
        if (value instanceof Kept) return 'object'
        if (value instanceof Opaque) return value.value.t === 'function' ? 'function' : 'object'
        return typeof value
      }
      const value = evaluate(argument, scope)
      if (node.operator === '!') return !truthy(value)
      if (node.operator === 'void') return undefined
      const plain = primitive(value, String(node.operator))
      if (node.operator === '-') return -(plain as number)
      if (node.operator === '+') return +(plain as number)
      return ~(plain as number)
    }
    case 'LogicalExpression': {
      const left = evaluate(child(node, 'left'), scope)
      if (node.operator === '&&') return truthy(left) ? evaluate(child(node, 'right'), scope) : left
      if (node.operator === '||') return truthy(left) ? left : evaluate(child(node, 'right'), scope)
      return left === null || left === undefined ? evaluate(child(node, 'right'), scope) : left
    }
    case 'ConditionalExpression':
      return truthy(evaluate(child(node, 'test'), scope)) ? evaluate(child(node, 'consequent'), scope) : evaluate(child(node, 'alternate'), scope)
    case 'BinaryExpression':
      return binary(node.operator as string, evaluate(child(node, 'left'), scope), evaluate(child(node, 'right'), scope))
    default:
      throw new Unavailable('A condition can only compare and read values')
  }
}

function binary(operator: string, left: unknown, right: unknown): unknown {
  if (operator === '===' || operator === '!==') return identical(left, right) === (operator === '===')
  if (!isPrimitive(left) || !isPrimitive(right)) {
    if (operator === '==' || operator === '!=') {
      const other = isPrimitive(left) ? left : isPrimitive(right) ? right : null
      if (other === null || other === undefined) {
        const same = isPrimitive(left) || isPrimitive(right) ? false : identical(left, right)
        return same === (operator === '==')
      }
    }
    throw new Unavailable(`${operator} on an object would run the app's code; compare its properties instead`)
  }
  const a = left as number
  const b = right as number
  switch (operator) {
    case '==': return left == right
    case '!=': return left != right
    case '<': return a < b
    case '<=': return a <= b
    case '>': return a > b
    case '>=': return a >= b
    case '+': return (left as string) + (right as string)
    case '-': return a - b
    case '*': return a * b
    case '/': return a / b
    case '%': return a % b
    case '**': return a ** b
    case '&': return a & b
    case '|': return a | b
    case '^': return a ^ b
    case '<<': return a << b
    case '>>': return a >> b
    default: return a >>> b
  }
}

/** Whether a condition's value counts as true (objects always do). */
export function truthy(value: unknown): boolean {
  return value instanceof Kept || value instanceof Opaque ? true : Boolean(value)
}

/** Reads a condition once; its `evaluate` runs it on a step's values and never throws. */
export function compileCondition(text: string): CompiledCondition {
  const source = text.trim().replace(/;\s*$/, '')
  if (!source) return { ok: false, error: 'Write a condition, e.g. i === 6' }
  if (source.length > MAX_CONDITION_LENGTH) return { ok: false, error: `A condition is at most ${MAX_CONDITION_LENGTH} characters` }
  let tree: Expr
  try {
    tree = parseExpressionAt(source, 0, { ecmaVersion: 'latest' }) as unknown as Expr
    if (source.slice(tree.end).trim()) return { ok: false, error: 'A condition is one expression' }
    vet(tree, 0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: error instanceof Unavailable ? message : `Not a condition: ${message.replace(/\s*\(\d+:\d+\)$/, '')}` }
  }
  return {
    ok: true,
    evaluate: (scope) => {
      try {
        return { ok: true, value: evaluate(tree, scope) }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'The condition could not be evaluated' }
      }
    }
  }
}
