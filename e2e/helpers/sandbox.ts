// Runs a Debugging level's app the way the play page's check run does (a sealed srcdoc iframe with the bridge, one frame
// per width the probes ask for, a phone's first), in a real browser page, and reads its messages with the same pure code
// as the app (shared/levels/debugging). `record` runs it instrumented (chapter 5) and keeps the steps it posts.
import type { Page } from '@playwright/test'
import { checkFrames, consoleEntry, mergeObservations, observe, readBridgeMessage, requestAddress, requestEntry, sandboxDocument, statusLabel, withResponse } from '../../shared/levels'
import type { BackendSpec, BridgeMessage, ConsoleEntryBody, NetworkEntry, Observation, Probe, RecordedStep } from '../../shared/levels'
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
}

async function runFrame(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], width: number, height: number, backend?: BackendSpec, record?: Readonly<Record<string, string>>): Promise<CheckResult> {
  const token = `t-${Math.random().toString(36).slice(2)}`
  const document = sandboxDocument(files, { token, probes, backend, record })
  const raw = await page.evaluate(async ({ html, style }) => {
    const messages: unknown[] = []
    const frame = window.document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    Object.assign(frame.style, style)
    const done = new Promise<void>((resolve) => {
      window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow) return
        messages.push(event.data)
        if ((event.data as { type?: string })?.type === 'done') resolve()
      })
    })
    frame.srcdoc = html
    window.document.body.append(frame)
    await Promise.race([done, new Promise(resolve => setTimeout(resolve, 5000))])
    frame.remove()
    return messages
  }, { html: document.html, style: checkFrameStyle(width, height) })
  const messages = raw.map(data => readBridgeMessage(data, token)).filter((message): message is BridgeMessage => message !== null)
  const urls = messages.find(message => message.type === 'files')
  const mapping = { urls: urls?.type === 'files' ? urls.urls : {}, bridgeLine: document.bridgeLine }
  let requests: NetworkEntry[] = []
  for (const message of messages) {
    if (message.type === 'request') requests.push(requestEntry(message, mapping))
    else if (message.type === 'response') requests = withResponse(requests, message)
  }
  return {
    observation: observe(messages, document.bridgeLine),
    entries: messages.map(message => consoleEntry(message, mapping)).filter((entry): entry is ConsoleEntryBody => entry !== null),
    network: requests.map(entry => `${entry.method} ${requestAddress(entry.url)} ${statusLabel(entry)}`),
    requests,
    steps: messages.flatMap(message => message.type === 'steps' ? message.steps : [])
  }
}

export async function runCheck(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], backend?: BackendSpec, record?: Readonly<Record<string, string>>): Promise<CheckResult> {
  const results: CheckResult[] = []
  for (const frame of checkFrames(probes)) results.push(await runFrame(page, files, frame.probes, frame.width, frame.height, backend, record))
  return { ...results[0]!, observation: mergeObservations(results.map(result => result.observation)) }
}
