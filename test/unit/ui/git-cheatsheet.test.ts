import { describe, expect, it } from 'vitest'
import en from '../../../layers/i18n/i18n/locales/en.json'
import { cheatGroups, groupKey, levelsUsing, noteKey, summaryKey } from '../../../app/utils/git-cheatsheet'
import { gitCommandNames } from '../../../shared/git'

/** The text behind a dotted i18n key, or undefined when a part of the path is missing. */
const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)

describe('git cheat sheet', () => {
  it('has an English text for every group, summary and example note', () => {
    const keys = cheatGroups.flatMap(group => [
      groupKey(group.id),
      ...group.commands.flatMap(command => [summaryKey(command.name), ...command.examples.map((_, i) => noteKey(command.name, i))])
    ])
    expect(keys.filter(key => typeof lookup(key) !== 'string' || lookup(key) === '')).toEqual([])
  })

  it('has no cheat sheet text without a place on the page', () => {
    const cheat = en.cheat as { groups: Record<string, string>, commands: Record<string, { summary: string, examples: Record<string, string> }> }
    const commands = cheatGroups.flatMap(group => group.commands)
    expect(Object.keys(cheat.groups).sort()).toEqual(cheatGroups.map(group => group.id).sort())
    expect(Object.keys(cheat.commands).sort()).toEqual(commands.map(command => command.name).sort())
    for (const command of commands) {
      expect(Object.keys(cheat.commands[command.name]!.examples), command.name).toHaveLength(command.examples.length)
    }
  })

  it('lists only commands the trainer supports, unless marked as coming soon', () => {
    for (const command of cheatGroups.flatMap(group => group.commands)) {
      expect(command.comingSoon || gitCommandNames.includes(command.name), command.name).toBe(true)
    }
  })

  it('covers every supported git command', () => {
    const listed = cheatGroups.flatMap(group => group.commands.map(command => command.name))
    expect(gitCommandNames.filter(name => !listed.includes(name))).toEqual([])
  })

  it('links commands to the levels that use them', () => {
    expect(levelsUsing('init').map(level => level.id)).toContain('git-01-first-commit')
    expect(levelsUsing('rebase').length).toBeGreaterThan(0)
    expect(levelsUsing('stash').map(level => level.id)).toEqual(['git-15-park-unfinished-work', 'git-36-hotfix-mid-feature'])
    expect(levelsUsing('cherry-pick').map(level => level.id)).toEqual(['git-37-fix-the-release-branch'])
    expect(levelsUsing('tag').map(level => level.id)).toEqual(['git-38-tag-a-release', 'git-39-gitflow-release'])
  })
})
