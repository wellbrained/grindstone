// The Tests panel's run (ADR 0008, chapter 3; docs/features/levels.md "The Tests panel"): a pull request's test files
// (`*.test.js`) run in a sealed frame of their own, as Debugging's apps do, but with no page: the frame's only script is
// the test bridge. It hands the page its two ports first (the same hello and token as the app's bridge, so the page's
// `bridgeLink` reads it, and only it), makes a blob URL for every module the tests import (each after the ones it
// imports, its imports pointed at their URLs: a worker has no import map), and starts the runner (test-runner.ts) in a
// **worker**, so a test that never ends blocks neither the frame nor Grindstone's page. A **watchdog** gives each step
// TEST_LIMITS.testMs (a file's load loadMs): a test that has not reported by then is "did not finish", the worker is
// stopped and a fresh one goes on with the next test (a file that does not load is left out), at most maxRestarts
// times. The worker reports over a port only the bridge holds; the bridge passes on plain data, cut, over its own port
// to the page, which reads it with `readBridgeMessage` and `readTestRun` and shows it as text. Pure string work and
// result reading here: no DOM.
import { BRIDGE_HELLO, withFileNames } from '../debugging/messages'
import type { BridgeMessage, TestError } from '../debugging/messages'
import { resolveImport } from '../debugging/paths'
import { RELATIVE_IMPORT, SANDBOX_CSP } from '../debugging/sandbox'
import { mapFrames, parseStack } from '../debugging/trace'
import type { SourceMapping } from '../debugging/trace'
import type { SourceLine } from '../debugging/types'
import { TEST_LIMITS, TEST_WORKER_SOURCE } from './test-runner'
import type { Files } from './types'

/** A test file: `cart.test.js`. */
export const isTestFile = (path: string): boolean => /\.test\.js$/.test(path)

/** The test files of a file set, in path order. */
export const testFilesOf = (files: Files): string[] => Object.keys(files).filter(isTestFile).sort()

/**
 * The files a run of the pull request's tests uses on one side: its own files (This PR), or main's code with the pull
 * request's test files on top (main), so a test that passes there too is seen not to prove the change.
 */
export function testRunFiles(pr: { base: Files, head: Files }, side: 'head' | 'base'): Files {
  if (side === 'head') return pr.head
  const tests = Object.fromEntries(testFilesOf(pr.head).map(path => [path, pr.head[path]!]))
  return { ...Object.fromEntries(Object.entries(pr.base).filter(([path]) => !isTestFile(path))), ...tests }
}

/** Where a module's import of another file goes in the worker: replaced in the frame by that file's blob URL. */
export const modulePlaceholder = (path: string): string => `@@grindstone-module:${path}@@`

/** A test file that can't run, and why (as a test runner would say it). */
export interface TestFileProblem {
  path: string
  message: string
}

/** What a run of these files needs. */
export interface TestPlan {
  /** Every test file, in path order. */
  tests: string[]
  /** The test files that can run (their imports are all there, with no cycle). */
  runnable: string[]
  /** The modules they import, each after the ones it imports, relative imports pointed at `modulePlaceholder`s. */
  modules: [path: string, source: string][]
  /** Test files that can't run. */
  problems: TestFileProblem[]
}

/** The relative imports of a module: the files they name (resolved), and those that are not there. */
function importsOf(path: string, source: string, files: Files): { found: string[], missing: string[] } {
  const found: string[] = []
  const missing: string[] = []
  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const target = resolveImport(path, match[3]!)
    if (target !== null && Object.hasOwn(files, target)) found.push(target)
    else missing.push(match[3]!)
  }
  return { found, missing }
}

/** Points a module's relative imports of the files that are there at their placeholders (same lines). */
function withPlaceholders(path: string, source: string, files: Files): string {
  return source.replace(RELATIVE_IMPORT, (whole, lead: string, quote: string, specifier: string) => {
    const target = resolveImport(path, specifier)
    return target !== null && Object.hasOwn(files, target) ? `${lead}${quote}${modulePlaceholder(target)}${quote}` : whole
  })
}

/**
 * Which test files can run and the modules they need, in an order the frame can make blob URLs in (a module after the
 * ones it imports). A test file that imports, at any depth, a file that isn't there, or modules that import each other
 * in a circle, can't run: it gets a problem instead.
 */
export function planTests(files: Files): TestPlan {
  const tests = testFilesOf(files)
  const order: string[] = []
  const done = new Set<string>()
  const problems: TestFileProblem[] = []
  const runnable: string[] = []
  for (const test of tests) {
    const added: string[] = []
    const visiting: string[] = []
    let problem: string | null = null
    const visit = (path: string) => {
      if (problem !== null || done.has(path) || added.includes(path)) return
      if (visiting.includes(path)) {
        problem = `Modules import each other in a circle: ${[...visiting.slice(visiting.indexOf(path)), path].join(' → ')}. This runner can't load that.`
        return
      }
      visiting.push(path)
      const { found, missing } = importsOf(path, files[path]!, files)
      if (missing.length) {
        problem = `Failed to load ${missing[0]} from ${path}: no such file.`
        return
      }
      for (const target of found) visit(target)
      visiting.pop()
      if (problem === null) added.push(path)
    }
    visit(test)
    if (problem !== null) {
      problems.push({ path: test, message: problem })
      continue
    }
    runnable.push(test)
    for (const path of added) {
      done.add(path)
      order.push(path)
    }
  }
  return { tests, runnable, modules: order.map(path => [path, withPlaceholders(path, files[path]!, files)]), problems }
}

/**
 * The frame's script: the ports first, then the modules' blob URLs, then the worker with the watchdog. Every message to
 * the page is a fresh object of plain data, texts cut; the worker's messages are read field by field.
 */
const TEST_BRIDGE_SOURCE = String.raw`(function (config) {
  'use strict';
  var script = document.currentScript;
  try { script.textContent = ''; } catch (error) { /* nothing to take off */ }
  var toPage = new MessageChannel();
  var fromPage = new MessageChannel();
  var send = toPage.port1.postMessage.bind(toPage.port1);
  window.parent.postMessage({ type: '${BRIDGE_HELLO}', token: config.token }, '*', [toPage.port2, fromPage.port2]);
  var post = function (message) {
    try { send(message); } catch (error) { /* only plain data is posted */ }
  };
  var later = setTimeout;
  var stop = clearTimeout;
  var limits = config.limits;
  var text = function (value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; };
  var number = function (value) { return typeof value === 'number' && value >= 0 && value < 1e9 ? Math.floor(value) : 0; };
  var errorOf = function (value) {
    if (value === null || typeof value !== 'object') return null;
    return { name: typeof value.name === 'string' ? value.name.slice(0, 100) : null, message: text(value.message, limits.maxMessage), stack: typeof value.stack === 'string' ? value.stack.slice(0, limits.maxStack) : null };
  };

  /* The modules, each after the ones it imports: a blob URL each, its imports pointed at those made before it. */
  var urls = {};
  var names = {};
  var made = [];
  for (var m = 0; m < config.modules.length; m++) {
    var path = config.modules[m][0];
    var source = config.modules[m][1];
    for (var k = 0; k < made.length; k++) source = source.split('@@grindstone-module:' + made[k] + '@@').join(urls[made[k]]);
    var url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    urls[path] = url;
    names[url] = path;
    made.push(path);
  }
  post({ type: 'files', urls: names });
  var workerUrl = URL.createObjectURL(new Blob([config.worker], { type: 'text/javascript' }));

  var excluded = {};
  var filesSeen = {};
  var testsSeen = {};
  var posted = 0;
  var restarts = 0;
  var over = false;
  var postFile = function (path, count, error, timeout) {
    if (filesSeen[path]) return;
    filesSeen[path] = true;
    post({ type: 'testFile', path: path, tests: count, error: error, timeout: timeout });
  };
  var postTest = function (step, status, checks, error, leaked) {
    if (testsSeen[step.index] || posted >= limits.maxTests) return;
    testsSeen[step.index] = true;
    posted++;
    post({ type: 'test', index: step.index, path: step.file, name: step.name, at: step.at, status: status, checks: checks, error: error, leaked: leaked });
  };
  var finish = function (finished, dropped) {
    if (over) return;
    over = true;
    post({ type: 'testsDone', finished: finished, dropped: dropped });
  };

  var start = function (from) {
    var worker;
    try { worker = new Worker(workerUrl); } catch (error) { return finish(false, 0); }
    var channel = new MessageChannel();
    var timer = 0;
    var step = null;
    /* A test's result or a file's report, held until the worker says anything after it: then it got past that test
       (or file). A worker that falls silent after one, kept busy by something it started and left running (a timer or
       an un-awaited loop), is stopped, and that test (or file) did not finish; the run goes on after it. */
    var pending = null;
    var flush = function () {
      var held = pending;
      pending = null;
      if (!held) return;
      if (held.kind === 'test') postTest(held.step, held.status, held.checks, held.error, false);
      else postFile(held.path, held.count, held.error, false);
    };
    var ended = false;
    var end = function () {
      ended = true;
      stop(timer);
      channel.port1.onmessage = null;
      try { channel.port1.close(); } catch (error) { /* closed */ }
      worker.terminate();
    };
    var goOn = function (next) {
      if (++restarts > limits.maxRestarts) return finish(false, 0);
      start(next);
    };
    /* every message re-arms it: a step that says nothing for too long did not finish */
    var watch = function () {
      stop(timer);
      timer = later(function () {
        if (ended) return;
        end();
        if (step && step.kind === 'test') {
          postTest(step, 'unfinished', 0, null, false);
          goOn(step.index + 1);
        } else if (step && step.kind === 'load') {
          postFile(step.path, 0, null, true);
          excluded[step.path] = true;
          goOn(from);
        } else if (pending && pending.kind === 'test') {
          postTest(pending.step, pending.status === 'failed' ? 'failed' : 'unfinished', pending.checks, pending.error, true);
          goOn(pending.step.index + 1);
        } else if (pending && pending.kind === 'file') {
          postFile(pending.path, 0, null, true);
          excluded[pending.path] = true;
          goOn(from);
        } else {
          finish(false, 0);
        }
      }, (step && step.kind === 'test') || (pending && pending.kind === 'test') ? limits.testMs : limits.loadMs);
    };
    channel.port1.onmessage = function (event) {
      var data = event.data;
      if (ended || data === null || typeof data !== 'object') return;
      /* the worker got past what it reported last */
      flush();
      if (data.kind === 'loading') {
        step = { kind: 'load', path: text(data.path, 200) };
      } else if (data.kind === 'file') {
        pending = { kind: 'file', path: text(data.path, 200), count: number(data.count), error: errorOf(data.error) };
        step = null;
      } else if (data.kind === 'start') {
        step = { kind: 'test', index: number(data.index), file: text(data.file, 200), name: text(data.name, limits.maxName), at: text(data.at, limits.maxStack) };
      } else if (data.kind === 'test') {
        pending = {
          kind: 'test',
          step: { index: number(data.index), file: text(data.file, 200), name: text(data.name, limits.maxName), at: text(data.at, limits.maxStack) },
          status: data.ok === true ? 'passed' : 'failed',
          checks: number(data.checks),
          error: data.ok === true ? null : errorOf(data.error)
        };
        step = null;
      } else if (data.kind === 'done') {
        end();
        finish(true, number(data.dropped));
        return;
      }
      watch();
    };
    var files = [];
    for (var i = 0; i < config.tests.length; i++) if (!excluded[config.tests[i]]) files.push([config.tests[i], urls[config.tests[i]]]);
    watch();
    worker.postMessage({ files: files, from: from, limits: limits }, [channel.port2]);
  };
  if (config.tests.length) start(0);
  else finish(true, 0);
})`

/** The document of one test run: a policy and the test bridge with its config, nothing else. */
export function testDocument(plan: TestPlan, token: string): string {
  const config = JSON.stringify({ token, modules: plan.modules, tests: plan.runnable, limits: TEST_LIMITS, worker: TEST_WORKER_SOURCE }).replace(/</g, '\\u003c')
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><script>${TEST_BRIDGE_SOURCE}(${config});</script>`
}

/** How a test ended: passed, failed (a check failed or it threw), or did not finish (the watchdog stopped it). */
export type TestStatus = 'passed' | 'failed' | 'unfinished'

/** One test of a run, as the panel shows it. */
export interface TestCase {
  path: string
  name: string
  /** Where `test(…)` is in its file; null when the stack did not say. */
  line: number | null
  status: TestStatus
  /** How many matchers ran in it (0: it checked nothing). */
  checks: number
  /** Why it failed, as text (blob URLs named as files); null when it passed or did not finish. */
  message: string | null
  /** Where it failed: in its test file, else the first of the pull request's files on the stack. */
  failure: SourceLine | null
  /** It ended, but something it started (a timer, a loop it didn't await) kept running and was stopped. */
  leaked: boolean
}

/** A test file of a run: how many tests it has, or why it could not run. */
export interface TestFileRun {
  path: string
  tests: number
  /** Why it could not run (it did not load, or a problem of the plan); null when it ran. */
  error: string | null
  /** It did not finish loading (an endless loop at its top level). */
  timeout: boolean
  /** The run never got to it (it stopped first). */
  missing: boolean
}

export interface TestRun {
  /** Every test file reported, and the runner said it was done; false when the run was stopped or timed out. */
  finished: boolean
  files: TestFileRun[]
  tests: TestCase[]
  /** Tests left out over the cap. */
  dropped: number
}

const errorText = (error: TestError, mapping: SourceMapping) =>
  withFileNames(error.name === null || error.name === 'AssertionError' ? error.message : `${error.name}: ${error.message}`, mapping)

/**
 * What a run's messages say, test by test: only the plan's test files count (a message about another path is dropped),
 * each test once, at most TEST_LIMITS.maxTests, in the order they ran; stacks become lines of the pull request's files.
 */
export function readTestRun(messages: readonly BridgeMessage[], plan: TestPlan, finished: boolean): TestRun {
  let mapping: SourceMapping = { urls: {}, bridgeLine: -1 }
  const fileMessages = new Map<string, Extract<BridgeMessage, { type: 'testFile' }>>()
  const tests: TestCase[] = []
  const seen = new Set<number>()
  let done: Extract<BridgeMessage, { type: 'testsDone' }> | null = null
  for (const message of messages) {
    if (message.type === 'files') mapping = { urls: message.urls, bridgeLine: -1 }
    else if (message.type === 'testFile' && plan.runnable.includes(message.path) && !fileMessages.has(message.path)) fileMessages.set(message.path, message)
    else if (message.type === 'testsDone') done = message
    else if (message.type === 'test' && plan.runnable.includes(message.path) && !seen.has(message.index) && tests.length < TEST_LIMITS.maxTests) {
      seen.add(message.index)
      const own = mapFrames(parseStack(message.at), mapping).find(frame => frame.path === message.path)
      const frames = message.error?.stack ? mapFrames(parseStack(message.error.stack), mapping) : []
      const failure = frames.find(frame => frame.path === message.path) ?? frames[0] ?? null
      tests.push({
        path: message.path,
        name: message.name,
        line: own?.line ?? null,
        status: message.status,
        checks: message.checks,
        message: message.status === 'failed' && message.error ? errorText(message.error, mapping) : null,
        failure: message.status === 'failed' && failure ? { path: failure.path, line: failure.line } : null,
        leaked: message.leaked
      })
    }
  }
  const files = plan.tests.map((path): TestFileRun => {
    const problem = plan.problems.find(each => each.path === path)
    if (problem) return { path, tests: 0, error: problem.message, timeout: false, missing: false }
    const message = fileMessages.get(path)
    if (!message) return { path, tests: 0, error: null, timeout: false, missing: true }
    const error = message.timeout ? null : message.error ? errorText(message.error, mapping) : null
    return { path, tests: message.tests, error, timeout: message.timeout, missing: false }
  })
  // with no test file that can run there is nothing to wait for
  const complete = finished && (plan.runnable.length === 0 || (done !== null && done.finished && files.every(file => !file.missing)))
  return { finished: complete, files, tests, dropped: done?.dropped ?? 0 }
}

/** The run in numbers: tests passed, failed and not finished, and files that could not run. */
export function testSummary(run: TestRun): { passed: number, failed: number, unfinished: number, broken: number } {
  const count = (status: TestStatus) => run.tests.filter(test => test.status === status).length
  return { passed: count('passed'), failed: count('failed'), unfinished: count('unfinished'), broken: run.files.filter(file => file.error !== null || file.timeout).length }
}
