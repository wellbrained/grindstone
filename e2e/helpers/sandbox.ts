// Runs a Debugging level's app the way the play page's check run does (a sealed srcdoc iframe with the bridge), in a
// real browser page, and reads its messages with the same pure code as the app (shared/levels/debugging).
import type { Page } from '@playwright/test'
import { consoleEntry, observe, readBridgeMessage, requestEntry, sandboxDocument, statusLabel, withResponse } from '../../shared/levels'
import type { BackendSpec, BridgeMessage, ConsoleEntryBody, NetworkEntry, Observation, Probe } from '../../shared/levels'

export interface CheckResult {
  observation: Observation
  /** The Console lines of the run (as the Console panel would show them). */
  entries: ConsoleEntryBody[]
  /** The Network panel's rows of the run: 'GET /api/menu 200'. */
  network: string[]
  /** The Network panel's entries themselves. */
  requests: NetworkEntry[]
}

export async function runCheck(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], backend?: BackendSpec): Promise<CheckResult> {
  const token = `t-${Math.random().toString(36).slice(2)}`
  const document = sandboxDocument(files, { token, probes, backend })
  const raw = await page.evaluate(async ({ html }) => {
    const messages: unknown[] = []
    const frame = window.document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
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
  }, { html: document.html })
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
    network: requests.map(entry => `${entry.method} ${entry.name} ${statusLabel(entry)}`),
    requests
  }
}
