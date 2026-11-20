// Runs a Debugging level's app the way the play page's check run does (a sealed srcdoc iframe with the bridge, one frame
// per width the probes ask for, a phone's first), in a real browser page, and reads its messages with the same pure code
// as the app (shared/levels/debugging). `record` runs it instrumented (chapter 5) and keeps the steps it posts; with
// `count` the instrumented code counts instead (chapter 6: `check` for a check run's work probes, `profile` for Record,
// whose profile is posted once the probes are done, as Stop would); `performance` watches the page and keeps the server's
// clock, like every load of a Performance level.
import type { Page } from '@playwright/test'
import { BRIDGE_HELLO, checkFrames, consoleEntry, loopFacts, mergeObservations, observe, readBridgeMessage, requestAddress, requestEntry, sandboxDocument, statusLabel, withResponse } from '../../shared/levels'
import type { BackendSpec, BridgeMessage, ConsoleEntryBody, LogsSpec, LoopEntry, NetworkEntry, Observation, Probe, Profile, RecordedStep, ServerLogMessage, ServerOutputMessage, WebSpec } from '../../shared/levels'
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
  /** Web fundamentals: the access lines of server.js ('OPTIONS /orders 200', the first frame's). */
  server: string[]
  /** Web fundamentals: every line server.js wrote (access lines, its console, errors). */
  serverOutput: ServerOutputMessage[]
  /** Web fundamentals: what each preflight asked in Access-Control-Request-Headers, in the order sent. */
  asks: string[]
  /** Web fundamentals (chapter 2): every cookie a request carried, 'METHOD address name', in the order sent. */
  sent: string[]
  /** The cookies in the jar once the run was over (names, the Application panel's order). */
  stored: string[]
  /** The names of the cookies the browser refused in the run (Set-Cookie lines and document.cookie writes). */
  refused: string[]
  /** The names a script on the page can read once the run was over. */
  readable: string[]
  /** Chapter 3: the keys the page's own origin keeps once the run was over ('local token', 'session draft'). */
  storage: string[]
  /** Chapter 3: every origin's storage once the run was over, 'local https://… key'. */
  areas: string[]
  /** Chapter 3: the thief's requests from outside the browser the Server panel shows, 'METHOD address status'. */
  replayed: string[]
  /** Chapter 4: the CDN's log once the run was over, 'who METHOD address OUTCOME' (the Application panel's Cache). */
  cdn: string[]
  /** Chapter 4: the browser's copies once the run was over, by address. */
  cached: string[]
  /** Chapter 5: the event loop's timeline (the Event loop panel's entries, in order; the first frame's). */
  loop: LoopEntry[]
  /** Chapter 5: what each frame painted of the watched elements, every item in order. */
  painted: string[]
  /** Chapter 5: each forced layout, by the read that forced it. */
  forced: string[]
  /** Chapter 5: each transition or animation that started, 'element property'. */
  animated: string[]
}

export interface RunOptions {
  /** The modules as instrumented (instrument.ts). */
  record?: Readonly<Record<string, string>>
  count?: 'check' | 'profile'
  performance?: boolean
  /** Chapter 7: the level's logs (request ids, the server's reports). */
  logs?: LogsSpec
  /** Web fundamentals: the API on another origin, answered by the level's server.js. */
  web?: WebSpec
  /** Web fundamentals: the page's path (document.cookie's URL). */
  page?: string
}

async function runFrame(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], width: number, height: number, backend: BackendSpec | undefined, options: RunOptions): Promise<CheckResult> {
  const token = `t-${Math.random().toString(36).slice(2)}`
  const document = sandboxDocument(files, { token, probes, backend, record: options.record, count: options.count, performance: options.performance, logs: options.logs, web: options.web, page: options.page })
  const raw = await page.evaluate(async ({ html, style, token, profile, hello }) => {
    const messages: unknown[] = []
    const frame = window.document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    Object.assign(frame.style, style)
    // as the page does (bridgeLink): the load's messages come over the port its bridge's first message hands over
    const waiting: { type: string, resolve: () => void }[] = []
    const seen = (type: string) => new Promise<void>(resolve => waiting.push({ type, resolve }))
    let toBridge: MessagePort | null = null
    const onHello = (event: MessageEvent) => {
      const data = event.data as { type?: unknown, token?: unknown } | null
      if (toBridge || event.source !== frame.contentWindow || data?.type !== hello || data.token !== token || event.ports.length !== 2) return
      const [up, down] = event.ports as [MessagePort, MessagePort]
      toBridge = down
      up.onmessage = (message: MessageEvent) => {
        messages.push(message.data)
        const type = (message.data as { type?: unknown } | null)?.type
        for (const each of waiting) if (each.type === type) each.resolve()
      }
    }
    window.addEventListener('message', onHello)
    const done = seen('done')
    const profiled = seen('profile')
    frame.srcdoc = html
    window.document.body.append(frame)
    await Promise.race([done, new Promise(resolve => setTimeout(resolve, 5000))])
    if (profile) {
      // Stop, as the Performance panel's button does: the profile comes once
      ;(toBridge as MessagePort | null)?.postMessage({ type: 'recordStop' })
      await Promise.race([profiled, new Promise(resolve => setTimeout(resolve, 2000))])
    }
    window.removeEventListener('message', onHello)
    frame.remove()
    return messages
  }, { html: document.html, style: checkFrameStyle(width, height), token, profile: options.count === 'profile', hello: BRIDGE_HELLO })
  const messages = raw.map(data => readBridgeMessage(data)).filter((message): message is BridgeMessage => message !== null)
  const urls = messages.find(message => message.type === 'files')
  const mapping = { urls: urls?.type === 'files' ? urls.urls : {}, bridgeLine: document.bridgeLine }
  let requests: NetworkEntry[] = []
  for (const message of messages) {
    if (message.type === 'request') requests.push(requestEntry(message, mapping))
    else if (message.type === 'response') requests = withResponse(requests, message)
  }
  const profile = messages.find(message => message.type === 'profile')
  const jar = messages.filter(message => message.type === 'cookies').at(-1)
  const kept = messages.filter(message => message.type === 'storage').at(-1)
  const caches = messages.filter(message => message.type === 'cache').at(-1)
  // the loop's entries come in order, each message from where the last one ended (as the panel appends them)
  const loop: LoopEntry[] = []
  for (const message of messages) if (message.type === 'loop' && message.from === loop.length) loop.push(...message.entries)
  const facts = loopFacts(loop)
  const pageOrigin = new URL(options.page ?? '/', 'https://cornerbakery.shop').origin
  return {
    observation: observe(messages, document.bridgeLine),
    entries: messages.map(message => consoleEntry(message, mapping)).filter((entry): entry is ConsoleEntryBody => entry !== null),
    network: requests.map(entry => `${entry.method} ${requestAddress(entry.url)} ${statusLabel(entry)}`),
    requests,
    steps: messages.flatMap(message => message.type === 'steps' ? message.steps : []),
    profile: profile?.type === 'profile' ? profile.profile : null,
    serverLogs: messages.filter((message): message is ServerLogMessage => message.type === 'serverlog'),
    server: messages.flatMap(message => message.type === 'server' && message.level === 'access' ? [message.text] : []),
    serverOutput: messages.filter((message): message is ServerOutputMessage => message.type === 'server'),
    asks: requests.flatMap(entry => entry.preflightFor === null ? [] : entry.requestHeaders.filter(([name]) => name === 'access-control-request-headers').map(([, value]) => value)),
    sent: requests.flatMap(entry => entry.cookies.filter(cookie => cookie.sent).map(cookie => `${entry.method} ${requestAddress(entry.url)} ${cookie.name}`)),
    stored: jar?.type === 'cookies' ? jar.jar.map(cookie => cookie.name) : [],
    refused: jar?.type === 'cookies' ? jar.refused.map(row => row.name) : [],
    readable: jar?.type === 'cookies' ? jar.readable : [],
    storage: kept?.type === 'storage' ? kept.areas.filter(area => area.origin === pageOrigin).flatMap(area => area.items.map(([key]) => `${area.kind} ${key}`)) : [],
    areas: kept?.type === 'storage' ? kept.areas.flatMap(area => area.items.map(([key]) => `${area.kind} ${area.origin} ${key}`)) : [],
    replayed: messages.flatMap(message => message.type === 'replay' ? [`${message.request} ${message.status ?? 'failed'}`] : []),
    cdn: caches?.type === 'cache' ? caches.log.map(line => `${line.who} ${line.method} ${line.url} ${line.outcome}`) : [],
    cached: caches?.type === 'cache' ? caches.browser.map(row => row.url) : [],
    loop,
    painted: facts.painted,
    forced: facts.forced,
    animated: facts.animated
  }
}

export async function runCheck(page: Page, files: Readonly<Record<string, string>>, probes: readonly Probe[], backend?: BackendSpec, options: RunOptions = {}): Promise<CheckResult> {
  const results: CheckResult[] = []
  for (const frame of checkFrames(probes)) results.push(await runFrame(page, files, frame.probes, frame.width, frame.height, backend, options))
  return { ...results[0]!, observation: mergeObservations(results.map(result => result.observation)) }
}
