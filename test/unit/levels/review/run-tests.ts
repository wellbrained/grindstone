// Runs a file set's tests on Node with the very runner the Tests panel's worker uses (TEST_RUNNER_SOURCE), linked the
// way the frame links them (planTests: each module after the ones it imports, its imports pointed at their URLs; here
// data: URLs instead of blob URLs). No watchdog: the levels' tests all end; the endless ones are the e2e's.
import { TEST_LIMITS, TEST_RUNNER_SOURCE } from '../../../../shared/levels/review/test-runner'
import type { TestLimits } from '../../../../shared/levels/review/test-runner'
import { modulePlaceholder, planTests } from '../../../../shared/levels/review/test-sandbox'
import type { TestPlan } from '../../../../shared/levels/review/test-sandbox'

export interface RunnerError {
  name: string | null
  message: string
  stack: string | null
}

export interface Entry {
  file: string | null
  name: string
  at: string
}

export interface Result {
  ok: boolean
  checks: number
  error: RunnerError | null
}

/** The runner as the worker gets it. */
export interface Runner {
  test: (name: unknown, fn?: unknown) => void
  expect: (actual: unknown) => Record<string, (...args: unknown[]) => void> & { not: Record<string, (...args: unknown[]) => void> }
  vi: {
    fn: (impl?: unknown) => ((...args: unknown[]) => unknown) & { mock: { calls: unknown[][] }, mockReturnValue: (value: unknown) => unknown }
    spyOn: (object: object, name: string) => { mockReturnValue: (value: unknown) => unknown }
  }
  setFile: (path: string) => void
  count: () => number
  describe: (error: unknown) => RunnerError
  run: (from: number, onStart: (index: number, entry: Entry) => void, onResult: (index: number, entry: Entry, result: Result) => void, onDone: (dropped: number) => void) => void
}

export const createRunner = new Function(`return ${TEST_RUNNER_SOURCE}`)() as (limits: TestLimits) => Runner

/** Every test of a runner, run from `from`: each one's entry and result, and how many were over the cap. */
export function runAll(runner: Runner, from = 0): Promise<{ results: (Entry & Result)[], dropped: number }> {
  return new Promise((resolve) => {
    const results: (Entry & Result)[] = []
    runner.run(from, () => {}, (_, entry, result) => results.push({ ...entry, ...result }), dropped => resolve({ results, dropped }))
  })
}

/** What a file set's tests did on Node: per runnable test file whether it loaded, and every test's result. */
export interface NodeRun {
  plan: TestPlan
  files: { path: string, count: number, error: string | null }[]
  tests: { path: string, name: string, ok: boolean, checks: number, message: string | null }[]
}

let runs = 0

export async function runOnNode(files: Readonly<Record<string, string>>): Promise<NodeRun> {
  const plan = planTests(files)
  const run = ++runs
  const urls: Record<string, string> = {}
  for (const [path, source] of plan.modules) {
    let linked = source
    for (const [done, url] of Object.entries(urls)) linked = linked.split(modulePlaceholder(done)).join(url)
    // a fresh URL per run: a module that ran once is not run again for the same URL
    // (encodeURIComponent keeps quotes, which would end the import's string)
    urls[path] = `data:text/javascript,${encodeURIComponent(`${linked}\n// ${path}, run ${run}\n`).replace(/'/g, '%27')}`
  }
  const runner = createRunner(TEST_LIMITS)
  const scope = globalThis as Record<string, unknown>
  const saved = ['test', 'it', 'expect', 'vi'].map(name => [name, scope[name]] as const)
  Object.assign(scope, { test: runner.test, it: runner.test, expect: runner.expect, vi: runner.vi })
  try {
    const loaded: NodeRun['files'] = []
    for (const path of plan.runnable) {
      const before = runner.count()
      runner.setFile(path)
      try {
        await import(/* @vite-ignore */ urls[path]!)
        loaded.push({ path, count: runner.count() - before, error: null })
      } catch (error) {
        loaded.push({ path, count: runner.count() - before, error: runner.describe(error).message })
      }
    }
    const { results } = await runAll(runner)
    return { plan, files: loaded, tests: results.map(result => ({ path: result.file!, name: result.name, ok: result.ok, checks: result.checks, message: result.error?.message ?? null })) }
  } finally {
    for (const [name, value] of saved) scope[name] = value
  }
}
