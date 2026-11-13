// The page's side of the sealed frame (docs/features/ui.md, "Sandbox and bridge"): every load of a level's app gets a
// fresh token, and a reload's check run happens in a hidden frame of its own, so the probes' clicks never touch the app
// you see. What the frames post is read with the pure code in shared/levels/debugging (messages.ts).
import { observe, readBridgeMessage, sandboxDocument } from '../../shared/levels'
import type { BridgeMessage, Observation, Probe, SandboxDocument } from '../../shared/levels'

/** The only sandbox flag a level's app gets: scripts run, but in an opaque origin (no storage, no cookies, no parent). */
export const SANDBOX_FLAGS = 'allow-scripts'

/** A check run that has not finished by then (an endless loop, a hang) counts as not finished. */
export const CHECK_TIMEOUT_MS = 5000

/** A check run keeps at most this many of the app's logs and errors (the first ones; the rest are dropped). */
export const MAX_CHECK_MESSAGES = 1000

/** A token no other load shares, so messages from an older load (or anything else) are ignored. */
export function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** One load of the app you see: its document and the token its messages carry. */
export interface AppLoad extends SandboxDocument {
  token: string
  /** The files this load runs (to tell when saved changes are not running yet). */
  files: Readonly<Record<string, string>>
}

export function appLoad(files: Readonly<Record<string, string>>): AppLoad {
  const token = newToken()
  return { ...sandboxDocument(files, { token }), token, files }
}

/**
 * The check behind a reload: the files run in a hidden sealed frame, the level's probes click and read once the app has
 * loaded, and the frame's messages become what the goals read. Resolves when the bridge says it is done, or after the
 * timeout with `finished: false`.
 */
export function runCheck(files: Readonly<Record<string, string>>, probes: readonly Probe[], timeoutMs = CHECK_TIMEOUT_MS): Promise<Observation> {
  return new Promise((resolve) => {
    const token = newToken()
    const document_ = sandboxDocument(files, { token, probes })
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', SANDBOX_FLAGS)
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('inert', '')
    frame.tabIndex = -1
    // off screen but rendered, so the app lays out and its timers run as they would on screen
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '390px', height: '700px', border: '0' })
    const messages: BridgeMessage[] = []
    let appMessages = 0
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return
      const message = readBridgeMessage(event.data, token)
      if (!message) return
      // a flood of logs must not fill memory: the goals need the probes, done and that errors happened, not every line
      if ((message.type === 'console' || message.type === 'error') && ++appMessages > MAX_CHECK_MESSAGES) return
      messages.push(message)
      if (message.type === 'done') finish()
    }
    const timer = setTimeout(() => finish(), timeoutMs)
    function finish() {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      frame.remove()
      resolve(observe(messages, document_.bridgeLine))
    }
    window.addEventListener('message', onMessage)
    frame.srcdoc = document_.html
    document.body.append(frame)
  })
}
