import { expect, test } from '@playwright/test'
import { debuggingLevels, playSolution, reload, startDebugLevel } from '../shared/levels'
import { expected } from '../test/unit/levels/debugging/expected'
import { runCheck } from './helpers/sandbox'

// Every Debugging level in a real browser (ADR 0007): its app really fails the way the level says (the table in
// test/unit/levels/debugging/expected.ts, which the unit tests run the goals on), every goal fails on a reload of the
// starting files, and replaying the solution (edits, then a reload) makes every goal pass. Find tasks: the trace the
// player reads has the frames the task talks about. No dev server needed: the apps run in a blank page.
const where = (line: { path: string, line: number } | null | undefined) => line ? `${line.path}:${line.line}` : null

for (const level of debuggingLevels) {
  test(`${level.id}: fails as written, and its solution works`, async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const table = expected[level.id]!
    const run = (files: Readonly<Record<string, string>>) => runCheck(page, files, [...(table.before ?? []), ...level.sandbox.probes])

    // the starting files, reloaded: what the table says, and every goal fails
    const start = await run(startDebugLevel(level).state.files)
    expect(start.observation.finished).toBe(true)
    expect(start.observation.probes).toEqual(table.start.probes)
    expect(Object.keys(start.observation.probeErrors)).toEqual(table.start.missing ?? [])
    expect(start.observation.errors).toHaveLength(table.start.errors)
    const first = start.entries.find(entry => entry.level === 'error')
    expect(where(first?.source)).toBe(table.start.errorAt)
    expect(first?.frames.map(where)).toEqual(table.start.frames)

    if (level.sandbox.find) {
      // the answer is a line of the trace (or the error's own line); the solution is a click
      const answer = level.sandbox.find
      const places = [where(first?.source), ...(first?.frames.map(where) ?? [])]
      expect(places.some(place => answer.lines.some(line => place === `${answer.path}:${line}`)) || level.id === 'debugging-practice-real-mistake').toBe(true)
      return
    }

    const reloaded = reload(startDebugLevel(level), level, start.observation)
    expect(Object.values(reloaded.session.goalsMet).some(Boolean)).toBe(false)

    const results = await playSolution(level, async (files) => {
      const solved = await run(files)
      expect(solved.observation.probes).toEqual(table.solved!.probes)
      expect(solved.observation.errors).toEqual([])
      return solved.observation
    })
    expect(results.map(result => result.solvedNow)).toEqual(level.solution.map((_, index) => index === level.solution.length - 1))
    expect(results.at(-1)!.session).toMatchObject({ solved: true, reloads: 1 })
  })
}
