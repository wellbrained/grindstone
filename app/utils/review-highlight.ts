// Syntax colours for the review diff (docs/features/ui.md, "Working with AI play page"): the editor's own languages
// (lezer parsers from @codemirror/lang-*, each its own chunk, loaded the first time a file of that kind shows), run over
// a whole file once, then cut into lines of tokens. A token is text and a class of theme colours, never HTML: the diff
// renders each one as text. Until a language is there (or for a file of no known kind) the line is plain text.
import { highlightCode, tagHighlighter, tags } from '@lezer/highlight'

/** A language's parser: text in, a syntax tree out (`@lezer/common`'s Parser, which is not a direct dependency). */
interface Parser {
  parse: (text: string) => Parameters<typeof highlightCode>[1]
}

export interface Token {
  text: string
  /** Theme colour classes ('' for plain text). */
  cls: string
}

/** The editor's colours (app/editor/codemirror.ts), as classes of the theme's tokens. */
const highlighter = tagHighlighter([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword], class: 'text-secondary' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'text-success' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'text-warning' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'text-dimmed italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'text-info' },
  { tag: [tags.typeName, tags.className], class: 'text-warning' },
  { tag: [tags.tagName], class: 'text-secondary' },
  { tag: [tags.attributeName], class: 'text-info' },
  { tag: [tags.propertyName], class: 'text-toned' },
  { tag: tags.invalid, class: 'text-error' }
])

type Kind = 'javascript' | 'css' | 'html'

function kindOf(path: string): Kind | null {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (['js', 'mjs', 'cjs'].includes(extension)) return 'javascript'
  if (extension === 'css') return 'css'
  if (['html', 'htm'].includes(extension)) return 'html'
  return null
}

const parsers = new Map<Kind, Promise<Parser>>()
function parserOf(kind: Kind): Promise<Parser> {
  let parser = parsers.get(kind)
  if (!parser) {
    parser = kind === 'css'
      ? import('@codemirror/lang-css').then(module => module.cssLanguage.parser)
      : kind === 'html'
        ? import('@codemirror/lang-html').then(module => module.htmlLanguage.parser)
        : import('@codemirror/lang-javascript').then(module => module.javascriptLanguage.parser)
    parser.catch(() => parsers.delete(kind))
    parsers.set(kind, parser)
  }
  return parser
}

/** The file cut into lines of tokens (1-based line n is index n - 1); null for a file of no known kind. */
export async function highlightLines(path: string, text: string): Promise<Token[][] | null> {
  const kind = kindOf(path)
  if (!kind) return null
  const parser = await parserOf(kind)
  const lines: Token[][] = [[]]
  highlightCode(text, parser.parse(text), highlighter, (piece, cls) => {
    lines.at(-1)!.push({ text: piece, cls })
  }, () => {
    lines.push([])
  })
  return lines
}
