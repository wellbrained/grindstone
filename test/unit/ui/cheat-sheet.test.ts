import { describe, expect, it } from 'vitest'
import en from '../../../layers/i18n/i18n/locales/en.json'
import { buildCheatSheet, filterCheatSheet } from '../../../app/utils/cheat-sheet'
import type { Translate } from '../../../app/utils/cheat-sheet'
import { debugCheatGroups, debugCheatSource, debugErrorTypes } from '../../../app/utils/debugging-cheatsheet'
import { browserMessages, webCheatGroups, webCheatSource } from '../../../app/utils/web-cheatsheet'

/** `t` over the English locale; a missing text throws, so a card can never show a key. */
const t: Translate = (key) => {
  const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  if (typeof text !== 'string') throw new Error(`no text for ${key}`)
  return text
}

const sheets = [
  { name: 'Debugging', source: debugCheatSource, groups: debugCheatGroups, messages: debugErrorTypes, last: 'errors' },
  { name: 'Web', source: webCheatSource, groups: webCheatGroups, messages: browserMessages, last: 'messages' }
]

describe.each(sheets)('$name cheat sheet cards', ({ source, groups, messages, last }) => {
  const sections = buildCheatSheet(source, t)

  it('has one section per group in the chips\' order, the messages last', () => {
    expect(sections.map(section => section.id)).toEqual([...groups.map(group => group.id), last])
    expect(sections.at(-1)!.cards).toHaveLength(messages.length)
  })

  it('gives every card a heading, a rule, a disclosure with its text, and its levels', () => {
    for (const section of sections) {
      for (const card of section.cards) {
        const where = `${section.id}/${card.id}`
        expect(card.title, where).not.toBe('')
        expect(card.rule, where).not.toBe('')
        expect(card.details, where).not.toBe('')
        expect(card.detailsLabel, where).not.toBe('')
        expect(card.message, where).toBe(section.id === last)
      }
    }
  })

  it('keeps the entries\' summaries whole behind the disclosure', () => {
    const entry = groups[0]!.entries[0]!
    const card = sections[0]!.cards[0]!
    expect(card.id).toBe(entry.id)
    expect(card.details).toBe(source.keys.summary(entry.id).split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en))
  })

  it('keeps every example line, copyable as it was', () => {
    for (const [index, group] of groups.entries()) {
      group.entries.forEach((entry, entryIndex) => {
        const card = sections[index]!.cards[entryIndex]!
        expect(card.examples.map(example => example.line)).toEqual(entry.examples.map(example => example.line))
        expect(card.examples.map(example => example.copy)).toEqual(entry.examples.map(example => example.copy !== false))
      })
    }
  })

  describe('filter', () => {
    const count = (query: string) => filterCheatSheet(sections, query).flatMap(section => section.cards).length
    const total = sections.flatMap(section => section.cards).length

    it('keeps everything, closed, for an empty or blank query', () => {
      for (const query of ['', '   ']) {
        const shown = filterCheatSheet(sections, query)
        expect(shown.map(section => section.id)).toEqual(sections.map(section => section.id))
        expect(shown.flatMap(section => section.cards).every(card => !card.reveal)).toBe(true)
      }
      expect(count('')).toBe(total)
    })

    it('matches the heading, the rule, the example lines and notes, and the text behind the disclosure', () => {
      const card = sections[0]!.cards.find(each => each.examples.length)!
      const find = (query: string) => filterCheatSheet(sections, query).flatMap(section => section.cards).find(each => each.id === card.id && !each.message)
      expect(find(card.title.toUpperCase())?.reveal).toBe(false)
      expect(find(card.rule)?.reveal).toBe(false)
      expect(find(card.examples[0]!.line)?.reveal).toBe(false)
      expect(find(card.examples[0]!.note)?.reveal).toBe(false)
      expect(find(card.details)?.reveal).toBe(true)
    })

    it('opens the disclosure only when the text behind it is the only match', () => {
      for (const section of sections) {
        for (const card of section.cards) {
          const outside = [card.title, card.rule, ...card.examples.flatMap(example => [example.line, example.note])].some(text => text.toLowerCase().includes(card.details.toLowerCase()))
          const shown = filterCheatSheet(sections, card.details).find(each => each.id === section.id)?.cards.find(each => each.id === card.id)
          expect(shown, `${section.id}/${card.id}`).toBeDefined()
          expect(shown!.reveal, `${section.id}/${card.id}`).toBe(!outside)
        }
      }
    })

    it('leaves out a section with no match, and everything for a query nothing matches', () => {
      expect(count('zzzz-nothing')).toBe(0)
      expect(filterCheatSheet(sections, 'zzzz-nothing')).toEqual([])
      const message = sections.at(-1)!.cards[0]!
      expect(filterCheatSheet(sections, message.title).map(section => section.id)).toContain(last)
    })
  })
})
