import { describe, expect, it } from 'vitest'
import { parseLayout } from '../../../app/utils/play-layout'

describe('parseLayout', () => {
  it('reads the two layouts', () => {
    expect(parseLayout('terminal')).toBe('terminal')
    expect(parseLayout('ide')).toBe('ide')
  })

  it('turns the dropped Mix layout into the IDE', () => {
    expect(parseLayout('mix')).toBe('ide')
  })

  it('falls back to Terminal for anything else', () => {
    expect(parseLayout(null)).toBe('terminal')
    expect(parseLayout(undefined)).toBe('terminal')
    expect(parseLayout('IDE')).toBe('terminal')
    expect(parseLayout('{"layout":"ide"}')).toBe('terminal')
  })
})
