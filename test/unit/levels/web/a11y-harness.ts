// Runs a chapter 6 level's page on happy-dom the way a check run does in a browser (after the reviewer's harness of
// 2026-11-20): the page's markup and style, the accessibility model installed before the app's code, the app, the load,
// the scene, then each probe's steps as the bridge runs them (keys, Tab, focus, typing and clicks, the model's reads,
// the reader's lines, text, a visibility much like the bridge's). happy-dom has no layout, so what needs one stays with
// e2e/web-levels.spec.ts; the fixes table's verdicts are asserted here as well as there.
import { Window } from 'happy-dom'
import { A11Y_SOURCE, a11yConfig, heardFacts } from '../../../../shared/levels/web/a11y'
import type { ReaderLine } from '../../../../shared/levels/web/a11y'
import type { Observation, ProbeStep, ProbeValue, WebLevel } from '../../../../shared/levels'

interface Model {
  quiet: (then: () => void) => void
  act: () => void
  install: () => void
  start: () => void
  probing: () => void
  refresh: () => void
  key: (name: string) => void
  tabTo: (element: unknown) => number
  focusOn: (element: unknown) => boolean
  top: () => void
  focused: (selector: string) => number
  reads: (element: unknown, has: string | null) => string | number | null
  name: (element: unknown, has: string | null) => string | number | null
  role: (element: unknown) => string
  state: (element: unknown, which: string) => string | null
  mark: () => number
  heard: (text: string, mark: number, live: boolean, after: string | null, scene: boolean) => number
  tabStops: () => number
}

const create = new Function(`return ${A11Y_SOURCE}`)() as (config: unknown, hooks: unknown) => Model
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

export interface HarnessRun {
  observation: Observation
  /** What the reader said before the probes ('kind: text'). */
  heard: string[]
  /** The Console's log lines. */
  logs: string[]
}

type Step = ProbeStep & Record<string, unknown>

/** The level's page with these files, its scene and its probes, on happy-dom. */
export async function runA11y(level: WebLevel, files: Readonly<Record<string, string>>): Promise<HarnessRun> {
  const window = new Window({ url: 'https://cornerbakery.shop/order' })
  const document = window.document
  const html = (files['index.html'] ?? '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]*stylesheet[^>]*>/g, '')
    .replace('</head>', `<style>[hidden] { display: none } ${files['style.css'] ?? ''}</style></head>`)
  document.write(html)
  const posted: { type: string, lines?: ReaderLine[] }[] = []
  const model = create(a11yConfig(), { win: window, post: (message: (typeof posted)[number]) => posted.push(message), check: true })
  model.install()
  const errors: string[] = []
  const logs: string[] = []
  const app = (files['app.js'] ?? '').replace(/^import \{ formatPrice \} from '\.\/money\.js'\n/m, 'const formatPrice = (amount) => amount.toFixed(2)\n')
  const console = { log: (...args: unknown[]) => logs.push(args.join(' ')), info: () => {}, warn: () => {}, error: (...args: unknown[]) => errors.push(args.join(' ')) }
  try {
    // the page's own timers are the window's (the model counts the short ones in an update)
    new Function('window', 'document', 'setTimeout', 'clearTimeout', 'console', app)(window, document, window.setTimeout.bind(window), window.clearTimeout.bind(window), console)
  } catch (error) {
    errors.push(String(error))
  }
  model.start()
  const find = (selector: string) => document.querySelector(selector) as unknown
  const quiet = () => new Promise<void>(resolve => model.quiet(resolve))
  const visible = (element: { parentElement: unknown, localName: string }): string => {
    for (let node = element as typeof element | null; node; node = node.parentElement as typeof element | null) {
      if (window.getComputedStyle(node as never).display === 'none') return node === element ? 'display: none' : 'display: none on an ancestor'
      const parent = node.parentElement as (typeof element & { hasAttribute: (name: string) => boolean, querySelector: (selector: string) => unknown }) | null
      if (parent && parent.localName === 'details' && !parent.hasAttribute('open') && parent.querySelector(':scope > summary') !== node) return 'in a closed details'
    }
    const visibility = window.getComputedStyle(element as never).visibility
    return visibility && visibility !== 'visible' ? `visibility: ${visibility}` : 'visible'
  }

  let mark = 0
  const run = async (step: Step): Promise<{ value?: ProbeValue, fail?: string }> => {
    const element = (selector: unknown) => find(String(selector))
    if (typeof step.keys === 'string' || typeof step.press === 'string' || typeof step.type === 'string' || typeof step.click === 'string' || typeof step.tap === 'string') model.act()
    if (typeof step.keyboard === 'string') {
      for (let i = 0; i < Math.min(Math.max(Number(step.times ?? 1), 1), 20); i++) model.key(step.keyboard)
      await quiet()
      return {}
    }
    if (typeof step.tabTo === 'string') {
      const target = element(step.tabTo)
      if (!target) return { fail: `missing ${step.tabTo}` }
      const presses = model.tabTo(target)
      await quiet()
      return presses < 0 ? { fail: `Tab never reaches ${step.tabTo}` } : { value: presses }
    }
    if (typeof step.focusOn === 'string') {
      const target = element(step.focusOn)
      if (!target) return { fail: `missing ${step.focusOn}` }
      if (!model.focusOn(target)) return { fail: `${step.focusOn} can't take focus` }
      await quiet()
      return {}
    }
    if (step.focusTop === true) {
      model.top()
      return {}
    }
    if (typeof step.focused === 'string') return { value: model.focused(step.focused) }
    if (typeof step.reads === 'string' || typeof step.name === 'string' || typeof step.role === 'string' || typeof step.state === 'string') {
      const selector = String(step.reads ?? step.name ?? step.role ?? step.state)
      const target = element(selector)
      if (!target) return { fail: `missing ${selector}` }
      const has = typeof step.has === 'string' ? step.has : null
      if (typeof step.reads === 'string') return { value: model.reads(target, has) }
      if (typeof step.name === 'string') return { value: model.name(target, has) }
      if (typeof step.role === 'string') return { value: model.role(target) }
      return { value: model.state(target, String(step.of)) }
    }
    if (typeof step.heard === 'string' || typeof step.announced === 'string') {
      return { value: model.heard(String(step.heard ?? step.announced), mark, typeof step.announced === 'string', typeof step.after === 'string' ? step.after : null, step.scene === true) }
    }
    if (step.tabStops === true) {
      const stops = model.tabStops()
      await quiet()
      return { value: stops }
    }
    if (typeof step.click === 'string') {
      const target = element(step.click) as { click: () => void } | null
      if (!target) return { fail: `missing ${step.click}` }
      target.click()
      await pause(30)
      return {}
    }
    if (typeof step.type === 'string') {
      const target = element(step.type) as { value: string, dispatchEvent: (event: unknown) => void } | null
      if (!target) return { fail: `missing ${step.type}` }
      target.value = String(step.value)
      target.dispatchEvent(new window.Event('input', { bubbles: true }))
      target.dispatchEvent(new window.Event('change', { bubbles: true }))
      await pause(20)
      return {}
    }
    if (typeof step.text === 'string') {
      const target = element(step.text) as { textContent: string | null } | null
      return target ? { value: squash(target.textContent ?? '') } : { fail: `missing ${step.text}` }
    }
    if (typeof step.visible === 'string') {
      const target = element(step.visible) as Parameters<typeof visible>[0] | null
      return target ? { value: visible(target) } : { fail: `missing ${step.visible}` }
    }
    throw new Error(`the harness has no step ${JSON.stringify(step)}`)
  }

  for (const step of level.sandbox.web?.scene ?? []) {
    mark = model.mark()
    const result = await run(step as Step)
    if (result.fail) errors.push(`scene: ${result.fail}`)
  }
  // the probes start at a task boundary: what the scene led to is the scene's
  model.probing()
  const heard = heardFacts(posted.flatMap(message => message.type === 'reader' ? message.lines ?? [] : []))
  const probes: Record<string, ProbeValue> = {}
  const probeErrors: Record<string, string> = {}
  for (const probe of level.sandbox.probes) {
    mark = model.mark()
    let value: ProbeValue = null
    let failed: string | null = null
    for (const step of probe.steps) {
      const result = await run(step as Step)
      if (result.fail) {
        failed = result.fail
        break
      }
      if ('value' in result) value = result.value ?? null
    }
    if (failed) probeErrors[probe.id] = failed
    else probes[probe.id] = value
  }
  return {
    observation: { finished: true, errors: errors.map(text => ({ kind: 'error' as const, text, source: null })), probes, probeErrors, logs },
    heard,
    logs
  }
}
