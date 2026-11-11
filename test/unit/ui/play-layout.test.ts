import { describe, expect, it } from 'vitest'
import { parseLayout } from '../../../app/utils/play-layout'

describe('parseLayout', () => {
  it('reads the three layouts', () => {
    expect(parseLayout('terminal')).toBe('terminal')
    expect(parseLayout('ide')).toBe('ide')
    expect(parseLayout('mix')).toBe('mix')
  })

  it('falls back to Terminal for anything else', () => {
    expect(parseLayout(null)).toBe('terminal')
    expect(parseLayout(undefined)).toBe('terminal')
    expect(parseLayout('IDE')).toBe('terminal')
    expect(parseLayout('{"layout":"ide"}')).toBe('terminal')
  })
})
