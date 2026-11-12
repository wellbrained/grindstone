import { describe, expect, it } from 'vitest'
import { levelFromRoute, levelPath, trackPath } from '../../../app/utils/level-route'

describe('level and track routes', () => {
  it('keeps the level URLs: /<track>/<slug>', () => {
    expect(levelPath({ id: 'git-04-merge-conflict', track: 'git' })).toBe('/git/04-merge-conflict')
    expect(levelFromRoute('git', '04-merge-conflict')?.title).toBe('Merge conflict')
    expect(levelFromRoute('git', 'nope')).toBeNull()
  })

  it('links a track page and a chapter section on it', () => {
    expect(trackPath('git')).toBe('/git')
    expect(trackPath('git', 'merging')).toBe('/git#merging')
  })
})
