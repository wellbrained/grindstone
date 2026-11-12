import { describe, expect, it } from 'vitest'
import { relativeTime } from '../../../app/utils/relative-time'

const now = Date.UTC(2026, 10, 12, 12)
const ago = (ms: number) => relativeTime(now - ms, now)

describe('relative time', () => {
  it('uses the largest whole unit', () => {
    expect(ago(0)).toBe('now')
    expect(ago(59_000)).toBe('now')
    expect(ago(5 * 60_000)).toBe('5 minutes ago')
    expect(ago(90 * 60_000)).toBe('1 hour ago')
    expect(ago(3 * 3_600_000)).toBe('3 hours ago')
    expect(ago(30 * 3_600_000)).toBe('yesterday')
    expect(ago(10 * 86_400_000)).toBe('last week')
    expect(ago(400 * 86_400_000)).toBe('last year')
  })

  it('copes with a time in the future (a clock that moved back)', () => {
    expect(relativeTime(now + 2 * 3_600_000, now)).toBe('in 2 hours')
  })
})
