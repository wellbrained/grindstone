import { describe, expect, it } from 'vitest'
import { pickDeploy, pickLine, playSolution, reload, restoreFiles, rollback, saveDebugFile, startDebugLevel } from '../../../../shared/levels'
import type { DebugPracticeTask, DebugScenario, Observation } from '../../../../shared/levels'
import { afterFailedFix, foundGoal, probeGoal } from '../../../../shared/levels/debugging/checks'
import { deployHistory, liveFiles } from '../../../../shared/levels/debugging/deploys'

// Chapter 7's actions on the shared core (ADR 0007; docs/features/levels.md "The Debugging environment"): Roll back
// saves a deploy's files (one counted action, no reload), a find task can be answered with a deploy, and colleague
// events fire on generic triggers after a counted action: "after a fix that did not work" is a reload of changed code
// whose check failed.

const HISTORY = deployHistory({ 'index.html': '<!doctype html>\n', 'order.js': 'send({ items })\n', 'money.js': 'euros\n' }, [
  { id: 'a1b2c3d', author: 'Maya', at: 'Yesterday 17:40', message: 'Euro sign', edits: [{ path: 'money.js', replace: ['euros', 'euros €'] }] },
  { id: 'b7e41d0', author: 'Ben', at: 'Today 08:02', message: 'Order notes', edits: [{ path: 'order.js', replace: ['{ items }', '{ lines, note }'] }] }
])
const LIVE = liveFiles(HISTORY)

const ORDERED = probeGoal('ordered', 'The order goes through', 'status', 'Thanks!')
const level: DebugScenario = {
  id: 'debugging-99-fixture',
  track: 'debugging',
  kind: 'scenario',
  title: 'Fixture',
  difficulty: 1,
  minutes: 5,
  story: 'An incident.',
  report: { author: 'Anna', text: 'Checkout is broken.' },
  sandbox: { page: '/order', open: 'order.js', probes: [{ id: 'status', steps: [{ text: '#status' }] }], deploys: HISTORY },
  setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
  goals: [ORDERED],
  teammates: [
    { id: 'ben-hint', author: 'Ben', trigger: { when: afterFailedFix([ORDERED], LIVE) }, apply: state => state, notice: 'Look at the logs.' },
    { id: 'maya-later', author: 'Maya', trigger: { afterCommands: 4 }, apply: state => state, notice: 'Still on it?' }
  ],
  hints: ['a', 'b', 'c'],
  debrief: { title: 't', paragraphs: ['p', 'q'] },
  solution: [{ rollback: 'a1b2c3d' }, 'reload']
}

const seen = (status: string): Observation => ({ finished: true, errors: [], probes: { status }, probeErrors: {}, logs: [] })

describe('Roll back', () => {
  it('saves the deploy\'s files (one counted action, not a reload), and back to live the same way', () => {
    const back = rollback(startDebugLevel(level), level, 'a1b2c3d')
    expect(back.session.state.files).toEqual(HISTORY.list[0]!.files)
    expect(back.session).toMatchObject({ commandCount: 1, history: [{ kind: 'rollback', to: 'a1b2c3d' }] })
    expect(back.session.reloads).toBeUndefined()
    // goals change only on a reload
    expect(back.session.goalsMet).toEqual({ ordered: false })
    const live = rollback(back.session, level, 'b7e41d0')
    expect(live.session.state.files).toEqual(LIVE)
  })

  it('replaces your saved edits too, and does nothing for an unknown deploy or a level without deploys', () => {
    const edited = saveDebugFile(startDebugLevel(level), level, 'order.js', '// mine\n').session
    expect(rollback(edited, level, 'b7e41d0').session.state.files).toEqual(LIVE)
    expect(rollback(edited, level, 'fffffff').session).toBe(edited)
    expect(rollback(edited, level, '__proto__').session).toBe(edited)
    const plain = { ...level, sandbox: { ...level.sandbox, deploys: undefined } }
    const session = startDebugLevel(plain)
    expect(rollback(session, plain, 'a1b2c3d').session).toBe(session)
  })

  it('replays as a solution step', async () => {
    const results = await playSolution(level, async files => seen(files['order.js'] === 'send({ items })\n' ? 'Thanks!' : 'Sorry'))
    expect(results.map(result => result.solvedNow)).toEqual([false, true])
    expect(results.at(-1)!.session).toMatchObject({ solved: true, reloads: 1, commandCount: 2 })
  })
})

describe('colleague events', () => {
  it('fire after a reload of changed code whose check failed, once, and not after a save or the first look', () => {
    // a reload of the files as they came: no fix tried yet
    const first = reload(startDebugLevel(level), level, seen('Sorry'))
    expect(first.notices).toEqual([])
    expect(first.session.state.checked).toEqual(LIVE)
    // a save after it: still no new check
    const saved = saveDebugFile(first.session, level, 'order.js', 'send({ lines })\n')
    expect(saved.notices).toEqual([])
    // the reload of that edit fails: Ben says something
    const wrong = reload(saved.session, level, seen('Sorry'))
    expect(wrong.notices).toEqual([{ eventId: 'ben-hint', author: 'Ben', text: 'Look at the logs.' }])
    expect(wrong.session.firedEvents).toEqual(['ben-hint'])
    // ... once
    const again = reload(wrong.session, level, seen('Sorry'))
    expect(again.notices.map(notice => notice.eventId)).toEqual(['maya-later'])
  })

  it('do not fire when the check passed', () => {
    const back = rollback(startDebugLevel(level), level, 'a1b2c3d')
    const fixed = reload(back.session, level, seen('Thanks!'))
    expect(fixed.notices).toEqual([])
    expect(fixed.solvedNow).toBe(true)
  })
})

describe('naming a deploy (find tasks)', () => {
  const target = { path: 'order.js', lines: [1], deploys: ['b7e41d0'], wrong: { 'deploy:a1b2c3d': 'Only the euro sign changed there.' }, otherwise: 'Not that one.' }
  const task: DebugPracticeTask = {
    id: 'debugging-practice-fixture',
    track: 'debugging',
    kind: 'practice',
    practises: 'debugging-99-fixture',
    title: 'Which deploy?',
    difficulty: 1,
    minutes: 0.5,
    task: 'Click the deploy that broke it.',
    sandbox: { page: '/order', open: 'order.js', probes: [], find: target, deploys: HISTORY },
    setup: () => ({ files: { ...LIVE }, observed: null, picked: null }),
    goals: [foundGoal('You found the deploy that broke it', target)],
    hints: ['h'],
    why: 'w',
    solution: [{ pickDeploy: 'b7e41d0' }]
  }

  it('is right for an answer deploy, says why for another, and its line counts too', () => {
    const right = pickDeploy(startDebugLevel(task), task, 'b7e41d0')
    expect(right.output.verdict).toEqual({ right: true, why: null })
    expect(right.solvedNow).toBe(true)
    expect(right.session.state.picked).toEqual({ deploy: 'b7e41d0' })
    expect(right.session.history).toEqual([{ kind: 'pickDeploy', deploy: 'b7e41d0' }])
    expect(pickDeploy(startDebugLevel(task), task, 'a1b2c3d').output.verdict).toEqual({ right: false, why: 'Only the euro sign changed there.' })
    expect(pickDeploy(startDebugLevel(task), task, 'fffffff').output.verdict).toEqual({ right: false, why: 'Not that one.' })
    expect(pickLine(startDebugLevel(task), task, { path: 'order.js', line: 1 }).solvedNow).toBe(true)
  })

  it('does nothing outside a find task with deploy answers', () => {
    const session = startDebugLevel(level)
    expect(pickDeploy(session, level, 'b7e41d0')).toMatchObject({ session, output: { verdict: null } })
  })

  it('replays as a solution step', async () => {
    const results = await playSolution(task, async () => seen(''))
    expect(results.at(-1)!.session.solved).toBe(true)
  })
})

describe('undoing a rollback (review 2026-11-13)', () => {
  it('puts back the saved files from before it, as one counted action', () => {
    const mine = { ...LIVE, 'order.js': '// mine\n' }
    const saved = saveDebugFile(startDebugLevel(level), level, 'order.js', '// mine\n').session
    const back = rollback(saved, level, 'a1b2c3d').session
    const undone = restoreFiles(back, level, mine)
    expect(undone.session.state.files).toEqual(mine)
    expect(undone.session.history.at(-1)).toEqual({ kind: 'restore' })
    expect(undone.session.commandCount).toBe(3)
  })

  it('takes only the files the app has, and does nothing when they are what is saved', () => {
    const session = startDebugLevel(level)
    expect(restoreFiles(session, level, { ...LIVE }).session).toBe(session)
    expect(restoreFiles(session, level, { 'order.js': 'x', 'evil.js': 'y' }).session).toBe(session)
  })
})

describe('the files a check ran (review 2026-11-13)', () => {
  it('are the files the reload started with, not a save made while it ran: no colleague speaks for a fix nobody checked', () => {
    // a save while the check of the starting files runs, then its result arrives
    const saved = saveDebugFile(startDebugLevel(level), level, 'order.js', 'send({ lines })\n').session
    const result = reload(saved, level, seen('Sorry'), LIVE)
    expect(result.session.state.checked).toEqual(LIVE)
    expect(result.notices).toEqual([])
  })
})
