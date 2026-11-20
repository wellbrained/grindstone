import { describe, expect, it, vi } from 'vitest'
import { editedText, isAnswerTo, levelIntro, playWebSolution, predict, reload, requestAddress, requestEntry, startWebLevel, statusLabel, webConfig, webLevels, withResponse } from '../../../../shared/levels'
import type { NetworkEntry, Observation, PredictionFact, Question, RequestMessage, ResponseMessage, WebLevel } from '../../../../shared/levels'
import { SHOP_ORIGIN } from '../../../../shared/levels/debugging/sandbox'
import { expected } from './expected'
import type { ExpectedRun } from './expected'
import { otherFixes } from './fixes'
import { nodeBackend } from './helpers'

// Every Web fundamentals level (ADR 0009): its shape, its prediction (the right answer is what the run shows: each
// option's fact checked against the table in expected.ts, which e2e/web-levels.spec.ts proves in a browser), goals that
// fail on the starting files and pass on the fixed app, the solution replayed (also with a wrong prediction, which
// costs but never blocks), the hints' lines, the other fixes' edits, and the level's server.js run through the CORS model
// on Node for the requests its app sends.

const observed = (run: ExpectedRun): Observation => ({
  finished: true,
  errors: Array.from({ length: run.errors }, () => ({ kind: 'network' as const, text: 'Access to fetch at …', source: null })),
  probes: run.probes,
  probeErrors: {},
  logs: []
})

const solvedFiles = (level: WebLevel): Record<string, string> => {
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files
}

const questionsOf = (level: WebLevel) => level.prediction.questions

describe('the Web fundamentals levels', () => {
  it('are scenarios with one question and practice tasks with one or three, every one with a table', () => {
    expect(webLevels.length).toBe(61)
    for (const level of webLevels) {
      expect(level.id, level.id).toMatch(level.kind === 'scenario' ? /^web-\d\d-[a-z-]+$/ : /^web-practice-[a-z-]+$/)
      expect(level.hints).toHaveLength(level.kind === 'scenario' ? 3 : 1)
      expect(questionsOf(level).length, level.id).toBe(level.kind === 'scenario' ? 1 : questionsOf(level).length === 3 ? 3 : 1)
      expect(expected[level.id], level.id).toBeDefined()
      // the table's answers are the questions' own
      expect(expected[level.id]!.answers, level.id).toEqual(questionsOf(level).map(question => question.answer))
      for (const question of questionsOf(level)) {
        const ids = question.options.map(option => option.id)
        expect(new Set(ids).size, `${level.id} ${question.id}`).toBe(ids.length)
        expect(isAnswerTo(question, question.answer), `${level.id} ${question.id}`).toBe(true)
        expect(question.rule, level.id).toMatch(/\.$/)
        expect(question.options.length, level.id).toBeGreaterThanOrEqual(2)
        // an order question's lines are not shown in their right order
        if (question.form === 'order') expect(ids, level.id).not.toEqual(question.answer)
      }
    }
    // the scenarios' tags on the track page
    expect(webLevels.filter(level => level.kind === 'scenario').map(level => level.teaches)).toEqual(['Allow-Origin', 'preflight', 'credentials', 'Allow-Headers', 'Allow-Methods', 'SameSite=None', 'CSRF', 'HttpOnly', 'Path', 'Strict', 'localStorage', 'innerHTML', 'exp', 'refresh', 'logout', 'max-age', 'no-cache', 'private', 'Vary', 'stale deploy', 'long task', 'event dispatch', 'forced layout', 'transition', 'microtasks', 'accessible name', 'keyboard', 'aria-expanded', 'live region', 'focus'])
  })

  it('check every answer against what the app does: the right option\'s fact holds, a wrong one\'s does not, lines come in the answer\'s order', () => {
    const holds = (fact: PredictionFact, run: ExpectedRun): boolean => {
      if ('row' in fact) return run.network.includes(fact.row)
      if ('server' in fact) return run.server.filter(line => line === fact.server).length >= (fact.times ?? 1)
      if ('cdn' in fact) return (run.cdn ?? []).includes(fact.cdn)
      if ('asks' in fact) return (run.asks ?? []).some(asked => asked.split(',').includes(fact.asks))
      if ('sent' in fact) return (run.sent ?? []).includes(fact.sent)
      if ('stored' in fact) return (run.stored ?? []).includes(fact.stored)
      if ('refused' in fact) return (run.refused ?? []).includes(fact.refused)
      if ('readable' in fact) return (run.readable ?? []).includes(fact.readable)
      if ('storage' in fact) return (run.storage ?? []).includes(fact.storage)
      if ('replayed' in fact) return (run.replayed ?? []).includes(fact.replayed)
      if ('painted' in fact) return (run.painted ?? []).some(item => item.startsWith(fact.painted))
      if ('forced' in fact) return (run.forced ?? []).includes(fact.forced)
      if ('layouts' in fact) return (run.forced ?? []).length === fact.layouts
      if ('animated' in fact) return (run.animated ?? []).includes(fact.animated)
      if ('heard' in fact) return (run.heard ?? []).includes(fact.heard)
      return (run.says ?? []).some(line => line.startsWith(fact.says))
    }
    /** Where an order question's line shows: the Console ('says') or, in chapter 6, the reader ('heard'). */
    const placeOf = (fact: PredictionFact, run: ExpectedRun): number => 'heard' in fact
      ? (run.heard ?? []).indexOf(fact.heard)
      : (run.says ?? []).findIndex(line => line.startsWith((fact as { says: string }).says))
    for (const level of webLevels) {
      const run = expected[level.id]!.start
      for (const question of questionsOf(level) as Question[]) {
        const name = `${level.id} ${question.id}`
        // every question is checked by at least one fact
        expect(question.options.some(option => option.fact), name).toBe(true)
        if (question.form === 'order') {
          const at = question.answer.map(id => placeOf(question.options.find(option => option.id === id)!.fact!, run))
          expect(at.every(index => index >= 0), name).toBe(true)
          expect([...at].sort((a, b) => a - b), name).toEqual(at)
          continue
        }
        const right = question.form === 'one' ? [question.answer] : question.answer
        for (const option of question.options) {
          if (!option.fact) continue
          expect(holds(option.fact, run), `${name} ${option.id}`).toBe(right.includes(option.id))
        }
        // pick lines: every option says something checkable
        if (question.form === 'lines') expect(question.options.every(option => option.fact), name).toBe(true)
      }
    }
  })

  it('fail on the starting files (every goal, even with the right prediction) and pass once fixed', async () => {
    for (const level of webLevels.filter(each => each.kind === 'scenario')) {
      const table = expected[level.id]!
      const fresh = startWebLevel(level)
      expect(Object.values(fresh.goalsMet).some(Boolean), level.id).toBe(false)
      const predicted = { ...fresh, state: { ...fresh.state, predicted: table.answers } }
      const failed = reload(predicted, level, observed(table.start)).session
      expect(level.goals.filter(goal => goal.id !== 'predicted').some(goal => failed.goalsMet[goal.id]), level.id).toBe(false)
      const results = await playWebSolution(level, async () => observed(table.solved!))
      expect(results.at(-1)!.session.solved, level.id).toBe(true)
      expect(results.at(-1)!.session.wrongPredictions, level.id).toBe(0)
    }
  })

  it('solve with a wrong prediction too: it costs one in the run, never the level', async () => {
    for (const level of webLevels.filter(each => each.kind === 'scenario')) {
      const question = questionsOf(level)[0]!
      const wrong = question.form === 'one' ? question.options.find(option => option.id !== question.answer)!.id : []
      let session = predict(startWebLevel(level), level, wrong).session
      expect(session.wrongPredictions, level.id).toBe(1)
      for (const step of level.solution.slice(1)) {
        if (step === 'reload') session = reload(session, level, observed(expected[level.id]!.solved!)).session
        else if (typeof step === 'object' && 'save' in step) session = { ...session, state: { ...session.state, files: { ...session.state.files, [step.save]: editedText(session.state.files, step) } } }
      }
      expect(session.solved, level.id).toBe(true)
    }
  })

  it('make a practice task a prediction only: answering every question solves it, no reload needed', async () => {
    for (const level of webLevels.filter(each => each.kind === 'practice')) {
      expect(level.solution.every(step => typeof step === 'object' && 'predict' in step), level.id).toBe(true)
      expect(level.goals.map(goal => goal.id), level.id).toEqual(['predicted'])
      const results = await playWebSolution(level, () => Promise.reject(new Error('no reload')))
      expect(results.at(-1)!.session.solved, level.id).toBe(true)
      expect(levelIntro(level), level.id).toBe(level.task)
    }
  })

  it('point the hints at lines that say what they claim', () => {
    const POINTED_AT: Record<string, [path: string, line: number, contains: string][]> = {
      'web-01-menu-blocked': [['server.js', 20, 'app.get(\'/menu\''], ['server.js', 21, 'res.json(MENU)']],
      'web-02-order-preflight': [['server.js', 24, '// POST /orders:']],
      'web-03-basket-credentials': [['server.js', 29, 'res.set(\'Access-Control-Allow-Origin\', \'*\')']],
      'web-04-basket-header': [['server.js', 19, 'res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')']],
      'web-05-works-with-curl': [['server.js', 18, 'res.set(\'Access-Control-Allow-Methods\', \'GET, POST\')']],
      'web-11-token-in-storage': [['server.js', 54, 'res.json({ name: CUSTOMERS[customer].name, token })'], ['server.js', 41, 'const token = (req.get(\'Authorization\')']],
      'web-13-token-never-expires': [['server.js', 53, 'const token = jwt.sign({ sub: customer }, SECRET)']],
      'web-16-old-price': [['server.js', 36, 'res.set(\'Cache-Control\', \'max-age=3600\')']],
      'web-17-whole-menu': [['server.js', 36, 'res.set(\'Cache-Control\', \'no-store\')']],
      'web-18-someone-elses-account': [['server.js', 52, 'app.get(\'/account\', (req, res) => {']],
      'web-19-vary-origin': [['server.js', 26, 'if (SHOPS.includes(origin)) res.set(\'Access-Control-Allow-Origin\', origin)']],
      'web-20-stale-deploy': [['app.js', 8, 'const response = await fetch(`${API}/menu`)'], ['server.js', 36, 'res.set(\'Cache-Control\', \'max-age=86400\')']],
      'web-21-spinner': [['app.js', 22, 'console.log(\'Spinner shown\')']],
      'web-22-pickup-menu': [['app.js', 29, 'document.addEventListener(\'click\', () => {']],
      'web-23-kitchen-screen': [['app.js', 13, 'list.scrollTop = list.scrollHeight'], ['app.js', 17, 'for (const order of OVERNIGHT) addOrder(order)']],
      'web-24-toast': [['app.js', 9, 'element.classList.add(\'visible\')']],
      'web-25-progress-bar': [['app.js', 20, 'await Promise.resolve()']],
      'web-26-every-button': [['app.js', 21, '<button class="add icon-button" type="button">']],
      'web-27-checkout': [['index.html', 25, '<div id="checkout" class="checkout">Check out</div>']],
      'web-28-allergens': [['index.html', 21, '<button id="allergens-toggle"'], ['app.js', 6, 'list.hidden = !list.hidden']],
      'web-29-silent-error': [['index.html', 22, '<input id="email"']],
      'web-30-focus-lost': [['app.js', 22, 'dialog.hidden = true'], ['app.js', 21, 'function close() {']]
    }
    for (const [id, points] of Object.entries(POINTED_AT)) {
      const level = webLevels.find(each => each.id === id)!
      for (const [path, line, contains] of points) expect(level.setup().files[path]!.split('\n')[line - 1], `${id} ${path}:${line}`).toContain(contains)
    }
  })

  it('have other fixes whose edits apply to the starting files', () => {
    for (const [id, fixes] of Object.entries(otherFixes)) {
      const level = webLevels.find(each => each.id === id)!
      expect(fixes.some(fix => fix.solves) && fixes.some(fix => !fix.solves), id).toBe(true)
      for (const fix of fixes) {
        let files = level.setup().files
        for (const edit of fix.edits) files = { ...files, [edit.save]: editedText(files, edit) }
        expect(files, `${id}: ${fix.name}`).not.toEqual(level.setup().files)
      }
    }
  })

  it('load their servers as data the frame can take (webConfig checks each level\'s spec)', () => {
    for (const level of webLevels) {
      const config = webConfig(level.sandbox.web!, level.setup().files, SHOP_ORIGIN)
      expect(config.api, level.id).toBe('https://api.cornerbakery.shop')
      expect(config.source !== null, level.id).toBe(level.sandbox.web!.server !== undefined)
      // chapter 5: the event loop, and no API server (app.js is what you fix)
      expect(config.loop !== null, level.id).toBe(level.sandbox.web!.loop !== undefined)
      if (config.loop) expect(level.sandbox.web!.server, level.id).toBeUndefined()
      // chapter 6: the accessibility model, and no API server either (index.html and app.js are what you fix)
      expect(config.a11y !== null, level.id).toBe(level.sandbox.web!.a11y === true)
      if (config.a11y) expect(level.sandbox.web!.server, level.id).toBeUndefined()
    }
    expect(() => webConfig({ api: 'https://api.cornerbakery.shop', loop: { watch: [] }, a11y: true }, {}, SHOP_ORIGIN)).toThrow(/not both/)
  })
})

/** The requests each scenario's app sends, as app.js writes them (and as a customer's tap sends them), in order. */
const REQUESTS: Record<string, { start: [string, RequestInit?][], solved: [string, RequestInit?][] }> = (() => {
  const API = 'https://api.cornerbakery.shop'
  const basket: [string, RequestInit] = [`${API}/basket`, { credentials: 'include', headers: { 'X-Basket-Id': 'laptop-1' } }]
  const remove: [string, RequestInit] = [`${API}/basket/lines/2`, { method: 'DELETE', credentials: 'include', headers: { 'X-Basket-Id': 'laptop-1' } }]
  const order: [string, RequestInit] = [`${API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 'croissant', quantity: 2 }, { id: 'rye', quantity: 1 }] }) }]
  return {
    'web-01-menu-blocked': { start: [[`${API}/menu`]], solved: [[`${API}/menu`]] },
    'web-02-order-preflight': { start: [order], solved: [order] },
    'web-03-basket-credentials': { start: [[`${API}/basket`, { credentials: 'include' }]], solved: [[`${API}/basket`, { credentials: 'include' }]] },
    'web-04-basket-header': { start: [[`${API}/menu`], basket], solved: [[`${API}/menu`], basket] },
    'web-05-works-with-curl': { start: [basket, remove], solved: [basket, remove, basket] }
  }
})()

// chapter 2's runs start with the page's clicks and other sites' visits (the scene): the e2e checks those in a browser
describe('each chapter 1 scenario\'s server.js through the CORS model, on Node', () => {
  for (const level of webLevels.filter(each => each.kind === 'scenario' && REQUESTS[each.id])) {
    it(`${level.id}: the requests its app sends get the Network panel's rows of the table`, async () => {
      vi.useFakeTimers()
      try {
        for (const [part, files] of [['start', level.setup().files], ['solved', solvedFiles(level)]] as const) {
          const { backend, posted } = nodeBackend(level.sandbox.web!, files)
          for (const [url, init] of REQUESTS[level.id]![part]) {
            const done = backend.fetch(url, init).catch(() => null)
            await vi.advanceTimersByTimeAsync(500)
            await done
          }
          let entries: NetworkEntry[] = []
          for (const message of posted) {
            if (message.type === 'request') entries.push(requestEntry(message as unknown as RequestMessage, { urls: {}, bridgeLine: 0 }))
            else if (message.type === 'response') entries = withResponse(entries, message as unknown as ResponseMessage)
          }
          expect(entries.map(entry => `${entry.method} ${requestAddress(entry.url)} ${statusLabel(entry)}`), `${level.id} ${part}`).toEqual(expected[level.id]![part]!.network)
        }
      } finally {
        vi.useRealTimers()
      }
    })
  }
})
