import { describe, expect, it } from 'vitest'
import { MAX_CONDITION_LENGTH, compileCondition } from '../../../../shared/levels/debugging/condition'
import type { RecordedValue } from '../../../../shared/levels/debugging/recording'

// Conditional breakpoints (chapter 5): a condition is read with a real parser and evaluated by Grindstone on the values
// the recording kept at a step. No code of the app runs (it ran already): no calls but a few pure built-ins, no
// assignments, no getters; a value the recording did not keep makes the condition fail at that step instead of guessing.

const number = (v: number): RecordedValue => ({ t: 'number', v })
const string = (v: string): RecordedValue => ({ t: 'string', v })
const product = (name: string, grams: number, id = 1): RecordedValue => ({ t: 'object', id, c: '', n: null, e: [['name', string(name)], ['grams', number(grams)]], more: 0 })

const scope = new Map<string, RecordedValue>([
  ['i', number(6)],
  ['total', number(24.999999999999996)],
  ['price', number(Number.NaN)],
  ['name', string('Rye loaf')],
  ['ok', { t: 'boolean', v: false }],
  ['nothing', { t: 'null' }],
  ['missing', { t: 'undefined' }],
  ['late', { t: 'uninitialized' }],
  ['item', product('Rye loaf', 0.75, 7)],
  ['same', product('Rye loaf', 0.75, 7)],
  ['other', product('Rye loaf', 0.75, 8)],
  ['items', { t: 'object', id: 3, c: 'Array', n: 2, e: [['0', product('Croissant', 60, 4)], ['1', product('Rye loaf', 0.75, 7)]], more: 0 }],
  ['cut', { t: 'object', id: 5, c: 'Array', n: 120, e: [['0', number(1)]], more: 119 }],
  ['deep', { t: 'object', id: 6, c: '', n: null, e: null, more: 0 }],
  ['lazy', { t: 'object', id: 9, c: '', n: null, e: [['value', { t: 'getter' }]], more: 0 }],
  ['long', { t: 'string', v: 'x'.repeat(200), full: 5000 }],
  ['this', { t: 'object', id: 10, c: 'Cart', n: null, e: [['owner', string('maya')]], more: 0 }]
])

const check = (text: string) => {
  const compiled = compileCondition(text)
  if (!compiled.ok) throw new Error(compiled.error)
  return compiled.evaluate(scope)
}

describe('compileCondition', () => {
  it.each([
    ['i === 6', true],
    ['i === 7', false],
    ['i == \'6\'', true],
    ['total >= 25', false],
    ['total < 25 && total > 24.99', true],
    ['Math.round(total * 100) >= 2500', true],
    ['name === \'Rye loaf\'', true],
    ['name.startsWith(\'Rye\')', true],
    ['name.includes(\'loaf\') && name.length === 8', true],
    ['item.grams < 1', true],
    ['item.name.toLowerCase() === \'rye loaf\'', true],
    ['items.length === 2', true],
    ['items[1].grams === 0.75', true],
    ['items[i - 5].name', 'Rye loaf'],
    ['items.at(-1).grams', 0.75],
    ['Number.isNaN(price)', true],
    ['isNaN(price) || price > 3', true],
    ['typeof name === \'string\'', true],
    ['typeof item', 'object'],
    ['!ok', true],
    ['nothing === null && missing === undefined', true],
    ['nothing ?? \'fallback\'', 'fallback'],
    ['item?.missing?.deep', undefined],
    ['ok ? 1 : 2', 2],
    ['item === same', true],
    ['item === other', false],
    ['this.owner', 'maya'],
    ['`${i}x`', '6x'],
    ['[1, 2].includes(2)', true],
    ['Array.isArray(items)', true],
    ['Number(\'3\') + 1', 4]
  ] as const)('%s → %s', (text, expected) => {
    expect(check(text)).toEqual({ ok: true, value: expected })
  })

  it('fails at a step where it reads what the recording did not keep, or what is not there', () => {
    for (const text of ['unknown > 1', 'late === 1', 'deep.a === 1', 'cut[90] === 1', 'lazy.value', 'long === \'x\'', 'missing.name', 'nothing.length', 'item.toFixed(2)', 'cut.includes(5)']) {
      const result = check(text)
      expect(result.ok, text).toBe(false)
    }
    expect(check('unknown > 1')).toEqual({ ok: false, error: 'unknown is not defined at this step' })
    expect(check('lazy.value')).toEqual({ ok: false, error: 'value is a getter: the recording did not call it' })
    expect(check('missing.name')).toEqual({ ok: false, error: 'Cannot read properties of undefined (reading \'name\')' })
    // a property a fully kept object does not have is undefined, like in JavaScript
    expect(check('item.price === undefined')).toEqual({ ok: true, value: true })
  })

  it('refuses what would run code or change something, and what is not one expression', () => {
    for (const text of ['i = 6', 'i++', 'alert(1)', 'new Date()', 'items.push(1)', 'item.constructor', 'name.constructor.constructor(\'x\')()', '(() => 1)()', 'delete item.name', 'i; i', '', 'i ===', `i === ${'1'.repeat(MAX_CONDITION_LENGTH)}`]) {
      const compiled = compileCondition(text)
      expect(compiled.ok, text).toBe(false)
      if (!compiled.ok) expect(compiled.error).not.toBe('')
    }
    // a trailing semicolon is fine, as in the browser
    expect(compileCondition('i === 6;').ok).toBe(true)
  })

  it('never throws on hostile input, and stays fast', () => {
    const started = performance.now()
    for (const text of ['('.repeat(5000), '!'.repeat(250), 'a'.repeat(250), '[[[[[[[[[[', ' i', '/(a+)+$/.test(name)']) {
      expect(() => compileCondition(text)).not.toThrow()
      const compiled = compileCondition(text)
      if (compiled.ok) expect(() => compiled.evaluate(scope)).not.toThrow()
    }
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
