import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  act,
  emptyProgress,
  fewestCommands,
  fewestHintsThenReloads,
  isBetterRun,
  levelCredit,
  readProgress,
  recordSolve,
  restart,
  serializeProgress,
  startSession,
  takeHint,
  undoLast
} from '../../../shared/levels'
import type { ActResult, ScenarioOf, SessionOf } from '../../../shared/levels'

// The shared level core with an environment that is not git (ADR 0007, docs/features/levels.md "Environments"): a tiny
// app with a counter. `inc` changes the code's value, `reload` restarts the app so it shows that value, as a Debugging
// level's Reload does. A colleague's event fires right before the first reload.

interface CounterState {
  value: number
  shown: number
  colleagueLooked: boolean
}
type CounterRecord = { action: 'inc' | 'reload' }
type CounterStep = 'inc' | 'reload'

const counterLevel: ScenarioOf<CounterState, CounterRecord, CounterStep> = {
  id: 'debugging-01-counter',
  track: 'debugging',
  kind: 'scenario',
  title: 'Show three',
  difficulty: 1,
  minutes: 1,
  story: 'The counter should show 3.',
  setup: () => ({ value: 0, shown: 0, colleagueLooked: false }),
  goals: [
    { id: 'shows-three', label: 'The app shows 3', check: ({ state }) => state.shown === 3 },
    { id: 'reloaded', label: 'You reloaded the app', check: ({ history }) => history.some(record => record.action === 'reload') }
  ],
  teammates: [{
    id: 'anna-looks',
    author: 'Anna',
    trigger: { beforeCommand: 'reload' },
    apply: state => ({ ...state, colleagueLooked: true }),
    notice: 'Anna watches the reload.'
  }],
  hints: ['Count up.', 'Three times, then reload.', '`inc` three times, then `reload`.'],
  debrief: { title: 'Done', paragraphs: ['The app shows what the code says after a reload.'] },
  solution: ['inc', 'inc', 'inc', 'reload']
}

type Counter = SessionOf<CounterState, CounterRecord>

/** The counter environment's one counted action per step. */
function step(session: Counter, action: CounterStep): ActResult<CounterState, CounterRecord, string> {
  return act(session, counterLevel, {
    commands: [action],
    reload: action === 'reload',
    execute: state => ({
      state: action === 'inc' ? { ...state, value: state.value + 1 } : { ...state, shown: state.value },
      record: { action },
      output: action === 'inc' ? `value ${state.value + 1}` : 'reloaded'
    })
  })
}

function play(session: Counter, ...actions: CounterStep[]) {
  let result: ActResult<CounterState, CounterRecord, string> = { session, output: '', notices: [], solvedNow: false }
  const all: ActResult<CounterState, CounterRecord, string>[] = []
  for (const action of actions) {
    result = step(result.session, action)
    all.push(result)
  }
  return { ...result, all }
}

describe('the shared core with a non-git environment', () => {
  it('starts from the setup and solves the level by replaying its solution', () => {
    const session = startSession(counterLevel)
    expect(session).toMatchObject({ levelId: 'debugging-01-counter', state: { value: 0, shown: 0 }, hintsUsed: 0, commandCount: 0, solved: false })
    expect(session.goalsMet).toEqual({ 'shows-three': false, 'reloaded': false })

    const result = play(session, ...counterLevel.solution)
    expect(result.all.map(each => each.solvedNow)).toEqual([false, false, false, true])
    expect(result.session.goalsMet).toEqual({ 'shows-three': true, 'reloaded': true })
    expect(result.session).toMatchObject({ solved: true, commandCount: 4, reloads: 1 })
    expect(result.output).toBe('reloaded')
    expect(result.session.history).toEqual([{ action: 'inc' }, { action: 'inc' }, { action: 'inc' }, { action: 'reload' }])
  })

  it('fires colleague events on its own commands', () => {
    const result = play(startSession(counterLevel), 'inc', 'reload')
    expect(result.all[0]!.notices).toEqual([])
    expect(result.all[1]!.notices).toEqual([{ eventId: 'anna-looks', author: 'Anna', text: 'Anna watches the reload.' }])
    expect(result.session.state.colleagueLooked).toBe(true)
  })

  it('counts hints, and shows the last one again without counting it', () => {
    let session = startSession(counterLevel)
    for (const expected of [1, 2, 3]) {
      const shown = takeHint(session, counterLevel)
      expect(shown).toMatchObject({ number: expected, total: 3, revealed: true, text: counterLevel.hints[expected - 1] })
      session = shown.session
    }
    const again = takeHint(session, counterLevel)
    expect(again).toMatchObject({ number: 3, revealed: false })
    expect(again.session.hintsUsed).toBe(3)
  })

  it('undoes the last action and restarts as a new attempt that keeps the hints', () => {
    const played = play(takeHint(startSession(counterLevel), counterLevel).session, 'inc', 'reload').session
    const undone = undoLast(played, counterLevel)!
    expect(undone.undone).toEqual({ action: 'reload' })
    expect(undone.session.state.shown).toBe(0)
    expect(undone.session.history).toEqual([{ action: 'inc' }])
    // the effort of the attempt stays
    expect(undone.session).toMatchObject({ commandCount: 2, reloads: 1 })
    expect(undoLast(startSession(counterLevel), counterLevel)).toBeNull()

    const restarted = restart(played, counterLevel)
    expect(restarted).toMatchObject({ hintsUsed: 1, commandCount: 0, history: [], state: { value: 0, shown: 0 } })
    expect(restarted.reloads).toBeUndefined()
  })

  it('keeps the best run by its own measure: fewest hints, then fewest reloads', () => {
    const solve = (hints: number, ...actions: CounterStep[]) => {
      let session = startSession(counterLevel)
      for (let i = 0; i < hints; i++) session = takeHint(session, counterLevel).session
      return play(session, ...actions).session
    }
    const short = solve(2, 'inc', 'inc', 'inc', 'reload')
    const longerClean = solve(0, 'inc', 'reload', 'inc', 'reload', 'inc', 'reload')
    const cleanFewerReloads = solve(0, 'inc', 'inc', 'reload', 'inc', 'reload')

    let progress = recordSolve(emptyProgress(), counterLevel.id, short, fewestHintsThenReloads)
    expect(progress.levels[counterLevel.id]).toMatchObject({ solved: true, best: { commands: 4, hints: 2, reloads: 1 }, fewestHints: 2 })

    // more commands and reloads, but no hints: better by this measure (git's would keep the short one)
    progress = recordSolve(progress, counterLevel.id, longerClean, fewestHintsThenReloads)
    expect(progress.levels[counterLevel.id]!.best).toEqual({ commands: 6, hints: 0, reloads: 3 })
    expect(recordSolve(recordSolve(emptyProgress(), 'x', short), 'x', longerClean).levels.x!.best).toEqual({ commands: 4, hints: 2, reloads: 1 })

    // same hints, fewer reloads wins the tie
    progress = recordSolve(progress, counterLevel.id, cleanFewerReloads, fewestHintsThenReloads)
    expect(progress.levels[counterLevel.id]).toMatchObject({
      best: { commands: 5, hints: 0, reloads: 2 },
      latest: { commands: 5, hints: 0, reloads: 2 },
      fewestHints: 0
    })

    // and the radar counts it in full
    expect(levelCredit(counterLevel, progress.levels[counterLevel.id])).toBe(1)
  })

  it('compares runs by any measure, a missing count as 0', () => {
    expect(isBetterRun({ commands: 9, hints: 0, reloads: 4 }, { commands: 3, hints: 1, reloads: 1 }, fewestHintsThenReloads)).toBe(true)
    expect(isBetterRun({ commands: 9, hints: 0, reloads: 4 }, { commands: 3, hints: 1, reloads: 1 }, fewestCommands)).toBe(false)
    expect(isBetterRun({ commands: 3, hints: 0 }, { commands: 3, hints: 0, reloads: 1 }, fewestHintsThenReloads)).toBe(true)
    expect(isBetterRun({ commands: 3, hints: 0 }, { commands: 3, hints: 0 }, fewestHintsThenReloads)).toBe(false)
  })

  it('stores reloads with the run and reads them back', () => {
    const solved = recordSolve(emptyProgress(), counterLevel.id, play(startSession(counterLevel), 'inc', 'inc', 'inc', 'reload').session, fewestHintsThenReloads)
    const read = readProgress(serializeProgress(solved))
    expect(read.ok && read.progress.levels[counterLevel.id]!.best).toEqual({ commands: 4, hints: 0, reloads: 1 })
    // a broken reload count is left out, the run stays
    const broken = readProgress(JSON.stringify({ version: 3, levels: { a: { solved: true, best: { commands: 2, hints: 0, reloads: -1 }, latest: null } } }))
    expect(broken.ok && broken.progress.levels.a!.best).toEqual({ commands: 2, hints: 0 })
  })
})

describe('progress saved by 0.2.6', () => {
  it('loads unchanged: git runs stay { commands, hints }, nothing is added', () => {
    const saved = {
      version: 3,
      levels: {
        'git-01-first-commit': { solved: true, best: { commands: 3, hints: 0 }, latest: { commands: 5, hints: 3 }, practiseAgain: true, lastPlayed: 1700000000000, fewestHints: 0 },
        'git-03-merge': { solved: true, best: { commands: 4, hints: 3 }, latest: { commands: 4, hints: 3 }, practiseAgain: false, lastPlayed: null, fewestHints: 3 },
        'git-05-rebase': { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: 1700000005000, fewestHints: null }
      }
    }
    const read = readProgress(JSON.stringify(saved), 1700000010000)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect({ ...read.progress, levels: { ...read.progress.levels } }).toEqual(saved)
    expect(serializeProgress(read.progress)).toBe(JSON.stringify(saved))
  })
})

describe('the shared core stays apart from git (ADR 0001)', () => {
  const core = join(__dirname, '../../../shared/levels')
  // the barrel (index.ts) and the registry (tracks.ts) are where the tracks come together
  const coreFiles = readdirSync(core).filter(name => name.endsWith('.ts') && name !== 'index.ts' && name !== 'tracks.ts')

  it.each(coreFiles)('%s imports no environment', (name) => {
    const imports = [...readFileSync(join(core, name), 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1]!)
    expect(imports.filter(path => !/^\.\/[a-z-]+$/.test(path) || ['./git', './tracks', './index'].includes(path))).toEqual([])
  })
})
