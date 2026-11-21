// What the 404 page says (app/error.vue), from the address alone: a level slug that isn't in a live track, a track
// that doesn't exist or isn't open yet, or any other address.
import type { Track } from '../../shared/levels'

// level: /<live track>/<slug> without such a level (name the track, link to its levels); track: /<name> that is no
// track; coming: a coming track or below it (it exists, but has no levels yet); page: anything else.
export type NotFound
  = { kind: 'level', track: Track, slug: string }
    | { kind: 'track', slug: string }
    | { kind: 'coming', track: Track }
    | { kind: 'page' }

/** A path segment as typed (percent-decoded; a broken escape stays as it is). */
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function notFoundFor(path: string, all: readonly Track[]): NotFound {
  const segments = path.split(/[?#]/)[0]!.split('/').filter(Boolean).map(decode)
  const track = segments[0] ? all.find(item => item.id === segments[0]) : undefined
  if (track?.status === 'coming' && segments.length <= 2) return { kind: 'coming', track }
  if (segments.length === 1 && !track) return { kind: 'track', slug: segments[0]! }
  if (segments.length === 2 && track) return { kind: 'level', track, slug: segments[1]! }
  return { kind: 'page' }
}
