import { describe, expect, it } from 'vitest'
import { complete } from '../../../app/utils/completion'
import type { CompletionContext } from '../../../app/utils/completion'

const context: CompletionContext = {
  trainerCommands: ['undo', 'reset', 'hint', 'help', 'clear', 'edit'],
  gitCommands: ['add', 'branch', 'commit', 'checkout', 'switch', 'push', 'merge'],
  shellCommands: ['ls', 'cat', 'echo', 'rm', 'touch'],
  branches: ['main', 'feature/login', 'feature/footer', 'origin/main'],
  files: ['README.md', 'src/login.ts', 'src/footer.ts']
}

describe('complete', () => {
  it('completes a trainer command, git and shell commands at the start', () => {
    expect(complete('hi', context).input).toBe('hint ')
    expect(complete('gi', context).input).toBe('git ')
    expect(complete('to', context).input).toBe('touch ')
  })

  it('lists the choices and extends to the common prefix', () => {
    const result = complete('h', context)
    expect(result.candidates).toEqual(['help', 'hint'])
    expect(result.input).toBe('h')
    expect(complete('git c', context)).toEqual({ input: 'git c', candidates: ['checkout', 'commit'] })
    expect(complete('git ch', context).input).toBe('git checkout ')
  })

  it('completes git subcommands', () => {
    expect(complete('git sw', context).input).toBe('git switch ')
    expect(complete('git ', context).candidates).toEqual(['add', 'branch', 'checkout', 'commit', 'merge', 'push', 'switch'])
  })

  it('completes branch names for branch commands, with a shared prefix', () => {
    expect(complete('git switch feature/l', context).input).toBe('git switch feature/login ')
    expect(complete('git merge fea', context)).toEqual({ input: 'git merge feature/', candidates: ['feature/footer', 'feature/login'] })
    expect(complete('git push origin ma', context).candidates).toEqual(['main'])
    expect(complete('git push or', context)).toEqual({ input: 'git push origin', candidates: ['origin', 'origin/main'] })
  })

  it('completes file names for add and the shell commands', () => {
    expect(complete('git add RE', context).input).toBe('git add README.md ')
    expect(complete('cat src/lo', context).input).toBe('cat src/login.ts ')
    expect(complete('edit src/', context).candidates).toEqual(['src/footer.ts', 'src/login.ts'])
  })

  it('offers nothing for flags, unknown commands or no match', () => {
    expect(complete('git commit -', context)).toEqual({ input: 'git commit -', candidates: [] })
    expect(complete('frobnicate x', context)).toEqual({ input: 'frobnicate x', candidates: [] })
    expect(complete('git switch zzz', context)).toEqual({ input: 'git switch zzz', candidates: [] })
  })

  it('completes files for restore and reset, revisions for reset and revert, and the stash subcommands', () => {
    expect(complete('git restore --staged RE', context).input).toBe('git restore --staged README.md ')
    expect(complete('git reset src/f', context).input).toBe('git reset src/footer.ts ')
    expect(complete('git revert ma', context).input).toBe('git revert main ')
    expect(complete('git stash p', context).candidates).toEqual(['pop', 'push'])
    expect(complete('git stash pop x', context).candidates).toEqual([])
  })

  it('does not offer branch names for a subcommand that takes none', () => {
    expect(complete('git add ma', context).candidates).toEqual([])
  })
})
