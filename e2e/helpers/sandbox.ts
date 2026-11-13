// Runs a Debugging level's app the way the play page's check run does (a sealed srcdoc iframe with the bridge, one frame
// per width the probes ask for, a phone's first), in a real browser page, and reads its messages with the same pure code
// as the app (shared/levels/debugging). `record` runs it instrumented (chapter 5) and keeps the steps it posts; with
// `count` the instrumented code counts instead (chapter 6: `check` for a check run's work probes, `profile` for Record,
// whose profile is posted once the probes are done, as Stop would); `performance` watches the page and keeps the server's
// clock, like every load of a Performance level.
import type { Page } from '@playwright/test'
import { checkFrames, consoleEntry, mergeObservations, observe, readBridgeMessage, requestAddress, requestEntry, sandboxDocument, statusLabel, withResponse } from '../../shared/levels'
import type { BackendSpec, BridgeMessage, ConsoleEntryBody, LogsSpec, NetworkEntry, Observation, Probe, Profile, RecordedStep, ServerLogMessage } from '../../shared/levels'
import { checkFrameStyle } from '../../app/utils/sandbox-host'

export interface CheckResult {
  observation: Observation
  /** The Console lines of the run (as the Console panel would show them; the first frame's). */
  entries: ConsoleEntryBody[]
  /** The Network panel's rows of the run, by address: 'GET /api/menu 200' (the first frame's). */
  network: string[]
  /** The Network panel's entries themselves. */
  requests: NetworkEntry[]
  /** A recorded run's steps (the first frame's; none without `record`). */
  steps: RecordedStep[]
  /** A recorded profile (`count: 'profile'`; the first frame's), or null. */
  profile: Profile | null
  /** Chapter 7: the server's reports of what it answered (the first frame's). */
  serverLogs: ServerLogMessage[]
}

export interface RunOptions {
  /** The modules as instrumented (instrument.ts). */
  record?: Readonly<Record<string, string>>
  count?: 'check' | 'profile'
  performance?: boolean
  /** Chapter 7: the level's logs (request ids, the server's reports). */
  logs?: LogsSpec
}

async function runFrame(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], width: number, height: number, backend: BackendSpec | undefined, options: RunOptions): Promise<CheckResult> {
  const token = `t-${Math.random().toString(36).slice(2)}`
  const document = sandboxDocument(files, { token, probes, backend, record: options.record, count: options.count, performance: options.performance, logs: options.logs })
  const raw = await page.evaluate(async ({ html, style, token, profile }) => {
    const messages: unknown[] = []
    const frame = window.document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    Object.assign(frame.style, style)
    const seen = (type: string) => new Promise<void>((resolve) => {
      window.addEventListener('message', (event) => {
        if (event.source === frame.contentWindow && (event.data as { type?: string })?.type === type) resolve()
      })
    })
    window.addEventListener('message', (event) => {
      if (event.source === frame.contentWindow) messages.push(event.data)
    })
    const done = seen('done')
    const profiled = seen('profile')
    frame.srcdoc = html
    window.document.body.append(frame)
    await Promise.race([done, new Promise(resolve => setTimeout(resolve, 5000))])
    if (profile) {
      // Stop, as the Performance panel's button does: the profile comes once
      frame.contentWindow?.postMessage({ grindstone: token, type: 'recordStop' }, '*')
      await Promise.race([profiled, new Promise(resolve => setTimeout(resolve, 2000))])
    }
    frame.remove()
    return messages
  }, { html: document.html, style: checkFrameStyle(width, height), token, profile: options.count === 'profile' })
  const messages = raw.map(data => readBridgeMessage(data, token)).filter((message): message is BridgeMessage => message !== null)
  const urls = messages.find(message => message.type === 'files')
  const mapping = { urls: urls?.type === 'files' ? urls.urls : {}, bridgeLine: document.bridgeLine }
  let requests: NetworkEntry[] = []
  for (const message of messages) {
    if (message.type === 'request') requests.push(requestEntry(message, mapping))
    else if (message.type === 'response') requests = withResponse(requests, message)
  }
  const profile = messages.find(message => message.type === 'profile')
  return {
    observation: observe(messages, document.bridgeLine),
    entries: messages.map(message => consoleEntry(message, mapping)).filter((entry): entry is ConsoleEntryBody => entry !== null),
    network: requests.map(entry => `${entry.method} ${requestAddress(entry.url)} ${statusLabel(entry)}`),
    requests,
    steps: messages.flatMap(message => message.type === 'steps' ? message.steps : []),
    profile: profile?.type === 'profile' ? profile.profile : null,
    serverLogs: messages.filter((message): message is ServerLogMessage => message.type === 'serverlog')
  }
}

export async function runCheck(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], backend?: BackendSpec, options: RunOptions = {}): Promise<CheckResult> {
  const results: CheckResult[] = []
  for (const frame of checkFrames(probes)) results.push(await runFrame(page, files, frame.probes, frame.width, frame.height, backend, options))
  return { ...results[0]!, observation: mergeObservations(results.map(result => result.observation)) }
}
