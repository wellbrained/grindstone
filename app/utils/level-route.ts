// Level pages live at /<track>/<slug>, e.g. /git/01-first-commit for the level `git-01-first-commit`.
import { levelById } from '../../shared/levels'
import type { Level } from '../../shared/levels'

export function levelPath(level: Pick<Level, 'id' | 'track'>): string {
  return `/${level.track}/${level.id.slice(level.track.length + 1)}`
}

export function levelFromRoute(track: string, slug: string): Level | null {
  const level = levelById(`${track}-${slug}`)
  return level?.track === track ? level : null
}

/** A track's page, e.g. /git; with a chapter, its section on that page (/git#merging). */
export function trackPath(trackId: string, chapterId?: string): string {
  return chapterId ? `/${trackId}#${chapterId}` : `/${trackId}`
}
