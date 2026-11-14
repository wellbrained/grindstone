import { describe, expect, it } from 'vitest'
import { BRIDGE_HELLO, readBridgeMessage } from '../../../../shared/levels/debugging/messages'
import type { BridgeMessage } from '../../../../shared/levels/debugging/messages'
import { SANDBOX_CSP } from '../../../../shared/levels/debugging/sandbox'
import { TEST_LIMITS } from '../../../../shared/levels/review/test-runner'
import { isTestFile, modulePlaceholder, planTests, readTestRun, testDocument, testFilesOf, testRunFiles, testSummary } from '../../../../shared/levels/review/test-sandbox'

// The Tests panel's run, the page's side (ADR 0008, chapter 3): which files are tests, the plan the frame links the
// modules by, the run's document, the test messages read from the frame (hostile ones dropped, texts cut) and what a
// run's messages come to (lines from stacks, the cap, the summary).

const FILES = {
  'index.html': '<!doctype html>',
  'app.js': 'import { lineTotal } from \'./prices.js\'\ndocument.title = lineTotal\n',
  'prices.js': 'import { round } from "./money.js"\nexport const lineTotal = line => round(line.price * line.quantity)\n',
  'money.js': 'export const round = amount => Math.round(amount * 100) / 100\n',
  'prices.test.js': 'import { lineTotal } from \'./prices.js\'\n\ntest(\'one\', () => {\n  expect(lineTotal({ price: 2.4, quantity: 1 })).toBe(2.4)\n})\n'
}

describe('the Tests panel\'s plan', () => {
  it('knows test files by their name', () => {
    expect(isTestFile('cart.test.js')).toBe(true)
    expect(isTestFile('cart.js')).toBe(false)
    expect(isTestFile('test.js')).toBe(false)
    expect(testFilesOf({ 'b.test.js': '', 'a.test.js': '', 'a.js': '' })).toEqual(['a.test.js', 'b.test.js'])
  })

  it('runs the pull request\'s tests on main\'s code for main', () => {
    const pr = { base: { 'prices.js': 'old', 'prices.test.js': 'old test', 'gone.test.js': 'gone' }, head: { 'prices.js': 'new', 'prices.test.js': 'new test' } }
    expect(testRunFiles(pr, 'head')).toEqual(pr.head)
    expect(testRunFiles(pr, 'base')).toEqual({ 'prices.js': 'old', 'prices.test.js': 'new test' })
  })

  it('orders the modules the tests import, each after its imports, and points the imports at placeholders', () => {
    const plan = planTests(FILES)
    expect(plan.tests).toEqual(['prices.test.js'])
    expect(plan.runnable).toEqual(['prices.test.js'])
    expect(plan.problems).toEqual([])
    // app.js and index.html are not imported by a test
    expect(plan.modules.map(([path]) => path)).toEqual(['money.js', 'prices.js', 'prices.test.js'])
    expect(plan.modules[1]![1]).toBe(`import { round } from "${modulePlaceholder('money.js')}"\nexport const lineTotal = line => round(line.price * line.quantity)\n`)
    expect(plan.modules[2]![1]).toContain(`from '${modulePlaceholder('prices.js')}'`)
  })

  it('says why a test file can\'t run: an import that is not there, or a circle', () => {
    const plan = planTests({
      ...FILES,
      'split.test.js': 'import { splitBill } from \'./split.js\'\n',
      'a.js': 'import \'./b.js\'\n',
      'b.js': 'import \'./a.js\'\n',
      'circle.test.js': 'import \'./a.js\'\n'
    })
    expect(plan.runnable).toEqual(['prices.test.js'])
    expect(plan.problems).toEqual([
      { path: 'circle.test.js', message: 'Modules import each other in a circle: a.js → b.js → a.js. This runner can\'t load that.' },
      { path: 'split.test.js', message: 'Failed to load ./split.js from split.test.js: no such file.' }
    ])
    expect(plan.modules.map(([path]) => path)).toEqual(['money.js', 'prices.js', 'prices.test.js'])
  })

  it('makes a document with the sandbox\'s policy and the bridge\'s hello, its config unable to close the script', () => {
    const html = testDocument(planTests({ ...FILES, 'prices.test.js': `${FILES['prices.test.js']}// </script><script>alert(1)</script>\n` }), 'token-1')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain(`content="${SANDBOX_CSP}"`)
    expect(html).toContain(BRIDGE_HELLO)
    expect(html).toContain('"token":"token-1"')
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain('new Worker(')
    expect(html).toContain(`"maxTests":${TEST_LIMITS.maxTests}`)
  })
})

describe('the test messages from the frame', () => {
  it('reads well-formed ones and cuts their texts', () => {
    expect(readBridgeMessage({ type: 'testFile', path: 'prices.test.js', tests: 2, error: null, timeout: false })).toEqual({ type: 'testFile', path: 'prices.test.js', tests: 2, error: null, timeout: false })
    expect(readBridgeMessage({ type: 'testsDone', finished: true, dropped: 0 })).toEqual({ type: 'testsDone', finished: true, dropped: 0 })
    const read = readBridgeMessage({ type: 'test', index: 0, path: 'p'.repeat(500), name: 'n'.repeat(500), at: 'a'.repeat(10_000), status: 'failed', checks: 1, error: { name: 'AssertionError', message: 'm'.repeat(10_000), stack: 's'.repeat(10_000) }, leaked: false })
    expect(read).toMatchObject({ type: 'test', status: 'failed', checks: 1 })
    const test = read as Extract<BridgeMessage, { type: 'test' }>
    expect([test.path.length, test.name.length, test.at.length, test.error!.message.length, test.error!.stack!.length]).toEqual([200, 200, 4000, 2000, 4000])
  })

  it('drops hostile ones', () => {
    const good = { type: 'test', index: 0, path: 'a.test.js', name: 'x', at: '', status: 'passed', checks: 0, error: null, leaked: false }
    for (const bad of [
      { ...good, status: 'solved' },
      { ...good, index: -1 },
      { ...good, checks: 1.5 },
      { ...good, name: { toString: () => 'x' } },
      { ...good, error: { message: 42 } },
      { ...good, error: 'boom' },
      { ...good, leaked: 'yes' },
      { ...good, leaked: undefined },
      { type: 'testFile', path: 'a.test.js', tests: 1, error: null, timeout: 'no' },
      { type: 'testsDone', finished: 'yes', dropped: 0 }
    ]) expect(readBridgeMessage(bad), JSON.stringify(bad)).toBeNull()
  })
})

describe('a test run\'s results', () => {
  const plan = planTests({ ...FILES, 'gone.test.js': 'import \'./gone.js\'\n', 'empty.test.js': '' })
  const PRICES = 'blob:null/1111'
  const TEST = 'blob:null/2222'
  const files: BridgeMessage = { type: 'files', urls: { [PRICES]: 'prices.js', [TEST]: 'prices.test.js' } }
  const at = `Error: test\n    at test (blob:null/9999:1:500)\n    at ${TEST}:3:1`
  const failed = (index: number, stack: string): BridgeMessage => ({ type: 'test', index, path: 'prices.test.js', name: `test ${index}`, at, status: 'failed', checks: 1, error: { name: 'AssertionError', message: `expect(received).toBe(expected)\n\nExpected: 2.4\nReceived: ${PRICES}`, stack }, leaked: false })

  it('maps where each test is and where it failed, names blob URLs as files, and keeps each test once', () => {
    const run = readTestRun([
      files,
      { type: 'testFile', path: 'prices.test.js', tests: 3, error: null, timeout: false },
      { type: 'testFile', path: 'empty.test.js', tests: 0, error: null, timeout: false },
      { type: 'test', index: 0, path: 'prices.test.js', name: 'passes', at, status: 'passed', checks: 0, error: null, leaked: false },
      failed(1, `AssertionError: …\n    at Object.toBe (blob:null/9999:1:200)\n    at ${PRICES}:2:10\n    at ${TEST}:4:44`),
      failed(1, 'again'),
      { type: 'test', index: 2, path: 'prices.test.js', name: 'throws', at, status: 'failed', checks: 0, error: { name: 'TypeError', message: 'line is undefined', stack: `TypeError: line is undefined\n    at ${PRICES}:2:40` }, leaked: false },
      { type: 'test', index: 3, path: 'prices.test.js', name: 'endless', at, status: 'unfinished', checks: 0, error: null, leaked: false },
      { type: 'test', index: 4, path: 'prices.test.js', name: 'left a loop running', at, status: 'unfinished', checks: 2, error: null, leaked: true },
      { type: 'test', index: 5, path: 'other.test.js', name: 'not in the plan', at, status: 'passed', checks: 1, error: null, leaked: false },
      { type: 'testsDone', finished: true, dropped: 0 }
    ], plan, true)
    expect(run.finished).toBe(true)
    expect(run.tests).toEqual([
      { path: 'prices.test.js', name: 'passes', line: 3, status: 'passed', checks: 0, message: null, failure: null, leaked: false },
      { path: 'prices.test.js', name: 'test 1', line: 3, status: 'failed', checks: 1, message: 'expect(received).toBe(expected)\n\nExpected: 2.4\nReceived: prices.js', failure: { path: 'prices.test.js', line: 4 }, leaked: false },
      { path: 'prices.test.js', name: 'throws', line: 3, status: 'failed', checks: 0, message: 'TypeError: line is undefined', failure: { path: 'prices.js', line: 2 }, leaked: false },
      { path: 'prices.test.js', name: 'endless', line: 3, status: 'unfinished', checks: 0, message: null, failure: null, leaked: false },
      { path: 'prices.test.js', name: 'left a loop running', line: 3, status: 'unfinished', checks: 2, message: null, failure: null, leaked: true }
    ])
    expect(run.files).toEqual([
      { path: 'empty.test.js', tests: 0, error: null, timeout: false, missing: false },
      { path: 'gone.test.js', tests: 0, error: 'Failed to load ./gone.js from gone.test.js: no such file.', timeout: false, missing: false },
      { path: 'prices.test.js', tests: 3, error: null, timeout: false, missing: false }
    ])
    expect(testSummary(run)).toEqual({ passed: 1, failed: 2, unfinished: 2, broken: 1 })
  })

  it('is not finished when the page gave up, the runner was stopped, or a file was never reached', () => {
    const all: BridgeMessage[] = [files, { type: 'testFile', path: 'prices.test.js', tests: 0, error: null, timeout: false }, { type: 'testFile', path: 'empty.test.js', tests: 0, error: null, timeout: false }]
    expect(readTestRun([...all, { type: 'testsDone', finished: true, dropped: 0 }], plan, true).finished).toBe(true)
    expect(readTestRun([...all, { type: 'testsDone', finished: true, dropped: 0 }], plan, false).finished).toBe(false)
    expect(readTestRun([...all, { type: 'testsDone', finished: false, dropped: 0 }], plan, true).finished).toBe(false)
    const unreached = readTestRun([files, { type: 'testFile', path: 'prices.test.js', tests: 0, error: null, timeout: false }, { type: 'testsDone', finished: true, dropped: 0 }], plan, true)
    expect(unreached.finished).toBe(false)
    expect(unreached.files.find(file => file.path === 'empty.test.js')).toMatchObject({ missing: true })
  })

  it('is finished when no test file could run at all: there was nothing to wait for', () => {
    const none = planTests({ 'split.test.js': 'import \'./split.js\'\n' })
    const run = readTestRun([], none, true)
    expect(run).toMatchObject({ finished: true, tests: [] })
    expect(testSummary(run)).toEqual({ passed: 0, failed: 0, unfinished: 0, broken: 1 })
  })

  it('names a file that did not load and one that never finished loading', () => {
    const run = readTestRun([
      files,
      { type: 'testFile', path: 'prices.test.js', tests: 0, error: { name: 'SyntaxError', message: `The requested module '${PRICES}' does not provide an export named 'lineTotal'`, stack: null }, timeout: false },
      { type: 'testFile', path: 'empty.test.js', tests: 0, error: null, timeout: true },
      { type: 'testsDone', finished: true, dropped: 0 }
    ], plan, true)
    expect(run.files.find(file => file.path === 'prices.test.js')!.error).toBe('SyntaxError: The requested module \'prices.js\' does not provide an export named \'lineTotal\'')
    expect(run.files.find(file => file.path === 'empty.test.js')).toMatchObject({ timeout: true, error: null })
    expect(testSummary(run).broken).toBe(3)
  })

  it('keeps at most the cap of tests, and says how many the runner left out', () => {
    const many: BridgeMessage[] = Array.from({ length: TEST_LIMITS.maxTests + 20 }, (_, index) => ({ type: 'test', index, path: 'prices.test.js', name: `t${index}`, at: '', status: 'passed', checks: 1, error: null, leaked: false }))
    const run = readTestRun([files, ...many, { type: 'testsDone', finished: true, dropped: 7 }], plan, true)
    expect(run.tests).toHaveLength(TEST_LIMITS.maxTests)
    expect(run.dropped).toBe(7)
    expect(run.tests[0]!.line).toBeNull()
  })
})
