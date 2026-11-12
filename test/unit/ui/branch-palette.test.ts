import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRANCH_PALETTE_SIZE, PALETTE_SIZE, branchClass, branchIndex, paletteClass } from '../../../app/utils/branch-palette'
import { gitTrack } from '../../../shared/levels'

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
    expect(paletteClass(7)).toBe('branch-c-7')
    expect(branchClass('feature/login')).toBe(`branch-c-${branchIndex('feature/login')}`)
  })
})

describe('palette tokens', () => {
  const css = readFileSync(new URL('../../../app/assets/css/main.css', import.meta.url), 'utf8')

  it('defines every slot in both themes, with a class each, and nothing beyond', () => {
    for (let slot = 0; slot < PALETTE_SIZE; slot++) {
      expect(css.match(new RegExp(`--branch-${slot}:`, 'g')), `--branch-${slot}`).toHaveLength(2)
      expect(css).toContain(`.${paletteClass(slot)} { color: var(--branch-${slot}); }`)
    }
    expect(css).not.toContain(`--branch-${PALETTE_SIZE}:`)
  })

  it('gives the chapters slots that exist', () => {
    for (const chapter of gitTrack.chapters) expect(chapter.colour).toBeLessThan(PALETTE_SIZE)
  })
})
