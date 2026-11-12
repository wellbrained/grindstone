// "2 hours ago" for the Continue card's last played time, through the browser's Intl (the UI locale is English).
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000]
]

/** `at` relative to `now` (both ms since epoch), in the largest whole unit: 'yesterday', '3 hours ago', 'now'. */
export function relativeTime(at: number, now: number, locale = 'en'): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diff = at - now
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return format.format(Math.trunc(diff / size), unit)
  }
  return format.format(0, 'second')
}
