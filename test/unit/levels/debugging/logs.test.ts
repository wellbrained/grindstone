import { describe, expect, it } from 'vitest'
import { MAX_LOG_HISTORY, MAX_STACK_LINES, accessLevel, checkLogs, clockText, filterLogs, historyEntries, liveEntries, requestLabel } from '../../../../shared/levels/debugging/logs'
import type { BackendSpec, LogsSpec } from '../../../../shared/levels'

// The server's logs (ADR 0007, chapter 7; docs/features/levels.md "The logs"): what the server logged before you came
// (level data), and for each request of the app you see, the lines its answer scripts and the access line, built on the
// page from the fake backend's `serverlog` message (numbers only) and the request the Network panel already has. Text
// only; a frame of an app file in a stack links its line.

const FILES = { 'index.html': '<!doctype html>\n', 'order.js': 'a\nb\nc\nd\ne\nf\n' }

const BACKEND: BackendSpec = {
  routes: [
    { path: '/api/menu', respond: { status: 200, json: [] } },
    {
      method: 'POST',
      path: '/api/orders',
      respond: [
        { status: 500, json: { error: 'Internal Server Error' }, delay: 120, log: [
          { level: 'warn', message: 'POST /api/orders: no "items" in {body}' },
          { level: 'error', message: 'TypeError: Cannot read properties of undefined (reading \'map\')', stack: ['    at priceOrder (server/orders.js:41:28)', '    at submit (order.js:4:9)'] }
        ] },
        { status: 201, json: { number: 1042 } }
      ]
    }
  ]
}

const LOGS: LogsSpec = {
  now: '09:41:00.000',
  firstRequest: 4127,
  history: [
    { at: '08:02:10.004', level: 'info', route: '', request: null, message: 'deploy b7e41d0 is live' },
    { at: '08:05:31.250', level: 'error', route: 'POST /api/orders', request: 'req-4093', message: 'TypeError: boom', stack: ['    at priceOrder (server/orders.js:41:28)'] }
  ]
}

describe('checkLogs', () => {
  it('takes a level\'s logs as they are written', () => {
    expect(() => checkLogs(LOGS, BACKEND)).not.toThrow()
  })

  it('refuses what a level cannot mean', () => {
    const line = LOGS.history[1]!
    const bad = (logs: Partial<LogsSpec>, backend: BackendSpec = BACKEND) => () => checkLogs({ ...LOGS, ...logs }, backend)
    expect(bad({ now: '9:41' })).toThrow(/HH:MM:SS\.mmm/)
    expect(bad({ firstRequest: 0 })).toThrow(/first request/)
    expect(bad({ history: [{ ...line, at: '10:00:00.000' }] })).toThrow(/after now/)
    expect(bad({ history: [line, { ...line, at: '08:00:00.000' }] })).toThrow(/oldest first/)
    expect(bad({ history: [{ ...line, request: 'req-5000' }] })).toThrow(/req-5000/)
    expect(bad({ history: [{ ...line, request: 'abc' }] })).toThrow(/req-/)
    expect(bad({ history: [{ ...line, route: 'orders' }] })).toThrow(/route/)
    expect(bad({ history: [{ ...line, level: 'fatal' as 'error' }] })).toThrow(/level/)
    expect(bad({ history: [{ ...line, message: '' }] })).toThrow(/message/)
    expect(bad({ history: [{ ...line, stack: Array.from({ length: MAX_STACK_LINES + 1 }, () => 'at x (y.js:1:1)') }] })).toThrow(/stack/)
    expect(bad({ history: Array.from({ length: MAX_LOG_HISTORY + 1 }, () => line) })).toThrow(/at most/)
    expect(bad({}, { routes: [{ path: '/a', respond: { status: 200, log: [{ level: 'loud' as 'warn', message: 'x' }] } }] })).toThrow(/level/)
  })
})

describe('the lines', () => {
  it('reads the history: each line as written, a frame of an app file linked, the server\'s own not', () => {
    const [deploy, failure] = historyEntries(LOGS, FILES)
    expect(deploy).toEqual({ key: 'h0', time: '08:02:10.004', level: 'info', route: '', request: null, requestId: null, message: 'deploy b7e41d0 is live', stack: [], live: false })
    expect(failure).toMatchObject({ level: 'error', route: 'POST /api/orders', request: 'req-4093', requestId: null })
    expect(failure!.stack).toEqual([{ text: 'at priceOrder (server/orders.js:41:28)', source: null }])
  })

  it('reads a load\'s request: its scripted lines (the body filled in), then the access line, on the server\'s clock', () => {
    const lines = liveEntries(
      { id: 1, route: 1, answer: 0, status: 500, at: 120, time: 120 },
      { method: 'POST', url: 'https://cornerbakery.shop/api/orders', body: '{"lines":[],"note":"Ring twice"}' },
      LOGS,
      BACKEND,
      FILES
    )
    expect(lines.map(line => [line.time, line.level, line.route, line.request, line.requestId, line.message])).toEqual([
      ['09:41:00.120', 'warn', 'POST /api/orders', 'req-4127', 1, 'POST /api/orders: no "items" in {"lines":[],"note":"Ring twice"}'],
      ['09:41:00.120', 'error', 'POST /api/orders', 'req-4127', 1, 'TypeError: Cannot read properties of undefined (reading \'map\')'],
      ['09:41:00.120', 'error', 'POST /api/orders', 'req-4127', 1, 'POST /api/orders 500 Internal Server Error · 120 ms']
    ])
    expect(lines[1]!.stack).toEqual([
      { text: 'at priceOrder (server/orders.js:41:28)', source: null },
      { text: 'at submit (order.js:4:9)', source: { path: 'order.js', line: 4 } }
    ])
    expect(new Set(lines.map(line => line.key)).size).toBe(3)
    expect(lines.every(line => line.live)).toBe(true)
  })

  it('cuts a long body, and an unknown path gets only its access line', () => {
    const long = liveEntries({ id: 3, route: 1, answer: 0, status: 500, at: 0, time: 120 }, { method: 'POST', url: 'https://cornerbakery.shop/api/orders', body: 'x'.repeat(5000) }, LOGS, BACKEND, FILES)
    expect(long[0]!.message.length).toBeLessThan(400)
    expect(long[0]!.message.endsWith('…')).toBe(true)
    const unknown = liveEntries({ id: 2, route: -1, answer: -1, status: 404, at: 30, time: 30 }, { method: 'GET', url: 'https://cornerbakery.shop/api/nope?x=1', body: null }, LOGS, BACKEND, FILES)
    expect(unknown.map(line => [line.level, line.request, line.message])).toEqual([['warn', 'req-4128', 'GET /api/nope?x=1 404 Not Found · 30 ms']])
    // indexes that are not the level's (a forged message) script nothing
    expect(liveEntries({ id: 2, route: 7, answer: 9, status: 200, at: 30, time: 30 }, { method: 'GET', url: 'https://cornerbakery.shop/a', body: null }, LOGS, BACKEND, FILES)).toHaveLength(1)
  })

  it('names requests, levels and times like the server does', () => {
    expect(requestLabel(LOGS, 1)).toBe('req-4127')
    expect(requestLabel(LOGS, 12)).toBe('req-4138')
    expect([200, 201, 302, 400, 404, 422, 500, 503].map(accessLevel)).toEqual(['info', 'info', 'info', 'warn', 'warn', 'warn', 'error', 'error'])
    expect(clockText('09:41:00.000', 0)).toBe('09:41:00.000')
    expect(clockText('09:41:59.900', 250)).toBe('09:42:00.150')
    expect(clockText('23:59:59.999', 2)).toBe('00:00:00.001')
  })
})

describe('filterLogs', () => {
  const entries = [
    ...historyEntries(LOGS, FILES),
    ...liveEntries({ id: 1, route: 0, answer: 0, status: 200, at: 80, time: 80 }, { method: 'GET', url: 'https://cornerbakery.shop/api/menu', body: null }, LOGS, BACKEND, FILES)
  ]

  it('keeps a level and worse, and lines with the text anywhere (any case)', () => {
    expect(filterLogs(entries, 'all', '')).toHaveLength(3)
    expect(filterLogs(entries, 'warn', '').map(entry => entry.key)).toEqual(['h1'])
    expect(filterLogs(entries, 'error', '').map(entry => entry.key)).toEqual(['h1'])
    expect(filterLogs(entries, 'all', 'REQ-4093').map(entry => entry.key)).toEqual(['h1'])
    expect(filterLogs(entries, 'all', 'orders.js:41').map(entry => entry.key)).toEqual(['h1'])
    expect(filterLogs(entries, 'all', '  menu ').map(entry => entry.route)).toEqual(['GET /api/menu'])
    expect(filterLogs(entries, 'all', 'nothing like this')).toEqual([])
  })

  it('stays fast on a full panel and a long filter', () => {
    const many = Array.from({ length: 700 }, (_, index) => ({ ...entries[1]!, key: `x${index}`, message: 'y'.repeat(2000) }))
    const started = performance.now()
    filterLogs(many, 'all', 'z'.repeat(500))
    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe('what comes from the frame (review 2026-11-13)', () => {
  it('cuts a long path and query in the route and the access line, like the body', () => {
    const long = `https://cornerbakery.shop/api/${'p'.repeat(5000)}?q=${'x'.repeat(5000)}`
    const [line] = liveEntries({ id: 1, route: -1, answer: -1, status: 404, at: 0, time: 30 }, { method: 'GET', url: long, body: null }, LOGS, BACKEND, FILES)
    expect(line!.route.length).toBeLessThan(320)
    expect(line!.message.length).toBeLessThan(380)
    expect(line!.message).toContain('…')
  })
})
