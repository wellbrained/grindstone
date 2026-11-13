import { expect, test } from '@playwright/test'
import { debuggingLevels, editedText, playSolution, reload, startDebugLevel } from '../shared/levels'
import { instrumentFiles } from '../shared/levels/debugging/instrument'
import { withoutInstrumentation } from '../shared/levels/debugging/recording'
import { expected } from '../test/unit/levels/debugging/expected'
import { otherFixes } from '../test/unit/levels/debugging/fixes'
import { runCheck } from './helpers/sandbox'

// Every Debugging level in a real browser (ADR 0007): its app really fails the way the level says (the table in
// test/unit/levels/debugging/expected.ts, which the unit tests run the goals on), every goal fails on a reload of the
// starting files, and replaying the solution (edits, then a reload) makes every goal pass. Find tasks: the trace the
// player reads has the frames the task talks about. Levels with a fake backend: the Network panel's rows are what the
// table says, before and after the fix. Throwing away a file the fix edits is no fix; other real fixes pass and tempting
// non-fixes do not (test/unit/levels/debugging/fixes.ts). Chapter 5 (the Debugger): the app run instrumented, as Record
// runs it, does exactly what it does as written (the same probe values and errors), and a find task's answer is a line
// the recording stops on. No dev server needed: the apps run in a blank page.
const where = (line: { path: string, line: number } | null | undefined) => line ? `${line.path}:${line.line}` : null

for (const level of debuggingLevels) {
  test(`${level.id}: fails as written, and its solution works`, async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const table = expected[level.id]!
    const run = (files: Readonly<Record<string, string>>) => runCheck(page, files, [...(table.before ?? []), ...level.sandbox.probes], level.sandbox.backend)

    // the starting files, reloaded: what the table says, and every goal fails
    const start = await run(startDebugLevel(level).state.files)
    expect(start.observation.finished).toBe(true)
    expect(start.observation.probes).toEqual(table.start.probes)
    expect(Object.keys(start.observation.probeErrors)).toEqual(table.start.missing ?? [])
    expect(start.observation.errors).toHaveLength(table.start.errors)
    const first = start.entries.find(entry => entry.level === 'error')
    expect(where(first?.source)).toBe(table.start.errorAt ?? null)
    expect(first?.frames.map(where)).toEqual(table.start.frames)
    expect(start.network).toEqual(table.start.network ?? [])
    for (const text of table.start.says ?? []) expect(start.entries.map(entry => entry.text).some(line => line.startsWith(text)), text).toBe(true)

    if (level.sandbox.debugger) {
      // recorded (instrumented) the app does what it does as written, and the recording has steps
      const map = instrumentFiles(startDebugLevel(level).state.files)
      expect(map.skipped).toEqual([])
      const recorded = await runCheck(page, startDebugLevel(level).state.files, [...(table.before ?? []), ...level.sandbox.probes], level.sandbox.backend, map.modules)
      expect(recorded.observation.probes).toEqual(start.observation.probes)
      expect(recorded.observation.errors.map(error => ({ ...error, text: withoutInstrumentation(error.text) }))).toEqual(start.observation.errors)
      expect(recorded.steps.length).toBeGreaterThan(0)
      if (table.answerStep) {
        // the answer is a line the recording stops on: a step's own line, or a frame of a step's call stack
        const answer = level.sandbox.find!
        const lines = recorded.steps.flatMap(step => step.frames.map(frame => map.points[frame.point]).filter(point => point !== undefined).map(point => `${point.path}:${point.line}`))
        expect(lines, level.id).toContain(`${answer.path}:${answer.lines[0]}`)
      }
    }

    if (level.sandbox.find) {
      // the answer is a line of the trace (or the error's own line, or a request's initiator); the solution is a click
      const answer = level.sandbox.find
      const places = [where(first?.source), ...(first?.frames.map(where) ?? []), ...start.requests.map(entry => where(entry.initiator))]
      expect(places.some(place => answer.lines.some(line => place === `${answer.path}:${line}`))).toBe(!table.answerOffTrace)
      return
    }

    const reloaded = reload(startDebugLevel(level), level, start.observation)
    expect(Object.values(reloaded.session.goalsMet).some(Boolean)).toBe(false)

    // throwing away what the fix edits is no fix: each file the solution saves, emptied and deleted (in Elements & CSS
    // the stylesheet: nothing covers the button then, but nothing is styled either)
    const startFiles = startDebugLevel(level).state.files
    const touched = [...new Set(level.solution.flatMap(step => typeof step === 'object' && 'save' in step ? [step.save] : []))]
    for (const path of touched) {
      const { [path]: _gone, ...without } = startFiles
      for (const files of [{ ...without, [path]: '' }, without]) {
        const bare = reload(startDebugLevel(level), level, (await run(files)).observation)
        expect(Object.values(bare.session.goalsMet).every(Boolean), `${level.id} without ${path}`).toBe(false)
      }
    }

    // other real fixes pass, tempting non-fixes do not
    for (const fix of otherFixes[level.id] ?? []) {
      let files = startFiles
      for (const edit of fix.edits) files = { ...files, [edit.save]: editedText(files, edit) }
      const other = reload(startDebugLevel(level), level, (await run(files)).observation)
      expect(Object.values(other.session.goalsMet).every(Boolean), `${level.id}: ${fix.name}`).toBe(fix.solves)
    }

    const results = await playSolution(level, async (files) => {
      const solved = await run(files)
      expect(solved.observation.probes).toEqual(table.solved!.probes)
      expect(solved.observation.errors).toHaveLength(table.solved!.errors)
      expect(solved.network).toEqual(table.solved!.network ?? [])
      return solved.observation
    })
    expect(results.map(result => result.solvedNow)).toEqual(level.solution.map((_, index) => index === level.solution.length - 1))
    expect(results.at(-1)!.session).toMatchObject({ solved: true, reloads: 1 })
  })
}
