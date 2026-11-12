import { describe, expect, it } from 'vitest'
import {
  chapterOf,
  chapterProgress,
  continueTarget,
  defineTrack,
  emptyProgress,
  gitLevels,
  gitTrack,
  gitSubcommands,
  hasProgress,
  levelCommands,
  levelNumber,
  levelPlace,
  levels,
  nextLevel,
  nextUp,
  trackById,
  trackLevels,
  trackProgress,
  trackToContinue,
  tracks
} from '../../../shared/levels'
import { BIG_CHAPTER_SIZES, bigTrack, solvedProgress } from './fixtures'

const git = trackById('git')!

describe('track registry', () => {
  it('lists git as the live track and the upcoming ones as coming, without chapters', () => {
    expect(tracks.map(track => [track.id, track.status])).toEqual([
      ['git', 'live'],
      ['ai', 'coming'],
      ['web', 'coming'],
      ['debugging', 'coming'],
      ['frameworks', 'coming']
    ])
    for (const track of tracks) {
      expect(track.title).not.toBe('')
      expect(track.scope).not.toBe('')
      if (track.status === 'coming') expect(track.chapters).toEqual([])
    }
    expect(trackById('nope')).toBeNull()
  })

  it('gives git its eight chapters, numbered in order, each with its own colour', () => {
    expect(git.chapters.map(chapter => [chapter.number, chapter.title])).toEqual([
      [1, 'Basics'],
      [2, 'Branching'],
      [3, 'Merging'],
      [4, 'Rewriting history'],
      [5, 'Teamwork & remotes'],
      [6, 'Undo & recovery'],
      [7, 'Disasters'],
      [8, 'Workflows']
    ])
    expect(new Set(git.chapters.map(chapter => chapter.colour)).size).toBe(8)
    expect(new Set(git.chapters.map(chapter => chapter.id)).size).toBe(8)
    for (const chapter of git.chapters) {
      expect(chapter.trackId).toBe('git')
      expect(chapter.description).not.toBe('')
    }
  })

  it('maps the six levels to their chapters and leaves chapters 6 to 8 empty', () => {
    expect(git.chapters.map(chapter => chapter.levels.map(level => level.id))).toEqual([
      ['git-01-first-commit'],
      ['git-02-branch'],
      ['git-03-merge', 'git-04-merge-conflict'],
      ['git-05-rebase'],
      ['git-06-teammate-sync'],
      [],
      [],
      []
    ])
  })

  it('derives the play order from the chapters, every level in exactly one chapter', () => {
    expect(trackLevels(git)).toEqual(gitLevels)
    expect(levels.map(level => level.id)).toEqual(tracks.flatMap(track => trackLevels(track).map(level => level.id)))
    const ids = levels.map(level => level.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const level of levels) expect(chapterOf(level.id)?.trackId).toBe(level.track)
  })

  it('refuses a level of another track, a level listed twice and a coming track with levels', () => {
    const level = gitLevels[0]!
    const chapter = { id: 'c', title: 'C', description: 'C.', colour: 0 as const, levels: [level] }
    const base = { title: 'T', scope: 'S', description: 'D.' }
    expect(() => defineTrack({ ...base, id: 'ai', status: 'live', chapters: [chapter] })).toThrow(/git level/)
    expect(() => defineTrack({ ...base, id: 'git', status: 'live', chapters: [chapter, { ...chapter, id: 'd' }] })).toThrow(/twice/)
    expect(() => defineTrack({ ...base, id: 'git', status: 'coming', chapters: [chapter] })).toThrow(/coming/)
    expect(defineTrack({ ...base, id: 'git', status: 'live', chapters: [chapter] }).cheatSheet).toBeNull()
    expect(gitTrack.cheatSheet).toBe('/git/cheat-sheet')
    expect(gitTrack.tagline).not.toBe('')
  })
})

describe('level numbers and places', () => {
  it('numbers levels chapter.position', () => {
    expect(levelNumber('git-01-first-commit')).toBe('1.1')
    expect(levelNumber('git-03-merge')).toBe('3.1')
    expect(levelNumber('git-04-merge-conflict')).toBe('3.2')
    expect(levelNumber('git-06-teammate-sync')).toBe('5.1')
    expect(levelNumber('nope')).toBeNull()
  })

  it('knows the track, chapter and position of a level', () => {
    const place = levelPlace('git-04-merge-conflict')!
    expect(place.track.id).toBe('git')
    expect(place.chapter.title).toBe('Merging')
    expect(place.position).toBe(2)
    expect(place.index).toBe(3)
    expect(place.level.title).toBe('Merge conflict')
    expect(chapterOf('git-05-rebase')?.title).toBe('Rewriting history')
    expect(chapterOf('nope')).toBeNull()
  })

  it('numbers a 58-level track without gaps', () => {
    const track = bigTrack()
    const all = trackLevels(track)
    expect(all).toHaveLength(58)
    expect(levelNumber('big-1-1', [track])).toBe('1.1')
    expect(levelNumber('big-1-8', [track])).toBe('1.8')
    expect(levelNumber('big-2-1', [track])).toBe('2.1')
    expect(levelNumber('big-7-11', [track])).toBe('7.11')
    expect(levelPlace('big-7-11', [track])?.index).toBe(57)
    expect(track.chapters.map(chapter => chapter.levels.length)).toEqual(BIG_CHAPTER_SIZES)
  })
})

describe('next level', () => {
  it('follows the track order across chapter boundaries', () => {
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-02-branch')
    expect(nextLevel('git-03-merge')?.id).toBe('git-04-merge-conflict')
    expect(nextLevel('git-04-merge-conflict')?.id).toBe('git-05-rebase')
    expect(nextLevel('git-06-teammate-sync')).toBeNull()
    expect(nextLevel('nope')).toBeNull()
    const track = bigTrack()
    expect(nextLevel('big-1-8', [track])?.id).toBe('big-2-1')
    // the empty last chapter is skipped: 7.11 is the end
    expect(nextLevel('big-7-11', [track])).toBeNull()
  })
})

describe('next up and continue', () => {
  it('next up is the first unsolved level in play order', () => {
    expect(nextUp(git, emptyProgress())?.level.id).toBe('git-01-first-commit')
    expect(nextUp(git, solvedProgress(['git-01-first-commit', 'git-03-merge']))?.level.id).toBe('git-02-branch')
    expect(nextUp(git, solvedProgress(gitLevels.map(level => level.id)))).toBeNull()
    const track = bigTrack()
    const firstEight = Array.from({ length: 8 }, (_, i) => `big-1-${i + 1}`)
    expect(nextUp(track, solvedProgress(firstEight))?.number).toBe('2.1')
  })

  it('continues the last played level while it is unsolved', () => {
    const progress = solvedProgress(['git-01-first-commit'], { levelId: 'git-04-merge-conflict', at: 1000 })
    expect(continueTarget(git, progress)).toMatchObject({ resume: true, at: 1000, place: { number: '3.2' } })
  })

  it('falls back to next up when the last played level is solved, unknown or in another track', () => {
    const solvedLast = solvedProgress(['git-01-first-commit'], { levelId: 'git-01-first-commit', at: 5 })
    expect(continueTarget(git, solvedLast)).toMatchObject({ resume: false, place: { number: '2.1' } })
    const unknown = solvedProgress([], { levelId: 'git-99-gone', at: 5 })
    expect(continueTarget(git, unknown)).toMatchObject({ resume: false, place: { number: '1.1' } })
    expect(continueTarget(git, emptyProgress())).toMatchObject({ resume: false, at: null, place: { number: '1.1' } })
  })

  it('has nothing to continue when every level is solved', () => {
    const all = solvedProgress(gitLevels.map(level => level.id), { levelId: 'git-06-teammate-sync', at: 5 })
    expect(continueTarget(git, all)).toBeNull()
  })
})

describe('progress counts', () => {
  it('counts solved levels per track and chapter, ignoring unknown ids and unsolved entries', () => {
    const progress = solvedProgress(['git-03-merge', 'git-04-merge-conflict', 'git-01-first-commit', 'elsewhere'])
    progress.levels['git-02-branch'] = { solved: false, hintsUsed: 0, commands: 0, bestCommands: 0 }
    expect(trackProgress(git, progress)).toEqual({ solved: 3, total: 6 })
    expect(git.chapters.map(chapter => chapterProgress(chapter, progress))).toEqual([
      { solved: 1, total: 1 },
      { solved: 0, total: 1 },
      { solved: 2, total: 2 },
      { solved: 0, total: 1 },
      { solved: 0, total: 1 },
      { solved: 0, total: 0 },
      { solved: 0, total: 0 },
      { solved: 0, total: 0 }
    ])
    expect(trackProgress(trackById('ai')!, progress)).toEqual({ solved: 0, total: 0 })
  })
})

describe('commands a level practises', () => {
  it('finds the git subcommands of a line, also in chains', () => {
    expect(gitSubcommands('git add . && git commit -m "x"')).toEqual(['add', 'commit'])
    expect(gitSubcommands('echo "git push" > notes.txt')).toEqual([])
    expect(gitSubcommands('git push --force-with-lease')).toEqual(['push'])
  })

  it('lists each command of the solution once, in order of first use', () => {
    const byId = (id: string) => levelCommands(levels.find(level => level.id === id)!)
    expect(byId('git-01-first-commit')).toEqual(['init', 'add', 'commit'])
    expect(byId('git-04-merge-conflict')).toEqual(['merge', 'add', 'commit'])
    expect(byId('git-06-teammate-sync')).toEqual(['push', 'fetch', 'rebase', 'add'])
  })
})

describe('progress on the home page', () => {
  it('has progress once a level is solved or played', () => {
    expect(hasProgress(emptyProgress())).toBe(false)
    const unsolved = emptyProgress()
    unsolved.levels['git-01-first-commit'] = { solved: false, hintsUsed: 0, commands: 0, bestCommands: 0 }
    expect(hasProgress(unsolved)).toBe(false)
    expect(hasProgress(solvedProgress(['git-01-first-commit']))).toBe(true)
    expect(hasProgress(solvedProgress([], { levelId: 'git-01-first-commit', at: 1 }))).toBe(true)
  })

  it('continues the live track you last played, else the first live track with a solve', () => {
    expect(trackToContinue(emptyProgress())).toBeNull()
    expect(trackToContinue(solvedProgress([], { levelId: 'git-03-merge', at: 1 }))?.id).toBe('git')
    expect(trackToContinue(solvedProgress(['git-02-branch']))?.id).toBe('git')
    // a last played level nobody knows any more, and no solves: nothing to continue
    expect(trackToContinue(solvedProgress([], { levelId: 'git-99-gone', at: 1 }))).toBeNull()
    const big = bigTrack()
    expect(trackToContinue(solvedProgress(['big-2-1']), [git, big])).toBe(big)
  })
})
