import { describe, expect, it } from 'vitest'
import { RADAR_MIN_SHARE, radarPoint, easeOutCubic, nearestRadarAxis, radarPolygon, radarShape, tweenShares } from '../../../app/utils/skill-radar'

const round = ([x, y]: [number, number]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]

describe('skill radar geometry', () => {
  it('runs the axes clockwise from the top, the outer ring at the full share', () => {
    expect(round(radarPoint(0, 8, 1))).toEqual([110, 18])
    expect(round(radarPoint(2, 8, 1))).toEqual([202, 110])
    expect(round(radarPoint(4, 8, 0.5))).toEqual([110, 156])
    expect(round(radarPoint(6, 8, 1))).toEqual([18, 110])
    expect(round(radarPoint(3, 7, 0))).toEqual([110, 110])
  })

  it('writes a polygon as SVG points', () => {
    expect(radarPolygon([1, 1, 1, 1])).toBe('110,18 202,110 110,202 18,110')
    expect(radarPolygon([])).toBe('')
  })

  it('keeps a small shape at zero, so an empty axis still has a corner near the centre', () => {
    expect(radarShape([0, 0.5, 1])).toEqual([RADAR_MIN_SHARE, 0.5, 1])
    expect(radarShape([2, -1])).toEqual([1, RADAR_MIN_SHARE])
  })

  it('finds the axis nearest to a point, but not at the very centre or far outside', () => {
    expect(nearestRadarAxis(202, 110, 8)).toBe(2)
    expect(nearestRadarAxis(110, 20, 8)).toBe(0)
    // a little left of the top axis is still the top axis, further round it is the last one
    expect(nearestRadarAxis(100, 30, 8)).toBe(0)
    expect(nearestRadarAxis(40, 40, 8)).toBe(7)
    expect(nearestRadarAxis(111, 111, 8)).toBeNull()
    expect(nearestRadarAxis(220, 0, 8)).toBeNull()
    expect(nearestRadarAxis(202, 110, 0)).toBeNull()
  })

  it('moves a shape from the old values to the new ones', () => {
    expect(tweenShares([0, 0.5], [1, 0.5], 0)).toEqual([0, 0.5])
    expect(tweenShares([0, 0.5], [1, 0.5], 0.5)).toEqual([0.5, 0.5])
    expect(tweenShares([0, 0.5], [1, 0.5], 1)).toEqual([1, 0.5])
    // a different axis count (should not happen): the new shape
    expect(tweenShares([0], [1, 1], 0.5)).toEqual([1, 1])
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})
