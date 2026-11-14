// How the review page names where a comment sits (docs/features/ui.md, "Working with AI play page"): pure, so it is
// unit tested. A comment on lines after the pull request is named by them (an unchanged row has a line on each side,
// the one after counts); one on removed rows only, by the lines it removed; one on Sous's description, by its lines.
import { DESCRIPTION_PATH } from '../../shared/levels'
import type { CommentPlace, LineSpan, Spot } from '../../shared/levels'

type Translate = (key: string, named: Record<string, unknown>) => string

const spanText = (span: LineSpan) => span.start === span.end ? String(span.start) : `${span.start}–${span.end}`

/**
 * The lines as words: 'line 37', 'lines 10 to 13', 'removed line 9', 'line 3 of the description' (through i18n:
 * review.place.*).
 */
export function placeText(t: Translate, place: CommentPlace): string {
  const span = place.head ?? place.base
  if (!span) return ''
  const kind = place.path === DESCRIPTION_PATH ? 'descriptionLine' : place.head ? 'line' : 'removed'
  return span.start === span.end
    ? t(`review.place.${kind}`, { line: span.start })
    : t(`review.place.${kind}s`, { from: span.start, to: span.end })
}

/**
 * Where a planted issue can be pointed at, as short labels in the page's order: the description first, then the files
 * in path order, each by its first line ('description:1', 'description:2', 'cart.js:19'). For the debrief.
 */
export function issuePlaces(issue: Spot & { also?: readonly Spot[] }): string[] {
  const first = (spot: Spot) => spot.lines?.[0] ?? spot.removed?.[0] ?? 0
  return [issue, ...(issue.also ?? [])]
    .sort((a, b) => Number(b.path === DESCRIPTION_PATH) - Number(a.path === DESCRIPTION_PATH) || a.path.localeCompare(b.path) || first(a) - first(b))
    .map(spot => placeShort({
      path: spot.path,
      head: spot.lines ? { start: spot.lines[0], end: spot.lines[1] } : null,
      base: spot.removed ? { start: spot.removed[0], end: spot.removed[1] } : null
    }))
}

/** The place as a short label, like a link to it: 'cart.js:37', 'summary.js:10–13', 'cart.js:−9' (removed), 'description:3'. */
export function placeShort(place: CommentPlace): string {
  if (place.head) return `${place.path}:${spanText(place.head)}`
  if (place.base) return `${place.path}:−${spanText(place.base)}`
  return place.path
}
