import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'

// Catches missing translations: every locale must have exactly the same keys as English.
// English is the only locale for now; a new file in i18n/locales/ is checked automatically.
const locales = import.meta.glob<Record<string, unknown>>('../../i18n/locales/*.json', { eager: true, import: 'default' })

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? keys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  ).sort()
}

describe('locales', () => {
  it('finds the English locale', () => {
    expect(Object.keys(locales).some(path => path.endsWith('/en.json'))).toBe(true)
  })

  for (const [path, messages] of Object.entries(locales)) {
    it(`${path.split('/').pop()} has the same keys as en`, () => {
      expect(keys(messages)).toEqual(keys(en))
    })
  }
})
