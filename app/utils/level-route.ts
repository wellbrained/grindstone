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
