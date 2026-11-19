import { describe, expect, it } from 'vitest'
import { CACHE_LIMITS, CACHE_SOURCE } from '../../../../shared/levels/web/cache'
import type { CacheModel, HttpCache } from '../../../../shared/levels/web/cache'
import { WEB_CLOCK } from '../../../../shared/levels/web/cookies'

// The cache model (ADR 0009 chapter 4, docs/features/levels.md "The cache model"): the very source the web backend runs
// in the sealed frame, run here on Node. A private cache reads an answer as Chrome's network stack does
// (net/http/http_response_headers.cc: GetFreshnessLifetimes, GetCurrentAge, Update), a shared cache (the CDN) as RFC 9111
// says; each rule beside the text it follows.

const model = new Function(`return ${CACHE_SOURCE}`)()() as CacheModel

const URL_MENU = 'https://api.cornerbakery.shop/menu'
const SECOND = 1000
const H = (headers: Record<string, string>): [string, string][] => Object.entries(headers)
const answer = (headers: Record<string, string>, status = 200) => ({ status, headers: H(headers) })
const GET = (headers: Record<string, string> = {}) => ({ method: 'GET', headers: H(headers) })

function cacheAt(shared: boolean, start = WEB_CLOCK) {
  let now = start
  const cache = model.createCache({ shared, clock: () => now })
  const later = (ms: number) => {
    now += ms
  }
  return { cache, later }
}
const keep = (cache: HttpCache, headers: Record<string, string>, request: Record<string, string> = {}, body = '[]', status = 200) => cache.store(URL_MENU, GET(request), { status, headers: H(headers), body }, 'Lena')

describe('Cache-Control (RFC 9111 5.2)', () => {
  it('reads directives in any case, a value quoted or not, the first of a name', () => {
    expect({ ...model.directives('Max-Age=60, no-cache, private="set-cookie", max-age=5') }).toEqual({ 'max-age': '60', 'no-cache': true, 'private': 'set-cookie' })
    // "When there is more than one value present for a given directive … either the first occurrence should be used"
    expect({ ...model.directives('max-age="30" , public') }).toEqual({ 'max-age': '30', 'public': true })
    expect({ ...model.directives('') }).toEqual({})
  })
})

describe('how long an answer is fresh in Lena\'s browser (Chrome\'s GetFreshnessLifetimes)', () => {
  const life = (headers: Record<string, string>, status = 200) => model.lifetime(answer(headers, status), false, WEB_CLOCK)

  it('max-age first, then Expires minus Date (or the time it arrived), then nothing', () => {
    expect(life({ 'cache-control': 'max-age=3600' })).toBe(3600 * SECOND)
    expect(life({ 'cache-control': 'max-age=60', 'expires': 'Wed, 18 Nov 2026 09:41:00 GMT' })).toBe(60 * SECOND)
    expect(life({ expires: 'Tue, 17 Nov 2026 10:41:00 GMT' })).toBe(3600 * SECOND)
    expect(life({ expires: 'Tue, 17 Nov 2026 10:41:00 GMT', date: 'Tue, 17 Nov 2026 10:11:00 GMT' })).toBe(1800 * SECOND)
    expect(life({ expires: 'Mon, 16 Nov 2026 10:41:00 GMT' })).toBe(0)
    // RFC 9111 1.2.2: a delta-seconds that is too big counts as 2147483648
    expect(life({ 'cache-control': 'max-age=99999999999' })).toBe(2147483648 * SECOND)
    // 4.2.1: an invalid value is better taken as stale
    expect(life({ 'cache-control': 'max-age=soon' })).toBe(0)
  })

  it('no-cache, no-store, Pragma: no-cache and Vary: * make it stale at once, whatever max-age says', () => {
    expect(life({ 'cache-control': 'max-age=3600, no-cache' })).toBe(0)
    expect(life({ 'cache-control': 'no-store, max-age=3600' })).toBe(0)
    // "For backwards compat, we treat Pragma: no-cache as a synonym for Cache-Control: no-cache"
    expect(life({ 'cache-control': 'max-age=3600', 'pragma': 'no-cache' })).toBe(0)
    expect(life({ 'cache-control': 'max-age=3600', 'vary': '*' })).toBe(0)
    // a qualified no-cache is no "no-cache" token to Chrome
    expect(life({ 'cache-control': 'max-age=60, no-cache="set-cookie"' })).toBe(60 * SECOND)
  })

  it('guesses 10 % of the time since Last-Modified for a 200, 203 or 206 without must-revalidate; 300, 301, 308 and 410 are fresh for ever', () => {
    const modified = 'Mon, 16 Nov 2026 09:41:00 GMT'
    expect(life({ 'last-modified': modified })).toBe(8640 * SECOND)
    expect(life({ 'last-modified': modified }, 404)).toBe(0)
    expect(life({ 'last-modified': modified, 'cache-control': 'must-revalidate' })).toBe(0)
    expect(life({}, 301)).toBe(Infinity)
    expect(life({})).toBe(0)
  })
})

describe('how long an answer is fresh at the CDN (RFC 9111 4.2.1, a shared cache)', () => {
  const life = (headers: Record<string, string>, status = 200) => model.lifetime(answer(headers, status), true, WEB_CLOCK)

  it('"If the cache is shared and the s-maxage response directive is present, use its value", then max-age, then Expires', () => {
    expect(life({ 'cache-control': 's-maxage=60, max-age=0' })).toBe(60 * SECOND)
    expect(life({ 'cache-control': 'public, max-age=300' })).toBe(300 * SECOND)
    // 5.3: "A cache recipient MUST interpret invalid date formats, especially the value "0", as representing a time in the past"
    expect(life({ expires: '0' })).toBe(0)
  })

  it('no-cache is stale at once (qualified or not); Pragma means nothing to it', () => {
    expect(life({ 'cache-control': 'public, max-age=60, no-cache' })).toBe(0)
    expect(life({ 'cache-control': 'max-age=60, no-cache="set-cookie"' })).toBe(0)
    expect(life({ 'cache-control': 'public, max-age=60', 'pragma': 'no-cache' })).toBe(60 * SECOND)
  })
})

describe('the age of a copy (RFC 9111 4.2.3, as Chrome counts it)', () => {
  it('the Age it came with, or how much older than its Date, plus how long it has been kept', () => {
    expect(model.age(H({}), WEB_CLOCK, WEB_CLOCK + 90 * SECOND)).toBe(90 * SECOND)
    expect(model.age(H({ age: '50' }), WEB_CLOCK, WEB_CLOCK + 10 * SECOND)).toBe(60 * SECOND)
    expect(model.age(H({ date: 'Tue, 17 Nov 2026 09:40:00 GMT' }), WEB_CLOCK, WEB_CLOCK)).toBe(60 * SECOND)
    expect(model.age(H({ age: 'old' }), WEB_CLOCK, WEB_CLOCK)).toBe(0)
  })
})

describe('what a cache may keep (RFC 9111 3, 3.5)', () => {
  it('only the answer to a GET, never no-store; a status without a heuristic only with a lifetime of its own', () => {
    expect(model.refusal({ method: 'POST', headers: [] }, answer({ 'cache-control': 'max-age=60' }), false)).toBe('method')
    expect(model.refusal(GET(), answer({ 'cache-control': 'no-store' }), false)).toBe('no-store')
    expect(model.refusal(GET(), answer({}), false)).toBeNull()
    expect(model.refusal(GET(), answer({}, 302), false)).toBe('no-lifetime')
    expect(model.refusal(GET(), answer({ 'cache-control': 'max-age=60' }, 302), false)).toBeNull()
  })

  it('"A shared cache MUST NOT store a response with private"; an answer to Authorization only with public, s-maxage or must-revalidate', () => {
    expect(model.refusal(GET(), answer({ 'cache-control': 'private, max-age=60' }), false)).toBeNull()
    expect(model.refusal(GET(), answer({ 'cache-control': 'private, max-age=60' }), true)).toBe('private')
    expect(model.refusal(GET({ authorization: 'Bearer x' }), answer({ 'cache-control': 'max-age=60' }), true)).toBe('authorization')
    expect(model.refusal(GET({ authorization: 'Bearer x' }), answer({ 'cache-control': 'public, max-age=60' }), true)).toBeNull()
    expect(model.refusal(GET({ authorization: 'Bearer x' }), answer({ 'cache-control': 's-maxage=60' }), true)).toBeNull()
    expect(model.reason('private', true)).toBe('CDN: Not kept: Cache-Control: private is for the customer\'s own browser only.')
  })
})

describe('validators and conditional requests (RFC 9111 4.3, RFC 9110 13.1)', () => {
  it('revalidates with If-None-Match from the ETag and If-Modified-Since from Last-Modified', () => {
    expect(model.validators(H({ 'etag': 'W/"14e-abc"', 'last-modified': 'Mon, 16 Nov 2026 18:00:00 GMT' }))).toEqual([['if-none-match', 'W/"14e-abc"'], ['if-modified-since', 'Mon, 16 Nov 2026 18:00:00 GMT']])
    expect(model.validators(H({}))).toEqual([])
  })

  it('answers a client\'s condition itself: If-None-Match by weak comparison (* matches), else If-Modified-Since', () => {
    const copy = H({ 'etag': '"v1"', 'last-modified': 'Mon, 16 Nov 2026 18:00:00 GMT' })
    expect(model.notModified(H({ 'if-none-match': 'W/"v1"' }), copy)).toBe(true)
    expect(model.notModified(H({ 'if-none-match': '"v0", "v1"' }), copy)).toBe(true)
    expect(model.notModified(H({ 'if-none-match': '*' }), copy)).toBe(true)
    expect(model.notModified(H({ 'if-none-match': '"v2"', 'if-modified-since': 'Tue, 17 Nov 2026 00:00:00 GMT' }), copy)).toBe(false)
    expect(model.notModified(H({ 'if-modified-since': 'Tue, 17 Nov 2026 00:00:00 GMT' }), copy)).toBe(true)
    expect(model.notModified(H({ 'if-modified-since': 'Mon, 16 Nov 2026 12:00:00 GMT' }), copy)).toBe(false)
  })
})

describe('a cache\'s copies', () => {
  it('a fresh copy is fresh until it is as old as its lifetime, then stale', () => {
    const { cache, later } = cacheAt(false)
    keep(cache, { 'cache-control': 'max-age=60' })
    expect(cache.lookup(URL_MENU, [])).toMatchObject({ fresh: true, age: 0, lifetime: 60 * SECOND, by: 'Lena', hits: 0 })
    later(59 * SECOND)
    expect(cache.lookup(URL_MENU, [])!.fresh).toBe(true)
    later(SECOND)
    expect(cache.lookup(URL_MENU, [])!.fresh).toBe(false)
  })

  it('Vary (RFC 9111 4.1): a copy answers only requests with the same values of the named headers; * never', () => {
    const { cache } = cacheAt(true)
    keep(cache, { 'cache-control': 'public, max-age=60', 'vary': 'Origin' }, { origin: 'https://www.cornerbakery.shop' })
    expect(cache.lookup(URL_MENU, H({ origin: 'https://cornerbakery.shop' }))).toBeNull()
    expect(cache.lookup(URL_MENU, H({ origin: 'https://www.cornerbakery.shop' }))).not.toBeNull()
    // the CDN keeps one copy for each set of values
    keep(cache, { 'cache-control': 'public, max-age=60', 'vary': 'Origin' }, { origin: 'https://cornerbakery.shop' })
    expect(cache.list().map(copy => copy.varyValues)).toEqual([['https://www.cornerbakery.shop'], ['https://cornerbakery.shop']])
    // a missing header is a value too
    expect(cache.lookup(URL_MENU, [])).toBeNull()
    const { cache: other } = cacheAt(true)
    keep(other, { 'cache-control': 'public, max-age=60', 'vary': '*' })
    expect(other.lookup(URL_MENU, [])).toBeNull()
  })

  it('Lena\'s browser keeps one copy an address (a new answer replaces it), and no Set-Cookie with it; the CDN keeps it', () => {
    const browser = cacheAt(false).cache
    keep(browser, { 'cache-control': 'max-age=60', 'vary': 'Origin', 'set-cookie': 'a=1' }, { origin: 'https://www.cornerbakery.shop' })
    keep(browser, { 'cache-control': 'max-age=60', 'vary': 'Origin' }, { origin: 'https://cornerbakery.shop' })
    expect(browser.list()).toHaveLength(1)
    expect(browser.list()[0]!.headers.map(([name]) => name)).toEqual(['cache-control', 'vary'])
    const cdn = cacheAt(true).cache
    keep(cdn, { 'cache-control': 'public, max-age=60', 'set-cookie': 'a=1' })
    expect(cdn.list()[0]!.headers).toContainEqual(['set-cookie', 'a=1'])
  })

  it('a 304 freshens the copy: its headers replace the copy\'s (Chrome keeps its own ETag and content headers), its age starts again', () => {
    const { cache, later } = cacheAt(false)
    keep(cache, { 'cache-control': 'max-age=60', 'etag': '"v1"', 'content-type': 'application/json', 'access-control-allow-origin': 'https://www.cornerbakery.shop' })
    later(120 * SECOND)
    const stale = cache.lookup(URL_MENU, [])!
    expect(stale.fresh).toBe(false)
    const freshened = cache.freshen(stale.id, H({ 'cache-control': 'max-age=30', 'etag': '"v2"', 'content-type': 'text/plain', 'access-control-allow-origin': 'https://cornerbakery.shop', 'content-length': '0' }))!
    expect(freshened).toMatchObject({ fresh: true, age: 0, lifetime: 30 * SECOND })
    expect(Object.fromEntries(freshened.headers)).toEqual({ 'etag': '"v1"', 'content-type': 'application/json', 'cache-control': 'max-age=30', 'access-control-allow-origin': 'https://cornerbakery.shop' })
    // RFC 9111 3.2 for the CDN: everything but Content-Length
    const shared = cacheAt(true).cache
    keep(shared, { 'cache-control': 'public, max-age=60', 'etag': '"v1"' })
    const updated = shared.freshen(shared.list()[0]!.id, H({ 'etag': '"v2"', 'content-length': '0' }))!
    expect(Object.fromEntries(updated.headers)).toEqual({ 'cache-control': 'public, max-age=60', 'etag': '"v2"' })
  })

  it('an unsafe request takes the address\'s copies away (RFC 9111 4.4), and a cache keeps at most so many copies', () => {
    const { cache } = cacheAt(true)
    keep(cache, { 'cache-control': 'public, max-age=60', 'vary': 'Origin' }, { origin: 'https://a.example' })
    keep(cache, { 'cache-control': 'public, max-age=60', 'vary': 'Origin' }, { origin: 'https://b.example' })
    expect(cache.invalidate(URL_MENU)).toBe(2)
    expect(cache.list()).toEqual([])
    for (let i = 0; i < CACHE_LIMITS.entries + 5; i++) cache.store(`${URL_MENU}?page=${i}`, GET(), { status: 200, headers: H({ 'cache-control': 'max-age=60' }), body: '' }, 'Lena')
    expect(cache.list()).toHaveLength(CACHE_LIMITS.entries)
    expect(cache.list()[0]!.url).toBe(`${URL_MENU}?page=5`)
  })

  it('hands out copies, never its own, and no setter or getter on the prototypes reaches it', () => {
    const { cache } = cacheAt(true)
    keep(cache, { 'cache-control': 'public, max-age=60' })
    const copy = cache.lookup(URL_MENU, [])!
    copy.headers[0]![1] = 'no-store'
    copy.headers.push(['x', 'y'])
    expect(cache.lookup(URL_MENU, [])!.headers).toEqual([['cache-control', 'public, max-age=60']])
    let seen = 0
    const count = () => {
      seen += 1
    }
    const KEYS = ['url', 'headers', 'vary', 'stored', 'hits', 'max-age', 'public']
    const indices = Array.from({ length: 10 }, (_, i) => String(i))
    for (const i of indices) Object.defineProperty(Array.prototype, i, { configurable: true, set: count })
    for (const key of KEYS) Object.defineProperty(Object.prototype, key, { configurable: true, set: count, get: () => undefined })
    let found: boolean | undefined
    let directives: [string, unknown][] | undefined
    try {
      const fresh = model.createCache({ shared: true, clock: () => WEB_CLOCK })
      fresh.store(URL_MENU, GET(), { status: 200, headers: H({ 'cache-control': 'public, max-age=60' }), body: 'x' }, 'Lena')
      found = Object.getOwnPropertyDescriptor(fresh.lookup(URL_MENU, [])!, 'fresh')!.value as boolean
      const read = model.directives('public, max-age=60')
      directives = Object.keys(read).map(key => [key, Object.getOwnPropertyDescriptor(read, key)!.value])
    } finally {
      for (const i of indices) Reflect.deleteProperty(Array.prototype, i)
      for (const key of KEYS) Reflect.deleteProperty(Object.prototype, key)
    }
    expect(seen).toBe(0)
    expect(found).toBe(true)
    expect(directives).toEqual([['public', true], ['max-age', '60']])
  })
})
