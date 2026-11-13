import { expect, test } from '@playwright/test'
import { debuggingLevels, startDebugLevel } from '../shared/levels'
import { instrumentFiles } from '../shared/levels/debugging/instrument'
import { withoutInstrumentation } from '../shared/levels/debugging/recording'
import { expected } from '../test/unit/levels/debugging/expected'
import { runCheck } from './helpers/sandbox'

// Chapter 5's instrumentation (ADR 0007, "Breakpoints") keeps what code does: every app of chapters 1 to 4, run
// instrumented the way Record runs it, reads the same values in its probes, reports the same errors on the same lines
// and sends the same requests as when it runs as written (chapter 5's own apps, and chapter 6's counted, in
// debugging-levels.spec.ts). These apps
// cover real closures, classes, async/await, promise chains, races, imports, syntax errors and hoisting. Firefox and
// Safari quote code in some messages: the Console reads those through withoutInstrumentation, and so does this check.
for (const level of debuggingLevels.filter(each => !each.sandbox.debugger && !each.sandbox.performance)) {
  test(`${level.id}: instrumented, it does what it does as written`, async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const table = expected[level.id]!
    const probes = [...(table.before ?? []), ...level.sandbox.probes]
    const files = startDebugLevel(level).state.files
    const plain = await runCheck(page, files, probes, level.sandbox.backend)
    const map = instrumentFiles(files)
    const recorded = await runCheck(page, files, probes, level.sandbox.backend, { record: map.modules })
    const errors = (run: typeof plain) => run.observation.errors.map(error => [error.kind, withoutInstrumentation(error.text), error.source && `${error.source.path}:${error.source.line}`])
    expect(recorded.observation.finished).toBe(plain.observation.finished)
    expect(recorded.observation.probes).toEqual(plain.observation.probes)
    expect(errors(recorded)).toEqual(errors(plain))
    expect(recorded.network).toEqual(plain.network)
  })
}
