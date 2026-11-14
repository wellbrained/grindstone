// The page's side of the sealed frame (docs/features/ui.md, "Sandbox and bridge"): every load of a level's app gets a
// fresh token, and a reload's check run happens in a hidden frame of its own, so the probes' clicks never touch the app
// you see. Both get the level's scripted backend, each its own (a sequence of answers starts over with every load). A
// load talks to the page over the two ports its bridge hands over first (`bridgeLink`); what the frames post is read with
// the pure code in shared/levels/debugging (messages.ts).
import { checkFrames, isBridgeHello, mergeObservations, observe, readBridgeMessage, sandboxDocument, withUncounted } from '../../shared/levels'
import type { BackendSpec, BridgeMessage, CheckFrame, Instrumented, LogsSpec, Observation, Probe, SandboxDocument } from '../../shared/levels'

/** Messages to the bridge kept until it has said hello (Console input typed while the app loads); later ones are dropped. */
export const MAX_WAITING_MESSAGES = 100

/** The page's end of one load's bridge. */
export interface BridgeLink {
  /**
   * Every message the page's window gets: only a hello from the load's own frame with its token is taken, and its two
   * ports become the load's only way in and out (a later one, after the app reloaded itself, replaces them). Anything
   * else posted to the window (by the app's code, the Console, an older load) is ignored.
   */
  take: (event: MessageEvent) => void
  /** A message to the bridge (Console input, the Elements panel's requests, Stop); kept until the hello if it is early. */
  send: (message: Record<string, unknown>) => void
  /** The load's ports are closed; nothing more comes in or goes out. */
  close: () => void
}

/**
 * The link to one load's bridge: `frame` is where the load runs, `token` its token. The bridge creates the ports and
 * posts the hello before any of the app's code runs, so the first hello from that frame is the bridge's; the port to
 * the page then lives only in the bridge's closure. `onMessage` gets the well-formed messages of that port, in order.
 */
export function bridgeLink(frame: () => Window | null, token: string, onMessage: (message: BridgeMessage) => void): BridgeLink {
  let toPage: MessagePort | null = null
  let toBridge: MessagePort | null = null
  let closed = false
  let waiting: Record<string, unknown>[] = []
  return {
    take(event) {
      const source = frame()
      if (closed || !source || event.source !== source || !isBridgeHello(event.data, token)) return
      const [up, down] = event.ports
      if (event.ports.length !== 2 || !up || !down) return
      // A later hello with the same token comes from the same load's frame after the app reloaded itself
      // (location.reload(), a meta refresh): its bridge ran first again and wiped its text, so it is still the bridge.
      // The old document's ports died with it; the new ones take their place, so the panels keep working.
      if (toPage) toPage.onmessage = null
      toPage?.close()
      toBridge?.close()
      toPage = up
      toBridge = down
      up.onmessage = (message: MessageEvent) => {
        const read = readBridgeMessage(message.data)
        if (read && !closed) onMessage(read)
      }
      // the page only sends on this one: started, so whatever arrives on it is dropped rather than kept
      down.start()
      for (const message of waiting) down.postMessage(message)
      waiting = []
    },
    send(message) {
      if (closed) return
      if (toBridge) toBridge.postMessage(message)
      else if (waiting.length < MAX_WAITING_MESSAGES) waiting.push(message)
    },
    close() {
      closed = true
      waiting = []
      if (toPage) toPage.onmessage = null
      toPage?.close()
      toBridge?.close()
    }
  }
}

/** The only sandbox flag a level's app gets: scripts run, but in an opaque origin (no storage, no cookies, no parent). */
export const SANDBOX_FLAGS = 'allow-scripts'

/** A check run that has not finished by then (an endless loop, a hang) counts as not finished. */
export const CHECK_TIMEOUT_MS = 5000

/** A check run keeps at most this many of the app's logs and errors (the first ones; the rest are dropped). */
export const MAX_CHECK_MESSAGES = 1000

/**
 * Where a check run's frame sits: rendered at its size but out of sight, with one pixel column inside the viewport.
 * WebKit (Safari) all but stops the timers of a cross-origin frame wholly outside the viewport, and a check run lives on
 * timers (the fake backend's delays, the probes' waits); the column is transparent and never takes a click.
 */
export function checkFrameStyle(width: number, height: number): Record<string, string> {
  return { position: 'fixed', left: `${1 - width}px`, top: '0px', width: `${width}px`, height: `${height}px`, border: '0px', opacity: '0', pointerEvents: 'none' }
}

/** A token no other load shares: the page takes the ports of the bridge whose hello carries it (no older load's, nothing else's). */
export function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** One load of the app you see: its document and the token its bridge's hello carries. */
export interface AppLoad extends SandboxDocument {
  token: string
  /** The files this load runs (to tell when saved changes are not running yet). */
  files: Readonly<Record<string, string>>
  /** A recorded load: its code runs instrumented (Record). */
  recorded: boolean
}

/** How a load of the app you see runs. */
export interface LoadOptions {
  /** The level's scripted backend: its requests feed the Network panel. */
  backend?: BackendSpec
  /** The Elements panel's inspector. */
  elements?: boolean
  /** The modules as instrumented for a recorded load (Record, chapters 5 and 6). */
  record?: Readonly<Record<string, string>>
  /** Chapter 6's Record: the instrumented code counts (the profile), the page's changes and the server's clock are kept. */
  profile?: boolean
  /** Chapter 7: the server's logs (its requests get ids, and it says what it answered). */
  logs?: LogsSpec
}

/** A load of the app you see. */
export function appLoad(files: Readonly<Record<string, string>>, options: LoadOptions = {}): AppLoad {
  const token = newToken()
  const { backend, elements, record, profile, logs } = options
  const document_ = sandboxDocument(files, { token, backend, elements, record, logs, ...(profile && record ? { count: 'profile' as const, performance: true } : {}) })
  return { ...document_, token, files, recorded: record !== undefined }
}

/** What a check run needs besides the files and probes. */
export interface CheckOptions {
  /** The level's scripted backend (a fresh one per frame). */
  backend?: BackendSpec
  /** A Performance level (chapter 6): the page's changes are watched and the server's clock kept. */
  performance?: boolean
  /** The files instrumented to count, when a probe reads the work (chapter 6); a file it skipped leaves those probes without a value. */
  counted?: Instrumented
  /** Chapter 7: the server's logs (its answers carry request ids, which an app may show). */
  logs?: LogsSpec
  timeoutMs?: number
}

/**
 * The check behind a reload: the files run in a hidden sealed frame, the level's probes click and read once the app has
 * loaded, and the frame's messages become what the goals read. Probes that ask for another width (a laptop) run in a
 * frame of that width after it (checkFrames); their observations are put together. Resolves when every frame is done
 * (each one when the bridge says so, or after the timeout with `finished: false`).
 */
export async function runCheck(files: Readonly<Record<string, string>>, probes: readonly Probe[], options: CheckOptions = {}): Promise<Observation> {
  const observations: Observation[] = []
  for (const frame of checkFrames(probes)) observations.push(await runFrame(files, frame, options))
  const merged = mergeObservations(observations)
  return options.counted ? withUncounted(merged, probes, options.counted.skipped) : merged
}

/** One frame of a check run, at its width. */
function runFrame(files: Readonly<Record<string, string>>, { width, height, probes }: CheckFrame, options: CheckOptions): Promise<Observation> {
  const { backend, performance, counted, logs, timeoutMs = CHECK_TIMEOUT_MS } = options
  return new Promise((resolve) => {
    const token = newToken()
    const document_ = sandboxDocument(files, { token, probes, backend, performance, logs, ...(counted ? { record: counted.modules, count: 'check' as const } : {}) })
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', SANDBOX_FLAGS)
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('inert', '')
    frame.tabIndex = -1
    // out of sight but rendered, so the app lays out and its timers run as they would on screen
    Object.assign(frame.style, checkFrameStyle(width, height))
    // the check frame never keeps the keyboard: should anything in it take the focus (Firefox lets a script in a sealed,
    // inert frame do that; the page's window blurs and ends up with nothing focused), it goes straight back to where it
    // was. Focus that moved somewhere real (the app you see, another window) is left alone.
    let lastFocused: Element | null = document.activeElement
    const onFocusIn = (event: FocusEvent) => {
      if (event.target !== frame) lastFocused = event.target as Element
    }
    const giveBack = () => {
      const active = document.activeElement
      if (active !== frame && active !== document.body && active !== null) return
      if ((lastFocused instanceof HTMLElement || lastFocused instanceof SVGElement) && lastFocused.isConnected) lastFocused.focus({ preventScroll: true })
    }
    const onBlur = () => setTimeout(giveBack, 0)
    const messages: BridgeMessage[] = []
    let appMessages = 0
    // the goals read only what comes over this load's port: the app's code can't post there
    const link = bridgeLink(() => frame.contentWindow, token, (message) => {
      // the goals read no requests (probes count them inside the frame): only the app you see shows them
      if (message.type === 'request' || message.type === 'response' || message.type === 'serverlog') return
      // a flood of logs must not fill memory: the goals need the probes, done and that errors happened, not every line
      if ((message.type === 'console' || message.type === 'error' || message.type === 'netlog') && ++appMessages > MAX_CHECK_MESSAGES) return
      messages.push(message)
      if (message.type === 'done') finish()
    })
    const onMessage = (event: MessageEvent) => link.take(event)
    const timer = setTimeout(() => finish(), timeoutMs)
    function finish() {
      clearTimeout(timer)
      link.close()
      window.removeEventListener('message', onMessage)
      document.removeEventListener('focusin', onFocusIn, true)
      window.removeEventListener('blur', onBlur)
      frame.remove()
      resolve(observe(messages, document_.bridgeLine))
    }
    window.addEventListener('message', onMessage)
    document.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('blur', onBlur)
    frame.addEventListener('focus', giveBack)
    frame.srcdoc = document_.html
    document.body.append(frame)
  })
}
