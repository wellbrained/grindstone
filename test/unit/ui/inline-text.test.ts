import { describe, expect, it } from 'vitest'
import { levels, tracks } from '../../../shared/levels'
import { codeBreaks, inlineParts, plainText } from '../../../app/utils/inline-text'

describe('inlineParts', () => {
  it('reads `code`, **strong** and *emphasis*, the rest as text', () => {
    expect(inlineParts('the **same-origin policy**, with `fetch` and *Please sign in*.')).toEqual([
      { kind: 'text', text: 'the ' },
      { kind: 'strong', text: 'same-origin policy' },
      { kind: 'text', text: ', with ' },
      { kind: 'code', text: 'fetch' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'Please sign in' },
      { kind: 'text', text: '.' }
    ])
  })

  it('reads nothing inside code, and leaves a lone or spaced star as text', () => {
    expect(inlineParts('`a ** b` and `*x*`')).toEqual([
      { kind: 'code', text: 'a ** b' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: '*x*' }
    ])
    expect(inlineParts('2 * 3 * 4, a * and **')).toEqual([{ kind: 'text', text: '2 * 3 * 4, a * and **' }])
  })

  it('lets a long code chip wrap after a slash, a dot or a query mark, never inside a short one', () => {
    expect(codeBreaks('https://api.cornerbakery.shop/menu?day=1')).toEqual(['https://', 'api.', 'cornerbakery.', 'shop/', 'menu?', 'day=', '1'])
    expect(codeBreaks('server.js')).toEqual(['server.js'])
    expect(codeBreaks('https://api.cornerbakery.shop/').join('')).toBe('https://api.cornerbakery.shop/')
  })

  it('strips the marks for text that is read out', () => {
    expect(plainText('Lena taps **Sign in as Lena** on `mail.example`: *Please sign in*')).toBe('Lena taps Sign in as Lena on mail.example: Please sign in')
  })
})

// Every string a level shows, rendered through InlineText or as plain text: once the inline marks are read, no markdown
// may be left over (a `**word**` that shows its stars, a `[link](url)`, a heading). Code chips are exempt: their text is
// shown as written.
const LEFTOVER = [
  { name: 'stars', pattern: /\*\*|(^|[\s(])\*\S|\S\*($|[\s.,;:!?)])/ },
  { name: 'underscore emphasis', pattern: /(^|\s)__?\S[^_]*\S__?($|[\s.,;:!?])/ },
  { name: 'markdown link', pattern: /\[[^\]]+\]\([^)]+\)/ },
  { name: 'heading', pattern: /^#{1,6}\s/m }
]

/** The strings of a level a player reads: everything but code (files, setups, solutions are functions or code blocks). */
function proseOf(value: unknown, path: string, out: { path: string, text: string }[], seen = new Set<unknown>()) {
  if (typeof value === 'string') {
    out.push({ path, text: value })
    return out
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return out
  seen.add(value)
  for (const [key, child] of Object.entries(value)) {
    // a file map's entries (style.css, api.md) are code too
    if (CODE_KEYS.has(key) || /\.[a-z]+$/i.test(key)) continue
    proseOf(child, `${path}.${key}`, out, seen)
  }
  return out
}
/** Keys whose strings are code or data, never prose (shown in an editor, a terminal or not at all). */
const CODE_KEYS = new Set(['files', 'solution', 'setup', 'edits', 'at', 'code', 'source', 'html', 'css', 'js', 'commands', 'diff', 'before', 'after', 'patch', 'content', 'body', 'expression', 'id', 'track', 'chapter'])

describe('level prose', () => {
  it('has no markdown left once its inline marks are read, in every track', () => {
    const problems: string[] = []
    for (const level of levels) {
      for (const { path, text } of proseOf(level, level.id, [])) {
        const shown = inlineParts(text).filter(part => part.kind !== 'code').map(part => part.text).join('`')
        for (const { name, pattern } of LEFTOVER) {
          if (pattern.test(shown)) problems.push(`${path}: ${name} in "${text.slice(0, 120)}"`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('covers every track', () => {
    expect(new Set(levels.map(level => level.track))).toEqual(new Set(tracks.filter(track => track.status === 'live').map(track => track.id)))
  })
})
