import { describe, expect, it } from 'vitest'
import type { StepPoint } from '../../../../shared/levels/debugging/instrument'
import {
  atBreakpoint, fittingSteps, frameStep, hitCounts, isExpandable, nextHit, previousHit, readSteps, recordedLines, scopeAt, scopeValues, stepBack,
  stepInto, stepOut, stepOver, valueChildren, valuePreview
} from '../../../../shared/levels/debugging/recording'
import type { Breakpoint, RecordedStep, RecordedValue } from '../../../../shared/levels/debugging/recording'

// The stepping model of a recorded run (chapter 5): nothing is paused, a step is a moment that already happened, so the
// Debugger moves forward and back over the steps the recorder posted. Step over stays in the call (and its callers),
// into goes to the very next step, out leaves the call, Resume goes to the next step a breakpoint stops at.

const point = (path: string, line: number, fn: number, names: string[] = []): StepPoint => ({ path, line, column: 1, fn, scopes: names.length ? [{ kind: 'local', name: null, names }] : [] })

// app.js:9 renderTotal() → checkout.js renderTotal → cart.js basketTotal → loyalty.js applyDiscount, twice
const POINTS: StepPoint[] = [
  point('app.js', 9, 0),
  point('checkout.js', 14, 1, ['total']),
  point('cart.js', 5, 2, ['total']),
  point('cart.js', 6, 2, ['total']),
  point('loyalty.js', 2, 3, ['total']),
  point('cart.js', 7, 2, ['total']),
  point('checkout.js', 15, 1, ['total']),
  point('app.js', 10, 0)
]

/** A step: its point, its call, the calls under it (top first), the value of `total` if the point has it. */
const step = (at: number, calls: number[], total?: number, asyncFrom = -1): RecordedStep => ({
  point: at,
  inv: calls[0]!,
  frames: calls.map((inv, index) => ({ inv, fn: inv, point: at, async: asyncFrom >= 0 && index >= asyncFrom })),
  values: total === undefined ? [] : [{ t: 'number', v: total }]
})

const STEPS: RecordedStep[] = [
  step(0, [0]), // 0 app.js:9
  step(1, [1, 0], 0), // 1 checkout.js:14  let total = basketTotal()
  step(2, [2, 1, 0], 0), // 2 cart.js:5
  step(3, [2, 1, 0], 4.8), // 3 cart.js:6  total = applyDiscount(total)
  step(4, [3, 2, 1, 0], 4.8), // 4 loyalty.js:2
  step(5, [2, 1, 0], 4.32), // 5 cart.js:7  return total
  step(6, [1, 0], 4.32), // 6 checkout.js:15  total = applyDiscount(total)
  step(4, [4, 1, 0], 4.32), // 7 loyalty.js:2 again
  step(7, [0]) // 8 app.js:10
]

const always = () => true
const at = (path: string, line: number, condition = ''): Breakpoint => ({ path, line, condition })

describe('stepping through a recording', () => {
  it('steps into the next step, over the calls a line makes, out of the call, and back', () => {
    expect(stepInto(STEPS, 3)).toBe(4)
    expect(stepOver(STEPS, 3)).toBe(5)
    expect(stepOver(STEPS, 1)).toBe(6)
    // the last step of a call: on to whatever runs after it ended
    expect(stepOver(STEPS, 5)).toBe(6)
    expect(stepOut(STEPS, 4)).toBe(5)
    expect(stepOut(STEPS, 2)).toBe(6)
    expect(stepOut(STEPS, 7)).toBe(8)
    expect(stepBack(5)).toBe(4)
    expect(stepBack(0)).toBe(0)
    // at the end, everything stays at the end
    for (const move of [stepInto, stepOver, stepOut]) expect(move(STEPS, 8)).toBe(8)
  })

  it('steps over an await to where the function goes on once it is back', () => {
    // addToCart awaits priceOf (call 2); the click handler returns, another click comes, then addToCart is back
    const steps = [
      step(0, [1]), // addToCart: const price = await priceOf(id)
      step(1, [2, 1]), // priceOf
      step(2, [9]), // another click handler, nothing to do with it
      step(3, [1], undefined, 1), // addToCart is back (its caller now an async frame)
      step(4, [1], undefined, 1)
    ]
    expect(stepOver(steps, 0)).toBe(3)
    expect(stepOut(steps, 1)).toBe(2)
    // a function back from an await is not on the stack of the call that started it any more
    expect(stepOut(steps, 3)).toBe(4)
  })

  it('resumes to the next and previous breakpoint, and counts its hits', () => {
    const discount = [at('loyalty.js', 2)]
    expect(nextHit(STEPS, POINTS, 0, discount, always)).toEqual({ index: 4, breakpoint: discount[0] })
    expect(nextHit(STEPS, POINTS, 4, discount, always)?.index).toBe(7)
    expect(nextHit(STEPS, POINTS, 7, discount, always)).toBeNull()
    expect(previousHit(STEPS, POINTS, 7, discount, always)?.index).toBe(4)
    expect(previousHit(STEPS, POINTS, 4, discount, always)).toBeNull()
    expect(hitCounts(STEPS, POINTS, [...discount, at('cart.js', 6), at('app.js', 3)], always)).toEqual([2, 1, 0])
    expect(nextHit(STEPS, POINTS, 0, [], always)).toBeNull()
    // a condition decides which hits count
    const second = (_: Breakpoint, step: RecordedStep) => step.values[0]?.t === 'number' && step.values[0].v < 4.5
    expect(nextHit(STEPS, POINTS, 0, discount, second)?.index).toBe(7)
    expect(hitCounts(STEPS, POINTS, discount, second)).toEqual([1])
  })

  it('stops once each time a line runs, not at each statement of it', () => {
    // two statements on line 2 (`if (a) return b`), then line 3
    const points = [point('app.js', 2, 0), point('app.js', 2, 0), point('app.js', 3, 0)]
    const steps = [step(0, [1]), step(1, [1]), step(2, [1]), step(0, [1]), step(2, [1]), step(0, [1]), step(1, [2])]
    expect(steps.map((_, index) => atBreakpoint(steps, points, index, at('app.js', 2)))).toEqual([true, false, false, true, false, true, true])
  })

  it('stops on a for line at its test every round, round 0 too, so the loop\'s variables are there', () => {
    // a for line: the statement (before `i` exists), then its test every round; the body on line 3
    const head: StepPoint = { ...point('app.js', 2, 0), testFollows: true }
    const points = [head, point('app.js', 2, 0, ['i']), point('app.js', 3, 0, ['i'])]
    const round = (n: number): RecordedStep => ({ ...step(1, [1]), values: [{ t: 'number', v: n }] })
    const steps = [step(0, [1]), round(0), step(2, [1]), round(1), step(2, [1]), round(2)]
    expect(steps.map((_, index) => atBreakpoint(steps, points, index, at('app.js', 2)))).toEqual([false, true, false, true, false, true])
    const first = (_: Breakpoint, each: RecordedStep) => each.values[0]?.t === 'number' && each.values[0].v === 0
    expect(nextHit(steps, points, -1, [at('app.js', 2)], first)?.index).toBe(1)
    expect(hitCounts(steps, points, [at('app.js', 2)], always)).toEqual([3])
    // a statement before the loop on the same line is where the line starts: one stop there, then every later round
    const before = [point('app.js', 2, 0), ...points]
    const shifted = [step(0, [1]), ...steps.map(each => ({ ...each, point: each.point + 1 }))]
    expect(shifted.map((_, index) => atBreakpoint(shifted, before, index, at('app.js', 2)))).toEqual([true, false, false, false, true, false, true])
  })

  it('shows a caller\'s values from its own last step', () => {
    expect(frameStep(STEPS, 4, 0)).toBe(4)
    expect(frameStep(STEPS, 4, 1)).toBe(3)
    expect(frameStep(STEPS, 4, 2)).toBe(1)
    expect(frameStep(STEPS, 4, 9)).toBeNull()
  })

  it('reads the scopes of a step, innermost first, and the values a condition sees', () => {
    const points: StepPoint[] = [{
      path: 'app.js',
      line: 1,
      column: 1,
      fn: 0,
      scopes: [
        { kind: 'block', name: null, names: ['i'] },
        { kind: 'local', name: 'f', names: ['this', 'total'] },
        { kind: 'module', name: null, names: ['i', 'shop'] }
      ]
    }]
    const values: RecordedValue[] = [{ t: 'number', v: 2 }, { t: 'undefined' }, { t: 'number', v: 4.8 }, { t: 'number', v: 9 }, { t: 'string', v: 'Corner' }]
    const one: RecordedStep = { point: 0, inv: 1, frames: [], values }
    expect(scopeAt(points, one)).toEqual([
      { kind: 'block', name: null, entries: [['i', { t: 'number', v: 2 }]] },
      { kind: 'local', name: 'f', entries: [['this', { t: 'undefined' }], ['total', { t: 'number', v: 4.8 }]] },
      { kind: 'module', name: null, entries: [['i', { t: 'number', v: 9 }], ['shop', { t: 'string', v: 'Corner' }]] }
    ])
    // the innermost `i` wins
    expect(scopeValues(points, one).get('i')).toEqual({ t: 'number', v: 2 })
    expect(recordedLines(STEPS, POINTS).get('loyalty.js')).toEqual(new Set([2]))
  })
})

describe('readSteps', () => {
  const good = [3, 7, [[7, 2, 3], [5, 1, -1]], 1, [{ t: 'number', v: Number.NaN }, { t: 'string', v: 'x'.repeat(900), full: 900 }, { t: 'object', id: 4, c: 'Array', n: 2, e: [['0', { t: 'ref', id: 4 }]], more: 1 }]]

  it('reads well-formed steps as plain data, async frames marked, long strings cut', () => {
    const [read] = readSteps([good])!
    expect(read).toMatchObject({ point: 3, inv: 7, frames: [{ inv: 7, fn: 2, point: 3, async: false }, { inv: 5, fn: 1, point: -1, async: true }] })
    expect(read!.values[0]).toEqual({ t: 'number', v: Number.NaN })
    expect(read!.values[1]).toMatchObject({ t: 'string', full: 900 })
    expect((read!.values[1] as { v: string }).v.length).toBeLessThanOrEqual(500)
  })

  it('drops a message that is not well formed, and never throws', () => {
    const deep: unknown = Array.from({ length: 40 }).reduce<unknown>(inner => ({ t: 'object', id: 1, c: '', n: null, e: [['a', inner]], more: 0 }), { t: 'null' })
    const wide = { t: 'object', id: 1, c: '', n: null, e: Array.from({ length: 64 }, (_, index) => [String(index), { t: 'object', id: 2, c: '', n: null, e: Array.from({ length: 64 }, () => ['b', { t: 'null' }]), more: 0 }]), more: 0 }
    for (const raw of [
      null, 'steps', {}, [null], [[1, 2, 3]], Array.from({ length: 600 }, () => good),
      [[-1, 7, [], -1, []]], [[1.5, 7, [], -1, []]], [[3, 7, [[1, 2]], -1, []]], [[3, 7, [], 5, []]], [[3, 7, [], -1, [{ t: 'nope' }]]],
      [[3, 7, [], -1, [{ t: 'number', v: '1' }]]], [[3, 7, [], -1, [{ t: 'object', id: 1, c: '', n: null, e: [[1, { t: 'null' }]], more: 0 }]]],
      [[3, 7, [], -1, [deep]]], [[3, 7, [], -1, [wide]]], [[3, 7, [], -1, [{ t: 'string', v: 1 }]]]
    ]) {
      expect(() => readSteps(raw)).not.toThrow()
      expect(readSteps(raw), JSON.stringify(raw)?.slice(0, 80)).toBeNull()
    }
  })

  it('keeps only steps that fit the recorded code', () => {
    const map = { points: [point('app.js', 1, 0, ['a'])], functions: [{ name: '(anonymous)', path: 'app.js', line: 1 }] }
    const fits: RecordedStep = { point: 0, inv: 1, frames: [{ inv: 1, fn: 0, point: 0, async: false }], values: [{ t: 'null' }] }
    expect(fittingSteps([fits, { ...fits, point: 1 }, { ...fits, values: [] }, { ...fits, frames: [{ inv: 1, fn: 3, point: 0, async: false }] }], map)).toEqual([fits])
  })
})

describe('showing recorded values', () => {
  const croissant: RecordedValue = { t: 'object', id: 2, c: '', n: null, e: [['id', { t: 'string', v: 'croissant' }], ['price', { t: 'number', v: 2.4 }]], more: 0 }
  it.each([
    [{ t: 'number', v: 24.999999999999996 }, '24.999999999999996'],
    [{ t: 'number', v: -0 }, '-0'],
    [{ t: 'string', v: 'Butter croissant' }, '"Butter croissant"'],
    [{ t: 'string', v: 'xx', full: 900 }, '"xx…"'],
    [{ t: 'uninitialized' }, '<uninitialized>'],
    [{ t: 'getter' }, '(...)'],
    [{ t: 'function', v: 'ƒ applyDiscount(total)' }, 'ƒ applyDiscount(total)'],
    [croissant, '{id: \'croissant\', price: 2.4}'],
    [{ t: 'object', id: 1, c: 'Array', n: 3, e: [['0', croissant], ['1', { t: 'number', v: 1 }]], more: 1 }, '(3) [{…}, 1, …]'],
    [{ t: 'object', id: 1, c: 'Array', n: 3, e: null, more: 0 }, 'Array(3)'],
    [{ t: 'object', id: 1, c: 'Map', n: 1, e: [['\'croissant\'', { t: 'number', v: 2.4 }]], more: 0 }, 'Map(1) {\'croissant\' => 2.4}'],
    [{ t: 'object', id: 1, c: 'Cart', n: null, e: [['items', { t: 'object', id: 3, c: 'Array', n: 2, e: null, more: 0 }]], more: 0 }, 'Cart {items: Array(2)}'],
    [{ t: 'object', id: 1, c: 'Cart', n: null, e: null, more: 0 }, 'Cart'],
    [{ t: 'object', id: 1, c: '', n: null, e: null, more: 0 }, '{…}']
  ] as [RecordedValue, string][])('%j → %s', (value, text) => {
    expect(valuePreview(value)).toBe(text)
  })

  it('opens objects into their entries, an array with its length', () => {
    const list: RecordedValue = { t: 'object', id: 1, c: 'Array', n: 1, e: [['0', croissant]], more: 0 }
    expect(isExpandable(list)).toBe(true)
    expect(isExpandable({ t: 'object', id: 1, c: '', n: null, e: null, more: 0 })).toBe(false)
    expect(isExpandable({ t: 'number', v: 1 })).toBe(false)
    expect(valueChildren(list)).toEqual({ entries: [['0', croissant], ['length', { t: 'number', v: 1 }]], more: 0 })
  })
})
