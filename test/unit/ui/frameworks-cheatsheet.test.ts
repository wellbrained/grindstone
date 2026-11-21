import { describe, expect, it } from 'vitest'
import en from '../../../layers/i18n/i18n/locales/en.json'
import { fwCheatGroups, fwGroupKey, fwMessageKey, fwNoteKey, fwRuleKey, fwSummaryKey, fwTitleKey, vueMessages } from '../../../app/utils/frameworks-cheatsheet'
import { frameworksLevels, levelPlace, trackById } from '../../../shared/levels'

// The Framework deep dives cheat sheet (/frameworks/cheat-sheet): the same frame as the Web fundamentals sheet, its
// texts under fwCheat.*, Vue's warnings quoted as the levels' runs print them (e2e/frameworks-levels.spec.ts checks
// the levels' facts against real Vue; e2e/cheat-sheets.spec.ts plays the page).

const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
const entries = fwCheatGroups.flatMap(group => group.entries)

describe('framework deep dives cheat sheet', () => {
  it('is the track\'s cheat sheet, one group per chapter in chapter order', () => {
    const track = trackById('frameworks')!
    expect(track.cheatSheet).toBe('/frameworks/cheat-sheet')
    expect(fwCheatGroups.map(group => group.id)).toEqual(track.chapters.map(chapter => chapter.id))
    for (const chapter of track.chapters) expect(lookup(fwGroupKey(chapter.id)), chapter.id).toBe(chapter.title)
  })

  it('has an English text for every group, title, rule, summary, example note and message, and none without a place', () => {
    const keys = [
      ...fwCheatGroups.map(group => fwGroupKey(group.id)),
      fwGroupKey('messages'),
      ...entries.flatMap(entry => [fwTitleKey(entry.id), fwRuleKey(entry.id), fwSummaryKey(entry.id), ...entry.examples.map((_, i) => fwNoteKey(entry.id, i))]),
      ...vueMessages.flatMap(message => [fwMessageKey(message.id, 'means'), fwMessageKey(message.id, 'look')])
    ]
    expect(keys.filter(key => typeof lookup(key) !== 'string' || lookup(key) === '')).toEqual([])
    const sheet = en.fwCheat as { entries: Record<string, { examples?: Record<string, string> }>, messages: Record<string, unknown> }
    expect(Object.keys(sheet.entries).sort()).toEqual(entries.map(entry => entry.id).sort())
    for (const entry of entries) expect(Object.keys(sheet.entries[entry.id]!.examples ?? {}), entry.id).toHaveLength(entry.examples.length)
    expect(Object.keys(sheet.messages).sort()).toEqual(vueMessages.map(message => message.id).sort())
    expect(Object.keys(en.fwCheat).filter(key => typeof (en.fwCheat as Record<string, unknown>)[key] === 'string').sort())
      .toEqual(['copied', 'copy', 'intro', 'look', 'none', 'practise', 'search', 'sections', 'title', 'why'])
  })

  it('gives every card a one-line rule of its own, and keeps vue-i18n syntax out of the texts', () => {
    for (const entry of entries) {
      const rule = lookup(fwRuleKey(entry.id)) as string
      expect(rule.length, entry.id).toBeLessThanOrEqual(110)
      expect(rule, entry.id).not.toBe(lookup(fwTitleKey(entry.id)))
      expect(rule, entry.id).not.toBe(lookup(fwSummaryKey(entry.id)))
    }
    const texts: string[] = []
    const walk = (node: unknown) => {
      if (typeof node === 'string') texts.push(node)
      else if (node && typeof node === 'object') Object.values(node).forEach(walk)
    }
    walk({ ...en.fwCheat, none: '', copy: '', copied: '' })
    expect(texts.filter(text => /[{}|@]/.test(text))).toEqual([])
  })

  it('has no duplicate ids, and links only to the track\'s scenarios, in level order, each in its own chapter', () => {
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length)
    expect(new Set(vueMessages.map(message => message.id)).size).toBe(vueMessages.length)
    for (const group of fwCheatGroups) {
      for (const entry of group.entries) {
        const places = entry.levels.map(id => levelPlace(id))
        expect(places.every(place => place?.track.id === 'frameworks' && place.chapter.id === group.id && place.level.kind === 'scenario'), entry.id).toBe(true)
        expect([...entry.levels].sort((a, b) => places[entry.levels.indexOf(a)]!.index - places[entry.levels.indexOf(b)]!.index)).toEqual(entry.levels)
      }
    }
    for (const message of vueMessages) for (const id of message.levels) expect(levelPlace(id)?.track.id, message.id).toBe('frameworks')
  })

  it('links every scenario of the track from somewhere on the sheet', () => {
    const linked = new Set([...entries.flatMap(entry => entry.levels), ...vueMessages.flatMap(message => message.levels)])
    expect(frameworksLevels.filter(level => level.kind === 'scenario' && !linked.has(level.id)).map(level => level.id)).toEqual([])
  })

  it('quotes Vue\'s warnings in the words the levels\' facts check', () => {
    for (const message of vueMessages) {
      for (const id of message.levels) {
        const level = frameworksLevels.find(each => each.id === id)!
        const says = level.prediction.questions.flatMap(question => question.options.flatMap(option => option.fact && 'says' in option.fact ? [option.fact.says] : []))
        expect(says.some(text => message.message.startsWith(text)), `${message.id} in ${id}`).toBe(true)
      }
    }
  })
})
