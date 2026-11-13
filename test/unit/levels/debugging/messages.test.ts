import { describe, expect, it } from 'vitest'
import { consoleEntry, observe, readBridgeMessage } from '../../../../shared/levels/debugging/messages'
import type { BridgeMessage } from '../../../../shared/levels/debugging/messages'

// Messages as the bridge posts them (recorded from Chromium, e2e/debugging-levels.spec.ts checks the real thing).
const CART = 'blob:null/62c4b7ee-ab46-4baa-a461-20d546593740'
const APP = 'blob:null/71eecb73-e0ff-4569-baf1-b581d8ef1437'
const mapping = { urls: { [CART]: 'cart.js', [APP]: 'app.js' }, bridgeLine: 3 }
const token = 'tok-1'

const files: BridgeMessage = { type: 'files', urls: { [CART]: 'cart.js', [APP]: 'app.js' } }
const ready: BridgeMessage = { type: 'console', level: 'log', args: ['Corner Bakery shop ready · 3 products'], stack: `Error\n    at console.<computed> [as log] (about:srcdoc:3:4249)\n    at ${APP}:31:9` }
const typeError: BridgeMessage = {
  type: 'error',
  kind: 'error',
  name: 'TypeError',
  message: 'Cannot read properties of undefined (reading \'push\')',
  stack: `TypeError: Cannot read properties of undefined (reading 'push')\n    at addToCart (${CART}:14:14)\n    at HTMLButtonElement.<anonymous> (${APP}:22:40)\n    at next (about:srcdoc:3:8648)`,
  url: CART,
  line: 14,
  column: 14
}
const syntaxError: BridgeMessage = { type: 'error', kind: 'error', name: 'SyntaxError', message: 'Unexpected token \'export\'', stack: 'SyntaxError: Unexpected token \'export\'', url: CART, line: 20, column: 1 }

describe('readBridgeMessage', () => {
  it('takes a well-formed message that carries this load\'s token, without the token', () => {
    expect(readBridgeMessage({ ...typeError, grindstone: token }, token)).toEqual(typeError)
    expect(readBridgeMessage({ type: 'ready', grindstone: token }, token)).toEqual({ type: 'ready' })
    expect(readBridgeMessage({ type: 'probe', id: 'badge', ok: true, value: '1', error: null, grindstone: token }, token))
      .toEqual({ type: 'probe', id: 'badge', ok: true, value: '1', error: null })
    expect(readBridgeMessage({ type: 'result', id: 3, ok: true, value: '{items: Array(0)}', grindstone: token }, token))
      .toEqual({ type: 'result', id: 3, ok: true, value: '{items: Array(0)}' })
  })

  it('ignores anything else: another load\'s token, no token, other shapes, wrong field types', () => {
    expect(readBridgeMessage({ ...typeError, grindstone: 'old' }, token)).toBeNull()
    expect(readBridgeMessage({ type: 'ready' }, token)).toBeNull()
    expect(readBridgeMessage('ready', token)).toBeNull()
    expect(readBridgeMessage(null, token)).toBeNull()
    expect(readBridgeMessage({ type: 'navigate', grindstone: token }, token)).toBeNull()
    expect(readBridgeMessage({ type: 'console', level: 'table', args: [], stack: '', grindstone: token }, token)).toBeNull()
    expect(readBridgeMessage({ type: 'console', level: 'log', args: [{ html: '<b>' }], stack: '', grindstone: token }, token)).toBeNull()
    expect(readBridgeMessage({ type: 'error', kind: 'error', name: 1, message: 'x', stack: null, url: null, line: null, column: null, grindstone: token }, token)).toBeNull()
    expect(readBridgeMessage({ type: 'probe', id: 'x', ok: true, value: { no: 1 }, error: null, grindstone: token }, token)).toBeNull()
  })

  it('keeps only blob URLs in the file list', () => {
    expect(readBridgeMessage({ type: 'files', urls: { [APP]: 'app.js', 'https://evil.example/x.js': 'cart.js' }, grindstone: token }, token))
      .toEqual({ type: 'files', urls: { [APP]: 'app.js' } })
  })

  it('cuts very long texts and very many console arguments', () => {
    const read = readBridgeMessage({ type: 'console', level: 'log', args: Array.from({ length: 80 }, () => 'x'.repeat(20000)), stack: '', grindstone: token }, token)
    expect(read?.type === 'console' && read.args).toHaveLength(50)
    expect(read?.type === 'console' && read.args[0]!.length).toBeLessThanOrEqual(10001)
  })
})

describe('consoleEntry', () => {
  it('shows a log with where it was called from (not the bridge), and no trace', () => {
    expect(consoleEntry(ready, mapping)).toEqual({ level: 'log', text: 'Corner Bakery shop ready · 3 products', source: { path: 'app.js', line: 31 }, frames: [] })
  })

  it('shows an uncaught error the way the browser does, with its frames in the level files', () => {
    expect(consoleEntry(typeError, mapping)).toEqual({
      level: 'error',
      text: 'Uncaught TypeError: Cannot read properties of undefined (reading \'push\')',
      source: { path: 'cart.js', line: 14 },
      frames: [
        { fn: 'addToCart', path: 'cart.js', line: 14, column: 14 },
        { fn: 'HTMLButtonElement.<anonymous>', path: 'app.js', line: 22, column: 40 }
      ]
    })
  })

  it('points a syntax error at the line where the browser found it (it has no frames)', () => {
    expect(consoleEntry(syntaxError, mapping)).toEqual({ level: 'error', text: 'Uncaught SyntaxError: Unexpected token \'export\'', source: { path: 'cart.js', line: 20 }, frames: [] })
  })

  it('names a module by its file where the browser wrote its blob URL (Firefox), and keeps a missing location (Safari)', () => {
    expect(consoleEntry({ type: 'error', kind: 'error', name: 'SyntaxError', message: `The requested module '${CART}' doesn't provide an export named: 'formatEuro'`, stack: null, url: APP, line: 4, column: 10 }, mapping))
      .toEqual({ level: 'error', text: 'Uncaught SyntaxError: The requested module \'cart.js\' doesn\'t provide an export named: \'formatEuro\'', source: { path: 'app.js', line: 4 }, frames: [] })
    expect(consoleEntry({ type: 'error', kind: 'error', name: 'SyntaxError', message: 'Importing binding name \'formatEuro\' is not found.', stack: null, url: null, line: null, column: null }, mapping))
      .toMatchObject({ text: 'Uncaught SyntaxError: Importing binding name \'formatEuro\' is not found.', source: null })
  })

  it('marks a rejection as one, also when the reason is not an Error', () => {
    expect(consoleEntry({ type: 'error', kind: 'rejection', name: null, message: '\'out of stock\'', stack: null, url: null, line: null, column: null }, mapping))
      .toMatchObject({ level: 'error', text: 'Uncaught (in promise) \'out of stock\'', source: null })
  })

  it('gives console.error its call stack as a trace, console.warn only its source', () => {
    const stack = `Error\n    at console.<computed> [as error] (about:srcdoc:3:4249)\n    at renderTotal (${CART}:9:11)\n    at ${APP}:30:1`
    expect(consoleEntry({ type: 'console', level: 'error', args: ['Total failed'], stack }, mapping)).toMatchObject({
      level: 'error',
      source: { path: 'cart.js', line: 9 },
      frames: [{ fn: 'renderTotal', path: 'cart.js', line: 9 }, { fn: '(anonymous)', path: 'app.js', line: 30 }]
    })
    expect(consoleEntry({ type: 'console', level: 'warn', args: ['Low stock'], stack }, mapping)).toMatchObject({ level: 'warn', source: { path: 'cart.js', line: 9 }, frames: [] })
  })

  it('shows Console input results; an error from the input is red and has no frames of the app', () => {
    expect(consoleEntry({ type: 'result', id: 1, ok: true, value: '{items: Array(0)}' }, mapping)).toEqual({ level: 'result', text: '{items: Array(0)}', source: null, frames: [] })
    expect(consoleEntry({ type: 'result', id: 2, ok: false, name: 'ReferenceError', message: 'formatPrice is not defined', stack: 'ReferenceError: formatPrice is not defined\n    at eval (eval at <anonymous> (about:srcdoc:3:7468), <anonymous>:1:1)' }, mapping))
      .toEqual({ level: 'error', text: 'Uncaught ReferenceError: formatPrice is not defined', source: null, frames: [] })
  })

  it('has nothing to show for the bridge\'s own messages', () => {
    for (const message of [files, { type: 'ready' }, { type: 'done' }, { type: 'probe', id: 'x', ok: true, value: 1, error: null }] as BridgeMessage[]) {
      expect(consoleEntry(message, mapping)).toBeNull()
    }
  })
})

describe('observe', () => {
  it('collects what the goals read: errors with their source, probe values, logs, whether the run finished', () => {
    const observation = observe([
      files,
      ready,
      { type: 'ready' },
      typeError,
      { type: 'probe', id: 'badge', ok: true, value: '0', error: null },
      { type: 'probe', id: 'rows', ok: true, value: 3, error: null },
      { type: 'probe', id: 'total', ok: false, value: null, error: 'Nothing on the page matches #total' },
      { type: 'done' }
    ], 3)
    expect(observation).toEqual({
      finished: true,
      errors: [{ kind: 'error', text: 'Uncaught TypeError: Cannot read properties of undefined (reading \'push\')', source: { path: 'cart.js', line: 14 } }],
      probes: { badge: '0', rows: 3 },
      probeErrors: { total: 'Nothing on the page matches #total' },
      logs: ['Corner Bakery shop ready · 3 products']
    })
  })

  it('counts console.error as an error and not as a log; a run without "done" did not finish', () => {
    const observation = observe([files, { type: 'console', level: 'error', args: ['Oops'], stack: '' }], 3)
    expect(observation).toMatchObject({ finished: false, errors: [{ kind: 'console', text: 'Oops', source: null }], logs: [] })
  })
})
