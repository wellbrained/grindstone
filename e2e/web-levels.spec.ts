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
  runCheck(page, files, probes, undefined, { web: level.sandbox.web })

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
    const lines = start.entries.map(entry => entry.text)
    // what the texts quote (in any order: requests sent together may be answered in any order; an order question
    // checks its own lines' order below)
    for (const text of table.start.says ?? []) expect(lines.some(line => line.startsWith(text)), `${text}\n\n${lines.join('\n')}`).toBe(true)
    // every prediction against this very run: the right option's fact holds, a wrong one's does not, lines in order
    const holds = (fact: PredictionFact) => {
      if ('row' in fact) return start.network.includes(fact.row)
      if ('server' in fact) return start.server.includes(fact.server)
      if ('asks' in fact) return start.asks.some(asked => asked.split(',').includes(fact.asks))
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
