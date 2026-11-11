import { describe, expect, it } from 'vitest'
import { BRANCH_PALETTE_SIZE, branchClass, branchIndex } from '../../../app/utils/branch-palette'

describe('branchIndex', () => {
  it('keeps main on slot 0, also as origin/main', () => {
    expect(branchIndex('main')).toBe(0)
    expect(branchIndex('origin/main')).toBe(0)
    expect(branchIndex('refs/heads/main')).toBe(0)
  })

  it('is stable and shares a colour between a branch and its origin ref', () => {
    expect(branchIndex('feature/login')).toBe(branchIndex('feature/login'))
    expect(branchIndex('origin/feature/login')).toBe(branchIndex('feature/login'))
  })

  it('never gives another branch slot 0 and stays inside the palette', () => {
    for (const name of ['feature/a', 'feature/b', 'dev', 'master', 'HEAD', 'x', 'release/1.0', 'fix/typo']) {
      const index = branchIndex(name)
      expect(index).toBeGreaterThanOrEqual(1)
      expect(index).toBeLessThan(BRANCH_PALETTE_SIZE)
    }
  })

  it('maps to the CSS class of its slot', () => {
    expect(branchClass('main')).toBe('branch-c-0')
    expect(branchClass('feature/login')).toBe(`branch-c-${branchIndex('feature/login')}`)
  })
})
