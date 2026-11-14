// The Tests panel's run on the page's side (ADR 0008, chapter 3; docs/features/ui.md "Working with AI play page"): a
// pull request's test files run in a hidden sealed frame of their own (test-sandbox.ts: the test bridge, the runner in
// a worker, the watchdog), read over the load's own port (`bridgeLink`, never the window's messages), then turned into
// the panel's results (`readTestRun`). The page gives up after TESTS_TIMEOUT_MS whatever the frame does.
import { TEST_LIMITS, planTests, readTestRun, testDocument } from '../../shared/levels'
import type { BridgeMessage, Files, TestRun } from '../../shared/levels'
import { SANDBOX_FLAGS, bridgeLink, checkFrameStyle, newToken } from './sandbox-host'

/** The page stops waiting for a run then: enough for every restart the frame's watchdog may make, and a margin. */
export const TESTS_TIMEOUT_MS = TEST_LIMITS.loadMs + (TEST_LIMITS.maxRestarts + 1) * (TEST_LIMITS.testMs + TEST_LIMITS.loadMs) + 2000

/** Messages a run keeps: the files, one per test file, one per test, the end (the frame's own cap, read again). */
const MAX_MESSAGES = TEST_LIMITS.maxTests * 2 + 50

export interface RunTestsOptions {
  /** Stops the run (a new run, the panel closing): it resolves at once with what came so far, not finished. */
  signal?: AbortSignal
  timeoutMs?: number
}

/** Runs the test files of a file set and resolves with their results; never rejects. */
export function runTests(files: Files, options: RunTestsOptions = {}): Promise<TestRun> {
  const plan = planTests(files)
  const { signal, timeoutMs = TESTS_TIMEOUT_MS } = options
  if (!plan.runnable.length || signal?.aborted) return Promise.resolve(readTestRun([], plan, !signal?.aborted))
  return new Promise((resolve) => {
    const token = newToken()
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', SANDBOX_FLAGS)
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('inert', '')
    frame.tabIndex = -1
    // out of sight but for one transparent pixel column, like a check run's frame: WebKit all but stops the timers of a
    // cross-origin frame wholly outside the viewport, and the watchdog lives on timers
    Object.assign(frame.style, checkFrameStyle(1, 1))
    const messages: BridgeMessage[] = []
    let ended = false
    const link = bridgeLink(() => frame.contentWindow, token, (message) => {
      if (messages.length >= MAX_MESSAGES) return
      messages.push(message)
      if (message.type === 'testsDone') finish(true)
    })
    const onMessage = (event: MessageEvent) => link.take(event)
    const onAbort = () => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)
    function finish(done: boolean) {
      if (ended) return
      ended = true
      clearTimeout(timer)
      link.close()
      window.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
      // removing the frame ends its worker too
      frame.remove()
      resolve(readTestRun(messages, plan, done))
    }
    window.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort)
    frame.srcdoc = testDocument(plan, token)
    document.body.append(frame)
  })
}
