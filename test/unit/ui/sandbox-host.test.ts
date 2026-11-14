import { afterEach, describe, expect, it } from 'vitest'
import { BRIDGE_HELLO } from '../../../shared/levels'
import type { BridgeMessage } from '../../../shared/levels'
import { MAX_WAITING_MESSAGES, bridgeLink, checkFrameStyle } from '../../../app/utils/sandbox-host'

// The hidden check frame (docs/features/ui.md, "Sandbox and bridge"): WebKit all but stops the timers of a cross-origin
// frame that is wholly outside the viewport, and a check run lives on timers (the fake backend's delays, the probes'
// waits), so the frame keeps one pixel column inside the viewport, transparent and never clickable.
describe('checkFrameStyle', () => {
  it('keeps one transparent, unclickable pixel column of the frame in the viewport, at its size', () => {
    expect(checkFrameStyle(390, 700)).toEqual({
      position: 'fixed',
      left: '-389px',
      top: '0px',
      width: '390px',
      height: '700px',
      border: '0px',
      opacity: '0',
      pointerEvents: 'none'
    })
    expect(checkFrameStyle(1024, 700)).toMatchObject({ left: '-1023px', width: '1024px' })
  })
})

// The page's end of a load's bridge: the bridge hands over two ports in its first message (with the load's token)
// before any of the app's code runs; the page reads the load from the first port only and talks to it over the second.
// Anything posted to the page's window (by the app's code, with a token it found or not) never counts.
describe('bridgeLink', () => {
  const token = 'tok-7'
  const frame = { name: 'the load\'s frame' } as unknown as Window
  const other = { name: 'another frame' } as unknown as Window
  const opened: MessagePort[] = []
  const channel = () => {
    const made = new MessageChannel()
    opened.push(made.port1, made.port2)
    return made
  }
  const windowMessage = (data: unknown, source: Window | null, ports: MessagePort[] = []) => ({ data, source, ports }) as unknown as MessageEvent
  const settle = () => new Promise(resolve => setTimeout(resolve, 20))
  /** A bridge: its hello's ports, and the ends it keeps (to post to the page, to read what the page sends). */
  const bridge = () => {
    const toPage = channel()
    const fromPage = channel()
    const toBridge: unknown[] = []
    fromPage.port1.onmessage = event => toBridge.push(event.data)
    return { ports: [toPage.port2, fromPage.port2], post: (message: unknown) => toPage.port1.postMessage(message), toBridge }
  }
  const forged = [{ type: 'probe', id: 'total', ok: true, value: '€9.00', error: null }, { type: 'done' }]

  afterEach(() => {
    for (const port of opened.splice(0)) port.close()
  })

  it('takes the first hello of its frame with its token, and reads the load from its port, in order', async () => {
    const got: BridgeMessage[] = []
    const link = bridgeLink(() => frame, token, message => got.push(message))
    const real = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, real.ports))
    real.post({ type: 'ready' })
    real.post({ type: 'probe', id: 'total', ok: true, value: '€12.00', error: null })
    real.post({ type: 'probe', id: 'x', ok: true, value: { html: '<b>' }, error: null })
    real.post({ type: 'done' })
    await settle()
    expect(got).toEqual([{ type: 'ready' }, { type: 'probe', id: 'total', ok: true, value: '€12.00', error: null }, { type: 'done' }])
    link.close()
  })

  it('never reads the load from the window: forged results, with or without the token, count for nothing', async () => {
    const got: BridgeMessage[] = []
    const link = bridgeLink(() => frame, token, message => got.push(message))
    for (const message of forged) {
      link.take(windowMessage(message, frame))
      link.take(windowMessage({ ...message, grindstone: token, token }, frame))
    }
    const real = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, real.ports))
    for (const message of forged) link.take(windowMessage({ ...message, grindstone: token }, frame))
    await settle()
    expect(got).toEqual([])
    link.close()
  })

  it('takes no hello but the first one of its own frame with its token and two ports', async () => {
    const got: BridgeMessage[] = []
    const link = bridgeLink(() => frame, token, message => got.push(message))
    const fake = bridge()
    // another frame, another load's token, no token, a missing port, no frame yet
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, other, fake.ports))
    link.take(windowMessage({ type: BRIDGE_HELLO, token: 'tok-6' }, frame, fake.ports))
    link.take(windowMessage({ type: BRIDGE_HELLO }, frame, fake.ports))
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, [fake.ports[0]!]))
    const nowhere = bridgeLink(() => null, token, message => got.push(message))
    nowhere.take(windowMessage({ type: BRIDGE_HELLO, token }, null, fake.ports))
    for (const message of forged) fake.post(message)
    await settle()
    expect(got).toEqual([])

    const real = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, real.ports))
    real.post({ type: 'ready' })
    await settle()
    expect(got).toEqual([{ type: 'ready' }])
    link.close()
    nowhere.close()
  })

  // The app reloads itself (location.reload(), a meta refresh): the same frame runs the bridge first again, which says
  // hello with the same token (the app can't read it: the bridge wipes its text). Its ports replace the dead ones, so the
  // Console and the other panels keep working; the old document's port counts for nothing any more.
  it('takes a later hello from its frame after the app reloaded itself, and drops the old ports', async () => {
    const got: BridgeMessage[] = []
    const link = bridgeLink(() => frame, token, message => got.push(message))
    const first = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, first.ports))
    first.post({ type: 'ready' })
    await settle()
    const reloaded = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, reloaded.ports))
    first.post({ type: 'done' })
    reloaded.post({ type: 'ready' })
    link.send({ type: 'eval', id: 1, code: '6*9' })
    await settle()
    expect(got).toEqual([{ type: 'ready' }, { type: 'ready' }])
    expect(reloaded.toBridge).toEqual([{ type: 'eval', id: 1, code: '6*9' }])
    expect(first.toBridge).toEqual([])
    link.close()
  })

  it('sends to the bridge over its port, keeping what was sent before the hello (up to a limit)', async () => {
    const link = bridgeLink(() => frame, token, () => {})
    link.send({ type: 'eval', id: 0, code: '1 + 1' })
    for (let i = 1; i <= MAX_WAITING_MESSAGES + 5; i++) link.send({ type: 'eval', id: i, code: 'x' })
    const real = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, real.ports))
    link.send({ type: 'dom' })
    await settle()
    expect(real.toBridge).toHaveLength(MAX_WAITING_MESSAGES + 1)
    expect(real.toBridge[0]).toEqual({ type: 'eval', id: 0, code: '1 + 1' })
    expect(real.toBridge.at(-1)).toEqual({ type: 'dom' })
    link.close()
  })

  it('is closed for good: nothing comes in or goes out of an old load', async () => {
    const got: BridgeMessage[] = []
    const link = bridgeLink(() => frame, token, message => got.push(message))
    const real = bridge()
    link.take(windowMessage({ type: BRIDGE_HELLO, token }, frame, real.ports))
    link.close()
    real.post({ type: 'done' })
    link.send({ type: 'eval', id: 1, code: 'x' })
    await settle()
    expect(got).toEqual([])
    expect(real.toBridge).toEqual([])
  })
})
