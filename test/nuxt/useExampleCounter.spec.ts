import { describe, expect, it } from 'vitest'

// Composable test in the Nuxt environment — auto-imports (useExampleCounter, useState) just work
describe('useExampleCounter', () => {
  it('shares state between calls', () => {
    const a = useExampleCounter()
    const b = useExampleCounter()

    a.reset()
    a.increment()
    a.increment()

    expect(b.count.value).toBe(2)
    expect(b.double.value).toBe(4)
  })
})
