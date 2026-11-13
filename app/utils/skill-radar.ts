// Geometry of the skill radar picture (SkillRadar.vue, docs/features/ui.md "Skill radar"): pure, so it is unit tested.
// The SVG's view box is RADAR_VIEW wide; the outer ring sits at RADAR_RADIUS around the centre, the chapter dots a
// little outside it. Axes run clockwise from the top in chapter order.

export const RADAR_VIEW = 220
export const RADAR_CENTRE = RADAR_VIEW / 2
export const RADAR_RADIUS = 92
/** Where the chapter dots sit, as a share of the radius. */
export const RADAR_DOT_AT = 1.1
/** The rings, as in the logo: a third, two thirds, all of a chapter. */
export const RADAR_RINGS = [1 / 3, 2 / 3, 1] as const
/** An empty axis still gets a corner this close to the centre, so the shape stays a shape. */
export const RADAR_MIN_SHARE = 0.04

const round = (value: number) => Math.round(value * 10) / 10

/** The point on axis `index` of `count` at `share` of the radius, in view box units. */
export function radarPoint(index: number, count: number, share: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
  return [RADAR_CENTRE + Math.cos(angle) * RADAR_RADIUS * share, RADAR_CENTRE + Math.sin(angle) * RADAR_RADIUS * share]
}

/** SVG `points` for one share per axis. */
export function radarPolygon(shares: readonly number[]): string {
  return shares.map((share, index) => radarPoint(index, shares.length, share).map(round).join(',')).join(' ')
}

/** The drawn shape: shares clamped to RADAR_MIN_SHARE ... 1. */
export const radarShape = (shares: readonly number[]) => shares.map(share => Math.min(1, Math.max(RADAR_MIN_SHARE, share)))

/**
 * The axis nearest to a point (view box units), for hovering the picture; null near the centre (every axis meets
 * there) or well outside the chapter dots.
 */
export function nearestRadarAxis(x: number, y: number, count: number): number | null {
  if (count === 0) return null
  const dx = x - RADAR_CENTRE
  const dy = y - RADAR_CENTRE
  const distance = Math.hypot(dx, dy)
  if (distance < RADAR_RADIUS * 0.15 || distance > RADAR_RADIUS * 1.3) return null
  // 0 at the top, growing clockwise
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
  return Math.round(angle / ((2 * Math.PI) / count)) % count
}

/** The shape `t` (0 to 1) of the way from `from` to `to`; the new shape when they do not match. */
export function tweenShares(from: readonly number[], to: readonly number[], t: number): number[] {
  if (from.length !== to.length) return [...to]
  return to.map((value, index) => from[index]! + (value - from[index]!) * t)
}

/** Ease-out (cubic): fast start, gentle landing. */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
