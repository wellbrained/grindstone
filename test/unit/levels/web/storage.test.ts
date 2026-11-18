import { describe, expect, it, vi } from 'vitest'
import { STORAGE_LIMITS, STORAGE_SOURCE } from '../../../../shared/levels/web/storage'
import type { StorageModel } from '../../../../shared/levels/web/storage'

// The storage model (ADR 0009 chapter 3, docs/features/levels.md "The storage model"): the very source the web backend
// runs in the sealed frame, here on Node. Each rule next to the HTML Living Standard's text ("Web storage", 12.2) or
// WebIDL's for a legacy platform object with named properties, and Chrome's quota and words.

const make = () => new Function(`return ${STORAGE_SOURCE}`)()() as StorageModel

const SHOP = 'https://cornerbakery.shop'
const PROMO = 'https://promo.cornerbakery.shop'

/** A Storage.prototype of our own (Node has none): the model installs its members on it, as on the frame's. */
function page(changed: () => void = vi.fn()) {
  const model = make()
  const proto: Record<string | symbol, unknown> = Object.create(Object.prototype)
  Object.defineProperty(proto, Symbol.toStringTag, { value: 'Storage', configurable: true })
  model.install(proto, changed)
  const local = model.expose(model.area('local', SHOP), proto) as Storage & Record<string, unknown>
  const session = model.expose(model.area('session', SHOP), proto) as Storage & Record<string, unknown>
  return { model, proto, local, session, changed }
}

describe('an area (the Storage interface\'s methods)', () => {
  it('"setItem(key, value)" stores a string, "getItem(key)" returns it or null, an overwrite keeps the key\'s place', () => {
    const { local } = page()
    expect(local.getItem('token')).toBeNull()
    local.setItem('token', 'abc')
    local.setItem('cart', '2')
    local.setItem('token', 'def')
    expect(local.getItem('token')).toBe('def')
    expect(local.length).toBe(2)
    // "The key(n) method must return the name of the nth key in the list" (the order is the user agent's: here, first set)
    expect([local.key(0), local.key(1), local.key(2)]).toEqual(['token', 'cart', null])
  })

  it('converts keys and values with ToString (WebIDL DOMString), and refuses a Symbol', () => {
    const { local } = page()
    local.setItem('n', 42 as unknown as string)
    local.setItem({ toString: () => 'obj' } as unknown as string, { toString: () => 'value', valueOf: () => 'not this' } as unknown as string)
    local.setItem('nothing', undefined as unknown as string)
    expect([local.getItem('n'), local.getItem('obj'), local.getItem('nothing')]).toEqual(['42', 'value', 'undefined'])
    expect(() => local.setItem(Symbol('s') as unknown as string, 'x')).toThrow('Cannot convert a Symbol value to a string')
  })

  it('"removeItem(key)" and "clear()" empty it; Chrome\'s words for a missing argument and a call on anything else', () => {
    const { local, proto } = page()
    local.setItem('a', '1')
    local.setItem('b', '2')
    local.removeItem('a')
    expect([local.length, local.key(0)]).toEqual([1, 'b'])
    local.clear()
    expect(local.length).toBe(0)
    expect(() => (local.getItem as () => string | null)()).toThrow('Failed to execute \'getItem\' on \'Storage\': 1 argument required, but only 0 present.')
    expect(() => (local.setItem as (key: string) => void)('a')).toThrow('Failed to execute \'setItem\' on \'Storage\': 2 arguments required, but only 1 present.')
    // the browser's own members refuse anything but a Storage object: "Illegal invocation"
    expect(() => (proto.getItem as (key: string) => string | null).call({}, 'a')).toThrow('Illegal invocation')
    expect(() => Object.getOwnPropertyDescriptor(proto, 'length')!.get!.call({})).toThrow('Illegal invocation')
  })

  it('keeps each origin\'s localStorage apart, and sessionStorage apart from localStorage', () => {
    const { model, local, session } = page()
    local.setItem('token', 'mine')
    session.setItem('token', 'tab')
    expect(model.area('local', PROMO).getItem('token')).toBeNull()
    expect(model.area('local', SHOP).getItem('token')).toBe('mine')
    expect(model.area('session', SHOP).getItem('token')).toBe('tab')
  })

  it('throws Chrome\'s QuotaExceededError past 5,242,880 code units of keys and values in one area, and keeps what it had', () => {
    const { local, model } = page()
    const big = 'x'.repeat(STORAGE_LIMITS.quota - 4)
    local.setItem('a', big)
    local.setItem('b', '1')
    expect(model.area('local', SHOP).size()).toBe(STORAGE_LIMITS.quota - 1)
    let thrown: unknown
    try {
      local.setItem('c', '1')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(DOMException)
    expect((thrown as DOMException).name).toBe('QuotaExceededError')
    expect((thrown as DOMException).message).toBe('Failed to execute \'setItem\' on \'Storage\': Setting the value of \'c\' exceeded the quota.')
    expect(local.getItem('c')).toBeNull()
    // replacing a value counts the difference only, and another area has its own quota
    local.setItem('b', '2')
    expect(local.getItem('b')).toBe('2')
    model.area('local', PROMO).setItem('c', '1')
  })
})

describe('the page\'s object (WebIDL: a legacy platform object with a named getter, setter and deleter)', () => {
  it('shows each item as a property, in Object.keys, for…in, JSON.stringify and Object.entries', () => {
    const { local } = page()
    local.setItem('token', 'eyJ')
    local.cart = 3
    expect(local.token).toBe('eyJ')
    expect(local.getItem('cart')).toBe('3')
    expect(Object.keys(local)).toEqual(['token', 'cart'])
    expect(JSON.stringify(local)).toBe('{"token":"eyJ","cart":"3"}')
    expect(Object.entries(local)).toEqual([['token', 'eyJ'], ['cart', '3']])
    expect('token' in local).toBe(true)
    expect('missing' in local).toBe(false)
    expect(local.missing).toBeUndefined()
    delete local.token
    expect(local.getItem('token')).toBeNull()
    expect(Object.prototype.toString.call(local)).toBe('[object Storage]')
  })

  it('never hides Storage.prototype\'s members behind an item, and assigns to them as to any property (as Chrome)', () => {
    const { local, proto, model } = page()
    local.setItem('getItem', 'item')
    local.setItem('toString', 't')
    local.setItem('__proto__', 'p')
    expect(local.getItem).toBe(proto.getItem)
    // a name from Object.prototype hides no item: it reads and lists as one (Chrome; WebIDL would hide it)
    expect(local.toString).toBe('t')
    expect(Object.keys(local)).toEqual(['toString', '__proto__'])
    expect(JSON.stringify(local)).toBe('{"toString":"t","__proto__":"p"}')
    expect(Object.getPrototypeOf(local)).toBe(proto)
    // assigning to a member: an own property beside the item for a method, nothing for the getter-only length (strict: a TypeError)
    ;(local as Record<string, unknown>).getItem = 'x'
    expect(local.getItem).toBe('x')
    expect(model.area('local', SHOP).getItem('getItem')).toBe('item')
    expect(() => {
      (local as Record<string, unknown>).length = 5
    }).toThrow(TypeError)
    expect(model.area('local', SHOP).length()).toBe(3)
    // any other name is an item
    ;(local as Record<string, unknown>).cart = 2
    expect(model.area('local', SHOP).getItem('cart')).toBe('2')
  })

  it('takes Object.defineProperty with a value as setItem, and refuses an accessor', () => {
    const { local } = page()
    Object.defineProperty(local, 'token', { value: 'abc', configurable: true })
    expect(local.getItem('token')).toBe('abc')
    expect(() => Object.defineProperty(local, 'other', { get: () => 'x' })).toThrow(TypeError)
    expect(local.getItem('other')).toBeNull()
    expect(Object.getOwnPropertyDescriptor(local, 'token')).toEqual({ value: 'abc', writable: true, enumerable: true, configurable: true })
  })

  it('has Storage.prototype as its prototype, so instanceof and the members on it work as in the browser', () => {
    const { local, proto } = page()
    expect(Object.getPrototypeOf(local)).toBe(proto)
    expect(Object.isExtensible(local)).toBe(true)
    expect(Reflect.preventExtensions(local)).toBe(false)
    // its prototype can be set, as on any object
    expect(Reflect.setPrototypeOf(local, null)).toBe(true)
    expect(Object.getPrototypeOf(local)).toBeNull()
    expect(Reflect.setPrototypeOf(local, proto)).toBe(true)
    // a member the app replaces on the prototype changes what the app's own calls do, never the area
    const original = proto.getItem
    proto.getItem = () => 'patched'
    local.setItem('token', 'real')
    expect(local.getItem('token')).toBe('patched')
    proto.getItem = original
    expect(local.getItem('token')).toBe('real')
  })

  it('tells the Application panel after each change', () => {
    const { local, changed } = page()
    local.setItem('a', '1')
    local.b = '2'
    delete local.a
    local.clear()
    expect(changed).toHaveBeenCalledTimes(4)
  })
})

describe('the areas as the probes and the panel read them', () => {
  it('lists every area asked for, localStorage first, by origin, with copies of the items and the size', () => {
    const { model, local, session } = page()
    model.area('local', PROMO).setItem('code', 'XMAS23')
    local.setItem('token', 'abc')
    session.setItem('draft', 'two croissants')
    const listed = model.list()
    expect(listed).toEqual([
      { kind: 'local', origin: SHOP, items: [['token', 'abc']], size: 8 },
      { kind: 'local', origin: PROMO, items: [['code', 'XMAS23']], size: 10 },
      { kind: 'session', origin: SHOP, items: [['draft', 'two croissants']], size: 19 }
    ])
    listed[0]!.items[0]![1] = 'changed'
    expect(local.getItem('token')).toBe('abc')
  })

  it('never runs a setter or getter the app put on Object.prototype or Array.prototype', () => {
    // (a mock as the panel's hook would record its calls in arrays: the trap on their indices would count those)
    const { model, local } = page(() => {})
    let seen = 0
    // descriptors without a prototype: the traps' own 'value' accessor would break plain ones
    const count = () => {
      seen += 1
      return 'inherited'
    }
    const trap = (key: string | number, on: object) => Object.defineProperty(on, key, Object.assign(Object.create(null), { configurable: true, set: count, get: count }))
    for (const key of ['token', 'value', 'items', 'kind']) trap(key, Object.prototype)
    for (let i = 0; i < 4; i++) trap(i, Array.prototype)
    let listed: unknown, token: unknown, keys: unknown, value: unknown
    try {
      local.setItem('token', 'secret')
      local.setItem('cart', '2')
      listed = model.list()[0]!.items
      token = model.area('local', SHOP).getItem('token')
      keys = Object.keys(local)
      value = model.area('local', SHOP).getItem('value')
    } finally {
      for (const key of ['token', 'value', 'items', 'kind']) Reflect.deleteProperty(Object.prototype, key)
      for (let i = 0; i < 4; i++) Reflect.deleteProperty(Array.prototype, i)
    }
    expect(listed).toEqual([['token', 'secret'], ['cart', '2']])
    expect(token).toBe('secret')
    // a name the app put on Object.prototype hides no item from the page's own view either (as in Chrome)
    expect(keys).toEqual(['token', 'cart'])
    expect(value).toBeNull()
    expect(seen).toBe(0)
  })
})
