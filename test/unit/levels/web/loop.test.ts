import { describe, expect, it } from 'vitest'
import { LOOP_LIMITS, LOOP_SOURCE, loopConfig, loopFacts } from '../../../../shared/levels/web/loop'
import type { LoopEntry } from '../../../../shared/levels/web/loop'

// The event loop model (ADR 0009, chapter 5) on Node, with a window that has no DOM: the scheduler itself, beside the
// HTML standard's event loop and timer text. Each unit of work runs in a macrotask of its own (as each listener of the
// frame's private port does), so Node's microtask checkpoint after it stands in for the browser's. What needs a DOM
// (frames' snapshots, forced layouts, transitions, a tap's path) runs in e2e/web-event-loop.spec.ts and
// e2e/web-levels.spec.ts in three browsers.

interface Loop {
  install: () => void
  start: (then: () => void) => void
  tap: (element: unknown, then: () => void) => void
  wait: (ms: number, then: () => void) => void
  settle: (then: () => void) => void
  mark: () => unknown
  painted: (start: string, mark: unknown) => number
  forced: (mark: unknown) => number
  logged: (level: string, text: string) => void
  now: () => number
}

type FakeWindow = Record<string, unknown> & { performance: { now: () => number }, Date: DateConstructor }

const create = new Function(`return ${LOOP_SOURCE}`)() as (config: unknown, hooks: unknown) => Loop

/** Node has no MouseEvent: an Event that takes a mouse event's init does. */
class FakeMouseEvent extends Event {}
/** The window's Event: Node's own, but its prototype the model may add to (a timeStamp on the scripted clock) is this one. */
class FakeEvent extends Event {}

/** The loop on a window without a DOM; `log` is the page's console.log (each line with its phase). */
function setup(options: { check?: boolean, hit?: (element: unknown) => unknown } = {}) {
  const posted: { type: string, from: number, entries: LoopEntry[] }[] = []
  const errors: unknown[] = []
  class Target extends EventTarget {}
  class FakeDate extends Date {}
  function FakePerformance() {}
  // the window is an event target itself, as a browser's is
  const win = Object.assign(new Target(), {
    setTimeout,
    clearTimeout,
    MessageChannel,
    EventTarget: Target,
    Event: FakeEvent,
    MessageEvent,
    MouseEvent: FakeMouseEvent,
    structuredClone,
    eval: (code: string) => (0, eval)(code),
    Date: FakeDate as unknown as DateConstructor,
    Performance: FakePerformance,
    performance: Object.create(FakePerformance.prototype) as { now: () => number }
  }) as unknown as FakeWindow
  const loop = create(loopConfig({ watch: [] }, 'scriptDone'), {
    win,
    post: (message: { type: string, from: number, entries: LoopEntry[] }) => posted.push(message),
    check: options.check ?? true,
    describe: () => 'an element',
    squash: (text: string) => text,
    hit: options.hit ?? (() => null),
    batch: (count: number, unit: (index: number) => void) => {
      for (let i = 0; i < count; i++) {
        setImmediate(() => {
          try {
            unit(i)
          } catch (error) {
            errors.push(error)
          }
        })
      }
    }
  })
  loop.install()
  const lines: string[] = []
  const log = (text: string) => {
    lines.push(text)
    loop.logged('log', text)
  }
  /** Every entry posted so far. */
  const entries = () => posted.flatMap(message => message.entries)
  const call = <T>(name: string, ...args: unknown[]) => (win[name] as (...rest: unknown[]) => T)(...args)
  /** The script is over (the page's module called the marker), its microtasks run, then the load: the loop starts. */
  const load = async () => {
    call('scriptDone')
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise<void>(resolve => loop.start(resolve))
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  const run = (step: (then: () => void) => void) => new Promise<void>(resolve => step(resolve)).then(() => new Promise(resolve => setTimeout(resolve, 0)))
  return { loop, win, lines, log, entries, call, load, run, errors, Target }
}

describe('the event loop model: tasks, microtasks and frames', () => {
  it('runs the script, then its microtasks, then a 0 ms timer, then a frame\'s callbacks (the classic order)', async () => {
    const page = setup()
    page.log('Script start')
    page.call('setTimeout', () => page.log('Timeout'), 0)
    page.call('requestAnimationFrame', () => page.log('Frame'))
    Promise.resolve().then(() => page.log('Promise'))
    queueMicrotask(() => page.log('Microtask'))
    page.log('Script end')
    await page.load()
    expect(page.lines).toEqual(['Script start', 'Script end', 'Promise', 'Microtask', 'Timeout', 'Frame'])
    const logs = page.entries().filter(entry => entry.kind === 'log').map(entry => `${entry.text} ${entry.source}`)
    expect(logs).toEqual(['Script start sync', 'Script end sync', 'Promise microtask', 'Microtask microtask', 'Timeout sync', 'Frame sync'])
    const kinds = page.entries().filter(entry => entry.kind !== 'log').map(entry => `${entry.kind} ${entry.text}`)
    expect(kinds).toEqual(['task script', 'task setTimeout(…, 0)', 'callback requestAnimationFrame(…)', 'render '])
    // the timer at once, the frame at 16 ms
    const render = page.entries().find(entry => entry.kind === 'render')!
    // painted after its callback (each unit takes 10 µs)
    expect(render.at).toBe(16.01)
    expect(render.count).toBe(1)
  })

  it('clamps a timer nested more than five deep to 4 ms, as the HTML standard does: 100 nested 0 ms timers take about 400 ms', async () => {
    const page = setup()
    let ticks = 0
    const tick = () => {
      ticks += 1
      if (ticks < 100) page.call('setTimeout', tick, 0)
    }
    page.call('setTimeout', tick, 0)
    await page.load()
    await page.run(then => page.loop.wait(600, then))
    expect(ticks).toBe(100)
    const timers = page.entries().filter(entry => entry.kind === 'task' && entry.source === 'timeout')
    expect(timers).toHaveLength(100)
    // the first six run at once (nesting levels 1 to 6), the seventh is the first set from a level above 5
    expect(timers.slice(0, 7).map(timer => timer.clamped)).toEqual([false, false, false, false, false, false, true])
    expect(Math.round(timers[5]!.at)).toBe(0)
    expect(Math.round(timers[6]!.at)).toBe(4)
    // 94 clamped waits of 4 ms, and 10 µs for each of the 100 tasks
    expect(Math.round(timers[99]!.at)).toBe(377)
  })

  it('clamps an interval after five runs too, and stops it on clearInterval', async () => {
    const page = setup()
    let runs = 0
    const id = page.call<number>('setInterval', () => {
      runs += 1
      if (runs === 8) page.call('clearInterval', id)
    }, 0)
    await page.load()
    const runsAt = page.entries().filter(entry => entry.source === 'interval').map(entry => Math.round(entry.at))
    expect(runsAt).toEqual([0, 0, 0, 0, 0, 0, 4, 8])
    expect(runs).toBe(8)
  })

  it('reads a timeout as a long: fractions dropped, a negative or NaN is 0; clearTimeout cancels; arguments are passed', async () => {
    const page = setup()
    page.call('setTimeout', (a: string, b: string) => page.log(`late ${a}${b}`), 20.9, 'x', 'y')
    page.call('setTimeout', () => page.log('negative'), -5)
    page.call('setTimeout', () => page.log('nan'), Number.NaN)
    const gone = page.call<number>('setTimeout', () => page.log('cancelled'), 1)
    page.call('clearTimeout', gone)
    await page.load()
    expect(page.lines).toEqual(['negative', 'nan', 'late xy'])
    expect(page.entries().filter(entry => entry.source === 'timeout').map(entry => entry.count)).toEqual([0, 0, 20])
  })

  it('paints a frame only when one is needed, every 16 ms; a callback asked for in a frame waits for the next', async () => {
    const page = setup()
    page.call('requestAnimationFrame', (time: number) => {
      page.log(`frame 1 at ${time}`)
      page.call('requestAnimationFrame', (next: number) => page.log(`frame 2 at ${next}`))
    })
    await page.load()
    expect(page.lines).toEqual(['frame 1 at 16', 'frame 2 at 32'])
    // nothing more to paint: the third frame never comes
    await page.run(then => page.loop.wait(200, then))
    expect(page.entries().filter(entry => entry.kind === 'render').map(entry => entry.count)).toEqual([1, 2])
  })

  it('delays the frame behind a long task: the clock moves as the code reads it (a busy wait), and a frame comes only after', async () => {
    const page = setup()
    page.call('requestAnimationFrame', () => page.log(`frame at ${Math.round(page.win.performance.now())}`))
    page.call('setTimeout', () => {
      const end = page.win.performance.now() + 900
      while (page.win.performance.now() < end) { /* busy */ }
      page.log('work done')
    }, 0)
    await page.load()
    expect(page.lines).toEqual(['work done', 'frame at 900'])
    // the page's Date tells the same clock, from Tuesday 17 November 2026, 09:41
    expect(new page.win.Date().toISOString()).toMatch(/^2026-11-17T09:41:00\.9\d\dZ$/)
  })

  it('runs a message as a task: before a later timer, after the microtasks; a port starts with onmessage or start()', async () => {
    const page = setup()
    const Channel = page.win.MessageChannel as unknown as typeof MessageChannel
    const channel = new Channel()
    channel.port2.onmessage = event => page.log(`message ${String(event.data)}`)
    page.call('setTimeout', () => page.log('timeout 1 ms'), 1)
    channel.port1.postMessage('hello')
    Promise.resolve().then(() => page.log('microtask'))
    const quiet = new Channel()
    quiet.port2.addEventListener('message', event => page.log(`late ${String((event as MessageEvent).data)}`))
    quiet.port1.postMessage('queued')
    await page.load()
    expect(page.lines).toEqual(['microtask', 'message hello', 'timeout 1 ms'])
    quiet.port2.start()
    await page.run(then => page.loop.wait(10, then))
    expect(page.lines.at(-1)).toBe('late queued')
    // the message is cloned: a function can't be sent
    expect(() => channel.port1.postMessage(() => 1)).toThrow()
  })

  it('gives every listener of a message its own microtask checkpoint, as for any event the browser dispatches', async () => {
    const page = setup()
    const Channel = page.win.MessageChannel as unknown as typeof MessageChannel
    const channel = new Channel()
    for (const n of [1, 2]) {
      channel.port2.addEventListener('message', () => {
        Promise.resolve().then(() => page.log(`microtask ${n}`))
        page.log(`listener ${n}`)
      })
    }
    channel.port2.start()
    channel.port1.postMessage(0)
    await page.load()
    expect(page.lines).toEqual(['listener 1', 'microtask 1', 'listener 2', 'microtask 2'])
  })

  it('dispatches a customer\'s tap listener by listener (a checkpoint after each), and a script\'s dispatchEvent all at once', async () => {
    const page = setup({ hit: element => [element, 1, 1] })
    // the listeners go through the page's addEventListener (the model's)
    const node = new page.Target()
    for (const n of [1, 2]) {
      node.addEventListener('click', () => {
        Promise.resolve().then(() => page.log(`microtask ${n}`))
        page.log(`listener ${n}`)
      })
    }
    await page.load()
    await page.run(then => page.loop.tap(node, then))
    expect(page.lines).toEqual(['listener 1', 'microtask 1', 'listener 2', 'microtask 2'])
    page.lines.length = 0
    node.dispatchEvent(new Event('click'))
    await Promise.resolve()
    expect(page.lines).toEqual(['listener 1', 'listener 2', 'microtask 1', 'microtask 2'])
  })

  it('takes a listener added during a tap to an object the event has not reached yet, as the DOM does', async () => {
    const page = setup({ hit: element => [element, 1, 1] })
    const node = new page.Target()
    node.addEventListener('click', () => {
      page.log('first')
      node.addEventListener('click', () => page.log('added during the dispatch'))
    })
    await page.load()
    await page.run(then => page.loop.tap(node, then))
    // the same object's list was already taken: the new one waits for the next tap
    expect(page.lines).toEqual(['first'])
    await page.run(then => page.loop.tap(node, then))
    expect(page.lines).toEqual(['first', 'first', 'added during the dispatch'])
  })

  it('honours once, removeEventListener and stopImmediatePropagation in a tap', async () => {
    const page = setup({ hit: element => [element, 1, 1] })
    const node = new page.Target()
    const removed = () => page.log('removed')
    node.addEventListener('click', () => page.log('once'), { once: true })
    node.addEventListener('click', (event) => {
      page.log('stops')
      node.removeEventListener('click', removed)
      if (page.lines.length > 3) event.stopImmediatePropagation()
    })
    node.addEventListener('click', removed)
    node.addEventListener('click', () => page.log('last'))
    await page.load()
    await page.run(then => page.loop.tap(node, then))
    await page.run(then => page.loop.tap(node, then))
    expect(page.lines).toEqual(['once', 'stops', 'last', 'stops'])
  })

  it('a tap comes 5 ms after a frame, so a 0 ms timer it sets runs before the next frame', async () => {
    const page = setup({ hit: element => [element, 1, 1] })
    const node = new page.Target()
    node.addEventListener('click', () => {
      page.call('requestAnimationFrame', () => page.log('frame'))
      page.call('setTimeout', () => page.log('timeout'), 0)
    })
    await page.load()
    await page.run(then => page.loop.tap(node, then))
    expect(page.lines).toEqual(['timeout', 'frame'])
    const tap = page.entries().find(entry => entry.source === 'tap')!
    expect(tap.at % 16).toBeCloseTo(5, 1)
  })

  it('in a check run, moves the clock only while a probe drives it: wait stops at its time', async () => {
    const page = setup()
    page.call('setTimeout', () => page.log('at 300'), 300)
    page.call('setTimeout', () => page.log('at 1400'), 1400)
    page.call('setTimeout', () => page.log('at 3000'), 3000)
    // the load runs until the page is quiet, at most a second
    await page.load()
    expect(page.lines).toEqual(['at 300'])
    expect(Math.round(page.loop.now() / 1000)).toBe(1000)
    await page.run(then => page.loop.wait(500, then))
    expect(page.lines).toEqual(['at 300', 'at 1400'])
    expect(Math.round(page.loop.now() / 1000)).toBe(1500)
    await page.run(then => page.loop.settle(then))
    expect(page.lines).toEqual(['at 300', 'at 1400', 'at 3000'])
  })

  it('stops after 20,000 units when something keeps queueing work, and says so', async () => {
    const page = setup()
    const Channel = page.win.MessageChannel as unknown as typeof MessageChannel
    const channel = new Channel()
    channel.port2.onmessage = () => channel.port1.postMessage(0)
    channel.port1.postMessage(0)
    await page.load()
    // the panel's entries ran out first; the stop is said anyway
    expect(page.entries().filter(entry => entry.kind === 'note').map(entry => entry.source)).toEqual(['entries', 'units'])
    const note = page.entries().at(-1)!
    expect(note.count).toBe(LOOP_LIMITS.units + 1)
  }, 20_000)

  it('goes on after a callback throws (the browser reports it), and keeps its entries capped', async () => {
    const page = setup()
    page.call('setTimeout', () => {
      throw new Error('boom')
    }, 0)
    page.call('setTimeout', () => page.log('after'), 0)
    await page.load()
    expect(page.lines).toEqual(['after'])
    expect(page.errors).toHaveLength(1)
  })
})

describe('the event loop model: the review of 2026-11-19', () => {
  it('takes the window for a bare addEventListener and removeEventListener, as the browser does (no this)', async () => {
    const page = setup()
    let heard = 0
    const listener = () => {
      heard += 1
    }
    const add = page.win.addEventListener as unknown as (type: string, fn: () => void) => void
    const remove = page.win.removeEventListener as unknown as (type: string, fn: () => void) => void
    expect(() => add('ping', listener)).not.toThrow()
    ;(page.win as unknown as EventTarget).dispatchEvent(new Event('ping'))
    expect(heard).toBe(1)
    remove('ping', listener)
    ;(page.win as unknown as EventTarget).dispatchEvent(new Event('ping'))
    expect(heard).toBe(1)
  })

  it('runs an event handler where it was first set among the listeners, keeps its place when replaced, drops it when null', async () => {
    const page = setup()
    const Channel = page.win.MessageChannel as unknown as typeof MessageChannel
    const channel = new Channel()
    channel.port2.addEventListener('message', () => page.log('listener A'))
    channel.port2.onmessage = () => page.log('first handler')
    channel.port2.addEventListener('message', () => page.log('listener B'))
    channel.port2.onmessage = () => page.log('handler')
    channel.port1.postMessage(0)
    await page.load()
    expect(page.lines).toEqual(['listener A', 'handler', 'listener B'])
    channel.port2.onmessage = null
    channel.port1.postMessage(0)
    await page.run(then => page.loop.wait(10, then))
    expect(page.lines.slice(3)).toEqual(['listener A', 'listener B'])
  })

  it('stops when more than 2,000 tasks wait at once, and drops cancelled ones before counting', async () => {
    const page = setup()
    for (let i = 0; i < 3000; i++) page.call('clearTimeout', page.call<number>('setTimeout', () => {}, 100_000))
    expect(page.entries().some(entry => entry.kind === 'note')).toBe(false)
    for (let i = 0; i < 2100; i++) page.call('setTimeout', () => {}, 100_000)
    await page.load()
    expect(page.entries().filter(entry => entry.kind === 'note').map(entry => entry.source)).toEqual(['tasks'])
  })
})

describe('the loop\'s facts and its config', () => {
  it('reads what a run painted, forced and started from its entries', () => {
    const entry = (kind: LoopEntry['kind'], extra: Partial<LoopEntry> = {}): LoopEntry => ({ kind, at: 0, source: '', text: '', target: '', count: 0, clamped: false, painted: [], started: [], stack: null, ...extra })
    const facts = loopFacts([entry('render', { painted: ['spinner'], started: ['p.toast opacity'] }), entry('layout', { text: 'offsetHeight', count: 3 }), entry('render', { painted: ['status: Done'] })])
    expect(facts).toEqual({ painted: ['spinner', 'status: Done'], forced: ['offsetHeight', 'offsetHeight', 'offsetHeight'], animated: ['p.toast opacity'], frames: 2 })
  })

  it('checks a level\'s watched elements', () => {
    expect(() => loopConfig({ watch: [{ selector: '#a', name: 'A' }] }, null)).toThrow()
    expect(() => loopConfig({ watch: [{ selector: '#a', name: 'a' }, { selector: '#b', name: 'a' }] }, null)).toThrow()
    // every match is followed for its opacity only
    expect(() => loopConfig({ watch: [{ selector: '.t', name: 't', all: true }] }, null)).toThrow()
    expect(() => loopConfig({ watch: [{ selector: '.t', name: 't', all: true, opacity: true, text: true }] }, null)).toThrow()
    expect(loopConfig({ watch: [{ selector: '#a', name: 'a', text: true, opacity: true }] }, 'done').watch).toEqual([{ selector: '#a', name: 'a', text: true, opacity: true, all: false }])
  })
})
