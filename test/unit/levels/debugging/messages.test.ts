import { describe, expect, it } from 'vitest'
import { consoleEntry, mergeObservations, observe, readBridgeMessage } from '../../../../shared/levels/debugging/messages'
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

  it('puts the frames of a check run at several widths together: errors once, every probe, the logs of the first frame', () => {
    const error = { kind: 'error' as const, text: 'Uncaught TypeError: x', source: { path: 'app.js', line: 3 } }
    const phone = { finished: true, errors: [error], probes: { a: 'visible' }, probeErrors: {}, logs: ['ready'] }
    const laptop = { finished: true, errors: [error, { ...error, source: null }], probes: { b: 'display: none' }, probeErrors: { c: 'Nothing on the page matches .c' }, logs: ['ready'] }
    expect(mergeObservations([phone, laptop])).toEqual({
      finished: true,
      errors: [error, { ...error, source: null }],
      probes: { a: 'visible', b: 'display: none' },
      probeErrors: { c: 'Nothing on the page matches .c' },
      logs: ['ready']
    })
    expect(mergeObservations([phone, { ...laptop, finished: false }]).finished).toBe(false)
    expect(mergeObservations([phone])).toEqual(phone)
  })

  it('counts console.error as an error and not as a log; a run without "done" did not finish', () => {
    const observation = observe([files, { type: 'console', level: 'error', args: ['Oops'], stack: '' }], 3)
    expect(observation).toMatchObject({ finished: false, errors: [{ kind: 'console', text: 'Oops', source: null }], logs: [] })
  })
})

describe('the fake backend\'s messages', () => {
  const MENU = 'blob:null/0f1d2c3b-aaaa-bbbb-cccc-1234567890ab'
  const backendMapping = { urls: { ...mapping.urls, [MENU]: 'menu.js' }, bridgeLine: 3 }
  const sentFrom = `Error\n    at fetch (about:srcdoc:3:9120)\n    at loadMenu (${MENU}:5:26)\n    at ${APP}:28:1`
  const request = { type: 'request', id: 1, method: 'GET', url: 'https://cornerbakery.shop/api/products', headers: [['accept', '*/*']], body: null, stack: sentFrom }
  const response = { type: 'response', id: 1, status: 404, statusText: 'Not Found', headers: [['content-type', 'text/html; charset=utf-8']], body: '<pre>Cannot GET /api/products</pre>', failure: null, time: 31 }
  const netlog = { type: 'netlog', text: 'GET https://cornerbakery.shop/api/products 404 (Not Found)', stack: sentFrom }

  it('reads a request, its answer and the browser\'s line for it', () => {
    expect(readBridgeMessage({ ...request, grindstone: token }, token)).toEqual(request)
    expect(readBridgeMessage({ ...response, grindstone: token }, token)).toEqual(response)
    expect(readBridgeMessage({ ...netlog, grindstone: token }, token)).toEqual(netlog)
    const cors = { ...response, status: null, statusText: '', headers: [], body: null, failure: 'cors' }
    expect(readBridgeMessage({ ...cors, grindstone: token }, token)).toEqual(cors)
  })

  it('refuses malformed ones: a made-up failure, headers that are not pairs of text, a status that is not one, a method that is not a word', () => {
    const read = (message: object) => readBridgeMessage({ ...message, grindstone: token }, token)
    expect(read({ ...response, failure: 'teapot' })).toBeNull()
    expect(read({ ...response, headers: [['a']] })).toBeNull()
    expect(read({ ...response, headers: [['a', 1]] })).toBeNull()
    expect(read({ ...response, status: 99_999 })).toBeNull()
    expect(read({ ...response, status: 200.5 })).toBeNull()
    expect(read({ ...response, time: 'soon' })).toBeNull()
    expect(read({ ...request, method: 'GET /evil' })).toBeNull()
    expect(read({ ...request, id: 'one' })).toBeNull()
    expect(read({ ...request, body: { html: '<b>' } })).toBeNull()
    expect(read({ ...netlog, text: 5 })).toBeNull()
  })

  it('caps the headers it keeps', () => {
    const many = readBridgeMessage({ ...request, headers: Array.from({ length: 80 }, (_, index) => [`x-${index}`, 'v']), grindstone: token }, token)
    expect(many?.type === 'request' && many.headers).toHaveLength(50)
  })

  it('shows the browser\'s line for a failed request as an error with the line that sent it, no trace', () => {
    expect(consoleEntry(netlog as BridgeMessage, backendMapping)).toEqual({ level: 'error', text: netlog.text, source: { path: 'menu.js', line: 5 }, frames: [] })
    expect(consoleEntry({ type: 'netlog', text: 'Access to fetch …', stack: '' }, backendMapping)).toEqual({ level: 'error', text: 'Access to fetch …', source: null, frames: [] })
    expect(consoleEntry(request as BridgeMessage, backendMapping)).toBeNull()
    expect(consoleEntry(response as BridgeMessage, backendMapping)).toBeNull()
  })

  it('counts the browser\'s line as an error of its own kind', () => {
    const observation = observe([{ type: 'files', urls: backendMapping.urls }, request as BridgeMessage, response as BridgeMessage, netlog as BridgeMessage, { type: 'done' }], 3)
    expect(observation.errors).toEqual([{ kind: 'network', text: netlog.text, source: { path: 'menu.js', line: 5 } }])
  })
})

describe('the Elements panel\'s messages', () => {
  const read = (message: object) => readBridgeMessage({ ...message, grindstone: token }, token)
  const nodes = [
    { id: 0, parent: -1, tag: 'html', attrs: [['lang', 'en']], text: null, shown: true, overflows: false },
    { id: 1, parent: 0, tag: 'body', attrs: [], text: null, shown: true, overflows: false },
    { id: 2, parent: 1, tag: 'button', attrs: [['id', 'order'], ['onclick', '<b>alert(1)</b>']], text: 'Order', shown: false, overflows: true }
  ]
  const inspected = {
    type: 'inspected',
    seq: 4,
    node: 2,
    found: true,
    chain: [{ node: 2, label: 'button#order', inline: 'color: red', matches: [{ rule: 3, selectors: [0, 1] }] }, { node: 1, label: 'body', inline: null, matches: [] }],
    invalid: [{ rule: 3, declarations: [1] }],
    box: { width: 80.5, height: 20, padding: [4, 8, 4, 8], border: [0, 0, 0, 0], margin: [0, 0, 0, 0] },
    computed: [['display', 'inline-block'], ['color', 'rgb(255, 255, 255)']],
    scroll: { scrollWidth: 80, clientWidth: 80, scrollHeight: 20, clientHeight: 20 }
  }

  it('reads a snapshot of the page, an inspected element and pick mode\'s messages, as plain data', () => {
    expect(read({ type: 'dom', nodes, truncated: false })).toEqual({ type: 'dom', nodes, truncated: false })
    expect(read(inspected)).toEqual(inspected)
    expect(read({ ...inspected, box: null, scroll: null, found: false })).toMatchObject({ box: null, scroll: null, found: false })
    expect(read({ type: 'hovered', node: 2 })).toEqual({ type: 'hovered', node: 2 })
    expect(read({ type: 'hovered', node: -1 })).toEqual({ type: 'hovered', node: -1 })
    expect(read({ type: 'picked', node: 0 })).toEqual({ type: 'picked', node: 0 })
    expect(read({ type: 'pickEnd' })).toEqual({ type: 'pickEnd' })
  })

  it('refuses a snapshot that is not a tree of plain elements', () => {
    expect(read({ type: 'dom', nodes: [{ ...nodes[0], parent: 0 }], truncated: false })).toBeNull()
    expect(read({ type: 'dom', nodes: [nodes[0], { ...nodes[1], id: 5 }], truncated: false })).toBeNull()
    expect(read({ type: 'dom', nodes: [nodes[0], { ...nodes[1], tag: '<img src=x>' }], truncated: false })).toBeNull()
    expect(read({ type: 'dom', nodes: [nodes[0], { ...nodes[1], attrs: [['a', { html: 1 }]] }], truncated: false })).toBeNull()
    expect(read({ type: 'dom', nodes: [nodes[0], { ...nodes[1], shown: 'yes' }], truncated: false })).toBeNull()
    expect(read({ type: 'dom', nodes: 'html', truncated: false })).toBeNull()
  })

  it('caps a snapshot: elements, attributes and long texts', () => {
    const many = Array.from({ length: 900 }, (_, id) => ({ ...nodes[1], id, parent: id - 1, attrs: Array.from({ length: 30 }, (_, n) => [`data-${n}`, 'x'.repeat(5000)]) }))
    const capped = read({ type: 'dom', nodes: many, truncated: false })
    expect(capped?.type === 'dom' && capped.nodes).toHaveLength(600)
    expect(capped?.type === 'dom' && capped.truncated).toBe(true)
    expect(capped?.type === 'dom' && capped.nodes[0]!.attrs).toHaveLength(12)
    expect(capped?.type === 'dom' && capped.nodes[0]!.attrs[0]![1].length).toBeLessThanOrEqual(200)
  })

  it('refuses an inspected element with the wrong shape', () => {
    expect(read({ ...inspected, box: { ...inspected.box, padding: [1, 2, 3] } })).toBeNull()
    expect(read({ ...inspected, box: { ...inspected.box, width: 'wide' } })).toBeNull()
    expect(read({ ...inspected, chain: [{ ...inspected.chain[0], matches: [{ rule: 'x', selectors: [] }] }] })).toBeNull()
    expect(read({ ...inspected, chain: [{ ...inspected.chain[0], matches: [{ rule: 1, selectors: [-1] }] }] })).toBeNull()
    expect(read({ ...inspected, computed: [['display']] })).toBeNull()
    expect(read({ ...inspected, scroll: { scrollWidth: Infinity, clientWidth: 0, scrollHeight: 0, clientHeight: 0 } })).toBeNull()
    expect(read({ type: 'hovered', node: 1.5 })).toBeNull()
    expect(read({ type: 'picked', node: -1 })).toBeNull()
  })

  it('has nothing for the Console in them', () => {
    expect(consoleEntry(read({ type: 'dom', nodes, truncated: false })!, mapping)).toBeNull()
    expect(consoleEntry(read(inspected)!, mapping)).toBeNull()
  })
})
