import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKEND_SOURCE, DEFAULT_DELAY_MS, STATUS_TEXT, backendConfig } from '../../../../shared/levels/debugging/backend'
import type { BackendRuntime } from '../../../../shared/levels/debugging/backend'
import { SHOP_ORIGIN } from '../../../../shared/levels/debugging/sandbox'
import type { BackendSpec } from '../../../../shared/levels'

// The scripted fake backend (ADR 0007, chapter 2): the very source the bridge runs inside the sealed frame, run here on
// Node's own fetch classes (Request, Response, Headers), with fake timers for the delays. What it posts is what the
// Network panel and the Console show.

type Posted = Record<string, unknown> & { type: string }

const create = new Function(`return ${BACKEND_SOURCE}`)() as (config: unknown, hooks: unknown) => BackendRuntime

function start(spec: BackendSpec) {
  const posted: Posted[] = []
  const backend = create(backendConfig(spec, SHOP_ORIGIN), { post: (message: Posted) => posted.push(message), now: () => Date.now() })
  const of = (type: string) => posted.filter(message => message.type === type)
  return { backend, posted, of }
}

/** Runs a request to its end (the delays pass) and says how it settled. */
async function settle<T>(promise: Promise<T>): Promise<{ ok: true, value: T } | { ok: false, error: unknown }> {
  const outcome = promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
  await vi.advanceTimersByTimeAsync(5000)
  return outcome
}

async function answer(promise: Promise<Response>): Promise<Response> {
  const outcome = await settle(promise)
  if (!outcome.ok) throw new Error(`expected an answer, got ${String(outcome.error)}`)
  return outcome.value
}

async function refusal(promise: Promise<Response>): Promise<unknown> {
  const outcome = await settle(promise)
  if (outcome.ok) throw new Error('expected a refusal')
  return outcome.error
}

const MENU = [{ id: 'croissant', name: 'Butter croissant', price: 2.4 }]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('backendConfig', () => {
  it('puts every route on an address, fills the defaults and the status text', () => {
    const config = backendConfig({
      routes: [
        { path: '/api/menu', respond: { status: 200, json: MENU } },
        { method: 'POST', path: 'https://api.cornerbakery.shop/orders', body: '"quantity":3', respond: [{ status: 500, text: 'oops', delay: 200 }, { fail: 'network' }] }
      ]
    }, SHOP_ORIGIN)
    expect(config.origin).toBe('https://cornerbakery.shop')
    expect(config.delay).toBe(DEFAULT_DELAY_MS)
    expect(config.routes[0]).toEqual({
      method: 'GET',
      where: 'https://cornerbakery.shop/api/menu',
      body: null,
      query: null,
      answers: [{ status: 200, statusText: 'OK', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(MENU), delay: DEFAULT_DELAY_MS }]
    })
    expect(config.routes[1]).toMatchObject({ method: 'POST', where: 'https://api.cornerbakery.shop/orders', body: '"quantity":3' })
    expect(config.routes[1]!.answers).toEqual([
      { status: 500, statusText: 'Internal Server Error', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'oops', delay: 200 },
      { fail: 'network', error: 'net::ERR_CONNECTION_REFUSED', delay: DEFAULT_DELAY_MS }
    ])
  })

  it('keeps the level\'s headers (lower case, they win) and gives a 204 no body', () => {
    const config = backendConfig({ routes: [
      { path: '/a', respond: { status: 200, text: 'x', headers: { 'Content-Type': 'text/csv', 'Access-Control-Allow-Origin': '*' } } },
      { path: '/b', respond: { status: 204 } }
    ] }, SHOP_ORIGIN)
    expect(config.routes[0]!.answers[0]).toMatchObject({ headers: { 'content-type': 'text/csv', 'access-control-allow-origin': '*' } })
    expect(config.routes[1]!.answers[0]).toMatchObject({ status: 204, statusText: 'No Content', headers: {}, body: null })
  })

  it('refuses what a level cannot mean: an unknown status, two bodies, a silly delay, a bad pattern, an empty sequence', () => {
    const bad = (respond: unknown, extra: object = {}) => () => backendConfig({ routes: [{ path: '/x', respond: respond as never, ...extra }] }, SHOP_ORIGIN)
    expect(bad({ status: 299 })).toThrow(/status/)
    expect(bad({ status: 200, json: 1, text: '1' })).toThrow(/both/)
    expect(bad({ status: 200, delay: -1 })).toThrow(/delay/)
    expect(bad({ status: 200, delay: 10_000 })).toThrow(/delay/)
    expect(bad([])).toThrow(/answer/)
    expect(bad({ status: 200 }, { body: '(' })).toThrow(/pattern/)
    expect(bad({ status: 200 }, { query: '[' })).toThrow(/query pattern/)
  })

  it('knows the reason phrase of every status a level may use', () => {
    expect(STATUS_TEXT[404]).toBe('Not Found')
    expect(STATUS_TEXT[201]).toBe('Created')
    expect(STATUS_TEXT[503]).toBe('Service Unavailable')
  })
})

describe('the fake backend', () => {
  it('answers a route with a real Response: status, status text, headers, json(), url', async () => {
    const { backend } = start({ routes: [{ path: '/api/menu', respond: { status: 200, json: MENU } }] })
    const response = await answer(backend.fetch('/api/menu'))
    expect(response).toBeInstanceOf(Response)
    expect(response).toMatchObject({ ok: true, status: 200, statusText: 'OK', url: 'https://cornerbakery.shop/api/menu', type: 'basic' })
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toEqual(MENU)
  })

  it('resolves addresses like the page would: relative, absolute, a URL object, a Request; the query is kept but not routed on', async () => {
    const { backend, of } = start({ routes: [{ path: '/api/menu', respond: { status: 200, text: 'menu' } }] })
    for (const input of ['api/menu', '/api/menu?day=monday', 'https://cornerbakery.shop/api/menu', new URL('https://cornerbakery.shop/api/menu'), new Request('https://cornerbakery.shop/api/menu')]) {
      expect(await (await answer(backend.fetch(input))).text()).toBe('menu')
    }
    expect(of('request').map(message => message.url)).toEqual([
      'https://cornerbakery.shop/api/menu',
      'https://cornerbakery.shop/api/menu?day=monday',
      'https://cornerbakery.shop/api/menu',
      'https://cornerbakery.shop/api/menu',
      'https://cornerbakery.shop/api/menu'
    ])
  })

  it('answers an unknown path on the shop with the server\'s HTML 404 page, which json() cannot read', async () => {
    const { backend, of } = start({ routes: [{ path: '/api/menu', respond: { status: 200, json: MENU } }] })
    const response = await answer(backend.fetch('/api/products'))
    expect(response).toMatchObject({ ok: false, status: 404, statusText: 'Not Found' })
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const page = await response.clone().text()
    expect(page).toMatch(/^<!DOCTYPE html>\n/)
    expect(page).toContain('<pre>Cannot GET /api/products</pre>')
    await expect(response.json()).rejects.toBeInstanceOf(SyntaxError)
    // the browser's own line in the Console, pointing at the code that sent it
    expect(of('netlog')).toEqual([{ type: 'netlog', text: 'GET https://cornerbakery.shop/api/products 404 (Not Found)', stack: expect.stringContaining('Error') }])
  })

  it('answers a known path with another method as a 404 too (no such route)', async () => {
    const { backend } = start({ routes: [{ path: '/api/menu', respond: { status: 200, json: MENU } }] })
    const response = await answer(backend.fetch('/api/menu', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Cannot POST /api/menu')
  })

  it('logs 4xx and 5xx answers in the Console like the browser, never 2xx', async () => {
    const { backend, of } = start({ routes: [
      { method: 'POST', path: '/api/orders', respond: [{ status: 500, json: { error: 'down' } }, { status: 201, json: { number: 1042 } }] }
    ] })
    const failed = await answer(backend.fetch('/api/orders', { method: 'POST', body: '{}' }))
    expect(failed).toMatchObject({ ok: false, status: 500, statusText: 'Internal Server Error' })
    expect(await failed.json()).toEqual({ error: 'down' })
    const created = await answer(backend.fetch('/api/orders', { method: 'POST', body: '{}' }))
    expect(created).toMatchObject({ ok: true, status: 201, statusText: 'Created' })
    expect(of('netlog').map(message => message.text)).toEqual(['POST https://cornerbakery.shop/api/orders 500 (Internal Server Error)'])
  })

  it('answers a sequence call by call, and repeats its last answer', async () => {
    const { backend } = start({ routes: [{ method: 'POST', path: '/api/orders', respond: [{ status: 503 }, { status: 201, json: { number: 1042 } }, { status: 201, json: { number: 1043 } }] }] })
    const statuses: number[] = []
    for (let call = 0; call < 5; call++) statuses.push((await answer(backend.fetch('/api/orders', { method: 'POST' }))).status)
    expect(statuses).toEqual([503, 201, 201, 201, 201])
  })

  it('picks the first route whose body pattern matches, else the next one for the address', async () => {
    const { backend } = start({ routes: [
      { method: 'POST', path: '/api/orders', body: '"quantity":"', respond: { status: 400, json: { error: 'quantity must be a number' } } },
      { method: 'POST', path: '/api/orders', body: '"quantity":3\\b', respond: { status: 201, json: { quantity: 3 } } },
      { method: 'POST', path: '/api/orders', respond: { status: 201, json: { quantity: 1 } } }
    ] })
    const send = async (body: object) => (await answer(backend.fetch('/api/orders', { method: 'POST', body: JSON.stringify(body) }))).json()
    expect(await send({ quantity: '3' })).toEqual({ error: 'quantity must be a number' })
    expect(await send({ quantity: 3 })).toEqual({ quantity: 3 })
    expect(await send({ qty: 3 })).toEqual({ quantity: 1 })
  })

  it('picks the first route whose query pattern matches (the query as sent, without "?"), so answers can depend on it', async () => {
    const { backend, of } = start({ routes: [
      { path: '/api/search', query: '^q=cro$', respond: { status: 200, json: ['slow'], delay: 900 } },
      { path: '/api/search', query: '^q=croi', respond: { status: 200, json: ['fast'], delay: 50 } },
      { path: '/api/search', respond: { status: 200, json: [] } }
    ] })
    const read = async (input: string) => (await answer(backend.fetch(input))).json()
    expect(await read('/api/search?q=cro')).toEqual(['slow'])
    expect(await read('/api/search?q=croissant')).toEqual(['fast'])
    expect(await read('/api/search?q=sour')).toEqual([])
    expect(await read('/api/search')).toEqual([])
    // the routes' delays decide which answer comes first: the later request can win
    const order: string[] = []
    void backend.fetch('/api/search?q=cro').then(() => order.push('cro'))
    void backend.fetch('/api/search?q=croissant').then(() => order.push('croissant'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(order).toEqual(['croissant', 'cro'])
    // counted by address: the query does not count
    expect(backend.count('GET /api/search')).toBe(6)
    expect(of('request').at(-1)).toMatchObject({ url: 'https://cornerbakery.shop/api/search?q=croissant' })
  })

  it('reads the query with its body pattern: both must match', async () => {
    const { backend } = start({ routes: [
      { method: 'POST', path: '/api/orders', query: 'dry-run=1', body: '"items":\\[\\]', respond: { status: 400, json: 'empty' } },
      { method: 'POST', path: '/api/orders', respond: { status: 201, json: 'saved' } }
    ] })
    const send = async (input: string, body: string) => (await answer(backend.fetch(input, { method: 'POST', body }))).json()
    expect(await send('/api/orders?dry-run=1', '{"items":[]}')).toBe('empty')
    expect(await send('/api/orders?dry-run=1', '{"items":[1]}')).toBe('saved')
    expect(await send('/api/orders', '{"items":[]}')).toBe('saved')
  })

  it('honours delays: nothing arrives before them, and pending counts what is on its way', async () => {
    const { backend } = start({ routes: [{ path: '/slow', respond: { status: 200, text: 'late', delay: 800 } }, { path: '/fast', respond: { status: 200, text: 'soon' } }] })
    let slow: Response | null = null
    let fast: Response | null = null
    void backend.fetch('/slow').then((response) => {
      slow = response
    })
    void backend.fetch('/fast').then((response) => {
      fast = response
    })
    expect(backend.pending()).toBe(2)
    await vi.advanceTimersByTimeAsync(DEFAULT_DELAY_MS)
    expect(fast).not.toBeNull()
    expect(slow).toBeNull()
    expect(backend.pending()).toBe(1)
    await vi.advanceTimersByTimeAsync(800 - DEFAULT_DELAY_MS - 1)
    expect(slow).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(slow).not.toBeNull()
    expect(backend.pending()).toBe(0)
  })

  it('posts each request when it is sent and its answer when it arrives, for the Network panel', async () => {
    const { backend, posted } = start({ routes: [{ method: 'POST', path: '/api/orders', respond: { status: 201, json: { number: 1042 }, delay: 120 } }] })
    await answer(backend.fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"items":[]}' }))
    expect(posted).toEqual([
      { type: 'request', id: 1, method: 'POST', url: 'https://cornerbakery.shop/api/orders', headers: [['content-type', 'application/json']], body: '{"items":[]}', stack: expect.any(String) },
      { type: 'response', id: 1, status: 201, statusText: 'Created', headers: [['content-type', 'application/json; charset=utf-8']], body: '{"number":1042}', failure: null, time: 120 }
    ])
  })

  it('shows a body the way the browser sends it: a string with text/plain, an object as [object Object], form fields', async () => {
    const { backend, of } = start({ routes: [{ method: 'POST', path: '/x', respond: { status: 204 } }] })
    await answer(backend.fetch('/x', { method: 'POST', body: 'hi' }))
    await answer(backend.fetch('/x', { method: 'POST', body: { a: 1 } as never }))
    await answer(backend.fetch('/x', { method: 'POST', body: new URLSearchParams({ email: 'anna@example.com' }) }))
    const requests = of('request')
    expect(requests.map(message => message.body)).toEqual(['hi', '[object Object]', 'email=anna%40example.com'])
    expect(requests[0]!.headers).toEqual([['content-type', 'text/plain;charset=UTF-8']])
    expect(requests[2]!.headers).toEqual([['content-type', 'application/x-www-form-urlencoded;charset=UTF-8']])
  })

  it('refuses what fetch refuses, with fetch\'s TypeError, before anything is sent', async () => {
    const { backend, posted } = start({ routes: [] })
    const withBody = await refusal(backend.fetch('/x', { body: 'x' }))
    expect(withBody).toBeInstanceOf(TypeError)
    expect((withBody as Error).message).toMatch(/^Failed to execute 'fetch' on 'Window': .*GET\/HEAD/)
    const badUrl = await refusal(backend.fetch('http://'))
    expect((badUrl as Error).message).toBe('Failed to execute \'fetch\' on \'Window\': Failed to parse URL from http://')
    expect(posted).toEqual([])
  })

  it('fails a network failure with "Failed to fetch" and the browser\'s line', async () => {
    const { backend, of } = start({ routes: [{ path: '/api/hours', respond: { fail: 'network' } }] })
    const error = await refusal(backend.fetch('/api/hours'))
    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe('Failed to fetch')
    // created where fetch was called, so its trace points at the app's line
    expect((error as Error).stack).toContain('backend.test.ts')
    expect(of('netlog').map(message => message.text)).toEqual(['GET https://cornerbakery.shop/api/hours net::ERR_CONNECTION_REFUSED'])
    expect(of('response')).toMatchObject([{ id: 1, status: null, failure: 'network', body: null }])
  })

  it('cannot reach a host it does not know', async () => {
    const { backend, of } = start({ routes: [] })
    expect(((await refusal(backend.fetch('https://example.com/'))) as Error).message).toBe('Failed to fetch')
    expect(of('netlog').map(message => message.text)).toEqual(['GET https://example.com/ net::ERR_NAME_NOT_RESOLVED'])
  })

  describe('CORS', () => {
    const SPECIALS = 'https://api.cornerbakery.shop/specials'

    it('refuses another origin\'s answer without Access-Control-Allow-Origin: "Failed to fetch" and the browser\'s CORS lines', async () => {
      const { backend, of } = start({ routes: [{ path: SPECIALS, respond: { status: 200, json: [] } }] })
      const error = await refusal(backend.fetch(SPECIALS))
      expect(error).toBeInstanceOf(TypeError)
      expect((error as Error).message).toBe('Failed to fetch')
      expect(of('netlog')).toEqual([
        { type: 'netlog', stack: '', text: 'Access to fetch at \'https://api.cornerbakery.shop/specials\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource. If an opaque response serves your needs, set the request\'s mode to \'no-cors\' to fetch the resource with CORS disabled.' },
        { type: 'netlog', stack: expect.stringContaining('Error'), text: 'GET https://api.cornerbakery.shop/specials net::ERR_FAILED 200 (OK)' }
      ])
      // the request went out (the server answered), the browser kept the answer from the app
      expect(of('response')).toMatchObject([{ status: 200, failure: 'cors', body: null }])
      expect(backend.count(`GET ${SPECIALS}`)).toBe(1)
    })

    it('lets the answer through when the server allows the shop, or anyone', async () => {
      for (const allowed of ['*', 'https://cornerbakery.shop']) {
        const { backend } = start({ routes: [{ path: SPECIALS, respond: { status: 200, json: ['apricot'], headers: { 'Access-Control-Allow-Origin': allowed } } }] })
        const response = await answer(backend.fetch(SPECIALS))
        expect(response.type).toBe('cors')
        expect(await response.json()).toEqual(['apricot'])
      }
      const { backend, of } = start({ routes: [{ path: SPECIALS, respond: { status: 200, json: [], headers: { 'Access-Control-Allow-Origin': 'https://kitchen.cornerbakery.shop' } } }] })
      await refusal(backend.fetch(SPECIALS))
      expect(of('netlog')[0]!.text).toContain('The \'Access-Control-Allow-Origin\' header has a value \'https://kitchen.cornerbakery.shop\' that is not equal to the supplied origin.')
    })

    it('words a refused preflight (JSON, other methods, own headers) like the browser', async () => {
      const json = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      const noHeader = start({ routes: [{ method: 'POST', path: 'https://api.cornerbakery.shop/newsletter', respond: { status: 201, json: {} } }] })
      await refusal(noHeader.backend.fetch('https://api.cornerbakery.shop/newsletter', json))
      expect(noHeader.of('netlog').map(message => message.text)).toEqual([
        'Access to fetch at \'https://api.cornerbakery.shop/newsletter\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: Response to preflight request doesn\'t pass access control check: No \'Access-Control-Allow-Origin\' header is present on the requested resource. If an opaque response serves your needs, set the request\'s mode to \'no-cors\' to fetch the resource with CORS disabled.',
        'POST https://api.cornerbakery.shop/newsletter net::ERR_FAILED'
      ])
      expect(noHeader.of('response')).toMatchObject([{ status: null, failure: 'cors' }])

      const originOnly = start({ routes: [{ method: 'POST', path: 'https://api.cornerbakery.shop/newsletter', respond: { status: 201, json: {}, headers: { 'Access-Control-Allow-Origin': '*' } } }] })
      await refusal(originOnly.backend.fetch('https://api.cornerbakery.shop/newsletter', json))
      expect(originOnly.of('netlog')[0]!.text).toMatch(/blocked by CORS policy: Request header field content-type is not allowed by Access-Control-Allow-Headers in preflight response\.$/)

      const allowed = start({ routes: [{ method: 'POST', path: 'https://api.cornerbakery.shop/newsletter', respond: { status: 201, json: {}, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } } }] })
      expect((await answer(allowed.backend.fetch('https://api.cornerbakery.shop/newsletter', json))).status).toBe(201)

      const put = start({ routes: [{ method: 'PUT', path: 'https://api.cornerbakery.shop/x', respond: { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } } }] })
      await refusal(put.backend.fetch('https://api.cornerbakery.shop/x', { method: 'PUT' }))
      expect(put.of('netlog')[0]!.text).toMatch(/Method PUT is not allowed by Access-Control-Allow-Methods in preflight response\.$/)
    })

    it('gives mode: no-cors an opaque answer the app cannot read', async () => {
      const { backend } = start({ routes: [{ path: SPECIALS, respond: { status: 200, json: ['apricot'] } }] })
      const response = await answer(backend.fetch(SPECIALS, { mode: 'no-cors' }))
      expect(response).toMatchObject({ type: 'opaque', status: 0, ok: false, statusText: '', url: '' })
      expect(await response.text()).toBe('')
    })

    it('never applies to the shop\'s own address', async () => {
      const { backend } = start({ routes: [{ path: '/api/specials', respond: { status: 200, json: ['apricot'] } }] })
      expect(await (await answer(backend.fetch('/api/specials'))).json()).toEqual(['apricot'])
    })
  })

  it('cancels on an abort signal, with the signal\'s reason', async () => {
    const { backend, of } = start({ routes: [{ path: '/slow', respond: { status: 200, text: 'late', delay: 500 } }] })
    const controller = new AbortController()
    const request = backend.fetch('/slow', { signal: controller.signal })
    const outcome = settle(request)
    controller.abort()
    const result = await outcome
    expect(result.ok).toBe(false)
    expect((result as { error: Error }).error.name).toBe('AbortError')
    expect(of('response')).toMatchObject([{ failure: 'aborted', status: null }])
    expect(backend.pending()).toBe(0)
    const early = await refusal(backend.fetch('/slow', { signal: AbortSignal.abort() }))
    expect((early as Error).name).toBe('AbortError')
  })

  it('tells probes how often an address was called and what was sent there last', async () => {
    const { backend } = start({ routes: [{ method: 'POST', path: '/api/orders', respond: { status: 201, json: {} } }] })
    expect(backend.count('POST /api/orders')).toBe(0)
    expect(backend.sent('POST /api/orders', null)).toBeNull()
    await answer(backend.fetch('/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ id: 'croissant', qty: 3 }] }) }))
    await answer(backend.fetch('/api/orders?again=1', { method: 'POST', body: JSON.stringify({ items: [{ id: 'croissant', quantity: '3', extra: { a: true } }] }) }))
    await answer(backend.fetch('/api/menu'))
    expect(backend.count('POST /api/orders')).toBe(2)
    expect(backend.count('post https://cornerbakery.shop/api/orders')).toBe(2)
    expect(backend.count('GET /api/orders')).toBe(0)
    expect(backend.count('GET /api/menu')).toBe(1)
    expect(backend.sent('POST /api/orders', null)).toBe('{"items":[{"id":"croissant","quantity":"3","extra":{"a":true}}]}')
    expect(backend.sent('POST /api/orders', 'items.0.quantity')).toBe('3')
    expect(backend.sent('POST /api/orders', 'items.0.extra')).toBe('{"a":true}')
    expect(backend.sent('POST /api/orders', 'items.0.extra.a')).toBe('true')
    expect(backend.sent('POST /api/orders', 'items.0.qty')).toBeNull()
    expect(backend.sent('POST /api/orders', 'items.5')).toBeNull()
    expect(backend.sent('GET /api/menu', null)).toBeNull()
  })

  it('reads a number in a sent body as a number, so "3" and 3 differ', async () => {
    const { backend } = start({ routes: [{ method: 'POST', path: '/api/orders', respond: { status: 201 } }] })
    await answer(backend.fetch('/api/orders', { method: 'POST', body: '{"quantity":3}' }))
    expect(backend.sent('POST /api/orders', 'quantity')).toBe(3)
  })
})
