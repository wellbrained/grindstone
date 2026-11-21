// The small inline markup of level text (story, goals, hints, debriefs, predictions; rendered by InlineText.vue):
// `code`, **strong** and *emphasis*. Parsed into parts and rendered as elements, never as HTML, so a level's text can't
// inject markup. Inside `code` nothing else is read (a `*` there is a character).

export type InlineKind = 'text' | 'code' | 'strong' | 'em'

export interface InlinePart {
  kind: InlineKind
  text: string
}

// **strong** before *em*; a marker hugs its words (no space inside it), so `2 * 3` or a lone `*` stays text
const EMPHASIS = /\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*/g

function emphasis(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  let at = 0
  for (const match of text.matchAll(EMPHASIS)) {
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) })
    parts.push(match[1] !== undefined ? { kind: 'strong', text: match[1] } : { kind: 'em', text: match[2]! })
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}

/** The parts of a line of level text, in order. */
export function inlineParts(text: string): InlinePart[] {
  return text.split(/`([^`]+)`/).flatMap((piece, index) => index % 2 === 1 ? [{ kind: 'code' as const, text: piece }] : emphasis(piece))
}

/**
 * A code chip's text in pieces, each ending after a `/`, `.`, `?`, `&` or `=`: the chip may wrap between them (a <wbr>),
 * so a long URL breaks at a slash before it breaks inside a word.
 */
export function codeBreaks(text: string): string[] {
  return text.length > 16 ? text.split(/(?<=[/.?&=])(?=[^/])/) : [text]
}

/** The text without its marks (for names that are read out, aria-labels, titles). */
export function plainText(text: string): string {
  return inlineParts(text).map(part => part.text).join('')
}
