import { describe, expect, it } from 'vitest'
import { cheatGroups, gitSubcommands, levelsUsing } from '../../../app/utils/git-cheatsheet'
import { gitCommandNames } from '../../../shared/git'

describe('git cheat sheet', () => {
  it('finds the git subcommands of a line, also in chains', () => {
    expect(gitSubcommands('git add . && git commit -m "x"')).toEqual(['add', 'commit'])
    expect(gitSubcommands('echo "git push" > notes.txt')).toEqual([])
    expect(gitSubcommands('git push --force-with-lease')).toEqual(['push'])
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
    expect(levelsUsing('stash')).toEqual([])
  })
})
