import { describe, expect, it } from 'vitest'
import { TEST_LIMITS } from '../../../../shared/levels/review/test-runner'
import { createRunner, runAll, runOnNode } from './run-tests'
import type { Runner } from './run-tests'

// The Tests panel's runner (ADR 0008, chapter 3), on Node with the very source the worker runs: its matchers and their
// messages (Jest's wording, as the panel shows them), checks counted per test, mocks and spies, inline snapshots, async
// tests, what it does with hostile tests (names, messages and values cut, a cap on tests, thrown non-errors, cycles).

/** One test's result: `body` gets the runner's expect and vi. */
async function one(body: (expect: Runner['expect'], vi: Runner['vi']) => unknown) {
  const runner = createRunner(TEST_LIMITS)
  runner.setFile('cart.test.js')
  runner.test('the test', () => body(runner.expect, runner.vi))
  const { results } = await runAll(runner)
  return results[0]!
}

const message = async (body: (expect: Runner['expect'], vi: Runner['vi']) => unknown) => (await one(body)).error?.message

describe('the test runner', () => {
  it('passes a test whose checks hold and counts each check', async () => {
    const result = await one((expect) => {
      expect(2.4 * 2).toBe(4.8)
      expect({ id: 'croissant', lines: [1, 2] }).toEqual({ id: 'croissant', lines: [1, 2] })
      // as in Vitest: -0 is not 0, NaN is NaN, and a property set to undefined is no property
      expect(-0).not.toEqual(0)
      expect([NaN]).toEqual([NaN])
      expect({ id: 'croissant', note: undefined }).toEqual({ id: 'croissant' })
      expect({ id: 'croissant' }).toEqual({ id: 'croissant', note: undefined })
      expect({ id: 'croissant', note: undefined }).not.toEqual({ id: 'croissant', note: null })
      expect([undefined]).not.toEqual([])
      expect(NaN).toBe(NaN)
      expect(0.1 + 0.2).toBeCloseTo(0.3)
      expect('Butter croissant').toContain('croissant')
      expect([1, 2]).toContain(2)
      expect(1).toBeTruthy()
      expect('').toBeFalsy()
      expect(() => {
        throw new Error('Out of croissants')
      }).toThrow('croissants')
      expect(() => JSON.parse('{')).toThrow(/JSON/)
      expect(3).not.toBe(4)
    })
    expect(result).toMatchObject({ ok: true, checks: 17, error: null, file: 'cart.test.js', name: 'the test' })
  })

  it('counts no check for an expect without a matcher, or one an if skips', async () => {
    expect(await one((expect) => {
      expect(12)
    })).toMatchObject({ ok: true, checks: 0 })
    expect(await one((expect) => {
      const fee = 3.5
      if (fee === 0) expect(fee).toBe(0)
    })).toMatchObject({ ok: true, checks: 0 })
  })

  it('says why a check failed, in Jest\'s words', async () => {
    expect(await message(expect => expect(2.8 * 3).toBe(8.39))).toBe('expect(received).toBe(expected)\n\nExpected: 8.39\nReceived: 8.399999999999999')
    expect(await message(expect => expect([1, 2]).toBe([1, 2]))).toBe('expect(received).toBe(expected)\n\nExpected: [1, 2]\nReceived: [1, 2]\n\nIf it should pass with deep equality, use toEqual.')
    expect(await message(expect => expect({ price: 2.4 }).toEqual({ price: 2.8 }))).toBe('expect(received).toEqual(expected)\n\nExpected: { price: 2.8 }\nReceived: { price: 2.4 }')
    expect(await message(expect => expect(4).not.toBe(4))).toBe('expect(received).not.toBe(expected)\n\nExpected: not 4\nReceived: 4')
    expect(await message(expect => expect(8.39).toBeCloseTo(8.4))).toBe('expect(received).toBeCloseTo(expected, precision)\n\nExpected: 8.4\nReceived: 8.39\n\nExpected precision: 2\nExpected difference: < 0.005\nReceived difference: 0.009999999999999787')
    expect(await message(expect => expect('2.40').toContain('€'))).toBe('expect(received).toContain(expected)\n\nExpected: to contain "€"\nReceived: "2.40"')
    expect(await message(expect => expect(0).toBeTruthy())).toBe('expect(received).toBeTruthy()\n\nReceived: 0')
    expect(await message(expect => expect(() => 1).toThrow())).toBe('expect(received).toThrow()\n\nReceived function did not throw')
    expect(await message(expect => expect(() => {
      throw new Error('Sold out')
    }).toThrow('Closed'))).toBe('expect(received).toThrow(expected)\n\nExpected substring: "Closed"\nReceived message: "Sold out"')
    expect(await message(expect => expect(12).toThrow())).toBe('expect(received).toThrow()\n\nReceived value must be a function: 12')
  })

  it('passes a closer look with fewer digits: toBeCloseTo(8.4, 0) takes anything within half a euro', async () => {
    expect(await one(expect => expect(8.39).toBeCloseTo(8.4, 0))).toMatchObject({ ok: true, checks: 1 })
    expect(await one(expect => expect(8.9).toBeCloseTo(8.4, 0))).toMatchObject({ ok: false })
  })

  it('makes mocks that record their calls, and spies that are put back after the test', async () => {
    const pricing = { applyDiscount: (total: number) => total * 0.9 }
    const runner = createRunner(TEST_LIMITS)
    runner.test('a spy', () => {
      runner.vi.spyOn(pricing, 'applyDiscount').mockReturnValue(21.6)
      runner.expect(pricing.applyDiscount(24)).toBe(21.6)
      runner.expect(pricing.applyDiscount).toHaveBeenCalledWith(24)
      runner.expect(pricing.applyDiscount).toHaveBeenCalledTimes(1)
    })
    runner.test('the real one again', () => runner.expect(pricing.applyDiscount(10)).toBe(9))
    runner.test('a mock', () => {
      const send = runner.vi.fn()
      send({ items: 2, total: 4.8 })
      runner.expect(send).toHaveBeenCalled()
      runner.expect(send).toHaveBeenCalledWith({ items: 2, total: 4.8 })
      runner.expect(send.mock.calls).toEqual([[{ items: 2, total: 4.8 }]])
    })
    runner.test('a mock not called as said', () => {
      const send = runner.vi.fn(() => 'sent')
      send(1)
      runner.expect(send).toHaveBeenCalledWith(2)
    })
    runner.test('not a mock', () => runner.expect(() => 1).toHaveBeenCalled())
    const { results } = await runAll(runner)
    expect(results.map(each => each.ok)).toEqual([true, true, true, false, false])
    expect(results[0]!.checks).toBe(3)
    expect(results[3]!.error!.message).toBe('expect(received).toHaveBeenCalledWith(...expected)\n\nExpected: [2]\nReceived: \n  1: [1]\n\nNumber of calls: 1')
    expect(results[4]!.error!.message).toBe('expect(received).toHaveBeenCalled()\n\nReceived value must be a mock function: [Function anonymous]')
    expect(pricing.applyDiscount(10)).toBe(9)
  })

  it('compares an inline snapshot without its indentation, and shows both when they differ', async () => {
    const receipt = '2 × Butter croissant  4.80\nTotal  4.80'
    expect(await one(expect => expect(receipt).toMatchInlineSnapshot(`
      2 × Butter croissant  4.80
      Total  4.80
    `))).toMatchObject({ ok: true, checks: 1 })
    expect(await message(expect => expect(receipt).toMatchInlineSnapshot(`
      2 × Butter croissant  2.40
      Total  4.80
    `))).toBe('expect(received).toMatchInlineSnapshot(snapshot)\n\nSnapshot:\n  2 × Butter croissant  2.40\n  Total  4.80\n\nReceived:\n  2 × Butter croissant  4.80\n  Total  4.80')
  })

  it('awaits an async test, and fails one whose promise rejects', async () => {
    expect(await one(async (expect) => {
      const total = await Promise.resolve(4.8)
      expect(total).toBe(4.8)
    })).toMatchObject({ ok: true, checks: 1 })
    expect(await one(async () => {
      await Promise.resolve()
      throw new TypeError('lines is not iterable')
    })).toMatchObject({ ok: false, error: { name: 'TypeError', message: 'lines is not iterable' } })
  })

  it('prints thrown values that are not errors, and a test without a function', async () => {
    expect(await one(() => {
      throw 'out of flour'
    })).toMatchObject({ ok: false, error: { name: null, message: 'Thrown: "out of flour"', stack: null } })
    const runner = createRunner(TEST_LIMITS)
    runner.test('no function')
    expect((await runAll(runner)).results[0]).toMatchObject({ ok: false, error: { message: 'test() needs a function as its second argument' } })
  })

  it('keeps the first tests up to the cap and cuts names, messages and printed values', async () => {
    const runner = createRunner(TEST_LIMITS)
    for (let i = 0; i < TEST_LIMITS.maxTests + 50; i++) runner.test(`test ${i}`, () => {})
    runner.test('x'.repeat(10_000), () => {})
    const { results, dropped } = await runAll(runner)
    expect(results).toHaveLength(TEST_LIMITS.maxTests)
    expect(dropped).toBe(51)

    const named = createRunner(TEST_LIMITS)
    named.test('n'.repeat(10_000), () => {
      throw new Error('m'.repeat(100_000))
    })
    const [long] = (await runAll(named)).results
    expect(long!.name).toHaveLength(TEST_LIMITS.maxName)
    expect(long!.name.endsWith('…')).toBe(true)
    expect(long!.error!.message).toHaveLength(TEST_LIMITS.maxMessage)
    expect(long!.error!.stack!.length).toBeLessThanOrEqual(TEST_LIMITS.maxStack)

    const cyclic: Record<string, unknown> = { name: 'basket' }
    cyclic.self = cyclic
    const huge = Array.from({ length: 1000 }, (_, i) => ({ i, deep: { deeper: { deepest: { gone: true } } } }))
    const text = await message(expect => expect(cyclic).toEqual(huge))
    expect(text).toContain('Expected: [{ i: 0, deep: { deeper: [Object] } }')
    expect(text).toContain('Received: { name: "basket", self: [Circular] }')
    expect(text!.split('\n').every(line => line.length <= TEST_LIMITS.maxPreview + 'Expected: '.length)).toBe(true)
  })

  it('runs from a given test on, as a fresh worker after one that did not finish', async () => {
    const runner = createRunner(TEST_LIMITS)
    for (const name of ['a', 'b', 'c']) runner.test(name, () => {})
    expect((await runAll(runner, 2)).results.map(each => each.name)).toEqual(['c'])
  })

  it('remembers where each test was registered', async () => {
    const runner = createRunner(TEST_LIMITS)
    runner.setFile('prices.test.js')
    runner.test('one croissant', () => {})
    const [result] = (await runAll(runner)).results
    expect(result!.file).toBe('prices.test.js')
    expect(result!.at).toContain('test-runner.test.ts')
  })

  it('runs a file set\'s test files with their imports, as the frame links them', async () => {
    const run = await runOnNode({
      'prices.js': 'import { round } from \'./money.js\'\nexport const lineTotal = line => round(line.price * line.quantity)\n',
      'money.js': 'export const round = amount => Math.round(amount * 100) / 100\n',
      'prices.test.js': 'import { lineTotal } from \'./prices.js\'\ntest(\'three pains au chocolat\', () => {\n  expect(lineTotal({ price: 2.8, quantity: 3 })).toBe(8.4)\n})\n',
      'broken.test.js': 'import { nothing } from \'./gone.js\'\ntest(\'never\', () => {})\n'
    })
    expect(run.plan.problems).toEqual([{ path: 'broken.test.js', message: 'Failed to load ./gone.js from broken.test.js: no such file.' }])
    expect(run.files).toEqual([{ path: 'prices.test.js', count: 1, error: null }])
    expect(run.tests).toEqual([{ path: 'prices.test.js', name: 'three pains au chocolat', ok: true, checks: 1, message: null }])
  })
})
