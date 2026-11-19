import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SERVER_LIMITS, serverPrelude } from '../../../../shared/levels/web/server'
import { STATUS_TEXT } from '../../../../shared/levels/debugging/backend'
import { WEB_CLOCK } from '../../../../shared/levels/web/cookies'
import { nodeServer } from './helpers'

// The server.js runtime (ADR 0009, docs/features/levels.md "The server"): the very source the worker in the sealed
// frame runs, here on Node. An Express subset: routes by method and path, middleware, express.json(), Express 5's own
// OPTIONS answer and 404 page, a thrown error as a 500; the answers as data, headers capped and checked.

const API = 'https://api.cornerbakery.shop'
const get = (path: string, headers: [string, string][] = []) => ({ method: 'GET', url: `${API}${path}`, headers, body: null })

const MENU_SERVER = `const express = require('express')
const app = express()
app.use(express.json())

const MENU = [{ id: 'croissant', name: 'Butter croissant', price: 2.4 }]

app.get('/menu', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://cornerbakery.shop')
  res.json(MENU)
})

app.post('/orders', (req, res) => {
  res.status(201).json({ number: 1042, items: req.body.items.length })
})

app.delete('/basket/lines/:id', (req, res) => {
  console.log('removing', req.params.id)
  res.sendStatus(204)
})
`

describe('the server.js runtime', () => {
  it('answers a route with its status, headers and JSON body, and logs an access line', async () => {
    const server = nodeServer(MENU_SERVER)
    const answer = await server.handle(get('/menu'))
    expect(answer).toEqual({
      status: 200,
      headers: [['access-control-allow-origin', 'https://cornerbakery.shop'], ['content-type', 'application/json; charset=utf-8']],
      body: '[{"id":"croissant","name":"Butter croissant","price":2.4}]'
    })
    expect(server.output).toEqual([{ level: 'access', text: 'GET /menu 200', line: null }])
  })

  it('reads a JSON body with express.json(), :params, and the console of server.js', async () => {
    const server = nodeServer(MENU_SERVER)
    const order = await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['content-type', 'application/json']], body: '{"items":[{"id":"croissant"}]}' })
    expect(order.status).toBe(201)
    expect(order.body).toBe('{"number":1042,"items":1}')
    const removed = await server.handle({ method: 'DELETE', url: `${API}/basket/lines/2`, headers: [], body: null })
    // Express 5's res.send takes Content-Type off a 204
    expect(removed).toEqual({ status: 204, headers: [], body: null })
    expect(server.output.map(line => line.text)).toEqual(['POST /orders 201', 'removing 2', 'DELETE /basket/lines/2 204'])
  })

  it('answers OPTIONS itself, as Express does, with the methods it has for the path and no CORS headers', async () => {
    const server = nodeServer(MENU_SERVER)
    expect(await server.handle({ method: 'OPTIONS', url: `${API}/orders`, headers: [['origin', 'https://cornerbakery.shop']], body: null })).toEqual({
      status: 200,
      headers: [['allow', 'POST'], ['content-type', 'text/plain; charset=utf-8'], ['x-content-type-options', 'nosniff']],
      body: 'POST'
    })
    // Express 5's router: sorted, joined with ', '
    expect((await server.handle({ method: 'OPTIONS', url: `${API}/menu`, headers: [], body: null })).body).toBe('GET, HEAD')
  })

  it('answers an unknown path with Express\'s 404 page, and a body it can\'t read with a 400', async () => {
    const server = nodeServer(MENU_SERVER)
    const missing = await server.handle(get('/api/menu'))
    expect(missing.status).toBe(404)
    expect(missing.body).toContain('<pre>Cannot GET /api/menu</pre>')
    const broken = await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['content-type', 'application/json']], body: '{items' })
    expect(broken.status).toBe(400)
  })

  it('turns a thrown error (also a rejected async route) into a 500 with its message, and logs it', async () => {
    const server = nodeServer(MENU_SERVER)
    // a text body is not parsed (Express 5: req.body stays undefined), so reading .items throws
    const answer = await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['content-type', 'text/plain;charset=UTF-8']], body: '{"items":[]}' })
    expect(answer.status).toBe(500)
    expect(answer.body).toContain('TypeError: Cannot read properties of undefined (reading &#39;items&#39;)'.replace(/&#39;/g, '\''))
    expect(server.output.some(line => line.level === 'error' && line.text.startsWith('TypeError: Cannot read properties of undefined'))).toBe(true)
    const async = nodeServer(`const app = require('express')()\napp.get('/x', async () => { throw new RangeError('nope') })`)
    expect((await async.handle(get('/x'))).status).toBe(500)
    expect(async.output.map(line => line.text)).toEqual(['RangeError: nope', 'GET /x 500'])
  })

  it('runs middleware in order, next() on, and lets a middleware answer OPTIONS for every path', async () => {
    const server = nodeServer(`const app = require('express')()
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', 'https://cornerbakery.shop')
  res.vary('Origin')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE')
    return res.sendStatus(204)
  }
  next()
})
app.get('/basket', (req, res) => res.json({ cookie: req.get('Cookie') ?? null, origin: req.headers.origin }))`)
    const preflight = await server.handle({ method: 'OPTIONS', url: `${API}/basket`, headers: [], body: null })
    expect(preflight.status).toBe(204)
    expect(preflight.headers).toEqual([['access-control-allow-origin', 'https://cornerbakery.shop'], ['vary', 'Origin'], ['access-control-allow-methods', 'GET, POST, DELETE']])
    const basket = await server.handle(get('/basket', [['origin', 'https://cornerbakery.shop'], ['cookie', 'session=lena']]))
    expect(basket.body).toBe('{"cookie":"session=lena","origin":"https://cornerbakery.shop"}')
  })

  it('refuses headers no server could send: a bad name, a line break in a value, too many', async () => {
    const server = nodeServer(`const app = require('express')()
app.get('/name', (req, res) => res.set('Bad Name', 'x').end())
app.get('/value', (req, res) => res.set('X-Note', 'a\\r\\nSet-Cookie: x=1').end())
app.get('/many', (req, res) => { for (let i = 0; i < 100; i++) res.append('X-' + i, 'y'); res.end() })
app.get('/twice', (req, res) => { res.json(1); res.json(2) })`)
    for (const path of ['/name', '/value', '/many']) expect((await server.handle(get(path))).status, path).toBe(500)
    expect(server.output.filter(line => line.level === 'error').map(line => line.text)).toEqual([
      'TypeError: Header name must be a valid HTTP token ["Bad Name"]',
      'TypeError: Invalid character in header content ["X-Note"]',
      `RangeError: Too many headers for this trainer (${SERVER_LIMITS.maxHeaders})`
    ])
    expect((await server.handle(get('/twice'))).body).toBe('1')
  })

  it('refuses a header value outside Latin-1 as Node does (ERR_INVALID_CHAR), also through res.type', async () => {
    const server = nodeServer(`const app = require('express')()
app.get('/note', (req, res) => { res.set('X-Note', 'Fresh today ☕'); res.json([]) })
app.get('/type', (req, res) => { res.type('application/json; note=☕'); res.json([]) })
app.get('/latin', (req, res) => { res.set('X-Note', 'Café crème'); res.end() })`)
    expect((await server.handle(get('/note'))).status).toBe(500)
    expect((await server.handle(get('/type'))).status).toBe(500)
    expect((await server.handle(get('/latin'))).headers).toEqual([['x-note', 'Café crème']])
    expect(server.output.filter(line => line.level === 'error').map(line => line.text)).toEqual([
      'TypeError: Invalid character in header content ["X-Note"]',
      'TypeError: Invalid character in header content ["Content-Type"]'
    ])
  })

  it('refuses a status no answer can carry where it is set, also as res.statusCode = 99 (Node: "Invalid status code")', async () => {
    const server = nodeServer(`const app = require('express')()
app.get('/low', (req, res) => { res.statusCode = 99; res.end() })
app.get('/info', (req, res) => { res.status(103).end() })`)
    expect((await server.handle(get('/low'))).status).toBe(500)
    expect((await server.handle(get('/info'))).status).toBe(500)
    expect(server.output.filter(line => line.level === 'error').map(line => line.text)).toEqual([
      // 99 is no status in Node either; 103 is one Node sends, but no answer here can carry it
      'RangeError: Invalid status code: 99',
      'RangeError: Invalid status code: 103 (this trainer answers with 200 to 599)'
    ])
  })

  it('says that express.json() takes no options here, and still reads application/json only; the raw body is not on req', async () => {
    const server = nodeServer(`const app = require('express')()
app.use(express_json_with_type)
app.post('/orders', (req, res) => res.json({ body: req.body ?? null, raw: 'rawBody' in req }))`.replace('express_json_with_type', 'require(\'express\').json({ type: \'*/*\' })'))
    expect(server.output.map(line => [line.level, line.text])).toEqual([['warn', 'express.json(): this trainer\'s express.json() takes no options; it reads application/json bodies only.']])
    const text = await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['content-type', 'text/plain;charset=UTF-8']], body: '{"items":[]}' })
    expect(text.body).toBe('{"body":null,"raw":false}')
  })

  it('names a header set twice once and two values of one header as two lines (the browser joins them with ", ")', async () => {
    const server = nodeServer(`const app = require('express')()
app.get('/one', (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('access-control-allow-origin', 'https://cornerbakery.shop'); res.end() })
app.get('/two', (req, res) => { res.set('Access-Control-Allow-Origin', ['https://cornerbakery.shop', 'https://promo.cornerbakery.shop']); res.end() })`)
    expect((await server.handle(get('/one'))).headers).toEqual([['access-control-allow-origin', 'https://cornerbakery.shop']])
    expect((await server.handle(get('/two'))).headers).toEqual([['access-control-allow-origin', 'https://cornerbakery.shop'], ['access-control-allow-origin', 'https://promo.cornerbakery.shop']])
  })

  it('has no app at all when server.js makes none: every path is a 404, and an unknown module stops it at the start', async () => {
    expect((await nodeServer('// nothing yet').handle(get('/menu'))).status).toBe(404)
    expect(nodeServer('const cors = require(\'cors\')').crashed).toBe('Error: Cannot find module \'cors\'')
  })

  it('puts the worker\'s prelude on one line, so server.js starts on line 2 (its line N is the worker\'s N + 1)', () => {
    const prelude = serverPrelude(STATUS_TEXT)
    expect(prelude).not.toContain('\n')
    // it travels in the frame's config, whose "<" are escaped; nothing in it closes a <script> either
    expect(prelude).not.toMatch(/<\/script/i)
  })
})

describe('cookies, forms and redirects in the server.js runtime (chapter 2)', () => {
  it('res.cookie writes Set-Cookie as Express 5 does: Path=/ by default, Max-Age in seconds with Expires on the scripted clock', async () => {
    const server = nodeServer(`const app = require('express')()
app.post('/login', (req, res) => {
  res.cookie('session', 'lena-7f3a', { httpOnly: true, secure: true, sameSite: 'lax' })
  res.cookie('theme', 'dark night', { maxAge: 60 * 60 * 1000, domain: 'cornerbakery.shop' })
  res.cookie('strict', '1', { sameSite: true, path: '/account', expires: new Date(Date.UTC(2026, 11, 24)) })
  res.cookie('none', '1', { sameSite: 'none' })
  res.json({ ok: true })
})`)
    const answer = await server.handle({ method: 'POST', url: `${API}/login`, headers: [], body: null })
    expect(answer.headers.filter(([name]) => name === 'set-cookie').map(([, value]) => value)).toEqual([
      'session=lena-7f3a; Path=/; HttpOnly; Secure; SameSite=Lax',
      'theme=dark%20night; Max-Age=3600; Domain=cornerbakery.shop; Path=/; Expires=Tue, 17 Nov 2026 10:41:00 GMT',
      'strict=1; Path=/account; Expires=Thu, 24 Dec 2026 00:00:00 GMT; SameSite=Strict',
      'none=1; Path=/; SameSite=None'
    ])
  })

  it('res.clearCookie expires the cookie in 1970 on its path; res.cookie refuses a sameSite it does not know', async () => {
    const server = nodeServer(`const app = require('express')()
app.post('/logout', (req, res) => {
  res.clearCookie('session', { httpOnly: true })
  res.end()
})
app.get('/odd', (req, res) => {
  res.cookie('a', '1', { sameSite: 'sometimes' })
  res.end()
})`)
    expect((await server.handle({ method: 'POST', url: `${API}/logout`, headers: [], body: null })).headers).toEqual([['set-cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly']])
    expect((await server.handle(get('/odd'))).status).toBe(500)
    expect(server.output.find(line => line.level === 'error')!.text).toBe('TypeError: option sameSite is invalid')
  })

  it('express.urlencoded() reads a form\'s body into req.body; other bodies stay unread', async () => {
    const server = nodeServer(`const express = require('express')
const app = express()
app.use(express.urlencoded({ extended: false }))
app.post('/orders', (req, res) => res.json(req.body ?? null))`)
    const form = await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['content-type', 'application/x-www-form-urlencoded']], body: 'item=sourdough&quantity=40&note=to+go%21' })
    expect(form.body).toBe('{"item":"sourdough","quantity":"40","note":"to go!"}')
    const json = await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['content-type', 'application/json']], body: '{"item":"rye"}' })
    expect(json.body).toBe('null')
  })

  it('res.redirect answers 302 (or the status given) with a Location', async () => {
    const server = nodeServer(`const app = require('express')()
app.get('/old', (req, res) => res.redirect('https://cornerbakery.shop/order'))
app.post('/orders', (req, res) => res.redirect(303, '/orders/1042'))`)
    const found = await server.handle(get('/old'))
    expect([found.status, found.headers[0]]).toEqual([302, ['location', 'https://cornerbakery.shop/order']])
    expect((await server.handle({ method: 'POST', url: `${API}/orders`, headers: [], body: null })).status).toBe(303)
  })
})

describe('chapter 3: tokens, cookies read for you, ids and the scripted clock', () => {
  const MINUTE = 60_000
  const TOKEN_SERVER = `const express = require('express')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { randomUUID } = require('crypto')
const app = express()
app.use(cookieParser())
const SECRET = 'oven-mitt-4417'
app.post('/login', (req, res) => res.json({ token: jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '15m' }), id: randomUUID() }))
app.get('/account', (req, res) => {
  try {
    res.json({ who: jwt.verify(req.cookies.session, SECRET).sub, at: new Date().toISOString(), now: Date.now() })
  } catch (error) {
    res.status(401).json({ error: error.name + ': ' + error.message })
  }
})`
  const at = (minutes: number) => WEB_CLOCK + minutes * MINUTE

  it('require(\'jsonwebtoken\') signs on the clock of the request, and verify refuses the token once the clock passes exp', async () => {
    const server = nodeServer(TOKEN_SERVER, true)
    const login = JSON.parse((await server.handle({ method: 'POST', url: `${API}/login`, headers: [], body: null, now: at(0) })).body!) as { token: string }
    const ask = (minutes: number) => server.handle({ ...get('/account', [['cookie', `theme=dark; session=${login.token}`]]), now: at(minutes) })
    expect(JSON.parse((await ask(14)).body!)).toEqual({ who: 'lena', at: '2026-11-17T09:55:00.000Z', now: at(14) })
    const late = await ask(15)
    expect([late.status, late.body]).toEqual([401, '{"error":"TokenExpiredError: jwt expired"}'])
  })

  it('cookie-parser reads req.cookies (URI-decoded, the first of a name); crypto.randomUUID gives the same ids on every run', async () => {
    const first = nodeServer(TOKEN_SERVER, true)
    const second = nodeServer(TOKEN_SERVER, true)
    const idOf = async (server: ReturnType<typeof nodeServer>) => (JSON.parse((await server.handle({ method: 'POST', url: `${API}/login`, headers: [], body: null })).body!) as { id: string }).id
    const ids = [await idOf(first), await idOf(first)]
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(ids[1]).not.toBe(ids[0])
    expect(await idOf(second)).toBe(ids[0])
    const echo = nodeServer(`const app = require('express')()
app.use(require('cookie-parser')())
app.get('/c', (req, res) => res.json(req.cookies))`)
    expect((await echo.handle(get('/c', [['cookie', 'a=1; b=two%20words; a=2; c="q"']]))).body).toBe('{"a":"1","b":"two words","c":"q"}')
  })

  it('without a moving clock (chapters 1 and 2) server.js keeps the real Date; another module is still not found', async () => {
    const server = nodeServer(`const app = require('express')()
app.get('/now', (req, res) => res.json({ scripted: Date.now() === ${WEB_CLOCK} }))`)
    expect((await server.handle(get('/now'))).body).toBe('{"scripted":false}')
    expect(nodeServer('require(\'passport\')').crashed).toBe('Error: Cannot find module \'passport\'')
  })
})

// Chapter 4 (a level with a cache): Express 5's res.send gives a body an ETag (the etag package: the body's length in
// hex and 27 characters of its SHA-1 in base64, weak by default) and answers a conditional GET whose condition still
// holds with 304 (req.fresh, the fresh package); res.end, Express's 404 page and its errors carry none.
describe('Express\'s ETag and 304 (chapter 4)', () => {
  const etagOf = (body: string, weak = true) => `${weak ? 'W/' : ''}"${Buffer.byteLength(body).toString(16)}-${createHash('sha1').update(body, 'utf8').digest('base64').substring(0, 27)}"`
  const SERVER = `const app = require('express')()
app.get('/menu', (req, res) => res.json([{ name: 'Butter croissant', price: 2.4 }]))
app.get('/empty', (req, res) => res.send(''))
app.get('/fixed', (req, res) => { res.set('ETag', '"v1"'); res.json({ fixed: true }) })
app.get('/end', (req, res) => res.end('plain'))
app.get('/modified', (req, res) => { res.set('Last-Modified', 'Mon, 16 Nov 2026 18:00:00 GMT'); res.json([]) })
app.get('/missing', (req, res) => res.status(404).json({ error: 'gone' }))
app.post('/orders', (req, res) => res.status(201).json({ number: 1042 }))
`
  const MENU_BODY = '[{"name":"Butter croissant","price":2.4}]'

  it('gives what res.send sends Express\'s weak ETag, the empty body too', async () => {
    const server = nodeServer(SERVER, false, true)
    const menu = await server.handle(get('/menu'))
    expect(menu.headers).toEqual([['content-type', 'application/json; charset=utf-8'], ['etag', etagOf(MENU_BODY)]])
    expect((await server.handle(get('/empty'))).headers).toContainEqual(['etag', 'W/"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"'])
    // an ETag the route set itself is kept; res.end and Express's own 404 page get none
    expect((await server.handle(get('/fixed'))).headers).toContainEqual(['etag', '"v1"'])
    expect((await server.handle(get('/end'))).headers.map(([name]) => name)).not.toContain('etag')
    expect((await server.handle(get('/nowhere'))).headers.map(([name]) => name)).not.toContain('etag')
    // the 4.5 and practice seeds' ETags are the runtime's own
    const { YESTERDAYS_ETAG, YESTERDAYS_MENU } = await import('../../../../shared/levels/web/20-stale-deploy')
    expect(etagOf(YESTERDAYS_MENU)).toBe(YESTERDAYS_ETAG)
    const { SPECIALS_ETAG } = await import('../../../../shared/levels/web/practice/caching')
    expect(etagOf('[{"name":"Apricot danish","price":3.2},{"name":"Cinnamon bun","price":3.4}]')).toBe(SPECIALS_ETAG)
    // without a cache in the level (chapters 1 to 3) there is none, as before
    expect((await nodeServer(SERVER).handle(get('/menu'))).headers.map(([name]) => name)).not.toContain('etag')
  })

  it('answers 304 without a body or content headers when If-None-Match still matches (W/ or not), unless the request says no-cache', async () => {
    const server = nodeServer(SERVER, false, true)
    const tag = etagOf(MENU_BODY)
    expect(await server.handle(get('/menu', [['if-none-match', tag]]))).toEqual({ status: 304, headers: [['etag', tag]], body: null })
    expect((await server.handle(get('/menu', [['if-none-match', `"x", ${tag.slice(2)}`]]))).status).toBe(304)
    expect((await server.handle(get('/menu', [['if-none-match', '*']]))).status).toBe(304)
    expect((await server.handle(get('/menu', [['if-none-match', 'W/"other"']]))).status).toBe(200)
    // "Always return stale when Cache-Control: no-cache to support end-to-end reload requests" (the fresh package)
    expect((await server.handle(get('/menu', [['if-none-match', tag], ['cache-control', 'no-cache']]))).status).toBe(200)
    expect((await server.handle(get('/menu', [['if-none-match', tag], ['cache-control', 'max-age=0']]))).status).toBe(304)
    // If-Modified-Since against Last-Modified, only without If-None-Match
    expect((await server.handle(get('/modified', [['if-modified-since', 'Tue, 17 Nov 2026 09:00:00 GMT']]))).status).toBe(304)
    expect((await server.handle(get('/modified', [['if-modified-since', 'Mon, 16 Nov 2026 09:00:00 GMT']]))).status).toBe(200)
    // only a GET or HEAD answered 2xx is fresh
    expect((await server.handle(get('/missing', [['if-none-match', '*']]))).status).toBe(404)
    expect((await server.handle({ method: 'POST', url: `${API}/orders`, headers: [['if-none-match', '*']], body: null })).status).toBe(201)
    expect(server.output.filter(line => line.level === 'access').map(line => line.text)).toContain('GET /menu 304')
  })

  it('takes app.set(\'etag\', …): false sends none, \'strong\' one without W/', async () => {
    const off = nodeServer(`const app = require('express')()\napp.set('etag', false)\napp.get('/menu', (req, res) => res.json([]))`, false, true)
    expect((await off.handle(get('/menu'))).headers.map(([name]) => name)).not.toContain('etag')
    const strong = nodeServer(`const app = require('express')()\napp.set('etag', 'strong')\napp.get('/menu', (req, res) => res.json([]))\napp.get('/setting', (req, res) => res.json({ etag: app.get('etag') }))`, false, true)
    expect((await strong.handle(get('/menu'))).headers).toContainEqual(['etag', etagOf('[]', false)])
    expect((await strong.handle(get('/setting'))).body).toBe('{"etag":"strong"}')
    expect(nodeServer(`const app = require('express')()\napp.set('etag', () => 'x')`, false, true).crashed).toMatch(/takes true, false, 'weak' or 'strong'/)
  })
})
