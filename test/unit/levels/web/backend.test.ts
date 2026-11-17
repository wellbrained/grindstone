import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webConfig } from '../../../../shared/levels/web/backend'
import type { WebSpec } from '../../../../shared/levels/web/backend'
import { SHOP_ORIGIN } from '../../../../shared/levels/debugging/sandbox'
import { nodeBackend } from './helpers'

// The web backend (ADR 0009, docs/features/levels.md "The web backend"): the very source the bridge runs in the sealed
// frame, here on Node's fetch classes with a level's server.js run in-process (helpers.ts) and fake timers. It is the
// browser between the page on https://cornerbakery.shop and the API on https://api.cornerbakery.shop: preflights, the
// Origin and the session cookie, the CORS check, Chrome's Console lines, and what the Network and Server panels get.

const API = 'https://api.cornerbakery.shop'
const SPEC: WebSpec = {
  api: API,
  server: 'server.js',
  session: { name: 'session', value: 'lena-7f3a' },
  shop: { routes: [{ path: '/api/hours', respond: { status: 200, json: { open: '7:00' } } }], alsoOn: ['https://www.cornerbakery.shop'] }
}

const SERVER = `const express = require('express')
const app = express()
app.use(express.json())

app.get('/open', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://cornerbakery.shop')
  res.set('X-Request-Id', 'req-1')
  res.json({ cookie: req.get('Cookie') ?? null })
})

app.get('/closed', (req, res) => res.json(['no CORS headers']))

app.get('/star', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.json(['anyone'])
})

app.get('/basket', (req, res) => {
  res.set('Access-Control-Allow-Origin', req.get('Origin'))
  res.set('Access-Control-Allow-Credentials', 'true')
  if (!req.get('Cookie')) return res.status(401).json({ error: 'Not signed in' })
  res.json({ lines: 2 })
})

app.post('/orders', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://cornerbakery.shop')
  res.status(201).json({ number: 1042 })
})

app.options('/lines', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://cornerbakery.shop')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.sendStatus(204)
})
app.post('/lines', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://cornerbakery.shop')
  res.status(201).json({ added: req.body.id })
})
`

function start(source = SERVER, spec = SPEC) {
  return nodeBackend(spec, { 'server.js': source, 'index.html': '' })
}

async function settle<T>(promise: Promise<T>): Promise<{ ok: true, value: T } | { ok: false, error: unknown }> {
  const outcome = promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
  await vi.advanceTimersByTimeAsync(2000)
  return outcome
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('webConfig', () => {
  it('takes server.js as saved, the shop\'s routes on each origin it answers on, and refuses an API that is no origin', () => {
    const config = webConfig(SPEC, { 'server.js': 'x' }, SHOP_ORIGIN)
    expect(config).toMatchObject({ page: 'https://cornerbakery.shop', api: API, source: 'x', path: '/' })
    // chapter 1's session is a cookie the browser kept since this morning, stored through the cookie model
    expect(config.seeds).toEqual([{ url: `${API}/login`, line: 'session=lena-7f3a; Secure; HttpOnly', ago: 29 * 60_000 }])
    expect(config.shop.origins).toEqual(['https://cornerbakery.shop', 'https://www.cornerbakery.shop'])
    expect(config.shop.routes[0]).toMatchObject({ method: 'GET', path: '/api/hours', answers: [{ status: 200, body: '{"open":"7:00"}' }] })
    expect(webConfig(SPEC, {}, SHOP_ORIGIN).source).toBeNull()
    expect(() => webConfig({ ...SPEC, api: `${API}/` }, {}, SHOP_ORIGIN)).toThrow(/not an origin/)
    expect(() => webConfig({ ...SPEC, api: 'https://cornerbakery.shop' }, {}, SHOP_ORIGIN)).toThrow(/another origin/)
  })
})

describe('the browser between the page and the API', () => {
  it('lets the page read an answer that allows its origin, sends the Origin, and shows it only the safelisted headers', async () => {
    const { backend, of, server } = start()
    const outcome = await settle(backend.fetch(`${API}/open`))
    if (!outcome.ok) throw outcome.error
    const response = outcome.value
    expect(response.type).toBe('cors')
    expect([...response.headers.keys()]).toEqual(['content-type'])
    expect(await response.json()).toEqual({ cookie: null })
    expect(backend.read(`GET ${API}/open`)).toBe(1)
    expect(backend.arrived(`GET ${API}/open`)).toBe(1)
    expect(of('request')[0]).toMatchObject({ method: 'GET', url: `${API}/open`, headers: [['origin', 'https://cornerbakery.shop'], ['referer', 'https://cornerbakery.shop/']], preflightFor: null, site: null, destination: 'fetch', cookies: [] })
    expect(of('response')[0]).toMatchObject({ status: 200, failure: null, reason: null })
    expect(server.output.map(line => line.text)).toEqual(['GET /open 200'])
  })

  it('refuses an answer without Access-Control-Allow-Origin as Chrome does: the server answered, the page gets "Failed to fetch"', async () => {
    const { backend, of } = start()
    const outcome = await settle(backend.fetch(`${API}/closed`))
    expect(outcome.ok).toBe(false)
    expect(String((outcome as { error: unknown }).error)).toBe('TypeError: Failed to fetch')
    expect(of('netlog').map(message => message.text)).toEqual([
      `Access to fetch at '${API}/closed' from origin 'https://cornerbakery.shop' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`,
      `GET ${API}/closed net::ERR_FAILED 200 (OK)`
    ])
    // the Network panel shows what the server really sent, and why the page may not read it
    expect(of('response')[0]).toMatchObject({ status: 200, failure: 'cors', body: '["no CORS headers"]', reason: expect.stringMatching(/^No 'Access-Control-Allow-Origin' header/) })
    expect(backend.arrived(`GET ${API}/closed`)).toBe(1)
    expect(backend.read(`GET ${API}/closed`)).toBe(0)
  })

  it('sends a preflight first for a JSON POST; Express answers it without CORS headers, so the POST never leaves', async () => {
    const { backend, of, server } = start()
    const outcome = await settle(backend.fetch(`${API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"items":[]}' }))
    expect(outcome.ok).toBe(false)
    const [main, preflight] = of('request')
    expect(preflight).toMatchObject({ method: 'OPTIONS', preflightFor: main!.id, headers: [['accept', '*/*'], ['access-control-request-method', 'POST'], ['access-control-request-headers', 'content-type'], ['origin', 'https://cornerbakery.shop']] })
    expect(of('response').map(message => [message.id, message.status, message.failure])).toEqual([[preflight!.id, 200, null], [main!.id, null, 'cors']])
    expect(of('netlog').map(message => message.text)).toEqual([
      `Access to fetch at '${API}/orders' from origin 'https://cornerbakery.shop' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`,
      `POST ${API}/orders net::ERR_FAILED`
    ])
    expect(backend.count(`POST ${API}/orders`)).toBe(1)
    expect(backend.arrived(`POST ${API}/orders`)).toBe(0)
    expect(server.output.map(line => line.text)).toEqual(['OPTIONS /orders 200'])
  })

  it('sends the POST once the preflight\'s answer allows its headers', async () => {
    const { backend, server } = start()
    const outcome = await settle(backend.fetch(`${API}/lines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":"rye"}' }))
    if (!outcome.ok) throw outcome.error
    expect(await outcome.value.json()).toEqual({ added: 'rye' })
    expect(server.output.map(line => line.text)).toEqual(['OPTIONS /lines 204', 'POST /lines 201'])
  })

  it('sends the session cookie with credentials from the same site, never with a preflight, and refuses `*` then', async () => {
    const { backend, of } = start()
    const star = await settle(backend.fetch(`${API}/star`, { credentials: 'include' }))
    expect(star.ok).toBe(false)
    expect(of('request')[0]!.headers).toEqual([['origin', 'https://cornerbakery.shop'], ['referer', 'https://cornerbakery.shop/'], ['cookie', 'session=lena-7f3a']])
    expect(of('request')[0]!.cookies).toEqual([{ name: 'session', value: 'lena-7f3a', sent: true, reason: null }])
    expect(of('netlog')[0]!.text).toMatch(/must not be the wildcard '\*' when the request's credentials mode is 'include'\.$/)
    const open = await settle(backend.fetch(`${API}/open`))
    if (!open.ok) throw open.error
    // without credentials (the default is same-origin) no cookie goes to another origin
    expect(await open.value.json()).toEqual({ cookie: null })
    const withHeader = await settle(backend.fetch(`${API}/lines`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
    expect(withHeader.ok).toBe(false)
    const preflight = of('request').find(message => message.method === 'OPTIONS')!
    expect((preflight.headers as string[][]).some(([name]) => name === 'cookie')).toBe(false)
  })

  it('answers a page on another origin as it would be answered: the session goes with a same-site page only', async () => {
    const { backend } = start()
    const asked = (fetchFrom: string, credentials = 'include') => new Promise<string>((resolve) => {
      backend.from({ fetchFrom, request: `GET ${API}/basket`, credentials }, resolve)
      void vi.advanceTimersByTimeAsync(2000)
    })
    // the API reflects any origin with credentials: a page on another subdomain (same site) reads Lena's basket
    expect(await asked('https://promo.cornerbakery.shop')).toBe('read')
    // another site's fetch carries no cookie (SameSite=Lax): the server says 401, which that page may read
    expect(await asked('https://cheap-flour.example')).toBe('refused')
    const strict = start(SERVER.replace('res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))', 'res.set(\'Access-Control-Allow-Origin\', \'https://cornerbakery.shop\')'))
    const blocked = await new Promise<string>((resolve) => {
      strict.backend.from({ fetchFrom: 'https://promo.cornerbakery.shop', request: `GET ${API}/basket`, credentials: 'include' }, resolve)
      void vi.advanceTimersByTimeAsync(2000)
    })
    expect(blocked).toBe('blocked')
    expect(strict.of('request')).toEqual([])
  })

  it('gives no-cors an opaque answer and refuses a method no-cors can\'t send', async () => {
    const { backend } = start()
    const opaque = await settle(backend.fetch(`${API}/closed`, { mode: 'no-cors' }))
    if (!opaque.ok) throw opaque.error
    expect([opaque.value.type, opaque.value.status, await opaque.value.text()]).toEqual(['opaque', 0, ''])
    expect(backend.read(`GET ${API}/closed`)).toBe(0)
    const put = await settle(backend.fetch(`${API}/closed`, { mode: 'no-cors', method: 'PUT' }))
    expect(String((put as { error: unknown }).error)).toMatch(/^TypeError: Failed to execute 'fetch' on 'Window': .*PUT.* is unsupported in no-cors mode\.$/)
  })

  it('answers the shop\'s own origin without a CORS check, its www origin with one, and an unknown host not at all', async () => {
    const { backend, of } = start()
    const own = await settle(backend.fetch('/api/hours'))
    if (!own.ok) throw own.error
    expect([own.value.type, await own.value.json()]).toEqual(['basic', { open: '7:00' }])
    expect((await settle(backend.fetch('https://www.cornerbakery.shop/api/hours'))).ok).toBe(false)
    expect((await settle(backend.fetch('https://cheap-flour.example/x'))).ok).toBe(false)
    expect(of('netlog').map(message => message.text).at(-1)).toBe('GET https://cheap-flour.example/x net::ERR_NAME_NOT_RESOLVED')
    // the Referer to its own origin is the page's whole address (strict-origin-when-cross-origin)
    expect(of('request')[0]!.headers).toEqual([['referer', 'https://cornerbakery.shop/']])
  })

  it('fails the fetch, never the page, when the browser can\'t carry an answer (its Response refuses an exposed header)', async () => {
    // a browser's Response throws on a header value outside Latin-1, Node's doesn't: this one does it as a browser
    // would. The answer comes from a server that skipped the runtime's own check (in-process here).
    const NodeResponse = globalThis.Response
    class Refusing extends NodeResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        if (JSON.stringify(init?.headers ?? []).includes('☕')) throw new TypeError('Failed to construct \'Response\': Invalid value')
        super(body, init)
      }
    }
    globalThis.Response = Refusing as typeof Response
    let made: ReturnType<typeof start>
    try {
      made = start()
    } finally {
      globalThis.Response = NodeResponse
    }
    const serve = made.server.serve
    made.server.serve = (request, done) => serve(request, answer => done('fail' in answer ? answer : { ...answer, headers: [...answer.headers, ['content-language', 'en ☕']] }))
    const outcome = await settle(made.backend.fetch(`${API}/open`))
    expect(outcome.ok).toBe(false)
    expect(String((outcome as { error: unknown }).error)).toBe('TypeError: Failed to fetch')
    expect(made.backend.pending()).toBe(0)
  })

  it('refuses the connection when server.js is gone or crashed at its start', async () => {
    const gone = nodeBackend(SPEC, { 'index.html': '' })
    expect((await settle(gone.backend.fetch(`${API}/open`))).ok).toBe(false)
    expect(gone.of('netlog')[0]!.text).toBe(`GET ${API}/open net::ERR_CONNECTION_REFUSED`)
    const crashed = start('throw new Error("boom")')
    expect((await settle(crashed.backend.fetch(`${API}/open`))).ok).toBe(false)
  })
})
