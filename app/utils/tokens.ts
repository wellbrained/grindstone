// Reading the tokens a Web fundamentals level shows (chapter 3): JSON Web Tokens in a cookie, in storage or in what the
// thief sent, decoded for the Application and Server panels as jwt.io shows them (never verified: anyone can read a
// token). Times are the scripted clock's, in GMT, as the levels' stories tell them.
import { decodeToken } from '../../shared/levels'

const JWT = /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g

/** The JSON Web Tokens in a text (a cookie header, a storage value), each decoded; at most three. */
export function tokensIn(text: string) {
  return [...text.matchAll(JWT)].map(match => ({ token: match[0], decoded: decodeToken(match[0]) })).filter(found => found.decoded !== null).slice(0, 3) as { token: string, decoded: NonNullable<ReturnType<typeof decodeToken>> }[]
}

/** A time on the scripted clock: '09:56' on the day the levels play, else '2026-12-17 09:41' (GMT). */
export function clockLabel(ms: number, now: number | null): string {
  const iso = new Date(ms).toISOString()
  const sameDay = now !== null && new Date(now).toISOString().slice(0, 10) === iso.slice(0, 10)
  return sameDay ? iso.slice(11, 16) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** How a token stands against the scripted clock: 'none' (no exp), 'expired' (ago), or 'valid' (left), in whole minutes. */
export function expiryOf(payload: Record<string, unknown>, now: number | null): { state: 'none' } | { state: 'expired' | 'valid', at: number, minutes: number } {
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return { state: 'none' }
  const at = payload.exp * 1000
  if (now === null) return { state: 'valid', at, minutes: 0 }
  return now >= at ? { state: 'expired', at, minutes: Math.floor((now - at) / 60_000) } : { state: 'valid', at, minutes: Math.ceil((at - now) / 60_000) }
}
