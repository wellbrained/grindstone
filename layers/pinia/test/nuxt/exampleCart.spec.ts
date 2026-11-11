import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('useExampleCartStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds items and computes count and total', () => {
    const cart = useExampleCartStore()

    cart.add({ id: 1, name: 'Keyboard', price: 89 })
    cart.add({ id: 1, name: 'Keyboard', price: 89 })
    cart.add({ id: 2, name: 'Mouse', price: 39 })

    expect(cart.count).toBe(3)
    expect(cart.total).toBe(89 * 2 + 39)
  })

  it('removes and clears items', () => {
    const cart = useExampleCartStore()
    cart.add({ id: 1, name: 'Keyboard', price: 89 })
    cart.add({ id: 2, name: 'Mouse', price: 39 })

    cart.remove(1)
    expect(cart.items.map(item => item.id)).toEqual([2])

    cart.clear()
    expect(cart.count).toBe(0)
  })
})
