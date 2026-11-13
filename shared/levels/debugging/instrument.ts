// Chapter 5's instrumentation (ADR 0007, "Breakpoints"; docs/features/levels.md, "The recording"): before a recorded
// load, the level's JavaScript modules are rewritten so every statement reports a **step** to the recorder in the frame
// (recorder.ts): which statement (a point: file, line, the scopes it can see), the function call it runs in, and the
// values of every variable it can see, read just before the statement runs. A real parser (acorn) reads the code; the
// rewrite only inserts text and never a line break, so every line (stack traces, Console links, find tasks) stays where
// it was. What the code does stays the same: function bodies get a try/finally that tells the recorder they ended,
// `await` and `yield` tell it the function is paused and back, and braceless bodies get braces.
// Only chapter 5's recorded loads use this: it is imported lazily (acorn is its own chunk). Pure: no DOM. A file it
// cannot read (a syntax error, too big, nested too deep, a body the try block would break) is left as it is and runs
// without steps.
import { parse } from 'acorn'
import { RECORDER_GLOBAL } from './recorder'

export { RECORDER_GLOBAL }
/** The longest file that is instrumented (characters); a longer one runs as written. */
export const MAX_INSTRUMENT_SOURCE = 100_000
/** The most statements an app is instrumented at (a file that would pass it runs as written). */
export const MAX_POINTS = 5000
/** How deep the syntax tree may nest before a file runs as written (the walk is recursive). */
const MAX_NESTING = 400
/** The most variables one step reads (the innermost scopes first). */
export const MAX_SCOPE_NAMES = 64

export type ScopeKind = 'block' | 'local' | 'closure' | 'module'

/** One scope a statement can see, as the Debugger's Scope lists it. */
export interface ScopeView {
  kind: ScopeKind
  /** The function of a local or closure scope (its name), else null. */
  name: string | null
  /** Its variables, `this` first, then by name. */
  names: string[]
}

/** A statement the code reports a step at: where it is and what it can see (a step's values follow `scopes`' names in order). */
export interface StepPoint {
  path: string
  line: number
  column: number
  /** The function it is in (an index into `functions`). */
  fn: number
  scopes: ScopeView[]
  /**
   * A `for` statement whose test starts on its line: the test's step comes next, every round, and sees the loop's
   * variables, so a breakpoint on the line stops there rather than here (recording.ts, `atBreakpoint`).
   */
  testFollows?: true
}

/** A function of the app (each file's top-level code is one too, named like Chrome does: "(anonymous)"). */
export interface FunctionInfo {
  name: string
  path: string
  line: number
}

export type SkipReason = 'syntax' | 'size' | 'nesting' | 'names' | 'points' | 'clash'

export interface Instrumented {
  /** Every JavaScript file of the app: instrumented, or as written when it was skipped. */
  modules: Record<string, string>
  points: StepPoint[]
  functions: FunctionInfo[]
  /** Files that run as written, and why. */
  skipped: { path: string, reason: SkipReason }[]
}

interface Located {
  type: string
  start: number
  end: number
  loc?: { start: { line: number, column: number } }
  [key: string]: unknown
}

const isNode = (value: unknown): value is Located => typeof value === 'object' && value !== null && typeof (value as Located).type === 'string'
const child = (node: Located, key: string): Located | null => isNode(node[key]) ? node[key] as Located : null
const children = (node: Located, key: string): Located[] => Array.isArray(node[key]) ? (node[key] as unknown[]).filter(isNode) : []

class TooDeep extends Error {}
class TooMany extends Error {}
class Clash extends Error {}

interface Fn {
  id: number
  name: string
  arrow: boolean
  module: boolean
  /** The variable that holds this call's token in the generated code. */
  token: string
}

interface Scope {
  kind: 'module' | 'function' | 'block'
  fn: Fn
  names: Set<string>
}

interface Insertion {
  at: number
  text: string
  /** Closing text (it goes before opening text at the same place, the innermost first). */
  close: boolean
  depth: number
  order: number
}

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const LEXICAL = new Set(['let', 'const'])

/** The names a binding pattern declares (`{ a, b: [c, ...d] = [] }` → a, c, d). */
function patternNames(pattern: Located | null, into: Set<string>) {
  if (!pattern) return
  switch (pattern.type) {
    case 'Identifier':
      into.add(pattern.name as string)
      break
    case 'ObjectPattern':
      for (const property of children(pattern, 'properties')) patternNames(property.type === 'RestElement' ? child(property, 'argument') : child(property, 'value'), into)
      break
    case 'ArrayPattern':
      for (const element of children(pattern, 'elements')) patternNames(element, into)
      break
    case 'AssignmentPattern':
      patternNames(child(pattern, 'left'), into)
      break
    case 'RestElement':
      patternNames(child(pattern, 'argument'), into)
      break
  }
}

/** The let, const, class and (in a block) function declarations directly in a statement list. */
function lexicalNames(statements: Located[], into: Set<string>) {
  for (const raw of statements) {
    const statement = raw.type === 'ExportNamedDeclaration' || raw.type === 'ExportDefaultDeclaration' ? child(raw, 'declaration') ?? raw : raw
    if (statement.type === 'VariableDeclaration' && LEXICAL.has(statement.kind as string)) {
      for (const declarator of children(statement, 'declarations')) patternNames(child(declarator, 'id'), into)
    } else if (statement.type === 'ClassDeclaration' || statement.type === 'FunctionDeclaration') {
      const id = child(statement, 'id')
      if (id) into.add(id.name as string)
    }
  }
}

/** The `var` declarations anywhere in a function body or a module (not inside nested functions). */
function varNames(node: Located, into: Set<string>, depth = 0) {
  if (depth > MAX_NESTING) throw new TooDeep()
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const declarator of children(node, 'declarations')) patternNames(child(declarator, 'id'), into)
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue
    const value = node[key]
    const list = Array.isArray(value) ? value : [value]
    for (const item of list) {
      if (!isNode(item) || FUNCTIONS.has(item.type) || item.type === 'ClassBody') continue
      varNames(item, into, depth + 1)
    }
  }
}

/**
 * A function body is wrapped in a try block, where its own function declarations become lexical: a `var` of the same
 * name (anywhere in the body) or a function declared twice would then be a SyntaxError, so such a file runs as written.
 */
function checkHoisting(list: Located[], vars: ReadonlySet<string>) {
  const declared = new Set<string>()
  for (const statement of list) {
    const name = statement.type === 'FunctionDeclaration' ? child(statement, 'id')?.name as string | undefined : undefined
    if (name === undefined) continue
    if (declared.has(name) || vars.has(name)) throw new Clash()
    declared.add(name)
  }
}

/** The name a function gets, as JavaScript infers it (a declaration, `const f = () => …`, a method), else "(anonymous)". */
function inferredName(fn: Located, parent: Located | null): string {
  const id = child(fn, 'id')
  if (id) return id.name as string
  if (!parent) return '(anonymous)'
  const keyName = (key: Located | null) => key?.type === 'Identifier' ? key.name as string : key?.type === 'Literal' ? String(key.value) : key?.type === 'PrivateIdentifier' ? `#${String(key.name)}` : null
  if (parent.type === 'VariableDeclarator' && child(parent, 'id')?.type === 'Identifier') return child(parent, 'id')!.name as string
  if ((parent.type === 'Property' || parent.type === 'PropertyDefinition') && !parent.computed) return keyName(child(parent, 'key')) ?? '(anonymous)'
  if (parent.type === 'MethodDefinition' && !parent.computed) {
    const name = keyName(child(parent, 'key')) ?? '(anonymous)'
    return parent.kind === 'get' || parent.kind === 'set' ? `${String(parent.kind)} ${name}` : name
  }
  if (parent.type === 'AssignmentExpression' && child(parent, 'left')?.type === 'Identifier') return child(parent, 'left')!.name as string
  if (parent.type === 'ExportDefaultDeclaration') return 'default'
  return '(anonymous)'
}

/** Rewrites one file; throws TooDeep / TooMany / acorn's SyntaxError. */
function instrumentFile(path: string, source: string, points: StepPoint[], functions: FunctionInfo[]): string {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, preserveParens: true, allowHashBang: true }) as unknown as Located
  const insertions: Insertion[] = []
  let order = 0
  const insert = (at: number, text: string, depth: number, close = false) => {
    insertions.push({ at, text, close, depth, order: order++ })
  }
  const g = RECORDER_GLOBAL
  const firstPoint = points.length
  const firstFunction = functions.length

  const newFunction = (name: string, line: number, arrow: boolean, module: boolean): Fn => {
    functions.push({ name, path, line })
    return { id: functions.length - 1, name, arrow, module, token: module ? `${g}m` : `${g}f` }
  }

  /** What a statement at this place can see: the scopes innermost first, grouped like the Debugger shows them. */
  function scopesOf(chain: Scope[], fn: Fn): ScopeView[] {
    const seen = new Set<string>()
    const views: ScopeView[] = []
    let total = 0
    const take = (names: Iterable<string>) => {
      const fresh: string[] = []
      for (const name of names) {
        if (seen.has(name) || name.startsWith(g)) continue
        seen.add(name)
        fresh.push(name)
      }
      return fresh.sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
    }
    const add = (kind: ScopeKind, name: string | null, names: string[]) => {
      const room = Math.max(0, MAX_SCOPE_NAMES - total)
      const kept = names.slice(0, room)
      total += kept.length
      if (kept.length) views.push({ kind, name, names: kept })
    }
    let index = chain.length - 1
    // the blocks of this function, then its own scope (with `this`)
    const blocks: string[] = []
    while (index >= 0 && chain[index]!.kind === 'block' && chain[index]!.fn === fn) blocks.push(...chain[index--]!.names)
    add('block', null, take(blocks))
    if (fn.module) {
      add('module', null, take(chain[0]!.names))
      return views
    }
    const own = index >= 0 && chain[index]!.fn === fn ? take(chain[index--]!.names) : []
    add('local', fn.name, fn.arrow ? own : ['this', ...own])
    // each enclosing function, its blocks with it, then the module
    while (index > 0) {
      const outer = chain[index]!.fn
      const names: string[] = []
      while (index > 0 && chain[index]!.fn === outer) names.push(...chain[index--]!.names)
      add('closure', outer.name, take(names))
    }
    add('module', null, take(chain[0]!.names))
    return views
  }

  function point(at: Located, chain: Scope[], fn: Fn): { id: number, getters: string } {
    if (points.length >= MAX_POINTS) throw new TooMany()
    const scopes = scopesOf(chain, fn)
    const loc = at.loc!.start
    let loop = at
    while (loop.type === 'LabeledStatement') loop = child(loop, 'body')!
    const loopTest = loop.type === 'ForStatement' ? child(loop, 'test') : null
    const testFollows = loopTest !== null && loopTest.loc!.start.line === loc.line
    points.push({ path, line: loc.line, column: loc.column + 1, fn: fn.id, scopes, ...(testFollows ? { testFollows: true as const } : {}) })
    const names = scopes.flatMap(scope => scope.names)
    return { id: points.length - 1, getters: names.map(name => name === 'this' ? '()=>this' : `()=>${name}`).join(',') }
  }

  const stepText = (at: Located, chain: Scope[], fn: Fn) => {
    const { id, getters } = point(at, chain, fn)
    return `${g}.on&&${g}.s(${id},${fn.token},[${getters}])`
  }

  const steppable = (statement: Located): boolean => {
    switch (statement.type) {
      case 'FunctionDeclaration':
      case 'EmptyStatement':
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'BlockStatement':
        return false
      case 'ExportNamedDeclaration': {
        const declaration = child(statement, 'declaration')
        return declaration !== null && declaration.type !== 'FunctionDeclaration'
      }
      case 'ExportDefaultDeclaration':
        return child(statement, 'declaration')?.type !== 'FunctionDeclaration'
      case 'ExpressionStatement':
        return typeof statement.directive !== 'string'
      default:
        return true
    }
  }

  /** A statement list: a step before each statement that does something, then the statement. */
  function statements(list: Located[], chain: Scope[], fn: Fn, depth: number) {
    for (const statement of list) {
      if (steppable(statement)) insert(statement.start, `${stepText(statement, chain, fn)};`, depth)
      visit(statement, chain, fn, depth + 1, null)
    }
  }

  /** The body of an if or a loop: a block is walked as one; a single statement gets braces and its step. */
  function body(node: Located | null, chain: Scope[], fn: Fn, depth: number) {
    if (!node) return
    if (node.type === 'BlockStatement' || node.type === 'EmptyStatement') {
      visit(node, chain, fn, depth, null)
      return
    }
    insert(node.start, `{${stepText(node, chain, fn)};`, depth - 0.5)
    visit(node, chain, fn, depth, null)
    insert(node.end, '}', depth - 0.5, true)
  }

  /** A loop's test: a step every round, before it is evaluated. */
  function test(node: Located | null, chain: Scope[], fn: Fn, depth: number) {
    if (!node) return
    insert(node.start, `(${stepText(node, chain, fn)},`, depth - 0.5)
    visit(node, chain, fn, depth, null)
    insert(node.end, ')', depth - 0.5, true)
  }

  function blockScope(fn: Fn, names: Set<string>): Scope {
    return { kind: 'block', fn, names }
  }

  function functionLike(node: Located, chain: Scope[], parent: Located | null, depth: number) {
    const arrow = node.type === 'ArrowFunctionExpression'
    const fn = newFunction(inferredName(node, parent), node.loc!.start.line, arrow, false)
    const names = new Set<string>()
    for (const param of children(node, 'params')) patternNames(param, names)
    const bodyNode = child(node, 'body')!
    const own: Scope = { kind: 'function', fn, names }
    const inner = [...chain, own]
    for (const param of children(node, 'params')) visit(param, inner, fn, depth + 1, node)
    const prologue = `const ${fn.token}=${g}.e(${fn.id},0);try{`
    const epilogue = `}finally{${g}.x(${fn.token})}`
    if (bodyNode.type === 'BlockStatement') {
      const list = children(bodyNode, 'body')
      const vars = new Set<string>()
      varNames(bodyNode, vars)
      checkHoisting(list, vars)
      for (const name of vars) names.add(name)
      lexicalNames(list, names)
      insert(bodyNode.start + 1, prologue, depth)
      statements(list, inner, fn, depth + 1)
      insert(bodyNode.end - 1, epilogue, depth, true)
      return
    }
    // an expression body becomes a block that returns it: `x => x * 2` → `x => {…try{step;return (x * 2)}finally{…}}`
    insert(bodyNode.start, `{${prologue}${stepText(bodyNode, inner, fn)};return (`, depth)
    visit(bodyNode, inner, fn, depth + 1, node)
    insert(bodyNode.end, `)${epilogue}}`, depth, true)
  }

  function visit(node: Located, chain: Scope[], fn: Fn, depth: number, parent: Located | null) {
    if (depth > MAX_NESTING) throw new TooDeep()
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        functionLike(node, chain, parent, depth)
        return
      case 'MethodDefinition':
      case 'Property':
      case 'PropertyDefinition': {
        const key = child(node, 'key')
        if (key && node.computed) visit(key, chain, fn, depth + 1, node)
        const value = child(node, 'value')
        if (value) visit(value, chain, fn, depth + 1, node)
        return
      }
      case 'VariableDeclarator': {
        const id = child(node, 'id')
        if (id) visit(id, chain, fn, depth + 1, node)
        const init = child(node, 'init')
        if (init) visit(init, chain, fn, depth + 1, node)
        return
      }
      case 'AssignmentExpression': {
        visit(child(node, 'left')!, chain, fn, depth + 1, node)
        visit(child(node, 'right')!, chain, fn, depth + 1, node)
        return
      }
      case 'ExportDefaultDeclaration': {
        visit(child(node, 'declaration')!, chain, fn, depth + 1, node)
        return
      }
      case 'StaticBlock': {
        const own = newFunction('<static_initializer>', node.loc!.start.line, false, false)
        const list = children(node, 'body')
        const names = new Set<string>()
        varNames(node, names)
        checkHoisting(list, names)
        lexicalNames(list, names)
        const open = source.indexOf('{', node.start) + 1
        insert(open, `const ${own.token}=${g}.e(${own.id},0);try{`, depth)
        statements(list, [...chain, { kind: 'function', fn: own, names }], own, depth + 1)
        insert(node.end - 1, `}finally{${g}.x(${own.token})}`, depth, true)
        return
      }
      case 'BlockStatement': {
        const list = children(node, 'body')
        const names = new Set<string>()
        lexicalNames(list, names)
        statements(list, [...chain, blockScope(fn, names)], fn, depth + 1)
        return
      }
      case 'IfStatement':
        visit(child(node, 'test')!, chain, fn, depth + 1, node)
        body(child(node, 'consequent'), chain, fn, depth + 1)
        body(child(node, 'alternate'), chain, fn, depth + 1)
        return
      case 'ForStatement': {
        const init = child(node, 'init')
        const names = new Set<string>()
        if (init?.type === 'VariableDeclaration' && LEXICAL.has(init.kind as string)) {
          for (const declarator of children(init, 'declarations')) patternNames(child(declarator, 'id'), names)
        }
        const inner = names.size ? [...chain, blockScope(fn, names)] : chain
        if (init) visit(init, inner, fn, depth + 1, node)
        test(child(node, 'test'), inner, fn, depth + 1)
        const update = child(node, 'update')
        if (update) visit(update, inner, fn, depth + 1, node)
        body(child(node, 'body'), inner, fn, depth + 1)
        return
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const left = child(node, 'left')!
        const names = new Set<string>()
        if (left.type === 'VariableDeclaration' && LEXICAL.has(left.kind as string)) {
          for (const declarator of children(left, 'declarations')) patternNames(child(declarator, 'id'), names)
        }
        const inner = names.size ? [...chain, blockScope(fn, names)] : chain
        visit(left, inner, fn, depth + 1, node)
        visit(child(node, 'right')!, chain, fn, depth + 1, node)
        body(child(node, 'body'), inner, fn, depth + 1)
        return
      }
      case 'WhileStatement':
        test(child(node, 'test'), chain, fn, depth + 1)
        body(child(node, 'body'), chain, fn, depth + 1)
        return
      case 'DoWhileStatement':
        body(child(node, 'body'), chain, fn, depth + 1)
        test(child(node, 'test'), chain, fn, depth + 1)
        return
      case 'LabeledStatement':
        // never wrapped: `continue label` must still name the loop itself
        visit(child(node, 'body')!, chain, fn, depth + 1, node)
        return
      case 'SwitchStatement': {
        visit(child(node, 'discriminant')!, chain, fn, depth + 1, node)
        const cases = children(node, 'cases')
        const names = new Set<string>()
        for (const each of cases) lexicalNames(children(each, 'consequent'), names)
        const inner = [...chain, blockScope(fn, names)]
        for (const each of cases) {
          const caseTest = child(each, 'test')
          if (caseTest) visit(caseTest, inner, fn, depth + 1, each)
          statements(children(each, 'consequent'), inner, fn, depth + 1)
        }
        return
      }
      case 'CatchClause': {
        const names = new Set<string>()
        patternNames(child(node, 'param'), names)
        const block = child(node, 'body')!
        const list = children(block, 'body')
        lexicalNames(list, names)
        statements(list, [...chain, blockScope(fn, names)], fn, depth + 1)
        return
      }
      case 'AwaitExpression':
      case 'YieldExpression': {
        const argument = child(node, 'argument')
        // the function is paused while it waits, and back when it resumes (what an `await` gives stays what it gives)
        insert(node.start, `${g}.r(${fn.token},`, depth)
        if (argument) {
          insert(argument.start, `${g}.w(${fn.token},`, depth + 0.5)
          visit(argument, chain, fn, depth + 1, node)
          insert(argument.end, ')', depth + 0.5, true)
          insert(node.end, ')', depth, true)
        } else {
          // a bare `yield`: it hands on undefined, as before
          insert(node.end, ` ${g}.w(${fn.token},undefined))`, depth, true)
        }
        return
      }
      default:
        break
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) visit(item, chain, fn, depth + 1, node)
      } else if (isNode(value)) {
        visit(value, chain, fn, depth + 1, node)
      }
    }
  }

  try {
    const moduleFn = newFunction('(anonymous)', 1, false, true)
    const list = children(program, 'body')
    const names = new Set<string>()
    for (const statement of list) {
      if (statement.type !== 'ImportDeclaration') continue
      for (const specifier of children(statement, 'specifiers')) patternNames(child(specifier, 'local'), names)
    }
    lexicalNames(list, names)
    varNames(program, names)
    // after a hashbang (it must stay first): at the start of the next line, so no line moves (none: nothing runs)
    const start = source.startsWith('#!') ? /^#!.*(?:\r\n|[\n\r\u2028\u2029])/.exec(source)?.[0].length ?? -1 : 0
    if (start >= 0) insert(start, `var ${moduleFn.token}=${g}.e(${moduleFn.id},1);`, -1)
    statements(list, [{ kind: 'module', fn: moduleFn, names }], moduleFn, 1)
  } catch (error) {
    // nothing of a file that fails half way is kept
    points.length = firstPoint
    functions.length = firstFunction
    throw error
  }

  // closing text before opening text at the same place, the innermost closing first and the outermost opening first
  insertions.sort((a, b) => a.at - b.at
    || (a.close === b.close ? 0 : a.close ? -1 : 1)
    || (a.close ? b.depth - a.depth || b.order - a.order : a.depth - b.depth || a.order - b.order))
  let out = ''
  let from = 0
  for (const each of insertions) {
    out += source.slice(from, each.at) + each.text
    from = each.at
  }
  return out + source.slice(from)
}

/**
 * The app's JavaScript files, instrumented for a recorded load: step points and functions are numbered across the
 * files (in path order). A file that cannot be instrumented runs as written and is listed in `skipped`. Never throws.
 */
export function instrumentFiles(files: Readonly<Record<string, string>>): Instrumented {
  const result: Instrumented = { modules: {}, points: [], functions: [], skipped: [] }
  const paths = Object.keys(files).filter(path => /\.m?js$/.test(path)).sort()
  for (const path of paths) {
    const source = files[path]!
    const skip = (reason: SkipReason) => {
      result.modules[path] = source
      result.skipped.push({ path, reason })
    }
    if (source.length > MAX_INSTRUMENT_SOURCE) {
      skip('size')
      continue
    }
    if (source.includes(RECORDER_GLOBAL)) {
      skip('names')
      continue
    }
    try {
      result.modules[path] = instrumentFile(path, source, result.points, result.functions)
    } catch (error) {
      // acorn reports running out of stack as a SyntaxError of its own
      const deep = error instanceof TooDeep || error instanceof RangeError || (error instanceof Error && /stack space/i.test(error.message))
      skip(deep ? 'nesting' : error instanceof TooMany ? 'points' : error instanceof Clash ? 'clash' : 'syntax')
    }
  }
  return result
}
