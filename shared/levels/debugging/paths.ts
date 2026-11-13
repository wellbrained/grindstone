// Which of a level's files a URL or import in it points at (the app's files sit in one folder tree, served from the
// shop's address). Shared by the sandbox document (imports, scripts, stylesheets) and the Elements panel's stylesheets.

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

/** The level file a URL in index.html points at ('./app.js', 'app.js', '/app.js'), or null. */
export function pageFile(url: string, files: Readonly<Record<string, string>>): string | null {
  if (/^[a-z][\w+.-]*:/i.test(url) || url.startsWith('//')) return null
  const path = resolveImport('index.html', url.replace(/^\/?(?!\.)/, './').split(/[?#]/)[0]!)
  return path !== null && path in files ? path : null
}

/** An attribute's value in an HTML tag's text ('href', 'src'); null when the tag has none. */
export const attribute = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(["']?)([^"'\\s>]*)\\1`, 'i').exec(tag)?.[2] ?? null

/** A `<link>` tag that loads a stylesheet. */
export const isStylesheetLink = (tag: string) => /\brel\s*=\s*["']?stylesheet\b/i.test(tag)
