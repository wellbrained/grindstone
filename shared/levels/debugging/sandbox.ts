// The document a Debugging level's app runs as, in a sealed iframe (`sandbox="allow-scripts"`, no same-origin, `srcdoc`):
// the level's index.html with the shop's base URL, a Content-Security-Policy and the bridge in front of everything but
// its doctype, on its first line (docs/features/ui.md, "Sandbox and bridge"): nothing of the level's files can run
// before the bridge or hide it in a comment. Every line of index.html stays where it was, so traces into it are right.
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
import { webConfig } from '../web/backend'
import type { ServerSeeds, WebSpec } from '../web/backend'
import { loopMarker } from '../web/loop'
import { VUE_MODULE, reactionHook, vueFacade } from '../frameworks/vue'
import { INERT_HTTP_EQUIV, INERT_SCRIPT_TYPE, NONCE_TAG, SCRIPT_INDEX } from '../web/pageload'
import type { PageScript } from '../web/pageload'

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
 * Web fundamentals chapter 7: a second real policy on top of SANDBOX_CSP (two policies: both must allow, so it only
 * takes away). The browser then runs no inline script or handler and no script from an address of its own accord:
 * only blob URLs, eval for the Console and the handlers the policy model allowed, and inline code with the load's nonce
 * (the bridge, its import map, what the page loader runs after the model said yes). pageload.ts has the rest.
 */
export const lockdownPolicy = (nonce: string) => `script-src 'nonce-${nonce}' blob: 'unsafe-eval'`

/** A fresh nonce for a load's lockdown policy (base64 of 18 random bytes). */
export function loadNonce(): string {
  const bytes = new Uint8Array(18)
  globalThis.crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Chapter 7: the page's own scripts made inert in place (a type no browser runs; lines kept), and its meta tags'
 * http-equiv renamed, so the frame's real policy is never the page's: the page loader applies them through the policy
 * model. Comments and the text of scripts are skipped, as the parser does. Returns the page and its scripts in order.
 */
/** HTML's JavaScript MIME type essences: a classic script's type the browser runs (anything else it never runs). */
const JAVASCRIPT_TYPES = new Set(['application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'])

interface TagAttribute { name: string, value: string | null, nameStart: number, nameEnd: number, valueStart: number, valueEnd: number }

/**
 * A start tag's attributes as HTML's tokenizer reads them (after the tag name: names up to a space, a slash, `=` or
 * `>`, values quoted or not), with where each sits in the text, and where the tag ends (a `>` inside quotes is no end).
 */
function startTag(html: string, from: number, nameLength: number): { attributes: TagAttribute[], end: number } {
  const attributes: TagAttribute[] = []
  const space = (char: string | undefined) => char === ' ' || char === '\t' || char === '\n' || char === '\f' || char === '\r'
  let at = from + 1 + nameLength
  while (at < html.length) {
    while (at < html.length && (space(html[at]) || html[at] === '/')) at++
    if (at >= html.length || html[at] === '>') break
    const nameStart = at
    while (at < html.length && !space(html[at]) && html[at] !== '/' && html[at] !== '>' && (html[at] !== '=' || at === nameStart)) at++
    const nameEnd = at
    let probe = at
    while (probe < html.length && space(html[probe])) probe++
    let value: string | null = null
    let valueStart = -1
    let valueEnd = -1
    if (html[probe] === '=') {
      probe++
      while (probe < html.length && space(html[probe])) probe++
      const quote = html[probe]
      if (quote === '"' || quote === '\'') {
        const close = html.indexOf(quote, probe + 1)
        valueStart = probe
        valueEnd = close < 0 ? html.length : close + 1
        value = html.slice(probe + 1, close < 0 ? html.length : close)
      } else {
        valueStart = probe
        while (probe < html.length && !space(html[probe]) && html[probe] !== '>') probe++
        valueEnd = probe
        value = html.slice(valueStart, valueEnd)
      }
      at = valueEnd
    }
    attributes.push({ name: html.slice(nameStart, nameEnd).toLowerCase(), value, nameStart, nameEnd, valueStart, valueEnd })
  }
  return { attributes, end: Math.min(at + 1, html.length) }
}

/**
 * Chapter 7: the page's own scripts made inert in place (a type no browser runs, a number; lines kept), and its meta
 * tags' http-equiv renamed, so the frame's real policy is never the page's: the page loader applies them through the
 * policy model. Comments and the text of scripts are skipped, as the parser does; a `nomodule` script is left as it is
 * (a browser with modules never runs it). Returns the page and its scripts in order.
 */
export function inertPage(html: string): { html: string, scripts: PageScript[] } {
  const scripts: PageScript[] = []
  // the edits to make, by position: [start, end, text]
  const edits: [number, number, string][] = []
  const lineAt = (index: number) => (html.slice(0, index).match(/\n/g) ?? []).length + 1
  // which nonce attribute of the text each script tag carries: the loader reads the served page's nonces in this order
  const nonceAt = new Map<number, number>()
  const nonceTags = new RegExp(NONCE_TAG, 'gi')
  for (let found = nonceTags.exec(html), k = 0; found; found = nonceTags.exec(html), k++) nonceAt.set(found.index, k)
  const tag = /<!--|<script(?=[\s/>])|<meta(?=[\s/>])/gi
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    if (match[0] === '<!--') {
      const end = html.indexOf('-->', match.index + 4)
      tag.lastIndex = end < 0 ? html.length : end + 3
      continue
    }
    const meta = match[0].toLowerCase() === '<meta'
    const { attributes, end } = startTag(html, match.index, meta ? 4 : 6)
    const find = (name: string) => attributes.find(each => each.name === name) ?? null
    tag.lastIndex = end
    if (meta) {
      const equiv = find('http-equiv')
      if (equiv) edits.push([equiv.nameStart, equiv.nameEnd, INERT_HTTP_EQUIV])
      continue
    }
    const type = find('type')
    const essence = type?.value?.trim().toLowerCase() ?? ''
    const module = essence === 'module'
    const classic = (type === null || essence === '' || JAVASCRIPT_TYPES.has(essence)) && find('nomodule') === null
    if (module || classic) {
      const src = find('src') !== null
      const when = src && find('async') !== null ? 2 : module || (src && find('defer') !== null) ? 1 : 0
      const stamp = `${SCRIPT_INDEX}="${scripts.length}"`
      scripts.push({ module, when, line: lineAt(match.index), nonce: nonceAt.get(match.index) ?? -1 })
      if (type === null) edits.push([match.index + 7, match.index + 7, ` type="${INERT_SCRIPT_TYPE}" ${stamp}`])
      else if (type.valueStart < 0) edits.push([type.nameStart, type.nameEnd, `type="${INERT_SCRIPT_TYPE}" ${stamp}`])
      else edits.push([type.valueStart, type.valueEnd, `"${INERT_SCRIPT_TYPE}" ${stamp}`])
    }
    // the script's text is no markup: go on after its end tag
    const close = html.toLowerCase().indexOf('</script', end)
    tag.lastIndex = close < 0 ? html.length : close
  }
  let out = ''
  let at = 0
  for (const [from, to, text] of edits.sort((a, b) => a[0] - b[0])) {
    out += html.slice(at, from) + text
    at = to
  }
  return { html: out + html.slice(at), scripts }
}

/**
 * A counting check run's policy (chapter 6): no eval, no `new Function`, no string timers. Code made from text at
 * runtime would run without counting, so it can't run at all there (the goals then fail on what it didn't do); the
 * Console, which needs eval, belongs to the app you see.
 */
export const COUNTING_CSP = SANDBOX_CSP.replace(' \'unsafe-eval\'', '')

export interface SandboxOptions {
  /**
   * A fresh random token per load: the bridge's first message carries it with the ports the load talks over, so the page
   * takes this load's ports only. The bridge reads it before any of the app's code runs and takes it off the page.
   */
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
  /**
   * Web fundamentals: the page's API on another origin, answered by the level's server.js through the CORS model (the
   * app you see and its check runs alike; server.js is never one of the page's modules).
   */
  web?: WebSpec
  /** Web fundamentals: the page's path (the address bar's, `/order`): document.cookie's URL and the Referer's. */
  page?: string
  /** Chapter 7, tests only: fixed seeds for the servers' scripted values (random per load otherwise). */
  seeds?: ServerSeeds
  /**
   * Framework deep dives (ADR 0010): Vue's development build as the frame gets it (`prepareVue`): the app imports `vue`,
   * a facade over it that reports each reaction. Loaded lazily by the play page, never part of the levels chunk.
   */
  vue?: string
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

/**
 * Where Grindstone's part goes: after the doctype (and the HTML whitespace before it), before anything else. A doctype
 * keeps the page out of quirks mode and runs nothing; any other text, tag or comment could be (or hide) the level's own
 * script, so the bridge goes in front of it. The parser then makes the `<head>` for the base, the policy and the bridge,
 * and the page's own `<html>` and `<head>` tags land on those it made (their attributes kept), as in any browser.
 */
function injectionPoint(page: string): number {
  return /^[\t\n\f\r ]*(?:<!doctype\b[^>]*>)?/i.exec(page)![0].length
}

// `from './x.js'`, `import './x.js'`, `import('./x.js')`: a relative specifier in quotes (the Tests panel's plan reads it too)
export const RELATIVE_IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.\.?\/[^'"\n]*)\2/g

/** Points relative imports of the level's own files at their names (the import map's keys); lines never change. */
export function rewriteImports(source: string, from: string, files: Readonly<Record<string, string>>): string {
  return source.replace(RELATIVE_IMPORT, (whole, lead: string, quote: string, specifier: string) => {
    const path = resolveImport(from, specifier)
    return path !== null && path in files ? `${lead}${quote}${path}${quote}` : whole
  })
}

/**
 * `<script type="module" src="./app.js"></script>` loads the file through the import map, on the same lines (a tag spread
 * over several lines keeps its line count). `after`: code the module runs once the file has run (chapter 5: the event
 * loop's marker, called when the page's synchronous script is over).
 */
function rewriteScripts(html: string, files: Readonly<Record<string, string>>, after = ''): string {
  return html.replace(/<script\b([^>]*)>(\s*)<\/script>/gi, (whole, attributes: string, inside: string) => {
    const src = attribute(attributes, 'src')
    const path = src === null ? null : pageFile(src, files)
    if (path === null || attribute(attributes, 'type')?.toLowerCase() !== 'module') return whole
    return `<script type="module">import "${path}"${after}${'\n'.repeat(((attributes + inside).match(/\n/g) ?? []).length)}</script>`
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
  // Framework deep dives: every module imports `vue` first (on its first line, so no line moves), so the facade runs
  // and takes its channel before any of the level's own code
  const first = options.vue === undefined ? '' : 'import \'vue\';'
  const modules = Object.fromEntries(Object.entries(files)
    .filter(([path]) => /\.m?js$/.test(path) && path !== options.web?.server)
    .map(([path, source]) => [path, first + rewriteImports(recording?.[path] ?? source, path, files)]))
  // the config is JSON inside a <script>: no raw "<", so no text in it can close the script or open a comment
  const backend = options.backend ? backendConfig(options.backend, SHOP_ORIGIN, options.logs ? { first: options.logs.firstRequest } : null) : null
  const elements = options.elements && !options.probes ? elementsConfig(files) : null
  const record = recording ? options.count ? countingLimits(options.count) : RECORD_LIMITS : null
  const perf = options.performance ? { actions: recording !== null && options.count === 'profile' } : null
  // chapter 5: a fresh name per load for the call that says the page's script is over
  const marker = options.web?.loop ? loopMarker() : null
  const web = options.web ? webConfig(options.web, files, SHOP_ORIGIN, options.page, marker, options.seeds ?? null) : null
  // chapter 7: the page's scripts and meta tags inert, a second real policy that only takes away, the load's nonce
  const inert = web?.security ? inertPage(files['index.html'] ?? '') : null
  const nonce = web?.security ? loadNonce() : null
  if (web?.security && inert && nonce) web.security = { ...web.security, nonce, scripts: inert.scripts }
  // Framework deep dives: Vue and the facade the app imports, as modules of the frame that are no level file (never linked)
  const hook = options.vue === undefined ? null : reactionHook()
  const libraries = options.vue === undefined || hook === null ? null : { [VUE_MODULE]: options.vue, vue: vueFacade(hook) }
  const vue = hook === null ? null : { hook }
  const config = JSON.stringify({ token: options.token, modules, libraries, vue, probes: options.probes ?? null, backend, elements, record, perf, web }).replace(/</g, '\\u003c')
  const policies = `<meta http-equiv="Content-Security-Policy" content="${options.count === 'check' ? COUNTING_CSP : SANDBOX_CSP}">${nonce ? `<meta http-equiv="Content-Security-Policy" content="${lockdownPolicy(nonce)}">` : ''}`
  const injected = `<base href="${SHOP_ORIGIN}">${policies}<script${nonce ? ` nonce="${nonce}"` : ''}>${BRIDGE_SOURCE}(${config});</script>`

  const page = rewriteStylesheets(inert ? inert.html : rewriteScripts(files['index.html'] ?? '', files, marker ? `;${marker}()` : ''), files)
  const at = injectionPoint(page)
  return {
    html: page.slice(0, at) + injected + page.slice(at),
    bridgeLine: (page.slice(0, at).match(/\n/g) ?? []).length + 1
  }
}
