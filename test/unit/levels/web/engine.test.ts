import { describe, expect, it } from 'vitest'
import {
  emptyProgress,
  fewestWrongPredictions,
  isAnswerTo,
  isRight,
  levelCredit,
  meets,
  nextQuestion,
  predict,
  predictionDone,
  readProgress,
  recordSolve,
  restart,
  serializeProgress,
  startWebLevel,
  trackById,
  trackRadar,
  webLevels
} from '../../../../shared/levels'
import type { OrderQuestion, PickLinesQuestion, PickOneQuestion, WebLevel } from '../../../../shared/levels'
import { bestRunCounters, taskKindOf, trackView } from '../../../../app/utils/track-view'

// The prediction mechanic (ADR 0009, docs/features/levels.md "The Web fundamentals environment"): answers of the three
// forms, scoring, wrong predictions as the best run's first count (kept across Reset, never blocking), the track's
// measure, progress that older versions still read, and the radar's half credit for a solve with a wrong prediction.

const level = (id: string): WebLevel => webLevels.find(each => each.id === id)!
const one = level('web-01-menu-blocked').prediction.questions[0] as PickOneQuestion
const lines = level('web-04-basket-header').prediction.questions[0] as PickLinesQuestion
const order = level('web-practice-console-order').prediction.questions[0] as OrderQuestion

describe('answers', () => {
  it('take the shape of their question: an option, known lines once each (none too), every line once in some order', () => {
    expect(isAnswerTo(one, 'blocked')).toBe(true)
    expect(isAnswerTo(one, 'nope')).toBe(false)
    expect(isAnswerTo(one, ['blocked'])).toBe(false)
    expect(isAnswerTo(lines, [])).toBe(true)
    expect(isAnswerTo(lines, ['menu', 'menu'])).toBe(false)
    expect(isAnswerTo(lines, ['menu', 'nope'])).toBe(false)
    expect(isAnswerTo(order, ['asking', 'ready', 'blocked'])).toBe(false)
    expect(isAnswerTo(order, ['none', 'blocked', 'ready', 'asking'])).toBe(true)
  })

  it('are right as the option, the same set in any order, or the very order', () => {
    expect(isRight(one, 'blocked')).toBe(true)
    expect(isRight(one, 'shows')).toBe(false)
    expect(isRight(lines, ['options', 'menu'])).toBe(true)
    expect(isRight(lines, ['menu'])).toBe(false)
    expect(isRight(lines, ['menu', 'options', 'basket'])).toBe(false)
    expect(isRight(order, ['asking', 'ready', 'blocked', 'none'])).toBe(true)
    expect(isRight(order, ['ready', 'asking', 'blocked', 'none'])).toBe(false)
  })
})

describe('predicting', () => {
  it('answers question after question, each counted, a wrong one adding 1 to wrong predictions; a malformed one changes nothing', () => {
    const task = level('web-practice-same-origin')
    let session = startWebLevel(task)
    expect(nextQuestion(task, session.state)).toBe(0)
    expect(predict(session, task, ['same']).session).toBe(session)
    const first = predict(session, task, 'other')
    expect(first.output.verdict).toEqual({ right: false, why: null })
    session = first.session
    expect(session).toMatchObject({ wrongPredictions: 1, commandCount: 1, solved: false })
    expect(session.history.at(-1)).toEqual({ kind: 'predict', question: 0, right: false })
    session = predict(session, task, 'other').session
    expect(session.wrongPredictions).toBe(1)
    const last = predict(session, task, 'other')
    expect(last.solvedNow).toBe(true)
    expect(predictionDone(task, last.session.state)).toBe(true)
    // nothing more to answer
    expect(predict(last.session, task, 'same').session).toBe(last.session)
  })

  it('stores a set of lines in the options\' order, so the same set reads the same', () => {
    const scenario = level('web-04-basket-header')
    expect(predict(startWebLevel(scenario), scenario, ['options', 'menu']).session.state.predicted).toEqual([['menu', 'options']])
  })

  it('keeps wrong predictions across Reset (the answer was shown), asks again, and starts at 0 on a fresh attempt', () => {
    const scenario = level('web-02-order-preflight')
    const wrong = predict(startWebLevel(scenario), scenario, 'through').session
    const again = restart(wrong, scenario)
    expect(again).toMatchObject({ wrongPredictions: 1, commandCount: 0, solved: false })
    expect(again.state.predicted).toBeUndefined()
    expect(predict(again, scenario, 'preflight').session.wrongPredictions).toBe(1)
    expect(startWebLevel(scenario).wrongPredictions).toBeUndefined()
  })
})

describe('the best run and the radar', () => {
  it('is the fewest wrong predictions, then the fewest hints, then the fewest reloads', () => {
    expect(trackById('web')!.bestRun).toBe(fewestWrongPredictions)
    expect(fewestWrongPredictions).toEqual(['wrongPredictions', 'hints', 'reloads'])
    const id = 'web-01-menu-blocked'
    const run = (wrongPredictions: number, hintsUsed: number, reloads: number) => ({ solved: true, commandCount: 4, hintsUsed, reloads, wrongPredictions })
    let progress = recordSolve(emptyProgress(), id, run(1, 0, 1), fewestWrongPredictions)
    progress = recordSolve(progress, id, run(0, 2, 3), fewestWrongPredictions)
    expect(progress.levels[id]!.best).toEqual({ commands: 4, hints: 2, reloads: 3, wrongPredictions: 0 })
    progress = recordSolve(progress, id, run(0, 2, 1), fewestWrongPredictions)
    expect(progress.levels[id]!.best).toMatchObject({ hints: 2, reloads: 1 })
    progress = recordSolve(progress, id, run(1, 0, 0), fewestWrongPredictions)
    expect(progress.levels[id]!.best).toMatchObject({ wrongPredictions: 0, reloads: 1 })
  })

  it('counts a level half on the radar until a solve had no wrong prediction and did without the last hint', () => {
    const scenario = level('web-01-menu-blocked')
    const entry = (best: { hints: number, wrongPredictions: number }) => ({ solved: true, best: { commands: 3, ...best }, latest: null, practiseAgain: false, lastPlayed: null, fewestHints: best.hints })
    expect(levelCredit(scenario, entry({ hints: 0, wrongPredictions: 1 }))).toBe(0.5)
    expect(levelCredit(scenario, entry({ hints: 3, wrongPredictions: 0 }))).toBe(0.5)
    expect(levelCredit(scenario, entry({ hints: 2, wrongPredictions: 0 }))).toBe(1)
    const task = level('web-practice-which-methods')
    expect(levelCredit(task, entry({ hints: 0, wrongPredictions: 0 }))).toBe(1)
    expect(levelCredit(task, entry({ hints: 1, wrongPredictions: 0 }))).toBe(0.5)
    // a better run never lowers it: it has as few wrong predictions, and no more hints at the same count
    const progress = recordSolve(recordSolve(emptyProgress(), scenario.id, { solved: true, commandCount: 3, hintsUsed: 0, wrongPredictions: 1 }, fewestWrongPredictions), scenario.id, { solved: true, commandCount: 3, hintsUsed: 0, wrongPredictions: 0 }, fewestWrongPredictions)
    expect(levelCredit(scenario, progress.levels[scenario.id])).toBe(1)
    expect(trackRadar(trackById('web')!, progress)[0]).toMatchObject({ value: 1, total: 11 })
  })

  it('shows wrong predictions first on the track page, reloads only for a run that reloaded', () => {
    const measure = trackById('web')!.bestRun
    expect(bestRunCounters(measure, { commands: 1, hints: 0, wrongPredictions: 1 })).toEqual(['wrongPredictions', 'hints'])
    expect(bestRunCounters(measure, { commands: 3, hints: 0, reloads: 1, wrongPredictions: 0 })).toEqual(['wrongPredictions', 'hints', 'reloads'])
    // Debugging keeps its reloads, also for a run without any
    expect(bestRunCounters(trackById('debugging')!.bestRun, { commands: 1, hints: 0 })).toEqual(['hints', 'reloads'])
    expect(taskKindOf(level('web-practice-which-methods'))).toBe('predict')
    const view = trackView(trackById('web')!, emptyProgress())
    expect(view.chapters[0]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual(['Allow-Origin', 'predict', 'predict', 'preflight', 'predict', 'credentials', 'predict', 'Allow-Headers', 'predict', 'Allow-Methods', 'predict'])
    expect(view.chapters[1]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual(['SameSite=None', 'predict', 'CSRF', 'predict', 'HttpOnly', 'predict', 'Path', 'predict', 'Strict', 'predict'])
    expect(view.chapters[2]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual(['localStorage', 'predict', 'innerHTML', 'predict', 'exp', 'predict', 'refresh', 'predict', 'logout', 'predict'])
    expect(view.chapters[3]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual(['max-age', 'predict', 'no-cache', 'predict', 'private', 'predict', 'Vary', 'predict', 'stale deploy', 'predict'])
    expect(view.chapters.slice(4).every(chapter => chapter.coming)).toBe(true)
  })
})

describe('progress with wrong predictions (version 3, no new version)', () => {
  const saved = {
    version: 3,
    levels: {
      'git-01-first-commit': { solved: true, best: { commands: 3, hints: 0 }, latest: { commands: 5, hints: 3 }, practiseAgain: true, lastPlayed: 1700000000000, fewestHints: 0 },
      'ai-01-twelve-croissants': { solved: true, best: { commands: 2, hints: 0, falseAlarms: 1 }, latest: { commands: 2, hints: 0, falseAlarms: 1 }, practiseAgain: false, lastPlayed: 1700000001000, fewestHints: 0 }
    }
  }

  it('loads a 0.4.0 file unchanged and writes it back byte for byte', () => {
    const read = readProgress(JSON.stringify(saved), 1700000010000)
    if (!read.ok) throw new Error('the 0.4.0 file did not load')
    expect(serializeProgress(read.progress)).toBe(JSON.stringify(saved))
  })

  it('stores wrong predictions with the run and reads them back; a broken count is left out; 0.4.0 keeps the rest', () => {
    const progress = recordSolve(emptyProgress(), 'web-01-menu-blocked', { solved: true, commandCount: 3, hintsUsed: 0, reloads: 1, wrongPredictions: 1 }, fewestWrongPredictions)
    const read = readProgress(serializeProgress(progress))
    expect(read.ok && read.progress.levels['web-01-menu-blocked']!.best).toEqual({ commands: 3, hints: 0, reloads: 1, wrongPredictions: 1 })
    for (const broken of [-1, 1.5, '1', null]) {
      const result = readProgress(JSON.stringify({ version: 3, levels: { a: { solved: true, best: { commands: 2, hints: 0, wrongPredictions: broken }, latest: null } } }))
      expect(result.ok && result.progress.levels.a!.best).toEqual({ commands: 2, hints: 0 })
    }
    // 0.4.0's reader takes a version 3 file, and of a run its commands, hints, reloads, false alarms and rounds
    const file = JSON.parse(serializeProgress(progress)) as { version: number, levels: Record<string, { best: Record<string, unknown> }> }
    expect(file.version).toBe(3)
    expect(file.levels['web-01-menu-blocked']!.best).toMatchObject({ commands: 3, hints: 0, reloads: 1 })
  })
})

describe('goal bounds', () => {
  it('meets "anything but" a value only with a value', () => {
    expect(meets('blocked', { not: 'read' })).toBe(true)
    expect(meets('refused', { not: 'read' })).toBe(true)
    expect(meets('read', { not: 'read' })).toBe(false)
    expect(meets(undefined, { not: 'read' })).toBe(false)
  })
})
