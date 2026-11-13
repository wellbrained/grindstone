import { afterEach, describe, expect, it } from 'vitest'
import { MAX_INSTRUMENT_SOURCE, instrumentFiles } from '../../../../shared/levels/debugging/instrument'
import type { Instrumented } from '../../../../shared/levels/debugging/instrument'
import { RECORDER_SOURCE, RECORD_LIMITS } from '../../../../shared/levels/debugging/recorder'
import type { RecorderRuntime } from '../../../../shared/levels/debugging/recorder'
import { atBreakpoint, readSteps, scopeAt, withoutInstrumentation } from '../../../../shared/levels/debugging/recording'
import { debuggingLevels } from '../../../../shared/levels'
import type { RecordedStep, RecordedValue } from '../../../../shared/levels/debugging/recording'

// Chapter 5's instrumentation (ADR 0007, "Breakpoints"): the level's modules are rewritten before they run so every
// statement reports a step (its line, the call stack, the variables it can see), without moving a line and without
// changing what the code does. Here the instrumented code runs on Node with the very recorder the bridge runs in the
// sealed frame: the same output as the original, and the steps it posts.

type Posted = Record<string, unknown> & { type: string }

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>
const createRecorder = new Function(`return ${RECORDER_SOURCE}`)() as (limits: typeof RECORD_LIMITS, hooks: unknown) => RecorderRuntime
const scope = globalThis as unknown as { __gs$?: RecorderRuntime }

afterEach(() => {
  delete scope.__gs$
})

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface Run {
  log: unknown[]
  error: string | null
  steps: RecordedStep[]
  posted: Posted[]
  meta: Instrumented
}

/** Runs module-like code (no imports) as the body of a strict async function, instrumented or as written. */
async function run(source: string, options: { instrumented?: boolean, limits?: Partial<typeof RECORD_LIMITS> } = {}): Promise<Run> {
  const posted: Posted[] = []
  const recorder = createRecorder({ ...RECORD_LIMITS, ...options.limits }, { post: (message: Posted) => posted.push(message), now: () => performance.now(), describe: () => 'div' })
  scope.__gs$ = recorder
  const meta = instrumentFiles({ 'app.js': source })
  const code = options.instrumented === false ? source : meta.modules['app.js']!
  const log: unknown[] = []
  let error: string | null = null
  try {
    await new AsyncFunction('log', `'use strict';${code}`)((value: unknown) => log.push(value))
  } catch (thrown) {
    error = thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown)
  }
  await pause(30)
  recorder.stop('stopped')
  const steps = posted.filter(message => message.type === 'steps').flatMap(message => readSteps(message.steps) ?? [])
  return { log, error, steps, posted, meta }
}

/** Runs the code as written and instrumented: both must log the same and end the same. */
async function same(source: string) {
  const plain = await run(source, { instrumented: false })
  const recorded = await run(source)
  expect(recorded.meta.skipped).toEqual([])
  expect(recorded.log).toEqual(plain.log)
  expect(recorded.error).toEqual(plain.error)
  expect(recorded.steps.length).toBeGreaterThan(0)
  return recorded
}

const lineOf = (run: Run, step: RecordedStep) => run.meta.points[step.point]!.line
const lines = (run: Run) => run.steps.map(step => lineOf(run, step))
const fnName = (run: Run, fn: number) => run.meta.functions[fn]!.name
const stackAt = (run: Run, step: RecordedStep) => step.frames.map(frame => `${frame.async ? 'async ' : ''}${fnName(run, frame.fn)}:${run.meta.points[frame.point]?.line ?? '?'}`)
/** The value of a name in a step's scopes (the innermost one that has it). */
function valueAt(run: Run, step: RecordedStep, name: string): RecordedValue | undefined {
  for (const view of scopeAt(run.meta.points, step)) {
    const entry = view.entries.find(([each]) => each === name)
    if (entry) return entry[1]
  }
  return undefined
}

describe('instrumentFiles', () => {
  it('keeps every line where it was, and only touches JavaScript', () => {
    const source = [
      '// line 1',
      'import { formatPrice } from \'./money.js\'',
      'export function total(items) {',
      '  let sum = 0',
      '  for (const item of items) sum += item.price',
      '  if (sum > 10) return formatPrice(sum * 0.9)',
      '  else return formatPrice(sum)',
      '}',
      'export const double = x => x * 2 // line 9',
      'export default async function load() { return await fetch(\'/api/menu\') }',
      ''
    ].join('\n')
    const result = instrumentFiles({ 'app.js': source, 'index.html': '<p>\n</p>', 'style.css': 'p {}' })
    expect(result.skipped).toEqual([])
    expect(Object.keys(result.modules)).toEqual(['app.js'])
    const out = result.modules['app.js']!.split('\n')
    expect(out).toHaveLength(source.split('\n').length)
    // what each line said is still on that line
    source.split('\n').forEach((line, index) => {
      for (const word of line.match(/[A-Za-z_]\w{3,}|\/\/ line \d/g) ?? []) expect(out[index], `line ${index + 1}`).toContain(word)
    })
    // a step on each statement, at its line: the declaration, the loop and its body, the if and both returns
    expect(result.points.map(point => point.line)).toEqual(expect.arrayContaining([4, 5, 6, 7, 9, 10]))
    expect(result.points.every(point => point.path === 'app.js')).toBe(true)
    expect(result.functions.map(fn => fn.name)).toEqual(['(anonymous)', 'total', 'double', 'load'])
  })

  it('names what a line can see: block, local (with this), closure and module scopes, innermost first', () => {
    const source = [
      'const shop = \'Corner Bakery\'',
      'function outer(a) {',
      '  const b = 1',
      '  return function inner(c) {',
      '    for (let i = 0; i < 1; i++) {',
      '      const d = a + b + c + i',
      '    }',
      '  }',
      '}',
      ''
    ].join('\n')
    const result = instrumentFiles({ 'app.js': source })
    const point = result.points.find(each => each.line === 6)!
    expect(point.scopes).toEqual([
      { kind: 'block', name: null, names: ['d', 'i'] },
      { kind: 'local', name: 'inner', names: ['this', 'c'] },
      { kind: 'closure', name: 'outer', names: ['a', 'b'] },
      { kind: 'module', name: null, names: ['outer', 'shop'] }
    ])
    // an arrow function has no `this` of its own
    const arrow = instrumentFiles({ 'app.js': 'const f = (x) => {\n  return x\n}\n' }).points.find(each => each.line === 2)!
    expect(arrow.scopes[0]).toEqual({ kind: 'local', name: 'f', names: ['x'] })
  })

  it('leaves a file it cannot read as it is, and says why, without throwing', () => {
    const deep = `const x = ${'('.repeat(20_000)}1${')'.repeat(20_000)}\n`
    const result = instrumentFiles({
      'broken.js': 'export function add( {\n',
      'huge.js': `// big\n${'let a = 1\n'.repeat(Math.ceil(MAX_INSTRUMENT_SOURCE / 10) + 1)}`,
      'deep.js': deep,
      'names.js': 'const __gs$ = 1\n',
      'fine.js': 'export const one = 1\n'
    })
    expect(result.skipped).toEqual([
      { path: 'broken.js', reason: 'syntax' },
      { path: 'deep.js', reason: 'nesting' },
      { path: 'huge.js', reason: 'size' },
      { path: 'names.js', reason: 'names' }
    ])
    expect(result.modules['broken.js']).toBe('export function add( {\n')
    expect(result.modules['deep.js']).toBe(deep)
    expect(result.modules['fine.js']).toContain('__gs$')
  })

  it('leaves a file as written when a body in a try block would no longer be valid: a var and a function of one name, a function twice', async () => {
    const clashes = {
      'var.js': 'export function setup() {\n  var handler\n  function handler() { return 1 }\n  return handler\n}\n',
      'loop.js': 'export function each(list) {\n  for (var item of list) item()\n  function item() {}\n}\n',
      'twice.js': 'export function pick() {\n  function choose() { return 1 }\n  function choose() { return 2 }\n  return choose()\n}\n',
      'fine.js': 'var handler = 1\nfunction handler2() {}\nexport function inner() {\n  { function nested() {} }\n  var nested2\n  function own() {}\n  return own\n}\n'
    }
    const result = instrumentFiles(clashes)
    expect(result.skipped).toEqual([
      { path: 'loop.js', reason: 'clash' },
      { path: 'twice.js', reason: 'clash' },
      { path: 'var.js', reason: 'clash' }
    ])
    for (const path of ['var.js', 'loop.js', 'twice.js']) expect(result.modules[path]).toBe(clashes[path as keyof typeof clashes])
    expect(result.points.every(point => point.path === 'fine.js')).toBe(true)
    // what does get instrumented still compiles and runs
    const recorded = await same('function setup() {\n  var count = 0\n  function bump() { count++ }\n  bump()\n  return count\n}\nlog(setup())\n')
    expect(recorded.log).toEqual([1])
  })

  it('keeps a hashbang first, on its own line', () => {
    const source = '#!/usr/bin/env node\nconst a = 1\nexport const b = a + 1\n'
    const result = instrumentFiles({ 'app.js': source })
    expect(result.skipped).toEqual([])
    const out = result.modules['app.js']!
    expect(out.startsWith('#!/usr/bin/env node\nvar __gs$m=')).toBe(true)
    expect(out.split('\n')).toHaveLength(source.split('\n').length)
    expect(result.points.map(point => point.line)).toEqual([2, 3])
    expect(withoutInstrumentation(out)).toBe(source)
    // a file that is only a hashbang has nothing to record
    expect(instrumentFiles({ 'app.js': '#!/usr/bin/env node' }).modules['app.js']).toBe('#!/usr/bin/env node')
  })

  it('reads a large file in linear time', () => {
    const body = Array.from({ length: 900 }, (_, index) => `export function f${index}(a) { if (a) { return a + ${index} } else { return [a, { b: a }] } }`).join('\n')
    const started = performance.now()
    const result = instrumentFiles({ 'app.js': body })
    expect(performance.now() - started).toBeLessThan(2000)
    expect(result.skipped).toEqual([])
    expect(body.length).toBeLessThanOrEqual(MAX_INSTRUMENT_SOURCE)
    expect(result.modules['app.js']!.split('\n')).toHaveLength(900)
  })
})

describe('the instrumented code does what the code did', () => {
  it('keeps closures in loops (var shared, let per round) and hoisting', async () => {
    await same(`
      const fns = []
      for (var i = 0; i < 3; i++) fns.push(() => i)
      const lets = []
      for (let j = 0; j < 3; j++) lets.push(() => j)
      log(fns.map(f => f()))
      log(lets.map(f => f()))
      log(early())
      log(typeof hoisted)
      var hoisted = 1
      function early() { return 'declared below' }
      try { log(later) } catch (error) { log(error.name) }
      const later = 2
      log(later)
    `)
  })

  it('keeps empty bodies valid: functions, arrows, methods and static blocks with nothing in them (review 2026-11-13)', async () => {
    const run = await same(`
      const noop = () => {}
      function nothing() {}
      const object = { method() {}, get value() { return 1 } }
      class Empty { constructor() {} static {} run() {} }
      noop()
      nothing()
      object.method()
      new Empty().run()
      log(noop(), nothing(), object.value)
    `)
    expect(withoutInstrumentation(run.meta.modules['app.js']!)).not.toContain('__gs$')
  })

  it('keeps classes: constructors, super, getters and setters, statics, private fields, static blocks and arrow fields', async () => {
    await same(`
      class Cart {
        #items = []
        static count = 0
        static { Cart.count = 10 }
        constructor(owner) { this.owner = owner; Cart.count++ }
        add(item) { this.#items.push(item); return this }
        get size() { return this.#items.length }
        set size(value) { throw new Error('read only ' + value) }
        handler = () => this.owner
        static make() { return new Cart('shop') }
      }
      class Special extends Cart {
        constructor(owner) {
          const upper = owner.toUpperCase()
          super(upper)
          this.special = true
        }
        add(item) { return super.add(item + '!') }
      }
      const cart = Cart.make().add('croissant').add('loaf')
      log([cart.size, cart.handler(), Cart.count])
      const special = new Special('maya').add('tart')
      log([special.owner, special.size, special.special, special instanceof Cart])
      try { special.size = 3 } catch (error) { log(error.message) }
    `)
  })

  it('keeps async functions: their order, values, rejections and awaits in loops', async () => {
    await same(`
      const wait = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms))
      async function a() { log('a1'); await wait(5); log('a2'); return 'A' }
      async function b() { log('b1'); await null; log('b2'); return 'B' }
      async function fails() { await wait(1); throw new Error('nope') }
      const both = Promise.all([a(), b()])
      log('sync')
      log(await both)
      try { await fails() } catch (error) { log('caught ' + error.message) }
      const total = async items => { let sum = 0; for (const item of items) sum += await item; return sum }
      log(await total([1, wait(2, 2), 3]))
      log(await (async () => ({ ok: true }))())
    `)
  })

  it('keeps generators: yield, yield*, return and throw', async () => {
    await same(`
      function* inner() { yield 'x'; return 'r' }
      function* numbers() {
        try {
          const got = yield 1
          log('got ' + got)
          const back = yield* inner()
          log('back ' + back)
          yield 2
        } finally {
          log('cleanup')
        }
      }
      const it = numbers()
      log(it.next())
      log(it.next('a'))
      log(it.next())
      log(it.next())
      log(it.return(9))
      const other = numbers()
      other.next()
      try { other.throw(new Error('boom')) } catch (error) { log(error.message) }
    `)
  })

  it('keeps labels, braceless bodies, else if chains, switch and finally', async () => {
    await same(`
      const seen = []
      outer: for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (j === 2) continue outer
          if (i === 3) break outer
          seen.push(i + '' + j)
        }
      }
      log(seen)
      block: { log('in'); if (seen.length) break block; log('never') }
      const size = n => { if (n < 2) return 'small'; else if (n < 5) return 'medium'; else return 'large' }
      log([1, 3, 9].map(size))
      let k = 0
      while (k < 3) k++
      do k += 10; while (k < 30)
      for (const x of [1, 2]) if (x > 1) log('x ' + x)
      switch (k) {
        case 33: { let note = 'thirty-three'; log(note) }
        case 1: log('falls through'); break
        default: log('never')
      }
      function finallyWins() { try { return 'try' } finally { log('finally') } }
      log(finallyWins())
    `)
  })

  it('keeps this, arguments, defaults, destructuring, object literal bodies and getters that count', async () => {
    await same(`
      let reads = 0
      const shop = {
        name: 'Corner Bakery',
        get busy() { reads++; return true },
        hello() { return [this.name, (() => this.name)()] },
        args() { return arguments.length }
      }
      function plain() { return this }
      log(shop.hello())
      log(shop.args(1, 2, 3))
      log(plain() === undefined)
      const pick = ({ a = 1, b: [c, ...rest] = [2, 3, 4] } = {}, ...more) => ({ a, c, rest, more })
      log(pick())
      log(pick({ a: 5, b: [6] }, 7))
      const total = [1, 2, 3].reduce((sum, value) => sum + value, 0)
      log(\`total \${total}\`)
      log(shop?.missing?.deep ?? 'none')
      log(reads)
    `)
  })
})

describe('the recording', () => {
  it('reports each statement before it runs, with its line and call stack', async () => {
    const recorded = await same([
      'function applyDiscount(total) {',
      '  return total * 0.9',
      '}',
      'function basketTotal() {',
      '  let total = 4.8',
      '  total = applyDiscount(total)',
      '  return total',
      '}',
      'log(basketTotal())',
      ''
    ].join('\n'))
    expect(lines(recorded)).toEqual([9, 5, 6, 2, 7])
    expect(recorded.steps.map(step => stackAt(recorded, step))).toEqual([
      ['(anonymous):9'],
      ['basketTotal:5', '(anonymous):9'],
      ['basketTotal:6', '(anonymous):9'],
      ['applyDiscount:2', 'basketTotal:6', '(anonymous):9'],
      ['basketTotal:7', '(anonymous):9']
    ])
    // the values are those before the line runs
    expect(valueAt(recorded, recorded.steps[2]!, 'total')).toEqual({ t: 'number', v: 4.8 })
    expect(valueAt(recorded, recorded.steps[4]!, 'total')).toEqual({ t: 'number', v: 4.32 })
    expect(valueAt(recorded, recorded.steps[3]!, 'total')).toEqual({ t: 'number', v: 4.8 })
  })

  it('steps through a loop\'s test every round', async () => {
    const recorded = await same([
      'const items = [\'a\', \'b\', \'c\']',
      'for (let i = 0; i < items.length - 1; i++) {',
      '  log(items[i])',
      '}',
      ''
    ].join('\n'))
    expect(lines(recorded)).toEqual([1, 2, 2, 3, 2, 3, 2])
    // the for statement itself runs before `i` exists; its test sees it every round
    expect(recorded.steps.filter(step => lineOf(recorded, step) === 2).map(step => valueAt(recorded, step, 'i'))).toEqual([
      undefined,
      { t: 'number', v: 0 },
      { t: 'number', v: 1 },
      { t: 'number', v: 2 }
    ])
    // a breakpoint on the for line stops at the test every round, round 0 included: `i === 0` holds once
    const breakpoint = { path: 'app.js', line: 2, condition: '' }
    const stops = recorded.steps.flatMap((_, index) => atBreakpoint(recorded.steps, recorded.meta.points, index, breakpoint) ? [valueAt(recorded, recorded.steps[index]!, 'i')] : [])
    expect(stops).toEqual([{ t: 'number', v: 0 }, { t: 'number', v: 1 }, { t: 'number', v: 2 }])
    // a test on a later line leaves the for line its own stop
    const split = instrumentFiles({ 'app.js': 'for (let i = 0;\n  i < 2; i++) log(i)\n' })
    expect(split.points.filter(point => point.testFollows)).toEqual([])
  })

  it('shows an awaiting function on top after it resumes, its caller as an async frame', async () => {
    const recorded = await same([
      'async function priceOf(id) {',
      '  const price = await Promise.resolve(2.4)',
      '  return price',
      '}',
      'async function addToCart(id) {',
      '  const price = await priceOf(id)',
      '  log(price)',
      '}',
      'addToCart(\'croissant\')',
      'log(\'clicked\')',
      ''
    ].join('\n'))
    expect(recorded.steps.map(step => stackAt(recorded, step))).toEqual([
      ['(anonymous):9'],
      ['addToCart:6', '(anonymous):9'],
      ['priceOf:2', 'addToCart:6', '(anonymous):9'],
      ['(anonymous):10'],
      ['priceOf:3', 'async addToCart:6', 'async (anonymous):9'],
      ['addToCart:7', 'async (anonymous):9']
    ])
  })

  it('snapshots values safely: strings cut, objects capped and shallow, cycles, getters never called, TDZ', async () => {
    const recorded = await run([
      'let reads = 0',
      'const long = \'x\'.repeat(5000)',
      'const many = Array.from({ length: 500 }, (_, i) => i)',
      'const deep = { a: { b: { c: { d: { e: 1 } } } } }',
      'const loop = { name: \'loop\' }',
      'loop.self = loop',
      'const lazy = { get value() { reads++; return 1 } }',
      'const map = new Map([[\'croissant\', 2.4]])',
      'const fn = function applyDiscount(total, rate) { return total }',
      'log(reads)',
      'const late = 1',
      ''
    ].join('\n'))
    expect(recorded.log).toEqual([0])
    const last = recorded.steps.at(-1)!
    expect(lineOf(recorded, last)).toBe(11)
    const long = valueAt(recorded, last, 'long')!
    expect(long).toMatchObject({ t: 'string', full: 5000 })
    expect((long as { v: string }).v.length).toBeLessThanOrEqual(RECORD_LIMITS.maxString)
    expect(valueAt(recorded, last, 'many')).toMatchObject({ t: 'object', c: 'Array', n: 500, more: 500 - RECORD_LIMITS.maxItems })
    const loop = valueAt(recorded, last, 'loop') as Extract<RecordedValue, { t: 'object' }>
    expect(loop.e!.find(([key]) => key === 'self')![1]).toEqual({ t: 'ref', id: loop.id })
    expect(valueAt(recorded, last, 'lazy')).toMatchObject({ e: [['value', { t: 'getter' }]] })
    expect(valueAt(recorded, last, 'map')).toMatchObject({ t: 'object', c: 'Map', n: 1, e: [['\'croissant\'', { t: 'number', v: 2.4 }]] })
    expect(valueAt(recorded, last, 'fn')).toEqual({ t: 'function', v: 'ƒ applyDiscount(total, rate)' })
    expect(valueAt(recorded, last, 'late')).toEqual({ t: 'uninitialized' })
    // depth: the variable, then three levels of properties; deeper objects are not opened
    const deep = JSON.stringify(valueAt(recorded, last, 'deep'))
    expect(deep).toContain('"e":null')
    expect(deep).not.toContain('"t":"number"')
  })

  it('stops after its cap, and the app runs on to its end', async () => {
    const recorded = await run('let sum = 0\nfor (let i = 0; i < 100000; i++) sum += i\nlog(sum)\n', { limits: { maxSteps: 500 } })
    expect(recorded.log).toEqual([4999950000])
    expect(recorded.steps).toHaveLength(500)
    expect(recorded.posted.filter(message => message.type === 'recordEnd')).toEqual([{ type: 'recordEnd', reason: 'steps', count: 500 }])
    // batched: never a message per step
    expect(recorded.posted.filter(message => message.type === 'steps').length).toBeLessThanOrEqual(Math.ceil(500 / RECORD_LIMITS.batch) + 1)
  })

  it('stops when snapshots take too long, and records nothing once stopped', async () => {
    const recorded = await run('const big = Object.fromEntries(Object.entries(new Array(20000).fill(1)))\nfor (let i = 0; i < 300; i++) big.k0 = i\nlog(big.k0)\n', { limits: { maxMs: 30 } })
    expect(recorded.log).toEqual([299])
    expect(recorded.posted.filter(message => message.type === 'recordEnd')).toEqual([expect.objectContaining({ reason: 'slow' })])
    expect(recorded.steps.length).toBeLessThan(RECORD_LIMITS.maxSteps)
  })
})

describe('withoutInstrumentation', () => {
  it('gives every level\'s code back exactly as written', () => {
    let files = 0
    for (const level of debuggingLevels) {
      const original = level.setup().files
      const { modules, skipped } = instrumentFiles(original)
      for (const [path, text] of Object.entries(modules)) {
        if (skipped.some(each => each.path === path)) continue
        expect(withoutInstrumentation(text), `${level.id} ${path}`).toBe(original[path])
        files++
      }
    }
    expect(files).toBeGreaterThan(150)
  })

  it('gives tricky code back as written: awaits, yields, braceless bodies, loops, strings and templates with brackets', () => {
    const source = [
      'async function* g(a) { const b = await f(a, (1)); yield; yield* other(); const c = yield await x }',
      'for (let i = 0; i < n(\')\'); i++) if (i) log(`}${i}{`); else while (k < 3) k++',
      'const h = x => ({ a: \'{\', b: `${x => x}` })',
      'do { k-- } while (k > "(")',
      'label: for (const v of list) { if (v) continue label }',
      ''
    ].join('\n')
    expect(withoutInstrumentation(instrumentFiles({ 'app.js': source }).modules['app.js']!)).toBe(source)
  })

  it('gives regex literals back as written, brackets and quotes in them included, and tells them from division', () => {
    const source = [
      'let t = \'\'',
      'export function clean(s, list, k) {',
      '  if (s) t = s.replace(/[)]/g, "")',
      '  for (const x of list) t = x.replace(/}/g, \'\')',
      '  while (k) k = k.replace(/\'/g, "")',
      '  const parts = s.split(/[(]/)',
      '  const half = (t.length) / 2 / k',
      '  if (half) t = /\\/[/{]/.test(s) ? half / 2 : `${/}/.source}`',
      '  do t += 1; while (/[)}]/.test(t) && list.length / 3 > 1)',
      '  return typeof /{/ === \'object\' && parts',
      '}',
      'export const arrow = s => s.match(/["(]/g)',
      ''
    ].join('\n')
    const { modules, skipped } = instrumentFiles({ 'app.js': source })
    expect(skipped).toEqual([])
    expect(withoutInstrumentation(modules['app.js']!)).toBe(source)
  })

  it('cleans what Firefox and Safari quote in an error message, and leaves other text alone', () => {
    const { modules } = instrumentFiles({ 'slots.js': 'export function show(slots) {\n  return slots.map(slot => slot.time)\n}\n' })
    const quoted = /slots\.map\(slot => .*?\)\}finally\{__gs\$\.x\(__gs\$f\)\}\}\)/.exec(modules['slots.js']!)![0]
    expect(withoutInstrumentation(`TypeError: slots.map is not a function. (In '${quoted}', 'slots.map' is undefined)`))
      .toBe('TypeError: slots.map is not a function. (In \'slots.map(slot => slot.time)\', \'slots.map\' is undefined)')
    expect(withoutInstrumentation('TypeError: cart.itmes is undefined')).toBe('TypeError: cart.itmes is undefined')
    // a cut-off fragment never throws
    expect(() => withoutInstrumentation('(__gs$.on&&__gs$.s(1,__gs$f,[()=>a]),i < n')).not.toThrow()
  })

  it('stays linear on hostile text (a message an app builds to look like instrumentation)', () => {
    const hostile = `${'{__gs$.on&&__gs$.s(1,__gs$f,[]);('.repeat(300)}${'"\\`'.repeat(200)}`.slice(0, 10_000)
    const started = performance.now()
    for (let i = 0; i < 1000; i++) withoutInstrumentation(hostile)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
