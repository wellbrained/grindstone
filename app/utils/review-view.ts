// How the review page names where a comment sits (docs/features/ui.md, "Working with AI play page"): pure, so it is
// unit tested. A comment on lines after the pull request is named by them (an unchanged row has a line on each side,
// the one after counts); one on removed rows only, by the lines it removed.
import type { CommentPlace, LineSpan } from '../../shared/levels'

type Translate = (key: string, named: Record<string, unknown>) => string

const spanText = (span: LineSpan) => span.start === span.end ? String(span.start) : `${span.start}–${span.end}`

/** The lines as words: 'line 37', 'lines 10 to 13', 'removed line 9' (through i18n: review.place.*). */
export function placeText(t: Translate, place: CommentPlace): string {
  const span = place.head ?? place.base
  if (!span) return ''
  const kind = place.head ? 'line' : 'removed'
  return span.start === span.end
    ? t(`review.place.${kind}`, { line: span.start })
    : t(`review.place.${kind}s`, { from: span.start, to: span.end })
}

/** The place as a short label, like a link to it: 'cart.js:37', 'summary.js:10–13', 'cart.js:−9' (removed). */
export function placeShort(place: CommentPlace): string {
  if (place.head) return `${place.path}:${spanText(place.head)}`
  if (place.base) return `${place.path}:−${spanText(place.base)}`
  return place.path
}
