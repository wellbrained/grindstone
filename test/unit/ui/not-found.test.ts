import { describe, expect, it } from 'vitest'
import { tracks } from '../../../shared/levels'
import { notFoundFor } from '../../../app/utils/not-found'

const summary = (path: string) => {
  const found = notFoundFor(path, tracks)
  return found.kind === 'level' ? ['level', found.track.id, found.slug] : found.kind === 'track' ? ['track', found.slug] : found.kind === 'coming' ? ['coming', found.track.id] : ['page']
}

describe('notFoundFor', () => {
  it('names the live track of a missing level, with the slug as typed', () => {
    expect(summary('/git/zzz')).toEqual(['level', 'git', 'zzz'])
    expect(summary('/web/zzz/')).toEqual(['level', 'web', 'zzz'])
    expect(summary('/debugging/no%20such?x=1#top')).toEqual(['level', 'debugging', 'no such'])
  })

  it('says there is no such track for one unknown segment', () => {
    expect(summary('/zzz')).toEqual(['track', 'zzz'])
    expect(summary('/bad%E0')).toEqual(['track', 'bad%E0'])
  })

  it('tells a coming track from an unknown one', () => {
    const coming = tracks.find(track => track.status === 'coming')!
    expect(summary(`/${coming.id}`)).toEqual(['coming', coming.id])
    expect(summary(`/${coming.id}/01-anything`)).toEqual(['coming', coming.id])
  })

  it('falls back to a plain page not found', () => {
    expect(summary('/')).toEqual(['page'])
    expect(summary('/zzz/yyy')).toEqual(['page'])
    expect(summary('/git/01-first-commit/extra')).toEqual(['page'])
  })
})
