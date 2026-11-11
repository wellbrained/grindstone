import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import de from '../../i18n/locales/de.json'

// Catches missing translations: every locale must have exactly the same keys as English
function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? keys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  ).sort()
}

describe('locales', () => {
  it('de has the same keys as en', () => {
    expect(keys(de)).toEqual(keys(en))
  })
})
