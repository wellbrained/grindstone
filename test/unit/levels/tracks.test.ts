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
  levelById,
  levelCommands,
  levelNumber,
  levelPlace,
  levels,
  nextLevel,
  nextUp,
  placeName,
  practiseAgainIn,
  trackById,
  trackLevels,
  trackPlaces,
  trackProgress,
  trackToContinue,
  tracks
} from '../../../shared/levels'
import type { Level } from '../../../shared/levels'
import { BIG_CHAPTER_SIZES, bigTrack, fakePractice, practiceTrack, solvedProgress } from './fixtures'

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

  it('maps the levels to their chapters and leaves chapter 8 empty', () => {
    expect(git.chapters.map(chapter => chapter.levels.map(level => level.id))).toEqual([
      [
        'git-01-first-commit',
        'git-practice-stage-one-file',
        'git-practice-commit-all',
        'git-07-stage-together',
        'git-practice-diff-staged',
        'git-08-what-changed',
        'git-practice-diff-file',
        'git-09-read-history',
        'git-practice-log-oneline',
        'git-10-ignore-build-files',
        'git-practice-ignore-logs'
      ],
      [
        'git-02-branch',
        'git-practice-list-branches',
        'git-16-started-on-wrong-branch',
        'git-practice-switch-back',
        'git-17-pick-up-teammate-branch',
        'git-practice-remote-branches',
        'git-18-clean-up-branches',
        'git-practice-rename-branch',
        'git-practice-delete-merged-branch',
        'git-19-look-at-old-version',
        'git-practice-branch-from-commit'
      ],
      [
        'git-03-merge',
        'git-practice-merge-no-ff',
        'git-20-both-sides-moved-on',
        'git-practice-merge-ff-only',
        'git-04-merge-conflict',
        'git-practice-keep-their-version',
        'git-21-back-out-of-a-merge',
        'git-practice-list-conflicts',
        'git-22-catch-up-with-main',
        'git-practice-merge-main-in'
      ],
      [
        'git-05-rebase',
        'git-practice-rebase-onto-main',
        'git-23-conflict-during-a-rebase',
        'git-practice-abort-rebase',
        'git-24-push-a-rebased-branch',
        'git-practice-push-with-lease',
        'git-25-tidy-up-before-review',
        'git-practice-reword-old-commit'
      ],
      [
        'git-26-push-your-first-branch',
        'git-practice-push-with-upstream',
        'git-27-get-your-teammates-work',
        'git-practice-fetch-only',
        'git-28-your-push-was-rejected',
        'git-practice-pull-rebase',
        'git-29-ahead-and-behind',
        'git-practice-unpushed-commits',
        'git-06-teammate-sync',
        'git-practice-prune-gone-branches'
      ],
      [
        'git-11-fix-last-commit',
        'git-practice-amend-no-edit',
        'git-12-throw-away-change',
        'git-practice-unstage-file',
        'git-practice-discard-file',
        'git-13-undo-local-commit',
        'git-practice-reset-soft',
        'git-practice-reset-hard',
        'git-14-undo-pushed-commit',
        'git-practice-revert-before-last',
        'git-15-park-unfinished-work',
        'git-practice-stash-untracked'
      ],
      [
        'git-30-committed-on-main',
        'git-practice-move-commit-to-branch',
        'git-31-lost-commits-after-reset',
        'git-practice-find-lost-commit',
        'git-32-rebased-the-wrong-branch',
        'git-practice-undo-rebase',
        'git-33-committed-a-secret',
        'git-practice-untrack-file',
        'git-practice-remove-file',
        'git-34-deleted-a-branch',
        'git-practice-restore-branch'
      ],
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

  it('refuses a practice task that does not follow its scenario', () => {
    const [s1, s2] = [gitLevels[0]!, levelById('git-07-stage-together')!]
    const chapter = (levels: Level[]) => ({ ...base, id: 'git' as const, status: 'live' as const, chapters: [{ id: 'c', title: 'C', description: 'C.', colour: 0 as const, levels }] })
    const base = { title: 'T', scope: 'S', description: 'D.' }
    const practice = fakePractice('p', s1.id)
    expect(() => defineTrack(chapter([practice, s1]))).toThrow(/starts chapter c/)
    expect(() => defineTrack(chapter([s1, s2, practice]))).toThrow(/practises git-01-first-commit but is listed after git-07-stage-together/)
    expect(() => defineTrack(chapter([s1, fakePractice('q', s1.id), practice, s2]))).not.toThrow()
  })
})

describe('level numbers and places', () => {
  it('numbers scenarios chapter.position, counting scenarios only; practice tasks have no number', () => {
    expect(levelNumber('git-01-first-commit')).toBe('1.1')
    expect(levelNumber('git-07-stage-together')).toBe('1.2')
    expect(levelNumber('git-08-what-changed')).toBe('1.3')
    expect(levelNumber('git-09-read-history')).toBe('1.4')
    expect(levelNumber('git-10-ignore-build-files')).toBe('1.5')
    expect(levelNumber('git-practice-stage-one-file')).toBeNull()
    expect(levelNumber('git-02-branch')).toBe('2.1')
    expect(levelNumber('git-19-look-at-old-version')).toBe('2.5')
    expect(levelNumber('git-03-merge')).toBe('3.1')
    expect(levelNumber('git-20-both-sides-moved-on')).toBe('3.2')
    expect(levelNumber('git-04-merge-conflict')).toBe('3.3')
    expect(levelNumber('git-21-back-out-of-a-merge')).toBe('3.4')
    expect(levelNumber('git-22-catch-up-with-main')).toBe('3.5')
    expect(levelNumber('git-26-push-your-first-branch')).toBe('5.1')
    expect(levelNumber('git-29-ahead-and-behind')).toBe('5.4')
    expect(levelNumber('git-06-teammate-sync')).toBe('5.5')
    expect(levelNumber('nope')).toBeNull()
  })

  it('knows the track, chapter and position of a level', () => {
    const place = levelPlace('git-04-merge-conflict')!
    expect(place.track.id).toBe('git')
    expect(place.chapter.title).toBe('Merging')
    expect(place.position).toBe(5)
    expect(place.index).toBe(26)
    expect(place.level.title).toBe('Merge conflict')
    expect(place.scenario).toBeNull()
    expect(placeName(place)).toBe('3.3 Merge conflict')
    expect(chapterOf('git-05-rebase')?.title).toBe('Rewriting history')
    expect(chapterOf('nope')).toBeNull()
  })

  it('gives a practice task its scenario, and names it by its title alone', () => {
    const place = levelPlace('git-practice-commit-all')!
    expect(place).toMatchObject({ number: null, position: 3, index: 2, scenario: { number: '1.1', level: { id: 'git-01-first-commit' } } })
    expect(placeName(place)).toBe('Commit tracked changes in one go')
    const track = practiceTrack()
    expect(trackPlaces(track).map(item => [item.level.id, item.number, item.scenario?.number ?? null])).toEqual([
      ['s1', '1.1', null],
      ['p1a', null, '1.1'],
      ['p1b', null, '1.1'],
      ['s2', '1.2', null],
      ['s3', '1.3', null],
      ['p3a', null, '1.3'],
      ['t1', '2.1', null],
      ['q1a', null, '2.1']
    ])
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
  it('goes scenario, its practice tasks, next scenario, across chapter boundaries', () => {
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-practice-stage-one-file')
    expect(nextLevel('git-practice-stage-one-file')?.id).toBe('git-practice-commit-all')
    expect(nextLevel('git-practice-commit-all')?.id).toBe('git-07-stage-together')
    expect(nextLevel('git-practice-ignore-logs')?.id).toBe('git-02-branch')
    expect(nextLevel('git-03-merge')?.id).toBe('git-practice-merge-no-ff')
    expect(nextLevel('git-practice-merge-ff-only')?.id).toBe('git-04-merge-conflict')
    expect(nextLevel('git-practice-merge-main-in')?.id).toBe('git-05-rebase')
    expect(nextLevel('git-practice-reword-old-commit')?.id).toBe('git-26-push-your-first-branch')
    expect(nextLevel('git-06-teammate-sync')?.id).toBe('git-practice-prune-gone-branches')
    expect(nextLevel('git-practice-prune-gone-branches')?.id).toBe('git-11-fix-last-commit')
    expect(nextLevel('git-practice-stash-untracked')?.id).toBe('git-30-committed-on-main')
    expect(nextLevel('git-practice-restore-branch')).toBeNull()
    expect(nextLevel('nope')).toBeNull()
    const track = bigTrack()
    expect(nextLevel('big-1-8', [track])?.id).toBe('big-2-1')
    // the empty last chapter is skipped: 7.11 is the end
    expect(nextLevel('big-7-11', [track])).toBeNull()
  })
})

describe('next up and continue', () => {
  it('next up is the first unsolved entry in play order, scenario or practice task', () => {
    expect(nextUp(git, emptyProgress())?.level.id).toBe('git-01-first-commit')
    expect(nextUp(git, solvedProgress(['git-01-first-commit', 'git-03-merge']))?.level.id).toBe('git-practice-stage-one-file')
    expect(nextUp(git, solvedProgress(gitLevels.map(level => level.id)))).toBeNull()
    const track = bigTrack()
    const firstEight = Array.from({ length: 8 }, (_, i) => `big-1-${i + 1}`)
    expect(nextUp(track, solvedProgress(firstEight))?.number).toBe('2.1')
  })

  it('continues the last played entry while it is unsolved', () => {
    const progress = solvedProgress(['git-01-first-commit'], { levelId: 'git-04-merge-conflict', at: 1000 })
    expect(continueTarget(git, progress)).toMatchObject({ reason: 'resume', at: 1000, place: { number: '3.3' } })
    const practice = solvedProgress(['git-01-first-commit'], { levelId: 'git-practice-commit-all', at: 5 })
    expect(continueTarget(git, practice)).toMatchObject({ reason: 'resume', place: { level: { id: 'git-practice-commit-all' } } })
  })

  it('falls back to next up when the last played entry is solved, unknown or in another track', () => {
    const solvedLast = solvedProgress(['git-01-first-commit'], { levelId: 'git-01-first-commit', at: 5 })
    expect(continueTarget(git, solvedLast)).toMatchObject({ reason: 'next', place: { level: { id: 'git-practice-stage-one-file' } } })
    const unknown = solvedProgress([], { levelId: 'git-99-gone', at: 5 })
    expect(continueTarget(git, unknown)).toMatchObject({ reason: 'next', place: { number: '1.1' } })
    expect(continueTarget(git, emptyProgress())).toMatchObject({ reason: 'next', at: null, place: { number: '1.1' } })
  })

  it('offers a "practise again" entry once nothing is unsolved, else nothing', () => {
    const all = gitLevels.map(level => level.id)
    expect(continueTarget(git, solvedProgress(all, { levelId: 'git-15-park-unfinished-work', at: 5 }))).toBeNull()
    const flagged = solvedProgress(all, null, ['git-05-rebase', 'git-07-stage-together'])
    expect(continueTarget(git, flagged)).toMatchObject({ reason: 'practise', at: null, place: { number: '1.2' } })
    // new entries come first
    const someLeft = solvedProgress(all.filter(id => id !== 'git-03-merge'), null, ['git-07-stage-together'])
    expect(continueTarget(git, someLeft)).toMatchObject({ reason: 'next', place: { number: '3.1' } })
  })

  it('finds the first flagged entry of a chapter', () => {
    const [basics, branching] = git.chapters
    const progress = solvedProgress(['git-01-first-commit', 'git-practice-commit-all', 'git-08-what-changed'], null, ['git-practice-commit-all', 'git-08-what-changed'])
    expect(practiseAgainIn(basics!, progress)?.id).toBe('git-practice-commit-all')
    expect(practiseAgainIn(branching!, progress)).toBeNull()
  })
})

describe('progress counts', () => {
  it('counts solved entries per track and chapter, both kinds, ignoring unknown ids and unsolved entries', () => {
    const progress = solvedProgress(['git-03-merge', 'git-04-merge-conflict', 'git-01-first-commit', 'git-practice-stage-one-file', 'elsewhere'], { levelId: 'git-02-branch', at: 3 })
    expect(trackProgress(git, progress)).toEqual({ solved: 4, total: 73 })
    expect(git.chapters.map(chapter => chapterProgress(chapter, progress))).toEqual([
      { solved: 2, total: 11 },
      { solved: 0, total: 11 },
      { solved: 2, total: 10 },
      { solved: 0, total: 8 },
      { solved: 0, total: 10 },
      { solved: 0, total: 12 },
      { solved: 0, total: 11 },
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
    // editor saves are not commands
    expect(byId('git-25-tidy-up-before-review')).toEqual(['rebase'])
  })
})

describe('progress on the home page', () => {
  it('has progress once a level is solved or played', () => {
    expect(hasProgress(emptyProgress())).toBe(false)
    const unsolved = emptyProgress()
    unsolved.levels['git-01-first-commit'] = { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: null }
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
