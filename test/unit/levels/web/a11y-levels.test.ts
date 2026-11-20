import { describe, expect, it } from 'vitest'
import { editedText, reload, startWebLevel, webLevels } from '../../../../shared/levels'
import type { DebugStep, Observation, WebLevel } from '../../../../shared/levels'
import { runA11y } from './a11y-harness'
import { expected } from './expected'
import { a11yFixes } from './fixes-a11y'

// Chapter 6's levels on happy-dom (the review of 2026-11-20 asked for the fixes table's verdicts outside a browser too):
// each page's scene says what the table says, its probes read what the table says, the solution solves, and every other
// fix and non-fix in fixes-a11y.ts gets its verdict, cheats included. e2e/web-levels.spec.ts runs the same in Chromium,
// Firefox and WebKit, with real layout.

/**
 * Fixes this harness can't judge: happy-dom has no ARIA reflection (`ariaExpanded`), and the harness gives the page's
 * code no MutationObserver of its own; the browsers run them.
 */
const BROWSER_ONLY = new Set(['the ariaExpanded property, and false in the markup', 'an empty live paragraph added, its text written by the page\'s own MutationObserver'])

const levels = webLevels.filter(level => level.sandbox.web?.a11y === true)

const solvedBy = (level: WebLevel, files: Record<string, string>, observation: Observation) =>
  reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: expected[level.id]!.answers } }, level, observation).session.solved

const applied = (level: WebLevel, edits: readonly DebugStep[]) => {
  let files = level.setup().files
  for (const edit of edits) if (typeof edit === 'object' && 'save' in edit) files = { ...files, [edit.save]: editedText(files, edit) }
  return files
}

describe('chapter 6 on happy-dom', () => {
  for (const level of levels) {
    it(`${level.id}: says and reads what its table says${level.kind === 'scenario' ? ', and its solution solves it' : ''}`, async () => {
      const table = expected[level.id]!
      const start = await runA11y(level, level.setup().files)
      expect(start.heard, 'heard').toEqual(table.start.heard ?? [])
      expect(start.observation.probes, 'probes').toEqual(table.start.probes)
      for (const line of table.start.says ?? []) expect(start.logs).toContain(line)
      if (level.kind === 'practice') return
      expect(solvedBy(level, level.setup().files, start.observation)).toBe(false)
      const files = applied(level, level.solution)
      const solved = await runA11y(level, files)
      expect(solved.heard).toEqual(table.solved!.heard ?? [])
      expect(solved.observation.probes).toEqual(table.solved!.probes)
      expect(solvedBy(level, files, solved.observation)).toBe(true)
    })
    for (const fix of a11yFixes[level.id] ?? []) {
      if (BROWSER_ONLY.has(fix.name)) continue
      it(`${level.id}: ${fix.solves ? 'also solved by' : 'not solved by'} ${fix.name}`, async () => {
        const files = applied(level, fix.edits)
        const run = await runA11y(level, files)
        expect(solvedBy(level, files, run.observation), JSON.stringify(run.observation.probes)).toBe(fix.solves)
      })
    }
  }
})
