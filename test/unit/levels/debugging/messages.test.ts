import { describe, expect, it } from 'vitest'
import { BRIDGE_HELLO, consoleEntry, isBridgeHello, mergeObservations, observe, readBridgeMessage } from '../../../../shared/levels/debugging/messages'
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

// The bridge's first message hands the page the load's ports (with the token); everything after it comes over the port.
describe('isBridgeHello', () => {
  it('is the hello of the load with this token only', () => {
    expect(BRIDGE_HELLO).toBe('grindstone:bridge')
    expect(isBridgeHello({ type: BRIDGE_HELLO, token }, token)).toBe(true)
    expect(isBridgeHello({ type: BRIDGE_HELLO, token: 'tok-old' }, token)).toBe(false)
    expect(isBridgeHello({ type: BRIDGE_HELLO }, token)).toBe(false)
    expect(isBridgeHello({ type: 'ready', token }, token)).toBe(false)
    expect(isBridgeHello({ type: BRIDGE_HELLO, token: { toString: () => token } }, token)).toBe(false)
    expect(isBridgeHello(BRIDGE_HELLO, token)).toBe(false)
    expect(isBridgeHello(null, token)).toBe(false)
  })

  it('is no message of the load: the hello itself is never read as one', () => {
    expect(readBridgeMessage({ type: BRIDGE_HELLO, token })).toBeNull()
  })
})

describe('readBridgeMessage', () => {
  it('takes a well-formed message as plain data, leaving out anything else it carries', () => {
    expect(readBridgeMessage(typeError)).toEqual(typeError)
    expect(readBridgeMessage({ ...typeError, grindstone: 'old', extra: '<b>' })).toEqual(typeError)
    expect(readBridgeMessage({ type: 'ready' })).toEqual({ type: 'ready' })
    expect(readBridgeMessage({ type: 'probe', id: 'badge', ok: true, value: '1', error: null }))
      .toEqual({ type: 'probe', id: 'badge', ok: true, value: '1', error: null })
    expect(readBridgeMessage({ type: 'result', id: 3, ok: true, value: '{items: Array(0)}' }))
      .toEqual({ type: 'result', id: 3, ok: true, value: '{items: Array(0)}' })
  })

  it('ignores anything else: other shapes, wrong field types', () => {
    expect(readBridgeMessage('ready')).toBeNull()
    expect(readBridgeMessage(null)).toBeNull()
    expect(readBridgeMessage({ type: 'navigate' })).toBeNull()
    expect(readBridgeMessage({ type: 'console', level: 'table', args: [], stack: '' })).toBeNull()
    expect(readBridgeMessage({ type: 'console', level: 'log', args: [{ html: '<b>' }], stack: '' })).toBeNull()
    expect(readBridgeMessage({ type: 'error', kind: 'error', name: 1, message: 'x', stack: null, url: null, line: null, column: null })).toBeNull()
    expect(readBridgeMessage({ type: 'probe', id: 'x', ok: true, value: { no: 1 }, error: null })).toBeNull()
  })

  it('keeps only blob URLs in the file list', () => {
    expect(readBridgeMessage({ type: 'files', urls: { [APP]: 'app.js', 'https://evil.example/x.js': 'cart.js' } }))
      .toEqual({ type: 'files', urls: { [APP]: 'app.js' } })
  })

  it('cuts very long texts and very many console arguments', () => {
    const read = readBridgeMessage({ type: 'console', level: 'log', args: Array.from({ length: 80 }, () => 'x'.repeat(20000)), stack: '' })
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
    // Debugging's backend names no preflight and no reason: they read as none
    expect(readBridgeMessage(request)).toEqual({ ...request, preflightFor: null, site: null, destination: 'fetch', cookies: [] })
    expect(readBridgeMessage(response)).toEqual({ ...response, reason: null, cookies: [], fromCache: false })
    expect(readBridgeMessage(netlog)).toEqual(netlog)
    const cors = { ...response, status: null, statusText: '', headers: [], body: null, failure: 'cors' }
    expect(readBridgeMessage(cors)).toEqual({ ...cors, reason: null, cookies: [], fromCache: false })
  })

  it('reads the web backend\'s preflights, its reasons and server.js\'s lines (Web fundamentals), and refuses them malformed', () => {
    const preflight = { ...request, id: 2, method: 'OPTIONS', preflightFor: 1, site: null, destination: 'fetch', cookies: [] }
    expect(readBridgeMessage(preflight)).toEqual(preflight)
    const refused = { ...response, status: 200, failure: 'cors', reason: 'No \'Access-Control-Allow-Origin\' header is present on the requested resource.', cookies: [] }
    expect(readBridgeMessage(refused)).toEqual({ ...refused, fromCache: false })
    expect(readBridgeMessage({ ...refused, reason: 'x'.repeat(5000) })).toMatchObject({ reason: 'x'.repeat(1000) })
    const line = { type: 'server', level: 'error', text: 'ReferenceError: MENU is not defined', line: 21 }
    expect(readBridgeMessage(line)).toEqual(line)
    expect(readBridgeMessage({ ...line, level: 'access', line: null })).toEqual({ ...line, level: 'access', line: null })
    expect(readBridgeMessage({ ...preflight, preflightFor: 'one' })).toBeNull()
    expect(readBridgeMessage({ ...line, level: 'shout' })).toBeNull()
    expect(readBridgeMessage({ ...line, line: 0 })).toBeNull()
    expect(readBridgeMessage({ ...line, line: 2.5 })).toBeNull()
    expect(readBridgeMessage({ ...line, text: { html: '<b>' } })).toBeNull()
    expect(readBridgeMessage({ ...line, text: 'y'.repeat(900) })).toMatchObject({ text: 'y'.repeat(500) })
  })

  it('reads chapter 2\'s cookies: a request\'s (sent or why not), an answer\'s Set-Cookie lines, the jar for the Application panel', () => {
    const form = { ...request, method: 'POST', site: 'https://cheap-flour.example', destination: 'document', preflightFor: null, cookies: [{ name: 'session', value: 'lena-7f3a', sent: false, reason: 'This cookie was blocked because …' }] }
    expect(readBridgeMessage(form)).toEqual(form)
    const kept = { ...response, reason: null, cookies: [{ line: 'session=lena-7f3a; Path=/', stored: true, reason: null }] }
    expect(readBridgeMessage(kept)).toEqual({ ...kept, fromCache: false })
    const jar = {
      type: 'cookies',
      jar: [{ name: 'session', value: 'lena-7f3a', size: 16, domain: 'api.cornerbakery.shop', hostOnly: true, path: '/', expires: null, secure: true, httpOnly: true, sameSite: 'Lax' }],
      total: 1,
      refused: [{ source: 'script', url: 'https://cornerbakery.shop/order', name: 'session', line: 'session=x; HttpOnly', reason: 'document.cookie can\'t set an HttpOnly cookie: the browser ignores the write.' }],
      readable: []
    }
    expect(readBridgeMessage(jar)).toEqual(jar)
    // malformed: a made-up destination or SameSite, a cookie row that is no object, a value that is no text, a source that is none
    expect(readBridgeMessage({ ...form, destination: 'worker' })).toBeNull()
    expect(readBridgeMessage({ ...form, site: 42 })).toBeNull()
    expect(readBridgeMessage({ ...form, cookies: ['session=lena'] })).toBeNull()
    expect(readBridgeMessage({ ...kept, cookies: [{ line: 1, stored: true, reason: null }] })).toBeNull()
    expect(readBridgeMessage({ ...jar, jar: [{ ...jar.jar[0], sameSite: 'Sometimes' }] })).toBeNull()
    expect(readBridgeMessage({ ...jar, jar: [{ ...jar.jar[0], value: { html: '<b>' } }] })).toBeNull()
    expect(readBridgeMessage({ ...jar, refused: [{ ...jar.refused[0], source: 'page' }] })).toBeNull()
    // capped: 200 cookies, 100 refusals (the last ones), values cut
    const many = readBridgeMessage({ ...jar, jar: Array.from({ length: 500 }, () => ({ ...jar.jar[0], value: 'v'.repeat(5000) })), refused: Array.from({ length: 300 }, (_, i) => ({ ...jar.refused[0], name: `n${i}` })) })
    expect(many).toMatchObject({ type: 'cookies' })
    if (many?.type !== 'cookies') throw new Error('no cookies message')
    expect([many.jar.length, many.jar[0]!.value.length, many.refused.length, many.refused[0]!.name]).toEqual([200, 301, 100, 'n200'])
  })

  it('reads chapter 3\'s storage and the thief\'s replays as plain data, capped, and refuses malformed ones', () => {
    const storage = { type: 'storage', areas: [{ kind: 'local', origin: 'https://cornerbakery.shop', items: [['token', 'eyJ.x.y']], count: 1, size: 12 }], now: 1794908460000 }
    expect(readBridgeMessage(storage)).toEqual(storage)
    const replay = { type: 'replay', request: 'GET https://api.cornerbakery.shop/account', using: 'authorization: Bearer eyJ', status: 200, by: 'https://cheap-flour.example' }
    expect(readBridgeMessage(replay)).toEqual(replay)
    expect(readBridgeMessage({ ...replay, status: null, by: null })).toEqual({ ...replay, status: null, by: null })
    // malformed: a kind that is none, an item that is no pair of text, no clock, a status that is no number
    expect(readBridgeMessage({ ...storage, areas: [{ ...storage.areas[0], kind: 'indexedDB' }] })).toBeNull()
    expect(readBridgeMessage({ ...storage, areas: [{ ...storage.areas[0], items: [['token', 42]] }] })).toBeNull()
    expect(readBridgeMessage({ ...storage, now: 'soon' })).toBeNull()
    expect(readBridgeMessage({ ...replay, status: 'ok' })).toBeNull()
    expect(readBridgeMessage({ ...replay, using: 7 })).toBeNull()
    // capped: 50 areas, 200 items each, keys and values cut at 301 characters
    const many = readBridgeMessage({ ...storage, areas: Array.from({ length: 80 }, () => ({ ...storage.areas[0], items: Array.from({ length: 300 }, () => ['k', 'v'.repeat(5000)]) })) })
    if (many?.type !== 'storage') throw new Error('no storage message')
    expect([many.areas.length, many.areas[0]!.items.length, many.areas[0]!.items[0]![1].length]).toEqual([50, 200, 301])
  })

  it('reads chapter 4\'s caches, the CDN\'s log and a copy the cache answered with as plain data, capped, and refuses malformed ones', () => {
    const row = { url: 'https://api.cornerbakery.shop/menu', vary: '', status: 200, stored: 1794908460000, age: 15, lifetime: 60, fresh: true, etag: 'W/"14e-x"', control: 'public, max-age=60', by: 'Lena', hits: 1 }
    const line = { at: 1794908475000, who: 'Sam', method: 'GET', url: 'https://api.cornerbakery.shop/account', outcome: 'HIT', status: 200, age: 15, note: 'Its copy from 09:41:00, fetched for Lena.' }
    const cache = { type: 'cache', now: 1794908475000, browser: [row], cdn: [{ ...row, lifetime: -1 }], log: [line] }
    expect(readBridgeMessage(cache)).toEqual(cache)
    expect(readBridgeMessage({ ...cache, cdn: null, log: [] })).toEqual({ ...cache, cdn: null, log: [] })
    expect(readBridgeMessage({ ...response, fromCache: true })).toEqual({ ...response, reason: null, cookies: [], fromCache: true })
    // malformed: an outcome that is none, a method that is no word, a freshness that is no boolean, no clock, a flag that is no boolean
    expect(readBridgeMessage({ ...cache, log: [{ ...line, outcome: 'STALE' }] })).toBeNull()
    expect(readBridgeMessage({ ...cache, log: [{ ...line, method: 'GET /x' }] })).toBeNull()
    expect(readBridgeMessage({ ...cache, browser: [{ ...row, fresh: 'yes' }] })).toBeNull()
    expect(readBridgeMessage({ ...cache, now: Number.NaN })).toBeNull()
    expect(readBridgeMessage({ ...response, fromCache: 1 })).toBeNull()
    // capped: 100 copies a cache, the last 200 log lines, texts cut at 301 characters
    const many = readBridgeMessage({ ...cache, browser: Array.from({ length: 150 }, () => ({ ...row, url: 'u'.repeat(5000) })), log: Array.from({ length: 300 }, (_, i) => ({ ...line, at: i })) })
    if (many?.type !== 'cache') throw new Error('no cache message')
    expect([many.browser.length, many.browser[0]!.url.length, many.log.length, many.log[0]!.at]).toEqual([100, 301, 200, 100])
  })

  it('reads chapter 5\'s event loop entries as plain data, capped, and refuses malformed ones', () => {
    const entry = { kind: 'render', at: 48.01, source: '', text: '', target: '', count: 2, clamped: false, painted: ['spinner', 'status: Placing your order…'], started: ['p#spinner.spinner spin'], stack: null }
    const timer = { kind: 'task', at: 21.02, source: 'timeout', text: 'setTimeout(tick, 0)', target: '', count: 0, clamped: true, painted: [], started: [], stack: 'Error\n    at blob:null/1:3:1' }
    const loop = { type: 'loop', from: 3, entries: [entry, timer] }
    expect(readBridgeMessage(loop)).toEqual(loop)
    // malformed: a kind or a source that is none, a time that is no number or negative, painted items that are not text, no flag
    expect(readBridgeMessage({ ...loop, entries: [{ ...entry, kind: 'paint' }] })).toBeNull()
    expect(readBridgeMessage({ ...loop, entries: [{ ...timer, source: 'idle' }] })).toBeNull()
    expect(readBridgeMessage({ ...loop, entries: [{ ...entry, at: -1 }] })).toBeNull()
    expect(readBridgeMessage({ ...loop, entries: [{ ...entry, at: 'now' }] })).toBeNull()
    expect(readBridgeMessage({ ...loop, entries: [{ ...entry, painted: [{ html: '<b>' }] }] })).toBeNull()
    expect(readBridgeMessage({ ...loop, entries: [{ ...timer, clamped: 'yes' }] })).toBeNull()
    expect(readBridgeMessage({ ...loop, from: -1 })).toBeNull()
    // capped: 200 entries a message, 12 painted items a frame, texts cut at 301 characters, stacks at 4000
    const many = readBridgeMessage({ ...loop, entries: Array.from({ length: 300 }, () => ({ ...timer, text: 'x'.repeat(5000), stack: 's'.repeat(9000), painted: Array.from({ length: 20 }, () => 'p') })) })
    if (many?.type !== 'loop') throw new Error('no loop message')
    expect([many.entries.length, many.entries[0]!.text.length, many.entries[0]!.stack!.length, many.entries[0]!.painted.length]).toEqual([200, 301, 4000, 12])
  })

  it('reads chapter 6\'s reader lines and accessibility tree as plain data, capped, and refuses malformed ones', () => {
    const line = { kind: 'focus', text: 'Add Butter croissant, button', key: 'Tab', probe: false }
    const reader = { type: 'reader', from: 2, lines: [line, { kind: 'assertive', text: 'Enter a whole email address', key: '', probe: true }] }
    expect(readBridgeMessage(reader)).toEqual(reader)
    // malformed: a kind that is none, a key the keyboard doesn't have, no flag, text that is not text, a negative start
    expect(readBridgeMessage({ ...reader, lines: [{ ...line, kind: 'shout' }] })).toBeNull()
    expect(readBridgeMessage({ ...reader, lines: [{ ...line, key: 'F5' }] })).toBeNull()
    expect(readBridgeMessage({ ...reader, lines: [{ ...line, probe: 'no' }] })).toBeNull()
    expect(readBridgeMessage({ ...reader, lines: [{ ...line, text: { html: '<b>' } }] })).toBeNull()
    expect(readBridgeMessage({ ...reader, from: -1 })).toBeNull()
    const row = { depth: 2, role: 'button', name: 'Allergens', value: '', states: ['collapsed', 'focused'], description: '', focused: true }
    const tree = { type: 'a11y', rows: [{ ...row, depth: 0, role: 'document', name: 'Corner Bakery · Order', states: [], focused: false }, row], focus: 'Allergens, button, collapsed', truncated: false }
    expect(readBridgeMessage(tree)).toEqual(tree)
    expect(readBridgeMessage({ ...tree, focus: null })).toEqual({ ...tree, focus: null })
    expect(readBridgeMessage({ ...tree, rows: [{ ...row, depth: -1 }] })).toBeNull()
    // a row deeper than the panel shows is kept at the deepest indent, not dropped with the whole tree
    const deep = readBridgeMessage({ ...tree, rows: [{ ...row, depth: 100 }] })
    expect(deep?.type === 'a11y' ? deep.rows[0]!.depth : null).toBe(60)
    expect(readBridgeMessage({ ...tree, rows: [{ ...row, states: [1] }] })).toBeNull()
    expect(readBridgeMessage({ ...tree, rows: [{ ...row, focused: 'yes' }] })).toBeNull()
    expect(readBridgeMessage({ ...tree, focus: 42 })).toBeNull()
    // capped: 20 lines a message, 400 rows (then truncated), 8 states, texts cut at 301 characters
    const lines = readBridgeMessage({ ...reader, lines: Array.from({ length: 50 }, () => ({ ...line, text: 'x'.repeat(5000) })) })
    if (lines?.type !== 'reader') throw new Error('no reader message')
    expect([lines.lines.length, lines.lines[0]!.text.length]).toEqual([20, 301])
    const rows = readBridgeMessage({ ...tree, rows: Array.from({ length: 500 }, () => ({ ...row, name: 'n'.repeat(5000), states: Array.from({ length: 20 }, () => 'expanded') })) })
    if (rows?.type !== 'a11y') throw new Error('no tree message')
    expect([rows.rows.length, rows.rows[0]!.name.length, rows.rows[0]!.states.length, rows.truncated]).toEqual([400, 301, 8, true])
  })

  it('refuses malformed ones: a made-up failure, headers that are not pairs of text, a status that is not one, a method that is not a word', () => {
    const read = (message: object) => readBridgeMessage(message)
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
    const many = readBridgeMessage({ ...request, headers: Array.from({ length: 80 }, (_, index) => [`x-${index}`, 'v']) })
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
  const read = (message: object) => readBridgeMessage(message)
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

describe('reading a recording\'s messages (chapter 5)', () => {
  it('reads a batch of steps and the end of a recording, and drops what is malformed', () => {
    const step = [3, 7, [[7, 2, 3]], -1, [{ t: 'number', v: 4.8 }]]
    expect(readBridgeMessage({ type: 'steps', steps: [step] })).toEqual({
      type: 'steps',
      steps: [{ point: 3, inv: 7, frames: [{ inv: 7, fn: 2, point: 3, async: false }], values: [{ t: 'number', v: 4.8 }] }]
    })
    expect(readBridgeMessage({ type: 'recordEnd', reason: 'steps', count: 2000 })).toEqual({ type: 'recordEnd', reason: 'steps', count: 2000 })
    for (const bad of [{ type: 'steps', steps: [[3]] }, { type: 'steps', steps: 'many' }, { type: 'recordEnd', reason: 'bored', count: 1 }, { type: 'recordEnd', reason: 'stopped', count: -1 }]) {
      expect(readBridgeMessage(bad)).toBeNull()
    }
  })

  it('leaves steps out of the Console and the check run', () => {
    const steps: BridgeMessage = { type: 'steps', steps: [] }
    expect(consoleEntry(steps, mapping)).toBeNull()
    expect(observe([files, steps, { type: 'done' }], 3)).toMatchObject({ finished: true, errors: [], logs: [] })
  })
})

describe('the server\'s log messages (chapter 7)', () => {
  const log = { type: 'serverlog', id: 2, route: 1, answer: 0, status: 500, at: 200, time: 120 }

  it('reads the numbers of a serverlog, and nothing else of it', () => {
    expect(readBridgeMessage(log)).toEqual(log)
    expect(readBridgeMessage({ ...log, route: -1, answer: -1, message: 'forged text' })).toEqual({ ...log, route: -1, answer: -1 })
  })

  it('refuses one whose numbers are not whole numbers in range', () => {
    for (const bad of [{ id: -1 }, { id: 1.5 }, { route: -2 }, { answer: 'x' }, { status: 1000 }, { at: 1e10 }, { time: Number.NaN }, { route: 1e7 }]) {
      expect(readBridgeMessage({ ...log, ...bad }), JSON.stringify(bad)).toBeNull()
    }
  })

  it('is not a Console line, and a check run ignores it', () => {
    expect(consoleEntry(log as BridgeMessage, mapping)).toBeNull()
    expect(observe([log as BridgeMessage, { type: 'done' }], 3)).toMatchObject({ finished: true, errors: [], logs: [] })
  })
})
