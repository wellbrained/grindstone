import { describe, expect, it } from 'vitest'
import { defineTrack, gitTrack, tracks } from '../../../shared/levels'
import { firstCommit } from '../../../shared/levels/git/01-first-commit'
import { comingTracks, liveTracks, navigationItems } from '../../../app/utils/navigation'

const labels = { home: 'Tracks', about: 'About' }

// a second live track, as data only: it must reach the nav and the home page without page edits
const web = defineTrack({
  id: 'web',
  title: 'Web fundamentals',
  scope: 'CORS and friends',
  description: 'Fixture.',
  status: 'live',
  chapters: [{ id: 'cors', title: 'CORS', description: 'Fixture.', colour: 0, levels: [{ ...firstCommit, id: 'web-01-cors', track: 'web' }] }]
})
const withWeb = [gitTrack, web, ...tracks.filter(track => track.status === 'coming' && track.id !== 'web')]

describe('navigation', () => {
  it('lists home, one entry per live track, and About; no global cheat sheet entry', () => {
    expect(navigationItems('/', tracks, labels).map(item => [item.label, item.to, item.active])).toEqual([
      ['Tracks', '/', true],
      ['Git', '/git', false],
      ['About', '/about', false]
    ])
  })

  it('marks a track active on its page, its levels and its cheat sheet', () => {
    for (const path of ['/git', '/git/', '/git/04-merge-conflict', '/git/cheat-sheet']) {
      expect(navigationItems(path, tracks, labels).find(item => item.active)?.to, path).toBe('/git')
    }
    expect(navigationItems('/gitlab', tracks, labels).some(item => item.active)).toBe(false)
    expect(navigationItems('/about', tracks, labels).find(item => item.active)?.to).toBe('/about')
  })

  it('picks up a second live track from data alone, in the nav and on the home page', () => {
    expect(navigationItems('/web/01-cors', withWeb, labels).map(item => [item.to, item.active])).toEqual([
      ['/', false],
      ['/git', false],
      ['/web', true],
      ['/about', false]
    ])
    expect(liveTracks(withWeb).map(track => track.id)).toEqual(['git', 'web'])
    expect(comingTracks(withWeb).map(track => track.id)).toEqual(['ai', 'debugging', 'frameworks'])
  })
})
