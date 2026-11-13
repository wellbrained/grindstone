// The document a Debugging level's app runs as, in a sealed iframe (`sandbox="allow-scripts"`, no same-origin, `srcdoc`):
// the level's index.html with the bridge, a Content-Security-Policy and the shop's base URL on its <head> line
// (docs/features/ui.md, "Sandbox and bridge"). Every line of index.html stays where it was, so traces into it are right.
// Modules run from blob URLs the bridge makes inside the frame; relative imports of the level's files are pointed at
// each file's own name, which the import map resolves (a blob URL has no folder to resolve "./cart.js" against). The
// stylesheet becomes a data URL. Pure string work: no DOM.
import { BRIDGE_SOURCE } from './bridge'
import type { Probe } from './types'

/** The shop's address: relative URLs in the app resolve against it (nothing is ever fetched from it). */
export const SHOP_ORIGIN = 'https://cornerbakery.shop/'

/**
 * What the app may load: its own inline and blob scripts, eval (the Console input), inline and data-URL styles, data
 * images. No network at all (the fake backend will answer inside the frame), no other base URL, no forms, no frames.
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

export interface SandboxOptions {
  /** A fresh random token per load: the page ignores messages that do not carry it (an older load, anything else). */
  token: string
  /** A check run's probes; none for the app you see. */
  probes?: readonly Probe[]
}

export interface SandboxDocument {
  html: string
  /** The line of the frame's page that holds the bridge (its stack frames are never shown). */
  bridgeLine: number
}

/** The level file an import refers to, resolved against the importing file; null when it leaves the app's folder. */
export function resolveImport(from: string, specifier: string): string | null {
  const parts = from.split('/').slice(0, -1)
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') {
      if (!parts.length) return null
      parts.pop()
    } else {
      parts.push(segment)
    }
  }
  return parts.join('/')
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

/** The level file a URL in index.html points at ('./app.js', 'app.js', '/app.js'), or null. */
function fileOf(url: string, files: Readonly<Record<string, string>>): string | null {
  if (/^[a-z][\w+.-]*:/i.test(url) || url.startsWith('//')) return null
  const path = resolveImport('index.html', url.replace(/^\/?(?!\.)/, './').split(/[?#]/)[0]!)
  return path !== null && path in files ? path : null
}

const attribute = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(["']?)([^"'\\s>]*)\\1`, 'i').exec(tag)?.[2] ?? null

/** `<script type="module" src="./app.js"></script>` loads the file through the import map, on the same lines (a tag spread over several lines keeps its line count). */
function rewriteScripts(html: string, files: Readonly<Record<string, string>>): string {
  return html.replace(/<script\b([^>]*)>(\s*)<\/script>/gi, (whole, attributes: string, inside: string) => {
    const src = attribute(attributes, 'src')
    const path = src === null ? null : fileOf(src, files)
    if (path === null || attribute(attributes, 'type')?.toLowerCase() !== 'module') return whole
    return `<script type="module">import "${path}"${'\n'.repeat(((attributes + inside).match(/\n/g) ?? []).length)}</script>`
  })
}

/** `<link rel="stylesheet" href="./style.css">` gets the file as a data URL (one line, no fetch). */
function rewriteStylesheets(html: string, files: Readonly<Record<string, string>>): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet\b/i.test(tag)) return tag
    const href = attribute(tag, 'href')
    const path = href === null ? null : fileOf(href, files)
    if (path === null) return tag
    const data = `data:text/css;charset=utf-8,${encodeURIComponent(files[path]!)}`
    return tag.replace(/\bhref\s*=\s*(["']?)[^"'\s>]*\1/i, `href="${data}"`)
  })
}

/** The document of one load of the app: the app you see (no probes) or a check run (with the level's probes). */
export function sandboxDocument(files: Readonly<Record<string, string>>, options: SandboxOptions): SandboxDocument {
  const modules = Object.fromEntries(Object.entries(files)
    .filter(([path]) => /\.m?js$/.test(path))
    .map(([path, source]) => [path, rewriteImports(source, path, files)]))
  // the config is JSON inside a <script>: no raw "<", so no text in it can close the script or open a comment
  const config = JSON.stringify({ token: options.token, modules, probes: options.probes ?? null }).replace(/</g, '\\u003c')
  const injected = `<base href="${SHOP_ORIGIN}"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><script>${BRIDGE_SOURCE}(${config});</script>`

  const page = rewriteStylesheets(rewriteScripts(files['index.html'] ?? '', files), files)
  const head = /<head\b[^>]*>/i.exec(page)
  if (!head) return { html: injected + page, bridgeLine: 1 }
  const at = head.index + head[0].length
  return {
    html: page.slice(0, at) + injected + page.slice(at),
    bridgeLine: (page.slice(0, at).match(/\n/g) ?? []).length + 1
  }
}
