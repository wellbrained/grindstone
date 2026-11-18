import { describe, expect, it } from 'vitest'
import { clockLabel, expiryOf, tokensIn } from '../../../app/utils/tokens'
import { WEB_CLOCK } from '../../../shared/levels'

// Reading tokens for the Application and Server panels (chapter 3): JSON Web Tokens found in a cookie, a storage value
// or what the thief sent, and their times against the scripted clock.

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsZW5hIiwiaWF0IjoxNzk0OTA4NDYwLCJleHAiOjE3OTQ5MTIwNjB9.o0kJVy6__1eQdV3OeTRbv9XEBJxgt1_PSaSK-OyLCYs'

describe('tokens in the panels', () => {
  it('finds the tokens in a text (a cookie header, JSON in storage) and decodes them; anything else is none', () => {
    expect(tokensIn(`authorization: Bearer ${TOKEN}`).map(found => found.decoded.payload)).toEqual([{ sub: 'lena', iat: 1794908460, exp: 1794912060 }])
    expect(tokensIn(JSON.stringify({ token: TOKEN, again: TOKEN })).length).toBe(2)
    expect(tokensIn('session=lena-7f3a; theme=dark')).toEqual([])
    expect(tokensIn('Butter.croissant.and.rye')).toEqual([])
  })

  it('tells a time on the levels\' day as HH:MM, another day with its date, and how a token stands', () => {
    expect(clockLabel(WEB_CLOCK + 15 * 60_000, WEB_CLOCK)).toBe('09:56')
    expect(clockLabel(WEB_CLOCK + 30 * 86_400_000, WEB_CLOCK)).toBe('2026-12-17 09:41')
    expect(expiryOf({ sub: 'lena' }, WEB_CLOCK)).toEqual({ state: 'none' })
    expect(expiryOf({ exp: WEB_CLOCK / 1000 + 900 }, WEB_CLOCK)).toEqual({ state: 'valid', at: WEB_CLOCK + 900_000, minutes: 15 })
    expect(expiryOf({ exp: WEB_CLOCK / 1000 - 300 }, WEB_CLOCK)).toEqual({ state: 'expired', at: WEB_CLOCK - 300_000, minutes: 5 })
  })
})
