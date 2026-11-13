import { describe, expect, it } from 'vitest'
import { checkFrameStyle } from '../../../app/utils/sandbox-host'

// The hidden check frame (docs/features/ui.md, "Sandbox and bridge"): WebKit all but stops the timers of a cross-origin
// frame that is wholly outside the viewport, and a check run lives on timers (the fake backend's delays, the probes'
// waits), so the frame keeps one pixel column inside the viewport, transparent and never clickable.
describe('checkFrameStyle', () => {
  it('keeps one transparent, unclickable pixel column of the frame in the viewport, at its size', () => {
    expect(checkFrameStyle(390, 700)).toEqual({
      position: 'fixed',
      left: '-389px',
      top: '0px',
      width: '390px',
      height: '700px',
      border: '0px',
      opacity: '0',
      pointerEvents: 'none'
    })
    expect(checkFrameStyle(1024, 700)).toMatchObject({ left: '-1023px', width: '1024px' })
  })
})
