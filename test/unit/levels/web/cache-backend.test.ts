import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebSpec } from '../../../../shared/levels/web/backend'
import { WEB_CLOCK } from '../../../../shared/levels/web/cookies'
import { nodeBackend } from './helpers'

// The web backend's chapter 4 (ADR 0009, docs/features/levels.md "The web backend" and "The cache model"): Lena's
// browser's cache between the page's fetch and the network (fetch's cache modes and the headers Fetch adds for them, a
// copy revalidated with a 304), the CDN in front of the API (HIT, MISS, REVALIDATED, PASS, Age and x-cache, Vary, an
// unsafe request taking copies away), another customer's browser, the probes, and the Application panel's Cache. The
// very source the bridge runs, on Node with server.js in-process and fake timers.

const API = 'https://api.cornerbakery.shop'
const SHOP = 'https://cornerbakery.shop'
const WWW = 'https://www.cornerbakery.shop'

/** server.js with the menu, a changing price, CORS for the shop (an echo for www too) and the Cache-Control to test. */
const SERVER = `const express = require('express')
const app = express()
app.use(express.urlencoded())
const SHOPS = ['https://cornerbakery.shop', 'https://www.cornerbakery.shop']
app.use((req, res, next) => {
  const origin = req.get('Origin')
  if (SHOPS.includes(origin)) res.set('Access-Control-Allow-Origin', origin)
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Headers', 'Cache-Control, If-None-Match')
    return res.sendStatus(204)
  }
  next()
})
let price = 2.4
app.post('/price', (req, res) => { price = Number(req.body.price); res.json({ price }) })
app.post('/menu', (req, res) => res.json({ ok: true }))
app.get('/menu', (req, res) => {
  res.set('Cache-Control', CONTROL)
  VARY
  res.json([{ id: 'croissant', price }])
})
app.get('/account', (req, res) => {
  res.set('Cache-Control', CONTROL)
  res.json({ name: (req.get('Cookie') ?? '').includes('sam') ? 'Sam' : 'Lena' })
})`

const begin = (control: string, cache: WebSpec['cache'] = {}, vary = '') => nodeBackend(
  { api: API, server: 'server.js', application: true, time: true, cache },
  { 'server.js': SERVER.replace(/CONTROL/g, `'${control}'`).replace('VARY', vary), 'index.html': '' }
)
type Made = ReturnType<typeof begin>

async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(value => ({ value }), (error: unknown) => ({ error }))
  await vi.advanceTimersByTimeAsync(2000)
  const result = await outcome
  if ('error' in result) throw result.error
  return result.value
}
const ask = <T>(start: (then: (value: T) => void) => void) => settle(new Promise<T>(resolve => start(resolve)))
const menu = async (made: Made, init: RequestInit = {}) => {
  const response = await settle(made.backend.fetch(`${API}/menu`, init))
  return { status: response.status, body: await settle(response.text()) }
}
const setPrice = (made: Made, price: string) => ask<string | number | null>(then => made.backend.other({ other: 'Kitchen', request: `POST ${API}/price`, from: null, body: { price } }, then))
/** The Network panel's rows of this load: 'METHOD address status' (cache: the copy answered). */
const rows = (made: Made) => {
  const responses = new Map(made.of('response').map(message => [message.id, message]))
  return made.of('request').map((message) => {
    const answer = responses.get(message.id)!
    return `${message.method as string} ${message.url as string} ${answer.status as number}${answer.fromCache ? ' (disk cache)' : ''}`
  })
}
const access = (made: Made) => made.server.output.filter(line => line.level === 'access').map(line => line.text)
const sentHeaders = (made: Made) => (made.of('request').at(-1)!.headers as [string, string][])
const lastCache = (made: Made) => made.of('cache').at(-1) as unknown as { now: number, browser: Record<string, unknown>[], cdn: Record<string, unknown>[] | null, log: Record<string, unknown>[] }
const cdnLines = (made: Made) => lastCache(made).log.map(line => `${line.who as string} ${line.method as string} ${line.url as string} ${line.outcome as string}`)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Lena\'s browser\'s cache', () => {
  it('answers within max-age from its copy, without a request, then asks with the ETag and keeps the copy on a 304', async () => {
    const made = begin('max-age=60')
    expect(await menu(made)).toEqual({ status: 200, body: '[{"id":"croissant","price":2.4}]' })
    expect(await menu(made)).toEqual({ status: 200, body: '[{"id":"croissant","price":2.4}]' })
    made.backend.later(1)
    // stale: a conditional request; server.js answers 304, the page still gets the copy as a 200
    expect(await menu(made)).toEqual({ status: 200, body: '[{"id":"croissant","price":2.4}]' })
    expect(rows(made)).toEqual([`GET ${API}/menu 200`, `GET ${API}/menu 200 (disk cache)`, `GET ${API}/menu 304`])
    expect(sentHeaders(made)).toContainEqual(['if-none-match', expect.stringMatching(/^W\/"/)])
    expect(access(made)).toEqual(['GET /menu 200', 'GET /menu 304'])
    expect(made.backend.fromCache(`GET ${API}/menu`)).toBe(1)
    expect(made.backend.notModified(`GET ${API}/menu`)).toBe(1)
    expect(made.backend.reached(`GET ${API}/menu`)).toBe(2)
  })

  it('shows a change at once with no-cache, and keeps nothing with no-store', async () => {
    const fresh = begin('no-cache')
    await menu(fresh)
    await setPrice(fresh, '2.6')
    expect((await menu(fresh)).body).toBe('[{"id":"croissant","price":2.6}]')
    expect(access(fresh)).toEqual(['GET /menu 200', 'POST /price 200', 'GET /menu 200'])
    const none = begin('no-store')
    await menu(none)
    await menu(none)
    expect(access(none)).toEqual(['GET /menu 200', 'GET /menu 200'])
    await vi.advanceTimersByTimeAsync(100)
    expect(lastCache(none).browser).toEqual([])
  })

  it('reads fetch\'s cache modes as Fetch says, with the headers it adds', async () => {
    const made = begin('max-age=60')
    await menu(made)
    // no-cache: Cache-Control: max-age=0, and it asks even with a fresh copy (Express: still fresh, a 304)
    await menu(made, { cache: 'no-cache' })
    expect(sentHeaders(made).filter(([name]) => name === 'cache-control' || name === 'pragma')).toEqual([['cache-control', 'max-age=0']])
    expect(rows(made).at(-1)).toBe(`GET ${API}/menu 304`)
    // reload: Pragma and Cache-Control: no-cache, no condition (so Express sends it whole), and it keeps the answer
    await menu(made, { cache: 'reload' })
    expect(sentHeaders(made).filter(([name]) => ['cache-control', 'pragma', 'if-none-match'].includes(name))).toEqual([['pragma', 'no-cache'], ['cache-control', 'no-cache']])
    expect(rows(made).at(-1)).toBe(`GET ${API}/menu 200`)
    expect(await menu(made)).toMatchObject({ status: 200 })
    expect(rows(made).at(-1)).toBe(`GET ${API}/menu 200 (disk cache)`)
    // force-cache: any copy, stale or not
    made.backend.later(10)
    await menu(made, { cache: 'force-cache' })
    expect(rows(made).at(-1)).toBe(`GET ${API}/menu 200 (disk cache)`)
    // no-store: past the cache both ways
    await menu(made, { cache: 'no-store' })
    expect(rows(made).at(-1)).toBe(`GET ${API}/menu 200`)
    // only-if-cached needs same-origin mode: the browser's own TypeError
    await expect(settle(made.backend.fetch(`${API}/menu`, { cache: 'only-if-cached' }))).rejects.toThrow(TypeError)
  })

  it('leaves a request alone that has its own condition (Fetch makes it no-store): the page gets the 304', async () => {
    const made = begin('no-cache')
    await menu(made)
    const tag = (made.of('response')[0]!.headers as [string, string][]).find(([name]) => name === 'etag')![1]
    const own = await settle(made.backend.fetch(`${API}/menu`, { headers: { 'If-None-Match': tag } }))
    expect(own.status).toBe(304)
    // a Cache-Control the page sets itself is read as Chrome reads it: no-cache fetches anew (no condition)
    await settle(made.backend.fetch(`${API}/menu`, { headers: { 'Cache-Control': 'no-cache' } }))
    expect(access(made).at(-1)).toBe('GET /menu 200')
  })

  it('takes the address\'s copy away after an unsafe request\'s answer that is no error (RFC 9111 4.4)', async () => {
    const made = begin('max-age=600')
    await menu(made)
    await menu(made)
    await settle(made.backend.fetch(`${API}/menu`, { method: 'POST' }))
    await menu(made)
    expect(access(made)).toEqual(['GET /menu 200', 'POST /menu 200', 'GET /menu 200'])
  })

  it('starts from the copies the level says it kept, and the panel lists them with their age', async () => {
    const made = begin('no-cache', { seeds: [{ into: 'browser', url: `${API}/menu`, headers: { 'cache-control': 'max-age=86400', 'access-control-allow-origin': SHOP, 'etag': 'W/"old"' }, body: '[{"id":"croissant","price":2}]', minutesAgo: 60 }] })
    expect((await menu(made)).body).toBe('[{"id":"croissant","price":2}]')
    expect(access(made)).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    expect(lastCache(made)).toMatchObject({ now: WEB_CLOCK, cdn: null, browser: [{ url: `${API}/menu`, status: 200, age: 3600, lifetime: 86400, fresh: true, etag: 'W/"old"', control: 'max-age=86400', hits: 1, by: 'Lena' }] })
  })
})

describe('the CDN in front of the API', () => {
  it('keeps a public answer: MISS, then HIT with its Age; a stale copy with an ETag is REVALIDATED; private is a PASS', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    const phone = (name: string) => ask(then => made.backend.other({ other: name, request: `GET ${API}/menu` }, then))
    await menu(made)
    made.backend.later(0.5)
    await phone('Sam')
    made.backend.later(1)
    await phone('Mia')
    expect(cdnLines(made)).toEqual([`Lena GET ${API}/menu MISS`, `Sam GET ${API}/menu HIT`, `Mia GET ${API}/menu REVALIDATED`])
    // the CDN asked with its own condition (nobody else sent one), and served its copy with its Age
    expect(access(made)).toEqual(['GET /menu 200', 'GET /menu 304'])
    expect(made.backend.reached(`GET ${API}/menu`)).toBe(2)
    expect((made.of('response').at(-1)!.headers as [string, string][])).toEqual(expect.arrayContaining([['x-cache', 'MISS']]))
    // Mia's revalidation made the copy new (Age 0); a CDN ignores a request's own Cache-Control, so a reload is a HIT
    // while the copy is fresh, and once it is stale Lena's Cache-Control: no-cache gets past Express's condition: a MISS
    await menu(made, { cache: 'no-store' })
    expect(cdnLines(made).at(-1)).toBe(`Lena GET ${API}/menu HIT`)
    made.backend.later(2)
    await menu(made, { cache: 'no-store' })
    expect(cdnLines(made).at(-1)).toBe(`Lena GET ${API}/menu MISS`)
    expect((made.of('response').at(-2)!.headers as [string, string][])).toEqual(expect.arrayContaining([['age', '0'], ['x-cache', 'HIT']]))
    const passed = begin('private, max-age=60', { cdn: true })
    await menu(passed, { cache: 'no-store' })
    await vi.advanceTimersByTimeAsync(100)
    expect(lastCache(passed).log[0]).toMatchObject({ outcome: 'PASS', note: 'CDN: Not kept: Cache-Control: private is for the customer\'s own browser only.' })
  })

  it('hands another customer the copy: the address decides, not the cookie (unless Vary names it)', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    await settle(made.backend.fetch(`${API}/account`))
    const sam = await ask<string | number | null>(then => made.backend.other({ other: 'Sam', request: `GET ${API}/account`, from: null, cookie: 'session=sam', json: 'name' }, then))
    expect(sam).toBe('Lena')
    const varied = begin('public, max-age=60', { cdn: true }, 'res.vary(\'Cookie\')')
    await ask(then => varied.backend.other({ other: 'Lena', request: `GET ${API}/menu`, cookie: 'session=lena' }, then))
    await ask(then => varied.backend.other({ other: 'Sam', request: `GET ${API}/menu`, cookie: 'session=sam' }, then))
    expect(cdnLines(varied)).toEqual([`Lena GET ${API}/menu MISS`, `Sam GET ${API}/menu MISS`])
  })

  it('keeps one copy per Origin with Vary: Origin; without it a copy made for www is refused on the shop\'s page', async () => {
    const plain = begin('public, max-age=300', { cdn: true })
    expect(await ask(then => plain.backend.other({ other: 'Mia', request: `GET ${API}/menu`, from: WWW }, then))).toBe(200)
    await expect(settle(plain.backend.fetch(`${API}/menu`))).rejects.toThrow('Failed to fetch')
    expect(await ask(then => plain.backend.other({ other: 'Sam', request: `GET ${API}/menu`, from: SHOP }, then))).toBe('blocked')
    const varied = begin('public, max-age=300', { cdn: true }, 'res.vary(\'Origin\')')
    await ask(then => varied.backend.other({ other: 'Mia', request: `GET ${API}/menu`, from: WWW }, then))
    expect((await menu(varied)).status).toBe(200)
    expect(await ask(then => varied.backend.other({ other: 'Sam', request: `GET ${API}/menu`, from: SHOP, like: true }, then))).toBe(200)
    expect(cdnLines(varied)).toEqual([`Mia GET ${API}/menu MISS`, `Lena GET ${API}/menu MISS`, `Sam GET ${API}/menu HIT`])
  })

  it('passes anything but a GET, and a non-error answer to it takes the address\'s copies away (RFC 9111 4.4)', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    await menu(made)
    await setPrice(made, '2.6')
    // POST /price leaves /menu's copy alone; a POST to /menu itself would take it
    expect((await menu(made, { cache: 'no-store' })).body).toBe('[{"id":"croissant","price":2.4}]')
    expect(cdnLines(made).at(-2)).toBe(`Kitchen POST ${API}/price PASS`)
  })

  it('answers a client\'s condition itself when its copy still matches', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    await menu(made, { cache: 'no-store' })
    const tag = (made.of('response')[0]!.headers as [string, string][]).find(([name]) => name === 'etag')![1]
    // the page's own condition (and so its preflight) reaches the CDN, which answers 304 from its copy
    const own = await settle(made.backend.fetch(`${API}/menu`, { headers: { 'If-None-Match': tag } }))
    expect(own.status).toBe(304)
    expect(cdnLines(made).at(-1)).toBe(`Lena GET ${API}/menu HIT`)
    expect(access(made)).toEqual(['GET /menu 200', 'OPTIONS /menu 204'])
  })

  it('logs who asked, what it did and why, with the copy\'s age, for the Application panel', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    await menu(made)
    made.backend.later(0.25)
    await ask(then => made.backend.other({ other: 'Sam', request: `GET ${API}/menu` }, then))
    await vi.advanceTimersByTimeAsync(100)
    const cache = lastCache(made)
    expect(cache.log).toEqual([
      { at: WEB_CLOCK, who: 'Lena', method: 'GET', url: `${API}/menu`, outcome: 'MISS', status: 200, age: null, note: 'Kept for the next request.' },
      { at: WEB_CLOCK + 15_000, who: 'Sam', method: 'GET', url: `${API}/menu`, outcome: 'HIT', status: 200, age: 15, note: 'Its copy from 09:41:00, fetched for Lena.' }
    ])
    expect(cache.cdn).toMatchObject([{ url: `${API}/menu`, age: 15, lifetime: 60, fresh: true, hits: 1, by: 'Lena', control: 'public, max-age=60' }])
  })
})

describe('another customer\'s browser, like the page (since the review)', () => {
  it('replays every different request the page really sent to the address, and says when they differ', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    await settle(made.backend.fetch(`${API}/account`))
    await settle(made.backend.fetch(`${API}/account?v=2`, { cache: 'no-store' }))
    // a decoy refused at its preflight never left the browser: not replayed
    await settle(made.backend.fetch(`${API}/account?d`, { headers: { 'X-Decoy': '1' } }).catch(() => null))
    const value = await ask(then => made.backend.other({ other: 'Sam', request: `GET ${API}/account`, from: null, cookie: 'session=sam', like: true, json: 'name' }, then))
    // both addresses are Lena's copies at the CDN (public); a value that differs between them would read 'Lena | Sam'
    expect(value).toBe('Lena')
    expect(cdnLines(made).filter(line => line.startsWith('Sam'))).toEqual([`Sam GET ${API}/account HIT`, `Sam GET ${API}/account?v=2 HIT`])
  })

  it('preflights a request that needs one, from a page on another origin', async () => {
    const made = begin('public, max-age=60', { cdn: true })
    expect(await ask(then => made.backend.other({ other: 'Mia', request: `GET ${API}/menu`, from: WWW, headers: { 'X-Decoy': '1' } }, then))).toBe('blocked')
    expect(access(made)).toEqual(['OPTIONS /menu 204'])
    expect(await ask(then => made.backend.other({ other: 'Mia', request: `GET ${API}/menu`, from: WWW, headers: { 'Cache-Control': 'no-cache' } }, then))).toBe(200)
  })

  it('sends nothing for a copy from the disk cache: no cookie, no Cookie header shown; only the first counts as whole', async () => {
    const made = nodeBackend({ api: API, server: 'server.js', application: true, time: true, cache: {}, session: { name: 'session', value: 'lena' } }, { 'server.js': SERVER.replace(/CONTROL/g, '\'max-age=60\'').replace('VARY', ''), 'index.html': '' })
    await settle(made.backend.fetch(`${API}/account`, { credentials: 'include' }).catch(() => null))
    await settle(made.backend.fetch(`${API}/account`, { credentials: 'include' }).catch(() => null))
    const [first, second] = made.of('request') as unknown as { headers: [string, string][], cookies: unknown[] }[]
    expect(first!.headers.map(([name]) => name)).toContain('cookie')
    expect(second!.headers.map(([name]) => name)).not.toContain('cookie')
    expect(second!.cookies).toEqual([])
    expect(made.backend.whole(`GET ${API}/account`)).toBe(1)
    expect(made.backend.whole(`GET ${API}/`)).toBe(1)
    expect(made.backend.carried(`GET ${API}/account`, 'session')).toBe(1)
  })
})
