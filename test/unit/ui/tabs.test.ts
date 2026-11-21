import { describe, expect, it } from 'vitest'
import { TAB_COLUMNS, tabAfterKey } from '../../../app/utils/tabs'

const PANES = ['diff', 'review', 'run'] as const

describe('tabAfterKey', () => {
  it('steps right and left, wrapping at the ends', () => {
    expect(tabAfterKey(PANES, 'diff', 'ArrowRight')).toBe('review')
    expect(tabAfterKey(PANES, 'run', 'ArrowRight')).toBe('diff')
    expect(tabAfterKey(PANES, 'diff', 'ArrowLeft')).toBe('run')
    expect(tabAfterKey(PANES, 'review', 'ArrowLeft')).toBe('diff')
  })

  it('jumps to the ends with Home and End', () => {
    expect(tabAfterKey(PANES, 'review', 'Home')).toBe('diff')
    expect(tabAfterKey(PANES, 'diff', 'End')).toBe('run')
  })

  it('ignores every other key, and an empty tab set', () => {
    expect(tabAfterKey(PANES, 'diff', 'Enter')).toBeNull()
    expect(tabAfterKey(PANES, 'diff', 'ArrowDown')).toBeNull()
    expect(tabAfterKey([], 'diff', 'ArrowRight')).toBeNull()
  })
})

describe('TAB_COLUMNS', () => {
  it('has a column count for every phone tab set the play pages build (2 to 7 tabs), six as two rows of three', () => {
    for (let count = 2; count <= 7; count++) expect(TAB_COLUMNS[count]).toMatch(/^grid-cols-\d$/)
    expect(TAB_COLUMNS[6]).toBe('grid-cols-3')
  })
})
