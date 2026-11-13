// The Elements panel's CSS knowledge (ADR 0007, chapter 3; docs/features/levels.md, "The Elements panel"): a level's
// stylesheets read into rules with the file and line of each selector and declaration, selector specificity, what a
// shorthand sets and which properties an element inherits. The bridge in the frame only says which of these rules match
// an element (the browser decides that); the cascade the panel shows is worked out from them here (elements.ts). Pure,
// and forgiving: a learner's broken CSS never throws, it reads what it can, like the browser. It runs on the page's main
// thread for every load, so it is linear in the text and caps how deep blocks and selectors nest.
import { attribute, isStylesheetLink, pageFile } from './paths'

/** One `property: value` of a rule or a style attribute; `line` null in a style attribute. */
export interface CssDeclaration {
  /** Lower case, except a custom property (`--Brand`), which keeps its case like the browser. */
  property: string
  /** As written, without `!important`. */
  value: string
  important: boolean
  line: number | null
}

/** A media or supports condition a rule sits in (`@media (max-width: 600px)`), with the line it is written on. */
export interface CssCondition {
  kind: 'media' | 'supports'
  text: string
  line: number
  /** Where it is written when that is not the rule's own file (a `media` attribute on index.html's `<link>`). */
  path?: string
}

/** One style rule of a level's stylesheet, where it is written. */
export interface CssRule {
  path: string
  /** The line its selector starts on. */
  line: number
  /** The selector list as written, whitespace collapsed ('.add, .action'). */
  selector: string
  selectors: string[]
  /** The conditions around it, outermost first; it applies only while all of them hold. */
  conditions: CssCondition[]
  declarations: CssDeclaration[]
}

/** A stylesheet of the page: a linked file of the level, or a `<style>` block of index.html from the line it starts on. */
export interface CssSheet {
  path: string
  source: string
  firstLine: number
  /** The `media` attribute of its `<link>` or `<style>` (on index.html): every rule of it holds only while it does. */
  media?: CssCondition
}

/** The most rules the panel reads from a page (a pasted megabyte of CSS must not slow the frame down). */
export const MAX_CSS_RULES = 2000

/** The most of one stylesheet that is read (characters); what comes after is left out of the panel. */
export const MAX_CSS_LENGTH = 300_000

/** How deep `@media` / `@supports` blocks and `:is(…)`-like selectors are followed; deeper ones are skipped or count nothing. */
export const MAX_CSS_NESTING = 32

const PROPERTY = /^(?:--[\w-]+|-?[a-z_][\w-]*)$/i

/** A reader over CSS text that counts lines and steps over comments and strings. */
function scanner(source: string, firstLine: number) {
  let at = 0
  let line = firstLine
  const advance = () => {
    if (source[at] === '\n') line++
    at++
  }
  /** Steps over a comment (true) when one starts here; an unclosed one runs to the end. */
  const comment = () => {
    if (source[at] !== '/' || source[at + 1] !== '*') return false
    at += 2
    while (at < source.length && !(source[at] === '*' && source[at + 1] === '/')) advance()
    at = Math.min(at + 2, source.length)
    return true
  }
  /** Reads a quoted string (with its quotes) when one starts here; an unclosed one runs to the end of the line. */
  const string = (): string | null => {
    const quote = source[at]
    if (quote !== '"' && quote !== '\'') return null
    const start = at
    at++
    while (at < source.length && source[at] !== quote && source[at] !== '\n') {
      if (source[at] === '\\') at++
      at++
    }
    if (source[at] === quote) at++
    return source.slice(start, at)
  }
  /** Steps over a block whose `{` was just read, to after its matching `}`. */
  const skipBlock = () => {
    let depth = 1
    while (at < source.length && depth > 0) {
      if (comment() || string() !== null) continue
      if (source[at] === '{') depth++
      else if (source[at] === '}') depth--
      advance()
    }
  }
  return {
    get at() { return at },
    get line() { return line },
    get char() { return source[at] },
    done: () => at >= source.length,
    /** The text from `from` to here. */
    since: (from: number) => source.slice(from, at),
    advance,
    comment,
    string,
    skipBlock
  }
}

type Scanner = ReturnType<typeof scanner>

/** One declaration's text, or null when it is not one (no colon, no property, no value). */
function declaration(text: string, line: number | null): CssDeclaration | null {
  const colon = text.indexOf(':')
  if (colon <= 0) return null
  const name = text.slice(0, colon).trim()
  let value = text.slice(colon + 1).trim()
  if (!PROPERTY.test(name) || !value) return null
  // `!important` at the end, spaces allowed around the "!" (no regex: a long run of spaces must stay linear)
  let important = false
  if (value.slice(-9).toLowerCase() === 'important') {
    const before = value.slice(0, -9).trimEnd()
    if (before.endsWith('!')) {
      important = true
      value = before.slice(0, -1).trimEnd()
    }
  }
  if (!value) return null
  return { property: name.startsWith('--') ? name : name.toLowerCase(), value, important, line }
}

/** Reads declarations up to the `}` that closes their block (or the end); nested rules inside are skipped. */
function declarations(scan: Scanner, lines: boolean): CssDeclaration[] {
  const found: CssDeclaration[] = []
  let text = ''
  let line: number | null = null
  let depth = 0
  const finish = () => {
    const read = declaration(text, lines ? line : null)
    if (read) found.push(read)
    text = ''
    line = null
  }
  while (!scan.done()) {
    if (scan.comment()) continue
    const char = scan.char!
    if (line === null && !/\s/.test(char)) line = scan.line
    const quoted = scan.string()
    if (quoted !== null) {
      text += quoted
      continue
    }
    if (depth === 0 && char === ';') {
      scan.advance()
      finish()
      continue
    }
    if (depth === 0 && char === '}') {
      scan.advance()
      break
    }
    if (depth === 0 && char === '{') {
      scan.advance()
      if (/^\s*--[\w-]+\s*:/.test(text)) {
        // a custom property's value may hold a block: it stays part of the value
        const from = scan.at
        scan.skipBlock()
        text += `{${scan.since(from)}`
      } else {
        // a nested rule (`&:hover { … }`): not read in this panel
        scan.skipBlock()
        text = ''
        line = null
      }
      continue
    }
    if (char === '(') depth++
    else if (char === ')') depth = Math.max(depth - 1, 0)
    text += char
    scan.advance()
  }
  finish()
  return found
}

/** What comes before a `{` (a selector or an at-rule), comments left out, and what ended it (`;` or `}` first: not a rule). */
function prelude(scan: Scanner): { text: string, line: number, ends: string | undefined } {
  let text = ''
  let line = scan.line
  let started = false
  let depth = 0
  while (!scan.done()) {
    if (scan.comment()) {
      text += ' '
      continue
    }
    if (!started && !/\s/.test(scan.char!)) {
      started = true
      line = scan.line
    }
    const quoted = scan.string()
    if (quoted !== null) {
      text += quoted
      continue
    }
    const char = scan.char!
    if (depth === 0 && (char === '{' || char === ';' || char === '}')) return { text, line, ends: char }
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth = Math.max(depth - 1, 0)
    text += char
    scan.advance()
  }
  return { text, line, ends: undefined }
}

/** The rules of a block: the whole sheet, or the inside of an `@media` / `@supports` (`inside`: stops at its `}`). */
function rules(scan: Scanner, path: string, conditions: CssCondition[], inside: boolean, found: CssRule[]) {
  const depth = conditions.length
  while (!scan.done()) {
    const { text, line, ends } = prelude(scan)
    if (ends === undefined) return
    scan.advance()
    if (ends === '}') {
      if (inside) return
      continue
    }
    if (ends === ';') continue
    const head = text.trim()
    const at = /^@([\w-]+)\s*([\s\S]*)$/.exec(head)
    if (at) {
      const name = at[1]!.toLowerCase()
      // deeper than MAX_CSS_NESTING: skipped, so hostile nesting can't exhaust the stack
      if ((name === 'media' || name === 'supports') && depth < MAX_CSS_NESTING) rules(scan, path, [...conditions, { kind: name, text: at[2]!.replace(/\s+/g, ' ').trim(), line }], true, found)
      else scan.skipBlock()
      continue
    }
    const read = declarations(scan, true)
    const selectors = splitSelectorList(head)
    if (selectors.length) found.push({ path, line, selector: selectors.join(', '), selectors, conditions, declarations: read })
  }
}

/** The style rules of one stylesheet, in order, with their lines. */
export function parseCss(sheet: CssSheet): CssRule[] {
  const found: CssRule[] = []
  rules(scanner(sheet.source.slice(0, MAX_CSS_LENGTH), sheet.firstLine), sheet.path, sheet.media ? [sheet.media] : [], false, found)
  return found
}

/** The declarations of a style attribute (`line` null: they have none of their own), or of one block from `line`. */
export function parseDeclarations(text: string, line: number | null): CssDeclaration[] {
  return declarations(scanner(text.slice(0, MAX_CSS_LENGTH), line ?? 1), line !== null)
}

/** The selectors of a list, split on the commas between them (not inside `:is(…)` or `[…]`), whitespace collapsed. */
export function splitSelectorList(list: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null
  for (const char of list) {
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === '\'') {
      quote = char
    } else if (char === '(' || char === '[') {
      depth++
    } else if (char === ')' || char === ']') {
      depth = Math.max(depth - 1, 0)
    } else if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** Ids, then classes (with attributes and pseudo-classes), then types (with pseudo-elements). */
export type Specificity = [ids: number, classes: number, types: number]

const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])
const TAKES_ITS_MOST_SPECIFIC = new Set(['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'])

const add = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mostSpecific = (list: string, depth: number): Specificity => depth >= MAX_CSS_NESTING
  ? [0, 0, 0]
  : splitSelectorList(list).map(each => selectorSpecificity(each, depth + 1)).reduce<Specificity>((best, each) => compareSpecificity(each, best) > 0 ? each : best, [0, 0, 0])

/** Where an identifier that starts here ends (escapes and non-ASCII letters included). */
function identEnd(text: string, from: number): number {
  let at = from
  while (at < text.length) {
    if (text[at] === '\\') at += 2
    else if (/[\w-]/.test(text[at]!) || text.charCodeAt(at) > 127) at++
    else break
  }
  return at
}

/** Where the bracket or parenthesis that opens here closes (its index). */
function closing(text: string, from: number): number {
  const open = text[from]
  const close = open === '(' ? ')' : ']'
  let depth = 0
  for (let at = from; at < text.length; at++) {
    const char = text[at]
    if (char === '"' || char === '\'') {
      const end = text.indexOf(char, at + 1)
      at = end < 0 ? text.length : end
    } else if (char === open) {
      depth++
    } else if (char === close && --depth === 0) {
      return at
    }
  }
  return text.length
}

/** The specificity of one selector (not a list), as the cascade compares it. */
export function specificity(selector: string): Specificity {
  return selectorSpecificity(selector, 0)
}

/** `depth`: how many `:is(…)`-like arguments in this selector is (deeper than MAX_CSS_NESTING counts nothing). */
function selectorSpecificity(selector: string, depth: number): Specificity {
  let result: Specificity = [0, 0, 0]
  let at = 0
  while (at < selector.length) {
    const char = selector[at]!
    if (char === '#') {
      at = identEnd(selector, at + 1)
      result = add(result, [1, 0, 0])
    } else if (char === '.') {
      at = identEnd(selector, at + 1)
      result = add(result, [0, 1, 0])
    } else if (char === '[') {
      at = closing(selector, at) + 1
      result = add(result, [0, 1, 0])
    } else if (char === ':') {
      const element = selector[at + 1] === ':'
      const start = at + (element ? 2 : 1)
      at = identEnd(selector, start)
      const name = selector.slice(start, at).toLowerCase()
      let args: string | null = null
      if (selector[at] === '(') {
        const end = closing(selector, at)
        args = selector.slice(at + 1, end)
        at = end + 1
      }
      if (element || LEGACY_ELEMENTS.has(name)) result = add(result, [0, 0, 1])
      else if (name === 'where') continue
      else if (TAKES_ITS_MOST_SPECIFIC.has(name) && args !== null) result = add(result, mostSpecific(args, depth))
      else {
        result = add(result, [0, 1, 0])
        const of = args !== null && /^nth-(?:last-)?child$/.test(name) ? /\bof\s+([\s\S]+)$/.exec(args) : null
        if (of) result = add(result, mostSpecific(of[1]!, depth))
      }
    } else if (char === '*') {
      at += selector[at + 1] === '|' ? 2 : 1
    } else if (/[A-Za-z_\\-]/.test(char) || selector.charCodeAt(at) > 127) {
      at = identEnd(selector, at)
      // `svg|rect`: the namespace counts for nothing, the type after it once
      if (selector[at] === '|') at++
      else result = add(result, [0, 0, 1])
    } else {
      at++
    }
  }
  return result
}

/** Positive when `a` wins over `b`, negative when it loses, 0 for a tie (then the later rule wins). */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const sides = (prefix: string, suffix = '') => SIDES.map(side => `${prefix}-${side}${suffix}`)
const BORDER_SIDES = SIDES.map(side => `border-${side}`)

/** What a shorthand sets (only the ones the panel needs to strike through correctly); anything else sets itself. */
const LONGHANDS: Record<string, readonly string[]> = {
  'margin': sides('margin'),
  'padding': sides('padding'),
  'inset': [...SIDES],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
  'background': ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-origin', 'background-clip'],
  'border': BORDER_SIDES.flatMap(side => [`${side}-width`, `${side}-style`, `${side}-color`]),
  'border-width': BORDER_SIDES.map(side => `${side}-width`),
  'border-style': BORDER_SIDES.map(side => `${side}-style`),
  'border-color': BORDER_SIDES.map(side => `${side}-color`),
  ...Object.fromEntries(BORDER_SIDES.map(side => [side, [`${side}-width`, `${side}-style`, `${side}-color`]])),
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  'font': ['font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family'],
  'flex': ['flex-grow', 'flex-shrink', 'flex-basis'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  'gap': ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap'],
  'overflow': ['overflow-x', 'overflow-y'],
  'outline': ['outline-color', 'outline-style', 'outline-width'],
  'text-decoration': ['text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self']
}

/** The properties a declaration of this property sets. */
export function longhandsOf(property: string): string[] {
  return [...(LONGHANDS[property] ?? [property])]
}

/** Properties an element takes from its parent unless something sets them on it (custom properties too). */
const INHERITED = new Set([
  'color', 'cursor', 'direction', 'visibility', 'pointer-events', 'white-space', 'word-spacing', 'letter-spacing',
  'line-height', 'text-align', 'text-indent', 'text-transform', 'text-shadow', 'word-break', 'overflow-wrap', 'word-wrap',
  'hyphens', 'tab-size', 'quotes', 'caret-color', 'accent-color', 'color-scheme', 'border-collapse', 'border-spacing',
  'empty-cells', 'caption-side', 'list-style', 'list-style-type', 'list-style-position', 'list-style-image', 'orphans',
  'widows', 'writing-mode', 'text-rendering', '-webkit-font-smoothing'
])

/** Whether an element inherits this property from its parent. */
export function isInherited(property: string): boolean {
  return property.startsWith('--') || property.startsWith('font') || INHERITED.has(property)
}

/** index.html with every `<!-- … -->` blanked out (same length, same lines), so tags inside a comment don't count. */
export function withoutComments(html: string): string {
  let out = ''
  let at = 0
  while (at < html.length) {
    const open = html.indexOf('<!--', at)
    if (open < 0) return out + html.slice(at)
    const close = html.indexOf('-->', open + 4)
    const stop = close < 0 ? html.length : close + 3
    out += html.slice(at, open) + html.slice(open, stop).replace(/[^\n]/g, ' ')
    at = stop
  }
  return out
}

/** The stylesheet `<link>`s and `<style>` blocks of a page, in document order, with where each starts (comments left out). */
export function styleTags(html: string): { tag: string, kind: 'link' | 'style', at: number, content?: { text: string, at: number } }[] {
  const page = withoutComments(html)
  const lower = page.toLowerCase()
  const found: ReturnType<typeof styleTags> = []
  // a bounded tag body: an unclosed `<link` can't make every later match scan to the end
  const opener = /<(link|style)\b[^>]{0,2000}>/gi
  for (let match = opener.exec(page); match; match = opener.exec(page)) {
    const kind = match[1]!.toLowerCase() as 'link' | 'style'
    if (kind === 'link') {
      if (isStylesheetLink(match[0])) found.push({ tag: match[0], kind, at: match.index })
      continue
    }
    const from = match.index + match[0].length
    const close = lower.indexOf('</style', from)
    const to = close < 0 ? page.length : close
    found.push({ tag: match[0], kind, at: match.index, content: { text: page.slice(from, to), at: from } })
    if (close < 0) break
    opener.lastIndex = to
  }
  return found
}

/** The value of an attribute that may hold spaces (`media="(max-width: 600px)"`); null without it. */
const quotedAttribute = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null
}

/**
 * The page's stylesheets in document order, as the browser applies them: `<link rel="stylesheet">` to a level file
 * (not a `disabled` one) and `<style>` blocks of index.html; tags inside `<!-- -->` don't count; a `media` attribute
 * becomes a condition of every rule of that sheet.
 */
export function styleSheets(files: Readonly<Record<string, string>>): CssSheet[] {
  const page = files['index.html'] ?? ''
  const sheets: CssSheet[] = []
  let line = 1
  let counted = 0
  const lineAt = (at: number) => {
    for (let i = counted; i < at; i++) if (page.charCodeAt(i) === 10) line++
    counted = Math.max(counted, at)
    return line
  }
  for (const tag of styleTags(page)) {
    const tagLine = lineAt(tag.at)
    const mediaText = quotedAttribute(tag.tag, 'media')?.trim()
    const media: CssCondition | undefined = mediaText && mediaText.toLowerCase() !== 'all' ? { kind: 'media', text: mediaText, line: tagLine, path: 'index.html' } : undefined
    if (tag.kind === 'style') {
      sheets.push({ path: 'index.html', source: tag.content!.text, firstLine: lineAt(tag.content!.at), ...(media ? { media } : {}) })
      continue
    }
    if (/\sdisabled(?=[\s=>/])/i.test(tag.tag)) continue
    const href = attribute(tag.tag, 'href')
    const path = href === null ? null : pageFile(href, files)
    if (path !== null) sheets.push({ path, source: files[path]!, firstLine: 1, ...(media ? { media } : {}) })
  }
  return sheets
}

/** Every style rule of the page in cascade order (stylesheets in document order, rules in source order), capped. */
export function cssRules(files: Readonly<Record<string, string>>): CssRule[] {
  return styleSheets(files).flatMap(parseCss).slice(0, MAX_CSS_RULES)
}
