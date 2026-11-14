import { describe, expect, it } from 'vitest'
import {
  KEY_STEP,
  KEY_STEP_BIG,
  MIN_EDITOR_HEIGHT,
  MIN_TERMINAL_HEIGHT,
  SPLITTER_HEIGHT,
  appliedTerminalHeight,
  clampHeight,
  maxTerminalHeight,
  parseTerminalHeight,
  stepTerminalHeight
} from '../../../app/utils/terminal-size'

describe('maxTerminalHeight', () => {
  it('leaves the editor its minimum and the handle its room', () => {
    expect(maxTerminalHeight(552)).toBe(552 - SPLITTER_HEIGHT - MIN_EDITOR_HEIGHT)
  })

  it('never goes below the terminal minimum, however short the column', () => {
    expect(maxTerminalHeight(200)).toBe(MIN_TERMINAL_HEIGHT)
    expect(maxTerminalHeight(0)).toBe(MIN_TERMINAL_HEIGHT)
  })
})

describe('clampHeight', () => {
  it('keeps a height inside the bounds and rounds to whole pixels', () => {
    expect(clampHeight(300.4, 160, 400)).toBe(300)
    expect(clampHeight(50, 160, 400)).toBe(160)
    expect(clampHeight(900, 160, 400)).toBe(400)
  })
})

describe('parseTerminalHeight', () => {
  it('reads a stored number of pixels', () => {
    expect(parseTerminalHeight('320')).toBe(320)
    expect(parseTerminalHeight('160')).toBe(160)
  })

  it('treats anything else as no value (the default sizes)', () => {
    for (const raw of [null, undefined, '', 'abc', '-300', '320.5', '12345', '159', '0', '{"h":300}', '3e2', ' 320']) {
      expect(parseTerminalHeight(raw)).toBeNull()
    }
  })
})

describe('stepTerminalHeight', () => {
  it('Up makes the terminal taller, Down shorter; Shift takes the big step', () => {
    expect(stepTerminalHeight('ArrowUp', false, 300, 160, 400)).toBe(300 + KEY_STEP)
    expect(stepTerminalHeight('ArrowDown', false, 300, 160, 400)).toBe(300 - KEY_STEP)
    expect(stepTerminalHeight('ArrowUp', true, 200, 160, 400)).toBe(200 + KEY_STEP_BIG)
    expect(stepTerminalHeight('ArrowDown', true, 300, 160, 400)).toBe(300 - KEY_STEP_BIG)
  })

  it('stops at the bounds', () => {
    expect(stepTerminalHeight('ArrowUp', true, 380, 160, 400)).toBe(400)
    expect(stepTerminalHeight('ArrowDown', true, 170, 160, 400)).toBe(160)
  })

  it('Home and End jump to the smallest and the largest', () => {
    expect(stepTerminalHeight('Home', false, 300, 160, 400)).toBe(160)
    expect(stepTerminalHeight('End', false, 300, 160, 400)).toBe(400)
  })

  it('ignores other keys', () => {
    expect(stepTerminalHeight('Enter', false, 300, 160, 400)).toBeNull()
    expect(stepTerminalHeight('a', false, 300, 160, 400)).toBeNull()
  })
})

describe('appliedTerminalHeight', () => {
  it('is nothing without a saved height', () => {
    expect(appliedTerminalHeight(null, 552)).toBeNull()
  })

  it('keeps a saved height that fits', () => {
    expect(appliedTerminalHeight(300, 552)).toBe(300)
  })

  it('clamps a saved height that no longer fits to the column, so the editor keeps its room', () => {
    expect(appliedTerminalHeight(508, 552)).toBe(maxTerminalHeight(552))
    expect(appliedTerminalHeight(508, 552)).toBe(376)
  })

  it('uses the saved height as it is while the column is not measured yet', () => {
    expect(appliedTerminalHeight(508, 0)).toBe(508)
  })
})
