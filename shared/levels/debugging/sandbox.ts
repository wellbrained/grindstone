// The document a Debugging level's app runs as, in a sealed iframe (`sandbox="allow-scripts"`, no same-origin, `srcdoc`):
// the level's index.html with the bridge, a Content-Security-Policy and the shop's base URL on its <head> line
// (docs/features/ui.md, "Sandbox and bridge"). Every line of index.html stays where it was, so traces into it are right.
// Modules run from blob URLs the bridge makes inside the frame; relative imports of the level's files are pointed at
// each file's own name, which the import map resolves (a blob URL has no folder to resolve "./cart.js" against). The
// stylesheet becomes a data URL. Pure string work: no DOM.
import { backendConfig } from './backend'
import { attribute, isStylesheetLink, pageFile, resolveImport } from './paths'
import { BRIDGE_SOURCE } from './bridge'
import { cssRules, styleTags } from './css'
import { COMPUTED_PROPERTIES } from './elements'
import { RECORD_LIMITS, countingLimits } from './recorder'
import type { BackendSpec, LogsSpec, Probe } from './types'

export { resolveImport }

/** The shop's address: relative URLs in the app resolve against it (nothing is ever fetched from it; the fake backend answers in its name). */
export const SHOP_ORIGIN = 'https://cornerbakery.shop/'

/**
 * What the app may load: its own inline and blob scripts, eval (the Console input), inline and data-URL styles, data
 * images. No network at all (the fake backend answers inside the frame), no other base URL, no forms, no frames.
 */
export const SANDBOX_CSP = [
  'default-src \'none\'',
  'script-src \'unsafe-inline\' \'unsafe-eval\' blob:',
  'style-src \'unsafe-inline\' data:',
  'img-src data: blob:',
  'font-src data:',
  'connect-src \'none\'',
  'base-uri \'none\'',
  'form-action \'none\''
].join('; ')

/**
 * A counting check run's policy (chapter 6): no eval, no `new Function`, no string timers. Code made from text at
 * runtime would run without counting, so it can't run at all there (the goals then fail on what it didn't do); the
 * Console, which needs eval, belongs to the app you see.
 */
export const COUNTING_CSP = SANDBOX_CSP.replace(' \'unsafe-eval\'', '')

export interface SandboxOptions {
  /** A fresh random token per load: the page ignores messages that do not carry it (an older load, anything else). */
  token: string
  /** A check run's probes; none for the app you see. */
  probes?: readonly Probe[]
  /** The level's scripted backend (the app you see and its check runs alike); none: requests are refused. */
  backend?: BackendSpec
  /** The app you see in a level with the Elements panel: the bridge gets the page's rules to match and can draw on the page. */
  elements?: boolean
  /**
   * A recorded load (chapter 5: Record, never a check run of the play page): the modules as instrumented (instrument.ts),
   * by path; the bridge runs the recorder they report their steps to. Lines stay where they are. With probes only in the
   * e2e, which checks that instrumented code does what the code does.
   */
  record?: Readonly<Record<string, string>>
  /**
   * Chapter 6: the instrumented modules (`record`) count instead of recording steps: `check` for a check run whose
   * probes read the work, `profile` for Record (the customer's actions, the profile posted at Stop).
   */
  count?: 'check' | 'profile'
  /** A Performance level's load (chapter 6): the page's changes are watched and the server's clock kept (probes, Record). */
  performance?: boolean
  /** A level with the server's logs (chapter 7): its server names each request and reports what it answered (every load). */
  logs?: LogsSpec
}

/** What the bridge needs for the Elements panel: the page's rules (to test which match), the linked stylesheets' names, what to read. */
export interface ElementsConfig {
  rules: { selectors: string[], conditions: [kind: string, text: string][], declarations: [property: string, value: string][] }[]
  /** The level files of the `<link rel="stylesheet">` tags in document order (their href is a data URL in the frame). */
  sheets: string[]
  computed: string[]
}

/** The size of a check run's frame unless a probe asks for another width: a phone. */
export const CHECK_VIEWPORT = { width: 390, height: 700 } as const

/** One frame of a check run: its size and the probes it runs. */
export interface CheckFrame {
  width: number
  height: number
  probes: Probe[]
}

/** The frames a check run needs: one per width its probes ask for, the phone's first, the probes in their order. */
export function checkFrames(probes: readonly Probe[]): CheckFrame[] {
  const widthOf = (probe: Probe) => probe.width ?? CHECK_VIEWPORT.width
  const asked = [...new Set(probes.map(widthOf))]
  const widths = asked.length ? [...asked.filter(width => width === CHECK_VIEWPORT.width), ...asked.filter(width => width !== CHECK_VIEWPORT.width)] : [CHECK_VIEWPORT.width]
  return widths.map(width => ({ width, height: CHECK_VIEWPORT.height, probes: probes.filter(probe => widthOf(probe) === width) }))
}

/** The Elements panel's config for these files. */
function elementsConfig(files: Readonly<Record<string, string>>): ElementsConfig {
  return {
    rules: cssRules(files).map(rule => ({
      selectors: rule.selectors,
      conditions: rule.conditions.map(condition => [condition.kind, condition.text]),
      declarations: rule.declarations.map(declaration => [declaration.property, declaration.value])
    })),
    sheets: linkedSheets(files['index.html'] ?? '', files),
    computed: [...COMPUTED_PROPERTIES]
  }
}

/**
 * The level files of the page's `<link rel="stylesheet">` elements, in document order: one per link the frame's DOM
 * has with a data URL (also a `disabled` one; not one inside `<!-- -->`), which is how the inspector names them.
 */
function linkedSheets(html: string, files: Readonly<Record<string, string>>): string[] {
  return styleTags(html).flatMap(({ tag, kind }) => {
    const href = kind === 'link' ? attribute(tag, 'href') : null
    const path = href === null ? null : pageFile(href, files)
    return path === null ? [] : [path]
  })
}

export interface SandboxDocument {
  html: string
  /** The line of the frame's page that holds the bridge (its stack frames are never shown). */
  bridgeLine: number
}

// `from './x.js'`, `import './x.js'`, `import('./x.js')`: a relative specifier in quotes
const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.\.?\/[^'"\n]*)\2/g

/** Points relative imports of the level's own files at their names (the import map's keys); lines never change. */
export function rewriteImports(source: string, from: string, files: Readonly<Record<string, string>>): string {
  return source.replace(IMPORT, (whole, lead: string, quote: string, specifier: string) => {
    const path = resolveImport(from, specifier)
    return path !== null && path in files ? `${lead}${quote}${path}${quote}` : whole
  })
}

/** `<script type="module" src="./app.js"></script>` loads the file through the import map, on the same lines (a tag spread over several lines keeps its line count). */
function rewriteScripts(html: string, files: Readonly<Record<string, string>>): string {
  return html.replace(/<script\b([^>]*)>(\s*)<\/script>/gi, (whole, attributes: string, inside: string) => {
    const src = attribute(attributes, 'src')
    const path = src === null ? null : pageFile(src, files)
    if (path === null || attribute(attributes, 'type')?.toLowerCase() !== 'module') return whole
    return `<script type="module">import "${path}"${'\n'.repeat(((attributes + inside).match(/\n/g) ?? []).length)}</script>`
  })
}

/** `<link rel="stylesheet" href="./style.css">` gets the file as a data URL (one line, no fetch). */
function rewriteStylesheets(html: string, files: Readonly<Record<string, string>>): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!isStylesheetLink(tag)) return tag
    const href = attribute(tag, 'href')
    const path = href === null ? null : pageFile(href, files)
    if (path === null) return tag
    const data = `data:text/css;charset=utf-8,${encodeURIComponent(files[path]!)}`
    return tag.replace(/\bhref\s*=\s*(["']?)[^"'\s>]*\1/i, `href="${data}"`)
  })
}

/** The document of one load of the app: the app you see (no probes) or a check run (with the level's probes). */
export function sandboxDocument(files: Readonly<Record<string, string>>, options: SandboxOptions): SandboxDocument {
  const recording = options.record ?? null
  const modules = Object.fromEntries(Object.entries(files)
    .filter(([path]) => /\.m?js$/.test(path))
    .map(([path, source]) => [path, rewriteImports(recording?.[path] ?? source, path, files)]))
  // the config is JSON inside a <script>: no raw "<", so no text in it can close the script or open a comment
  const backend = options.backend ? backendConfig(options.backend, SHOP_ORIGIN, options.logs ? { first: options.logs.firstRequest } : null) : null
  const elements = options.elements && !options.probes ? elementsConfig(files) : null
  const record = recording ? options.count ? countingLimits(options.count) : RECORD_LIMITS : null
  const perf = options.performance ? { actions: recording !== null && options.count === 'profile' } : null
  const config = JSON.stringify({ token: options.token, modules, probes: options.probes ?? null, backend, elements, record, perf }).replace(/</g, '\\u003c')
  const injected = `<base href="${SHOP_ORIGIN}"><meta http-equiv="Content-Security-Policy" content="${options.count === 'check' ? COUNTING_CSP : SANDBOX_CSP}"><script>${BRIDGE_SOURCE}(${config});</script>`

  const page = rewriteStylesheets(rewriteScripts(files['index.html'] ?? '', files), files)
  const head = /<head\b[^>]*>/i.exec(page)
  if (!head) return { html: injected + page, bridgeLine: 1 }
  const at = head.index + head[0].length
  return {
    html: page.slice(0, at) + injected + page.slice(at),
    bridgeLine: (page.slice(0, at).match(/\n/g) ?? []).length + 1
  }
}
