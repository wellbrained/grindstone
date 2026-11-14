import { describe, expect, it } from 'vitest'
import en from '../../../layers/i18n/i18n/locales/en.json'
import { aiCheatGroups, aiCheatLevels, aiGroupKey, aiNoteKey, aiSummaryKey, aiTitleKey } from '../../../app/utils/ai-cheatsheet'
import { aiLevels, aiTrack, levelById } from '../../../shared/levels'
import type { ReviewLevel } from '../../../shared/levels'

/** The text behind a dotted i18n key, or undefined when a part of the path is missing. */
const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)

const entries = aiCheatGroups.flatMap(group => group.entries)

/**
 * Everything a level shows as code: its pull request's files before and after, and in a steer level every text Sous's
 * commits can put in (its fixes, wrong fixes and overreaches).
 */
function codeOf(level: ReviewLevel): string {
  const steer = level.steer
    ? [...level.steer.problems.flatMap(problem => [problem.fix, ...(problem.misread ?? [])]), ...(level.steer.tempting ?? []).flatMap(spot => spot.overreach ? [spot.overreach] : [])]
        .flatMap(reaction => reaction.edits.flatMap(edit => 'replace' in edit ? [edit.replace[1]] : []))
    : []
  return [...Object.values(level.pr.base), ...Object.values(level.pr.head), ...steer].join('\n')
}

describe('Working with AI cheat sheet', () => {
  it('has an English text for every group, title, summary and example note', () => {
    const keys = [
      ...aiCheatGroups.map(group => aiGroupKey(group.id)),
      ...entries.flatMap(entry => [aiTitleKey(entry.id), aiSummaryKey(entry.id), ...entry.examples.map((_, i) => aiNoteKey(entry.id, i))])
    ]
    expect(keys.filter(key => typeof lookup(key) !== 'string' || lookup(key) === '')).toEqual([])
  })

  it('has no sheet text without a place on the page', () => {
    const sheet = en.aiCheat as { groups: Record<string, string>, entries: Record<string, { examples?: Record<string, string> }> }
    expect(Object.keys(sheet.groups).sort()).toEqual(aiCheatGroups.map(group => group.id).sort())
    expect(Object.keys(sheet.entries).sort()).toEqual(entries.map(entry => entry.id).sort())
    for (const entry of entries) expect(Object.keys(sheet.entries[entry.id]!.examples ?? {}), entry.id).toHaveLength(entry.examples.length)
  })

  it('keeps the characters vue-i18n reads as syntax (braces, pipes, at signs) out of the texts', () => {
    const strings: string[] = []
    const walk = (node: unknown) => typeof node === 'string' ? strings.push(node) : Object.values(node as object).forEach(walk)
    walk(en.aiCheat)
    // {query} and {line} are the page's own placeholders
    expect(strings.filter(text => /[{}|@]/.test(text.replace(/\{(query|line)\}/g, '')))).toEqual([])
  })

  it('has one section per chapter of the track, in its order: what to check, then steering', () => {
    expect(aiCheatGroups.map(group => group.chapter)).toEqual(aiTrack.chapters.map(chapter => chapter.id))
  })

  it('has no duplicate ids, example lines or level links', () => {
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length)
    expect(new Set(aiCheatGroups.map(group => group.id)).size).toBe(aiCheatGroups.length)
    for (const entry of entries) {
      expect(new Set(entry.examples.map(example => example.line)).size, entry.id).toBe(entry.examples.length)
      expect(new Set(entry.levels).size, entry.id).toBe(entry.levels.length)
    }
  })

  it('links only to Working with AI scenarios that exist, in level order, and every card to one at least', () => {
    const order = aiLevels.map(level => level.id)
    for (const { id, levels } of entries) {
      expect(levels.length, id).toBeGreaterThan(0)
      for (const levelId of levels) {
        const level = levelById(levelId)
        expect(level, `${id}: ${levelId}`).toBeDefined()
        expect(level?.track, levelId).toBe('ai')
        expect(level?.kind, levelId).toBe('scenario')
      }
      const positions = levels.map(levelId => order.indexOf(levelId))
      expect(positions, id).toEqual([...positions].sort((a, b) => a - b))
      expect(aiCheatLevels(levels).map(level => level.id), id).toEqual(levels)
    }
  })

  it('links every scenario of the track from somewhere on the sheet, each from its own chapter\'s section', () => {
    const linked = new Set(entries.flatMap(entry => entry.levels))
    const scenarios = aiLevels.filter(level => level.kind === 'scenario')
    expect(scenarios.map(level => level.id).filter(id => !linked.has(id))).toEqual([])
    for (const group of aiCheatGroups) {
      const chapter = aiTrack.chapters.find(each => each.id === group.chapter)!
      const own = chapter.levels.filter(level => level.kind === 'scenario').map(level => level.id)
      expect(own.filter(id => !group.entries.some(entry => entry.levels.includes(id))), group.id).toEqual([])
    }
  })

  it('quotes every line as a level it links shows it: in its pull request, or in a commit Sous can push', () => {
    for (const entry of entries) {
      for (const { line } of entry.examples) {
        const levels = entry.levels.map(id => levelById(id) as ReviewLevel)
        expect(levels.some(level => codeOf(level).includes(line)), `${entry.id}: ${line}`).toBe(true)
      }
    }
  })
})
