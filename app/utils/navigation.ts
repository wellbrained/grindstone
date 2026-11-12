// The site navigation and the home page's track lists, from the track registry: a new live track shows up in the header,
// the footer and on the home page from its data alone (shared/levels/tracks.ts).
import type { Track } from '../../shared/levels'

export interface NavItem {
  label: string
  to: string
  active: boolean
}

export const liveTracks = (all: readonly Track[]): Track[] => all.filter(track => track.status === 'live')
export const comingTracks = (all: readonly Track[]): Track[] => all.filter(track => track.status === 'coming')

/**
 * Tracks (home), one entry per live track, About. A track is active on its page and everything below it (its levels,
 * its cheat sheet).
 */
export function navigationItems(path: string, all: readonly Track[], labels: { home: string, about: string }): NavItem[] {
  const current = path.replace(/\/$/, '') || '/'
  return [
    { label: labels.home, to: '/', active: current === '/' },
    ...liveTracks(all).map(track => ({
      label: track.title,
      to: `/${track.id}`,
      active: current === `/${track.id}` || current.startsWith(`/${track.id}/`)
    })),
    { label: labels.about, to: '/about', active: current === '/about' }
  ]
}
