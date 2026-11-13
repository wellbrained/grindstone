import { describe, expect, it } from 'vitest'
import { defineTrack, emptyProgress, gitLevels, trackById } from '../../../shared/levels'
import { bestRunCounters, drawSteps, percent, storyLead, timeLabel, trackCardAction, trackView } from '../../../app/utils/track-view'
import { bigTrack, practiceTrack, solvedProgress } from '../levels/fixtures'

const git = trackById('git')!

const rowStates = (progress = emptyProgress()) => Object.fromEntries(trackView(git, progress).chapters
  .flatMap(chapter => chapter.rows.map(row => [row.place.level.id, row.state])))

describe('track view', () => {
  it('marks the first level as next up when nothing is solved', () => {
    const view = trackView(git, emptyProgress())
    expect(view.count).toEqual({ solved: 0, total: 85 })
    expect(view.liveChapters).toBe(8)
    expect(view.nextUp?.number).toBe('1.1')
    expect(view.chapters[0]!.rows.map(row => [row.place.number, row.state])).toEqual([
      ['1.1', 'next'],
      [null, 'open'],
      [null, 'open'],
      ['1.2', 'open'],
      [null, 'open'],
      ['1.3', 'open'],
      [null, 'open'],
      ['1.4', 'open'],
      [null, 'open'],
      ['1.5', 'open'],
      [null, 'open']
    ])
  })

  it('shows solved levels and one next up (a practice task counts); every git chapter has levels', () => {
    const progress = solvedProgress(['git-01-first-commit', 'git-03-merge'])
    expect(rowStates(progress)).toMatchObject({
      'git-01-first-commit': 'solved',
      'git-practice-stage-one-file': 'next',
      'git-practice-commit-all': 'open',
      'git-03-merge': 'solved',
      'git-04-merge-conflict': 'open'
    })
    const view = trackView(git, progress)
    expect(view.chapters.map(chapter => chapter.coming)).toEqual([false, false, false, false, false, false, false, false])
    expect(view.chapters[2]!.count).toEqual({ solved: 1, total: 10 })
    expect(view.chapters.map(chapter => chapter.state)).toEqual(['next', 'open', 'open', 'open', 'open', 'open', 'open', 'open'])
  })

  it('carries the stored progress of each row (best run, practise again)', () => {
    const view = trackView(git, solvedProgress(['git-01-first-commit'], null, ['git-01-first-commit']))
    expect(view.chapters[0]!.rows[0]!.progress).toMatchObject({ best: { commands: 3, hints: 0 }, practiseAgain: true })
    expect(view.chapters[0]!.rows[1]!.progress).toBeNull()
  })

  it('has no next up when every level is solved', () => {
    const view = trackView(git, solvedProgress(gitLevels.map(level => level.id)))
    expect(view.nextUp).toBeNull()
    expect(view.chapters.flatMap(chapter => chapter.rows).every(row => row.state === 'solved')).toBe(true)
  })

  it('lists the commands each level practises', () => {
    const rows = trackView(git, emptyProgress()).chapters.flatMap(chapter => chapter.rows)
    expect(rows[0]!.commands).toEqual(['init', 'add', 'commit'])
    expect(rows[1]!.commands).toEqual(['add'])
  })

  it('tags Debugging rows with the error a scenario teaches and the kind of a practice task, no commands', () => {
    const view = trackView(trackById('debugging')!, emptyProgress())
    expect(view.liveChapters).toBe(5)
    expect(view.chapters.map(chapter => chapter.coming)).toEqual([false, false, false, false, false, true, true])
    expect(view.chapters[0]!.rows.slice(0, 4).map(row => [row.commands, row.teaches, row.taskKind])).toEqual([
      [[], 'TypeError', null],
      [[], null, 'find'],
      [[], null, 'fix'],
      [[], 'TypeError', null]
    ])
    // Network scenarios are tagged with the status or problem they teach
    expect(view.chapters[1]!.rows.filter(row => row.teaches).map(row => row.teaches)).toEqual(['404', '500', 'payload', 'CORS', 'double POST'])
    // Elements & CSS scenarios with the CSS feature they teach, its practice tasks with their kind
    expect(view.chapters[2]!.rows.filter(row => row.teaches).map(row => row.teaches)).toEqual(['var()', 'z-index', 'specificity', '@media', 'min-width'])
    expect(view.chapters[2]!.rows.filter(row => row.taskKind).map(row => row.taskKind)).toEqual(Array.from({ length: 5 }, () => ['find', 'fix']).flat())
    // State & async scenarios with the mistake they teach, a find and a quick fix each
    expect(view.chapters[3]!.rows.filter(row => row.teaches).map(row => row.teaches)).toEqual(['await', 'race', 'closure', 'shallow copy', 'promise chain'])
    expect(view.chapters[3]!.rows.filter(row => row.taskKind).map(row => row.taskKind)).toEqual(Array.from({ length: 5 }, () => ['find', 'fix']).flat())
    // Breakpoints & stepping scenarios with what stepping shows, a find and a quick fix each
    expect(view.chapters[4]!.rows.filter(row => row.teaches).map(row => row.teaches)).toEqual(['call stack', 'off-by-one', 'floating point', 'assignment', 'conditional'])
    expect(view.chapters[4]!.rows.filter(row => row.taskKind).map(row => row.taskKind)).toEqual(Array.from({ length: 5 }, () => ['find', 'fix']).flat())
    // git rows have commands and nothing else
    expect(trackView(git, emptyProgress()).chapters[0]!.rows[0]).toMatchObject({ teaches: null, taskKind: null })
  })

  it('shows the counters of a best run: git its commands, Debugging hints and reloads', () => {
    expect(bestRunCounters(git.bestRun)).toEqual(['commands'])
    expect(bestRunCounters(trackById('debugging')!.bestRun)).toEqual(['hints', 'reloads'])
  })

  it('holds a 58-level track: rows per chapter, one next up across chapters', () => {
    const firstEight = Array.from({ length: 8 }, (_, i) => `big-1-${i + 1}`)
    const view = trackView(bigTrack(), solvedProgress(firstEight))
    expect(view.count).toEqual({ solved: 8, total: 58 })
    expect(view.chapters.map(chapter => chapter.rows.length)).toEqual([8, 7, 8, 8, 9, 7, 11, 0])
    const next = view.chapters.flatMap(chapter => chapter.rows).filter(row => row.state === 'next')
    expect(next.map(row => row.place.number)).toEqual(['2.1'])
    expect(view.chapters[0]!.count).toEqual({ solved: 8, total: 8 })
    expect(view.chapters[7]!.coming).toBe(true)
  })
})

describe('chapter lanes', () => {
  it('runs solid between solved levels, dim into and out of open ones, and stops at the chapter ends', () => {
    const solved = ['big-2-1', 'big-2-2', 'big-2-3', 'big-2-5']
    const rows = trackView(bigTrack(), solvedProgress(solved)).chapters[1]!.rows
    expect(rows.map(row => [row.place.number, row.lane.in, row.lane.out])).toEqual([
      ['2.1', null, 'solid'],
      ['2.2', 'solid', 'solid'],
      ['2.3', 'solid', 'dim'],
      ['2.4', 'dim', 'dim'],
      ['2.5', 'dim', 'dim'],
      ['2.6', 'dim', 'dim'],
      ['2.7', 'dim', null]
    ])
    expect(rows.every(row => row.lane.fork === null && row.lane.through === null)).toBe(true)
  })

  it('draws no lane through a chapter with one level', () => {
    const single = defineTrack({ ...git, chapters: [{ id: 'one', title: 'One', description: 'One.', colour: 0, levels: [gitLevels[0]!] }] })
    const [row] = trackView(single, emptyProgress()).chapters[0]!.rows
    expect(row!.lane).toEqual({ in: null, out: null, through: null, fork: null, sideIn: null, sideOut: null })
  })

  it('forks practice tasks onto a side branch off their scenario; the main line passes them by', () => {
    // a: s1 (p1a, p1b), s2, s3 (p3a)
    const rows = trackView(practiceTrack(), solvedProgress(['s1', 'p1a', 's2', 's3'])).chapters[0]!.rows
    expect(rows.map(row => [row.place.level.id, row.lane])).toEqual([
      ['s1', { in: null, out: 'solid', through: null, fork: 'solid', sideIn: null, sideOut: null }],
      ['p1a', { in: null, out: null, through: 'solid', fork: null, sideIn: 'solid', sideOut: 'dim' }],
      ['p1b', { in: null, out: null, through: 'solid', fork: null, sideIn: 'dim', sideOut: null }],
      ['s2', { in: 'solid', out: 'solid', through: null, fork: null, sideIn: null, sideOut: null }],
      // the last scenario: no main line below it, only its side branch
      ['s3', { in: 'solid', out: null, through: null, fork: 'dim', sideIn: null, sideOut: null }],
      ['p3a', { in: null, out: null, through: null, fork: null, sideIn: 'dim', sideOut: null }]
    ])
  })
})

describe('lane draw steps', () => {
  // a: s1 (p1a, p1b), s2, s3 (p3a)
  const rows = trackView(practiceTrack(), emptyProgress()).chapters[0]!.rows
  const steps = (id: string) => Object.fromEntries([...drawSteps(rows, rows.findIndex(row => row.place.level.id === id))]
    .map(([index, draw]) => [rows[index]!.place.level.id, draw]))

  it('draws nothing when no entry was just solved', () => {
    expect(drawSteps(rows, -1).size).toBe(0)
  })

  it('starts the first scenario at its own dot and runs past its practice tasks to the next scenario', () => {
    expect(steps('s1')).toEqual({ s1: { out: 0, fork: 0 }, p1a: { through: 1, sideIn: 1 }, p1b: { through: 1 }, s2: { in: 1 } })
  })

  it('draws a later scenario from the scenario above, past the practice tasks in between', () => {
    expect(steps('s2')).toEqual({ s1: { out: 0 }, p1a: { through: 0 }, p1b: { through: 0 }, s2: { in: 1, out: 2, fork: 2 }, s3: { in: 3 } })
    expect(steps('s3')).toEqual({ s2: { out: 0 }, s3: { in: 1, out: 2, fork: 2 }, p3a: { through: 3, sideIn: 3 } })
  })

  it('draws a practice task on its side branch: from the fork or the task above, on to the row below', () => {
    expect(steps('p1a')).toEqual({ s1: { fork: 0 }, p1a: { sideIn: 1, sideOut: 2 }, p1b: { sideIn: 3 } })
    expect(steps('p1b')).toEqual({ p1a: { sideOut: 0 }, p1b: { sideIn: 1, sideOut: 2 }, s2: { sideIn: 3 } })
    expect(steps('p3a')).toEqual({ s3: { fork: 0 }, p3a: { sideIn: 1, sideOut: 2 } })
  })
})

describe('track card action', () => {
  it('starts an untouched track at its first level', () => {
    expect(trackCardAction(git, emptyProgress(), null)).toMatchObject({ kind: 'start', place: { number: '1.1' } })
  })

  it('opens the track the Continue card already points at, so there is one Continue on the page', () => {
    expect(trackCardAction(git, solvedProgress(['git-01-first-commit']), 'git')).toEqual({ kind: 'open' })
  })

  it('continues a track with progress that the Continue card does not show', () => {
    expect(trackCardAction(git, solvedProgress(['git-01-first-commit']), 'web')).toMatchObject({ kind: 'continue', place: { level: { id: 'git-practice-stage-one-file' } } })
  })

  it('opens a track with every level solved', () => {
    expect(trackCardAction(git, solvedProgress(gitLevels.map(level => level.id)), null)).toEqual({ kind: 'open' })
  })
})

describe('track view helpers', () => {
  it('turns a count into a bar width', () => {
    expect(percent({ solved: 0, total: 0 })).toBe('0%')
    expect(percent({ solved: 1, total: 3 })).toBe('33%')
    expect(percent({ solved: 6, total: 6 })).toBe('100%')
  })

  it('takes the first paragraph of a story', () => {
    expect(storyLead('One.\n\nTwo.')).toBe('One.')
    expect(storyLead('Only one.')).toBe('Only one.')
  })

  it('writes the time estimate in seconds below a minute', () => {
    expect(timeLabel(0.5)).toEqual({ value: 30, unit: 's' })
    expect(timeLabel(5)).toEqual({ value: 5, unit: 'min' })
    expect(timeLabel(1)).toEqual({ value: 1, unit: 'min' })
  })
})
