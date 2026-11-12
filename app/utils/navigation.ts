// The site navigation and the home page's track lists, from the track registry: a new live track shows up in the header,
// the footer and on the home page from its data alone (shared/levels/tracks.ts).
import type { Track } from '../../shared/levels'

export interface NavLink {
  label: string
  to: string
}

export interface NavItem extends NavLink {
  active: boolean
  /** A live track: its Levels page and, when it has one, its cheat sheet, shown as a menu under the entry. */
  children?: NavLink[]
  /** Opens the children from the start in the vertical (mobile) menu. */
  defaultOpen?: boolean
}

export const liveTracks = (all: readonly Track[]): Track[] => all.filter(track => track.status === 'live')
export const comingTracks = (all: readonly Track[]): Track[] => all.filter(track => track.status === 'coming')

/**
 * Tracks (home), one entry per live track, About. A live track is a small menu: Levels, and its cheat sheet when it has
 * one. A track is active on its page and everything below it (its levels, its cheat sheet).
 */
export function navigationItems(path: string, all: readonly Track[], labels: { home: string, about: string, levels: string, cheat: string }): NavItem[] {
  const current = path.replace(/\/$/, '') || '/'
  return [
    { label: labels.home, to: '/', active: current === '/' },
    ...liveTracks(all).map(track => ({
      label: track.title,
      to: `/${track.id}`,
      active: current === `/${track.id}` || current.startsWith(`/${track.id}/`),
      children: [
        { label: labels.levels, to: `/${track.id}` },
        ...(track.cheatSheet ? [{ label: labels.cheat, to: track.cheatSheet }] : [])
      ],
      defaultOpen: true
    })),
    { label: labels.about, to: '/about', active: current === '/about' }
  ]
}
