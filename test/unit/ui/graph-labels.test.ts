import { describe, expect, it } from 'vitest'
import { fitLabel, flowPills } from '../../../app/utils/graph-labels'

describe('fitLabel', () => {
  it('keeps a label that fits', () => {
    expect(fitLabel('main', 10)).toBe('main')
    expect(fitLabel('feature/newsletter-form', 23)).toBe('feature/newsletter-form')
  })

  it('cuts a long label in the middle, to exactly the limit', () => {
    const cut = fitLabel('HEAD -> feature/newsletter-form', 20)
    expect(cut).toHaveLength(20)
    expect(cut).toContain('…')
    expect(cut.startsWith('HEAD -> fe')).toBe(true)
    expect(cut.endsWith('r-form')).toBe(true)
  })

  it('keeps the end of an origin ref, where the branches differ', () => {
    expect(fitLabel('origin/feature/allergen-labels', 16).endsWith('labels')).toBe(true)
  })

  it('never returns more than the limit, even a tiny one', () => {
    for (const max of [3, 4, 5, 8]) expect(fitLabel('annotated-release-tag', max).length).toBeLessThanOrEqual(Math.max(max, 3))
  })
})

describe('flowPills', () => {
  it('puts pills that fit on one line', () => {
    expect(flowPills([60, 80], 200, 5)).toEqual({ pills: [{ x: 0, line: 0 }, { x: 65, line: 0 }], lines: 1 })
  })

  it('starts a new line for a pill that would pass the limit', () => {
    const flowed = flowPills([120, 120, 40], 200, 5)
    expect(flowed.pills).toEqual([{ x: 0, line: 0 }, { x: 0, line: 1 }, { x: 125, line: 1 }])
    expect(flowed.lines).toBe(2)
  })

  it('places a pill wider than the limit on a line of its own', () => {
    expect(flowPills([300, 40], 200, 5)).toEqual({ pills: [{ x: 0, line: 0 }, { x: 0, line: 1 }], lines: 2 })
  })

  it('has no lines without pills', () => {
    expect(flowPills([], 200, 5)).toEqual({ pills: [], lines: 0 })
  })
})
