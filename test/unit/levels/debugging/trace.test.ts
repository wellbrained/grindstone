import { describe, expect, it } from 'vitest'
import { mapFrames, parseStack, sourceOf } from '../../../../shared/levels/debugging/trace'

// The same error (1.1: a click on Add, cart.js line 14) as each browser writes its stack. Module files run from blob
// URLs made inside the sealed frame; the frame's own page is about:srcdoc, where the bridge sits on line 3.
const CART = 'blob:null/6f1c9e2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const APP = 'blob:null/0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'
const mapping = { urls: { [CART]: 'cart.js', [APP]: 'app.js' }, bridgeLine: 3 }

const chrome = `TypeError: Cannot read properties of undefined (reading 'push')
    at addToCart (${CART}:14:14)
    at HTMLButtonElement.<anonymous> (${APP}:22:40)
    at runProbe (about:srcdoc:3:4120)
    at Array.forEach (<anonymous>)`

const firefox = `addToCart@${CART}:14:3
@${APP}:22:40
runProbe@about:srcdoc:3:4120
`

const safari = `addToCart@${CART}:14:18
@${APP}:22:50
forEach@[native code]
runProbe@about:srcdoc:3:4120`

describe('parseStack', () => {
  it('reads Chrome frames: function, url, line, column; skips the message and frames without a place', () => {
    expect(parseStack(chrome)).toEqual([
      { fn: 'addToCart', url: CART, line: 14, column: 14 },
      { fn: 'HTMLButtonElement.<anonymous>', url: APP, line: 22, column: 40 },
      { fn: 'runProbe', url: 'about:srcdoc', line: 3, column: 4120 }
    ])
  })

  it('reads Firefox frames, also anonymous ones', () => {
    expect(parseStack(firefox)).toEqual([
      { fn: 'addToCart', url: CART, line: 14, column: 3 },
      { fn: '', url: APP, line: 22, column: 40 },
      { fn: 'runProbe', url: 'about:srcdoc', line: 3, column: 4120 }
    ])
  })

  it('reads Safari frames and skips native code', () => {
    expect(parseStack(safari)).toEqual([
      { fn: 'addToCart', url: CART, line: 14, column: 18 },
      { fn: '', url: APP, line: 22, column: 50 },
      { fn: 'runProbe', url: 'about:srcdoc', line: 3, column: 4120 }
    ])
  })

  it('reads Chrome frames without a function name, async and constructor frames', () => {
    expect(parseStack(`Error: no
    at ${APP}:3:1
    at async loadMenu (${CART}:5:3)
    at new Basket (${CART}:9:11)`)).toEqual([
      { fn: '', url: APP, line: 3, column: 1 },
      { fn: 'loadMenu', url: CART, line: 5, column: 3 },
      { fn: 'new Basket', url: CART, line: 9, column: 11 }
    ])
  })

  it('reads Firefox async frames (the cause before the star) and nested names, and Safari module code', () => {
    expect(parseStack(`async*setup/<@${APP}:22:5\npromise callback*renderTotal@${CART}:9:3\nEventListener.handleEvent*@${APP}:4:1\nmodule code@${CART}:30:1`)).toEqual([
      { fn: 'setup/<', url: APP, line: 22, column: 5 },
      { fn: 'renderTotal', url: CART, line: 9, column: 3 },
      { fn: '', url: APP, line: 4, column: 1 },
      { fn: 'module code', url: CART, line: 30, column: 1 }
    ])
  })

  // recorded through the bridge in Playwright's Chromium, Firefox and WebKit (a probe's click, cart.js line 3)
  it.each([
    ['Chromium', `TypeError: Cannot read properties of undefined (reading 'push')\n    at add (${CART}:3:14)\n    at HTMLButtonElement.<anonymous> (${APP}:4:3)\n    at next (about:srcdoc:3:8648)\n    at runProbe (about:srcdoc:3:9106)\n    at about:srcdoc:3:9479`],
    ['Firefox', `add@${CART}:3:3\n@${APP}:4:3\nnext@about:srcdoc:3:8648\nrunProbe@about:srcdoc:3:9106\n@about:srcdoc:3:9479\npromise callback*@about:srcdoc:3:9453\n@about:srcdoc:3:9409\npromise callback*@about:srcdoc:3:9311\nEventListener.handleEvent*@about:srcdoc:3:9263\n@about:srcdoc:3:9618\n`],
    ['WebKit', `add@${CART}:3:13\n@${APP}:4:6\nclick@[native code]\nnext@about:srcdoc:3:8654\nrunProbe@about:srcdoc:3:9111`]
  ])('maps a real %s trace to the same two frames', (_, stack) => {
    expect(mapFrames(parseStack(stack), mapping).map(frame => `${frame.path}:${frame.line}`)).toEqual(['cart.js:3', 'app.js:4'])
  })

  it('keeps a frame without a column (some engines leave it out)', () => {
    expect(parseStack(`render@${CART}:7`)).toEqual([{ fn: 'render', url: CART, line: 7, column: null }])
  })

  it('does not take a message for a frame, even one with numbers and colons in it', () => {
    expect(parseStack(`Error: bad time 12:30:15\n    at tick (${APP}:4:2)`)).toEqual([{ fn: 'tick', url: APP, line: 4, column: 2 }])
    expect(parseStack('SyntaxError: Unexpected token \'export\'')).toEqual([])
    expect(parseStack('')).toEqual([])
  })
})

describe('mapFrames', () => {
  it('maps frames to the level files, keeps the order and drops the bridge and the browser', () => {
    const expected = [
      { fn: 'addToCart', path: 'cart.js', line: 14, column: 14 },
      { fn: 'HTMLButtonElement.<anonymous>', path: 'app.js', line: 22, column: 40 }
    ]
    expect(mapFrames(parseStack(chrome), mapping)).toEqual(expected)
    // the same file and line in every browser; an anonymous function gets a name
    for (const stack of [firefox, safari]) {
      const frames = mapFrames(parseStack(stack), mapping)
      expect(frames.map(frame => [frame.path, frame.line])).toEqual([['cart.js', 14], ['app.js', 22]])
      expect(frames[1]!.fn).toBe('(anonymous)')
    }
  })

  it('maps the page itself to index.html, except the bridge line', () => {
    expect(mapFrames([
      { fn: '', url: 'about:srcdoc', line: 12, column: 5 },
      { fn: 'post', url: 'about:srcdoc', line: 3, column: 99 }
    ], mapping)).toEqual([{ fn: '(anonymous)', path: 'index.html', line: 12, column: 5 }])
  })

  it('drops anything it does not know: eval code, other pages, native frames', () => {
    expect(mapFrames([
      { fn: 'eval', url: '<anonymous>', line: 1, column: 1 },
      { fn: '', url: 'about:srcdoc line 3 > eval', line: 1, column: 1 },
      { fn: 'x', url: 'https://cornerbakery.shop/other.js', line: 2, column: 2 }
    ], mapping)).toEqual([])
  })
})

describe('sourceOf', () => {
  it('maps one url and line, e.g. where a syntax error was found', () => {
    expect(sourceOf(CART, 20, mapping)).toEqual({ path: 'cart.js', line: 20 })
    expect(sourceOf('about:srcdoc', 3, mapping)).toBeNull()
    expect(sourceOf(null, 4, mapping)).toBeNull()
    expect(sourceOf(APP, null, mapping)).toBeNull()
  })
})
