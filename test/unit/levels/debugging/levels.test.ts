import { describe, expect, it } from 'vitest'
import { debuggingLevels, editedText, levelIntro, pickLine, playSolution, reload, saveDebugFile, startDebugLevel, takeHint } from '../../../../shared/levels'
import type { DebugLevel, Observation } from '../../../../shared/levels'
import { expected } from './expected'
import type { ExpectedRun } from './expected'

// Every Debugging level (ADR 0007): its shape, a start where no goal passes, goals that fail on what its broken app does
// and pass on what the fixed app does (the table in expected.ts; e2e/debugging-levels.spec.ts proves the apps really do
// that in a browser), its solution replayed, and for find tasks the click that solves it and why a wrong one does not.

const observed = (run: ExpectedRun): Observation => ({
  finished: true,
  errors: Array.from({ length: run.errors }, () => ({ kind: 'error' as const, text: 'Uncaught TypeError', source: null })),
  probes: run.probes,
  probeErrors: Object.fromEntries((run.missing ?? []).map(id => [id, 'Nothing on the page matches'])),
  logs: []
})

const lines = (level: DebugLevel, path: string) => (level.setup().files[path] ?? '').split('\n')
const texts = (level: DebugLevel) => [levelIntro(level), ...level.hints, ...(level.kind === 'scenario' ? level.debrief.paragraphs : [level.why])]

/** Lines the texts point at, with what is there: the hints may only name lines that say what they claim. */
const POINTED_AT: Record<string, [path: string, line: number, contains: string][]> = {
  'debugging-01-add-to-cart': [['cart.js', 17, 'cart.itmes.push(line)'], ['cart.js', 7, 'items: []']],
  'debugging-practice-line-that-throws': [['specials.js', 11, 'special.price.amount.toFixed(2)']],
  'debugging-practice-misspelled-property': [['cart.js', 7, 'cart.itesm.length']],
  'debugging-02-prices-vanished': [['app.js', 4, 'import formatPrice from \'./money.js\'']],
  'debugging-practice-import-right-name': [['app.js', 4, 'import { formatEuro } from \'./money.js\'']],
  'debugging-03-total-not-defined': [['checkout.js', 17, 'formatPrice(total)'], ['checkout.js', 13, 'let total = 0']],
  'debugging-practice-move-declaration-up': [['hours.js', 4, 'renderHours()'], ['hours.js', 6, 'const hours = ']],
  'debugging-04-error-in-money': [['checkout.js', 10, 'formatPrice(cart)'], ['money.js', 3, 'amount.toFixed(2)']],
  'debugging-practice-frame-that-passed': [['breads.js', 10, 'formatWeight(loaf)']],
  'debugging-practice-three-frame-trace': [['app.js', 12, 'confirmPickup(slots)']],
  'debugging-05-blank-page': [['cart.js', 11, '} else {'], ['cart.js', 12, 'cart.items.push('], ['cart.js', 16, 'export function renderBadge']],
  'debugging-practice-real-mistake': [['hours.js', 5, 'sunday: \'closed\''], ['hours.js', 7, 'export function hoursText']],
  'debugging-practice-close-the-bracket': [['cart.js', 9, 'renderBadge()'], ['cart.js', 11, 'export function renderBadge']]
}

describe('the Debugging levels', () => {
  it('are all in the table of what their apps do, and every table row is a level', () => {
    expect(Object.keys(expected)).toEqual(debuggingLevels.map(level => level.id))
    expect(Object.keys(POINTED_AT)).toEqual(debuggingLevels.map(level => level.id))
  })

  describe.each(debuggingLevels.map(level => [level.id, level] as const))('%s', (id, level) => {
    const table = expected[id]!
    const find = level.sandbox.find

    it('has the shape of its kind', () => {
      expect(level.track).toBe('debugging')
      expect(level.title).not.toBe('')
      expect(levelIntro(level).length).toBeGreaterThan(40)
      if (level.kind === 'scenario') {
        expect(level.hints).toHaveLength(3)
        expect(level.debrief.paragraphs.length).toBeGreaterThanOrEqual(2)
        expect(level.debrief.paragraphs.length).toBeLessThanOrEqual(4)
        expect(level.teaches).toMatch(/^[A-Z][a-z]+Error$/)
        expect(find).toBeUndefined()
      } else {
        expect(level.hints).toHaveLength(1)
        expect(level.minutes).toBe(0.5)
        expect(level.why).not.toBe('')
      }
      const files = level.setup().files
      expect(files['index.html']).toMatch(/^<!doctype html>\n<html lang="en">\n<head>\n/)
      expect(Object.keys(files)).toContain(level.sandbox.open)
      expect(level.sandbox.page).toBe('/order')
      // a find task is a click (no probes, no edits), a fix is edits and then one reload
      if (find) {
        expect(level.kind).toBe('practice')
        expect(level.sandbox.probes).toEqual([])
        expect(level.solution).toEqual([{ pick: find.path, line: find.lines[0] }])
      } else {
        expect(level.sandbox.probes.length).toBeGreaterThan(0)
        expect(level.solution.at(-1)).toBe('reload')
        expect(level.solution.filter(step => step === 'reload')).toHaveLength(1)
      }
    })

    it('starts the same every time, with every goal open', () => {
      expect(level.setup()).toEqual(level.setup())
      const session = startDebugLevel(level)
      expect(session.state).toMatchObject({ observed: null, picked: null })
      expect(Object.values(session.goalsMet)).toEqual(level.goals.map(() => false))
    })

    it('only points at lines that say what the texts claim', () => {
      for (const [path, line, contains] of POINTED_AT[id]!) expect(lines(level, path)[line - 1], `${path}:${line}`).toContain(contains)
      // every `file:line` the texts name is a line of that file
      for (const text of texts(level)) {
        for (const [, path, line] of text.matchAll(/`([\w/.-]+\.(?:js|html|css)):(\d+)`/g)) {
          expect(lines(level, path!).length, `${path}:${line}`).toBeGreaterThanOrEqual(Number(line))
        }
      }
    })

    if (find) {
      it('is solved by clicking the answer, in the editor or the trace, and says why a wrong click is not it', () => {
        for (const line of find.lines) {
          const result = pickLine(startDebugLevel(level), level, { path: find.path, line })
          expect(result.output.verdict).toEqual({ right: true, why: null })
          expect(result.solvedNow).toBe(true)
        }
        for (const [place, why] of Object.entries(find.wrong)) {
          const [path, line] = place.split(':')
          expect(find.lines.includes(Number(line)) && path === find.path, place).toBe(false)
          expect(lines(level, path!).length, place).toBeGreaterThanOrEqual(Number(line))
          const result = pickLine(startDebugLevel(level), level, { path: path!, line: Number(line) })
          expect(result.output.verdict).toEqual({ right: false, why })
          expect(result.session.solved).toBe(false)
        }
        const elsewhere = pickLine(startDebugLevel(level), level, { path: 'index.html', line: 1 })
        expect(elsewhere.output.verdict).toEqual({ right: false, why: find.otherwise })
        // a wrong click, then the right one: solved, and the clicks count as actions but not as reloads
        const wrong = pickLine(startDebugLevel(level), level, { path: 'index.html', line: 1 })
        const right = pickLine(wrong.session, level, { path: find.path, line: find.lines[0]! })
        expect(right.session).toMatchObject({ solved: true, commandCount: 2 })
        expect(right.session.reloads).toBeUndefined()
      })

      it('is not solved by anything but a click', () => {
        const session = reload(startDebugLevel(level), level, observed(table.start)).session
        expect(session.solved).toBe(false)
      })
    } else {
      it('fails every goal on its broken app, and passes them all once it is fixed', () => {
        const broken = reload(startDebugLevel(level), level, observed(table.start)).session
        expect(Object.values(broken.goalsMet)).toEqual(level.goals.map(() => false))
        const fixed = reload(startDebugLevel(level), level, observed(table.solved!)).session
        expect(Object.values(fixed.goalsMet)).toEqual(level.goals.map(() => true))
        // a check run that did not finish (an endless loop, a hang) passes nothing about errors
        const hung = reload(startDebugLevel(level), level, { ...observed(table.solved!), finished: false }).session
        expect(hung.goalsMet['no-errors']).toBe(false)
      })

      it('is solved by replaying its solution: the edits, then one reload', async () => {
        const startFiles = level.setup().files
        const results = await playSolution(level, async files => observed(JSON.stringify(files) === JSON.stringify(startFiles) ? table.start : table.solved!))
        expect(results.map(result => result.solvedNow)).toEqual(level.solution.map((_, index) => index === level.solution.length - 1))
        expect(results.at(-1)!.session).toMatchObject({ solved: true, reloads: 1, commandCount: level.solution.length })
      })

      it('changes its files only through its solution\'s edits, each of which changes something', () => {
        let files = level.setup().files
        for (const step of level.solution) {
          if (typeof step === 'string' || !('save' in step)) continue
          const text = editedText(files, step)
          expect(text).not.toBe(files[step.save])
          files = { ...files, [step.save]: text }
        }
        expect(files).not.toEqual(level.setup().files)
      })

      it('gets no credit for a reload without a fix', () => {
        const unchanged = saveDebugFile(startDebugLevel(level), level, level.sandbox.open, level.setup().files[level.sandbox.open]!)
        expect(reload(unchanged.session, level, observed(table.start)).session.solved).toBe(false)
      })
    }

    it('counts its hints', () => {
      const shown = takeHint(startDebugLevel(level), level)
      expect(shown).toMatchObject({ number: 1, total: level.hints.length, revealed: true })
    })
  })
})

describe('the Debugging engine', () => {
  const level = debuggingLevels[0]!

  it('saves only files the app has, and a save is an action, not a reload', () => {
    const session = startDebugLevel(level)
    expect(saveDebugFile(session, level, 'nope.js', 'x').session).toBe(session)
    const saved = saveDebugFile(session, level, 'cart.js', '// empty\n')
    expect(saved.session.state.files['cart.js']).toBe('// empty\n')
    expect(saved.session).toMatchObject({ commandCount: 1, history: [{ kind: 'save', path: 'cart.js' }] })
    expect(saved.session.reloads).toBeUndefined()
    // goals only change on a reload: a save keeps what the last reload saw
    expect(saved.session.goalsMet).toEqual(session.goalsMet)
  })

  it('counts reloads, and a click outside a find task does nothing', () => {
    const first = reload(startDebugLevel(level), level, observed(expected[level.id]!.start))
    const second = reload(first.session, level, observed(expected[level.id]!.start))
    expect(second.session).toMatchObject({ reloads: 2, commandCount: 2, history: [{ kind: 'reload' }, { kind: 'reload' }] })
    const session = startDebugLevel(level)
    expect(pickLine(session, level, { path: 'cart.js', line: 17 })).toMatchObject({ session, output: { verdict: null } })
  })

  it('refuses a solution edit whose text is not in the file', () => {
    expect(() => editedText({ 'a.js': 'x' }, { save: 'a.js', replace: ['y', 'z'] })).toThrow(/does not contain/)
    expect(() => editedText({}, { save: 'a.js', replace: ['y', 'z'] })).toThrow(/no file/)
    // `$&` in the replacement is written as is
    expect(editedText({ 'a.js': 'x' }, { save: 'a.js', replace: ['x', '$&$&'] })).toBe('$&$&')
  })
})
