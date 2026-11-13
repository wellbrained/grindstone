import { afterEach, describe, expect, it } from 'vitest'
import { instrumentFiles } from '../../../../shared/levels/debugging/instrument'
import type { Instrumented } from '../../../../shared/levels/debugging/instrument'
import { PROFILE_LIMITS, RECORDER_SOURCE, countingLimits } from '../../../../shared/levels/debugging/recorder'
import type { CountingLimits, RecorderRuntime } from '../../../../shared/levels/debugging/recorder'

// Chapter 6's counting (ADR 0007, "Performance"): the same instrumented code and the same recorder as chapter 5, run
// counting: each statement is a unit of work, for the function running it (self) and for every function on the stack
// (total); calls per function; what the page changed belongs to the statement that ran since the last look. Here the
// instrumented code runs on Node with the very recorder of the frame; `takeDom` stands in for the MutationObserver.

type Posted = Record<string, unknown> & { type: string }

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>
const createRecorder = new Function(`return ${RECORDER_SOURCE}`)() as (limits: CountingLimits, hooks: unknown) => RecorderRuntime
const scope = globalThis as unknown as { __gs$?: RecorderRuntime, page?: { change: (nodes: number) => void } }

afterEach(() => {
  delete scope.__gs$
  delete scope.page
})

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface Counted {
  recorder: RecorderRuntime
  posted: Posted[]
  meta: Instrumented
  log: unknown[]
  /** The profile posted at Stop (mode 'profile'). */
  profile: Posted | undefined
}

/**
 * Runs module-like code instrumented, counting. `page.change(n)` in the code stands for a DOM change of n nodes (what
 * the MutationObserver would report at the next look). `actions` run after the code, each starting an action first.
 */
async function count(source: string, options: { mode?: 'check' | 'profile', limits?: Partial<CountingLimits>, actions?: { kind: string, run: () => unknown }[] } = {}): Promise<Counted> {
  const posted: Posted[] = []
  let pending: number[] = []
  let clock = 0
  const recorder = createRecorder({ ...countingLimits(options.mode ?? 'profile'), ...options.limits }, {
    post: (message: Posted) => posted.push(message),
    now: () => performance.now(),
    describe: () => 'div',
    takeDom: () => {
      const taken = pending
      pending = []
      return taken
    },
    clock: () => clock,
    requests: () => [[1, 0, 300]]
  })
  scope.__gs$ = recorder
  scope.page = { change: (nodes: number) => pending.push(nodes) }
  const meta = instrumentFiles({ 'app.js': source })
  expect(meta.skipped).toEqual([])
  const log: unknown[] = []
  await new AsyncFunction('log', `'use strict';${meta.modules['app.js']!}`)((value: unknown) => log.push(value))
  await pause(5)
  for (const action of options.actions ?? []) {
    clock += 100
    recorder.action(action.kind, 'button.add', 'Add')
    await action.run()
    await pause(5)
  }
  recorder.stop('stopped')
  return { recorder, posted, meta, log, profile: posted.find(message => message.type === 'profile') }
}

interface FnRow { name: string, calls: number, self: number, total: number }
type ProfileAction = { work: number, fns: number[][], dom: number[][], renders: number[][], kind: string, label: string, at: number, more: number, requests: number[] }

const actionsOf = (run: Counted) => run.profile!.actions as ProfileAction[]
/** The functions of one action by name; an anonymous one by its line too ("(anonymous):1" is the module's top level). */
function fns(run: Counted, action = 0): Record<string, FnRow> {
  const rows: Record<string, FnRow> = {}
  for (const [fn, calls, self, total] of actionsOf(run)[action]!.fns) {
    const info = run.meta.functions[fn!]!
    rows[info.name === '(anonymous)' ? `${info.name}:${info.line}` : info.name] = { name: info.name, calls: calls!, self: self!, total: total! }
  }
  return rows
}

describe('counting work', () => {
  it('counts a unit per statement: self for the function running it, total for every function on the stack', async () => {
    const run = await count([
      'function inner(x) {',
      '  const y = x * 2',
      '  return y',
      '}',
      'function outer() {',
      '  let sum = 0',
      '  for (let i = 0; i < 3; i++) sum += inner(i)',
      '  return sum',
      '}',
      'log(outer())'
    ].join('\n'))
    expect(run.log).toEqual([6])
    const rows = fns(run)
    expect(rows.inner).toMatchObject({ calls: 3, self: 6, total: 6 })
    // outer: let, the for statement, its test 4 times, the body 3 times, return
    expect(rows.outer).toMatchObject({ calls: 1, self: 10, total: 16 })
    // the module: its one statement, and everything under it
    expect(rows['(anonymous):1']).toMatchObject({ calls: 1, self: 1, total: 17 })
    expect(actionsOf(run)[0]!.work).toBe(17)
    expect(run.profile!.work).toBe(17)
  })

  it('counts a recursive function\'s total once per unit, and callbacks run by built-ins under their caller', async () => {
    const run = await count([
      'function fib(n) {',
      '  if (n < 2) return n',
      '  return fib(n - 1) + fib(n - 2)',
      '}',
      'const doubled = [1, 2, 3].map(n => n * 2)',
      'log(fib(4), doubled)'
    ].join('\n'))
    const rows = fns(run)
    // fib(4) makes 9 calls; each runs its test and one return (the braceless one is a statement of its own)
    expect(rows.fib).toMatchObject({ calls: 9, self: 18, total: 18 })
    // the arrow runs as map's callback: once per item, its units in the module's total
    expect(rows['(anonymous):5']).toMatchObject({ calls: 3, self: 3, total: 3 })
    expect(rows['(anonymous):1']).toMatchObject({ calls: 1, self: 2, total: 23 })
    expect(actionsOf(run)[0]!.work).toBe(2 + 18 + 3)
  })

  it('follows async functions across awaits', async () => {
    const run = await count([
      'async function load() {',
      '  const first = await Promise.resolve(1)',
      '  const second = await Promise.resolve(2)',
      '  return first + second',
      '}',
      'log(await load())'
    ].join('\n'))
    expect(run.log).toEqual([3])
    expect(fns(run).load).toMatchObject({ calls: 1, self: 3, total: 3 })
  })

  it('gives each change of the page to the statement that made it, and counts a render per call that changed it', async () => {
    const run = await count([
      'function renderMenu(items) {',
      '  const html = items.join(\'\')',
      '  page.change(items.length)',
      '  return html',
      '}',
      'function renderBasket() {',
      '  page.change(1)',
      '  page.change(2)',
      '}',
      'renderMenu([1, 2, 3])',
      'renderBasket()',
      'renderMenu([1])'
    ].join('\n'))
    const [load] = actionsOf(run)
    const at = (line: number) => load!.dom.find(([point]) => run.meta.points[point!]!.line === line)?.slice(1)
    expect(at(3)).toEqual([2, 4])
    expect(at(7)).toEqual([1, 1])
    expect(at(8)).toEqual([1, 2])
    const renders = Object.fromEntries(load!.renders.map(([fn, calls, nodes]) => [run.meta.functions[fn!]!.name, [calls, nodes]]))
    expect(renders).toEqual({ renderMenu: [2, 4], renderBasket: [1, 3] })
  })

  it('groups everything by action: the load, then each action the bridge reports, with its server clock and requests', async () => {
    const run = await count([
      'export function add() {',
      '  page.change(2)',
      '  return 1',
      '}',
      'add()'
    ].join('\n').replace('export ', ''), {
      actions: [
        { kind: 'click', run: () => (globalThis as unknown as { __gs$: RecorderRuntime }).__gs$.request(7) },
        { kind: 'input', run: () => undefined }
      ]
    })
    const actions = actionsOf(run)
    expect(actions.map(action => [action.kind, action.label, action.at, action.requests])).toEqual([['load', '', 0, []], ['click', 'Add', 100, [7]], ['input', 'Add', 200, []]])
    expect(actions[0]!.work).toBe(3)
    expect(actions[1]!.work).toBe(0)
    expect(run.profile!.requests).toEqual([[1, 0, 300]])
  })

  it('keeps at most maxActions actions: later ones count into the last', async () => {
    const run = await count('const a = 1', { limits: { maxActions: 2 }, actions: [{ kind: 'click', run: () => {} }, { kind: 'click', run: () => {} }, { kind: 'click', run: () => {} }] })
    expect(actionsOf(run).map(action => action.more)).toEqual([0, 2])
  })

  it('stops counting at its cap (the app runs on), and a check run then reads no number', async () => {
    const run = await count('let n = 0\nfor (let i = 0; i < 100; i++) n += i\nlog(n)', { mode: 'check', limits: { maxWork: 50 } })
    expect(run.log).toEqual([4950])
    expect(run.recorder.work()).toBe(-1)
    // a check run posts nothing: the probes read the count
    expect(run.posted).toEqual([])
  })

  it('posts the profile once, at Stop, with the reason; a profile at its cap says so', async () => {
    const capped = await count('let n = 0\nfor (let i = 0; i < 100; i++) n += i', { limits: { maxWork: 50 } })
    expect(capped.posted.filter(message => message.type === 'profile')).toHaveLength(1)
    expect(capped.profile).toMatchObject({ reason: 'work', work: 50 })
    const stopped = await count('const a = 1')
    expect(stopped.profile).toMatchObject({ reason: 'stopped', work: 1 })
    expect(stopped.recorder.work()).toBe(1)
  })

  it('posts a live count while recording, at most every tickMs', async () => {
    const run = await count('let n = 0\nfor (let i = 0; i < 3000; i++) n += i', { limits: { tickMs: 0 } })
    const ticks = run.posted.filter(message => message.type === 'profileTick')
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks[0]).toEqual({ type: 'profileTick', work: 1024, actions: 1 })
  })

  it('keeps tables at maxRows rows and never takes a key that is not a whole number', async () => {
    const run = await count([
      'const fns = [1, 2, 3, 4, 5].map(n => () => n)',
      'for (const fn of fns) fn()'
    ].join('\n'), {
      limits: { maxRows: 3 },
      // what an app could call the recorder with: keys that are not numbers of functions
      actions: [{
        kind: 'click',
        run: () => {
          const recorder = scope.__gs$ as unknown as { e: (fn: unknown, module: number) => unknown }
          recorder.e('__proto__', 0)
          recorder.e(-1, 0)
          recorder.e(1.5, 0)
        }
      }]
    })
    expect(actionsOf(run)[0]!.fns.length).toBe(3)
    expect(actionsOf(run)[1]!.fns).toEqual([])
    expect(({} as Record<string, unknown>)[0]).toBeUndefined()
  })

  it('can not be switched off or replaced by the app code; a check run stopped by it reads no number', async () => {
    // the app's code reaches the recorder through its global (instrument.ts never touches a file that names it)
    const run = await count([
      'const recorder = globalThis["__gs" + "$"]',
      'let refused = 0',
      'try { recorder.on = false } catch (error) { refused += 1 }',
      'try { recorder.s = () => {} } catch (error) { refused += 1 }',
      'log(refused)',
      'log(recorder.on)',
      'recorder.stop("stopped")',
      'log("after")'
    ].join('\n'), { mode: 'check' })
    expect(run.log).toEqual([2, true, 'after'])
    expect(run.recorder.on).toBe(false)
    expect(run.recorder.work()).toBe(-1)
    expect(Object.isFrozen(run.recorder)).toBe(true)
  })

  it('keeps at most maxRequests request ids in all, each in one action', async () => {
    const run = await count('const a = 1', {
      limits: { maxRequests: 3 },
      actions: [
        { kind: 'click', run: () => [1, 2].forEach(id => scope.__gs$!.request(id)) },
        { kind: 'click', run: () => [3, 4, 5].forEach(id => scope.__gs$!.request(id)) }
      ]
    })
    expect(actionsOf(run).map(action => action.requests)).toEqual([[], [1, 2], [3]])
  })

  it('has the limits the page reads with', () => {
    expect(countingLimits('check')).toMatchObject({ profile: 1, maxWork: PROFILE_LIMITS.maxWork })
    expect(countingLimits('profile')).toMatchObject({ profile: 2 })
  })
})
