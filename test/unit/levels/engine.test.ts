import { describe, expect, it } from 'vitest'
import { MAX_SNAPSHOTS, playStep, saveEditor, saveFile, startLevel, submit } from '../../../shared/levels'
import type { Level, Session, SubmitResult } from '../../../shared/levels'
import { headCommit, remoteBranchHead, repo, teammateCommit } from '../../../shared/git'
import { deepFreeze } from '../git/helpers'

// A small fixture level: write notes.txt and commit it, on a repo that has an origin.
const fixture: Level = {
  id: 'test-01-fixture',
  track: 'git',
  title: 'Fixture',
  story: 'A test level.',
  setup: () => repo().file('README.md', '# Test').commit('Initial commit').origin().build(),
  goals: [
    { id: 'written', label: 'notes.txt exists', check: ({ state }) => state.workdir['notes.txt'] !== undefined },
    { id: 'committed', label: 'notes.txt is committed', check: ({ state }) => headCommit(state)?.tree['notes.txt'] !== undefined }
  ],
  teammates: [
    {
      id: 'anna-main',
      author: 'Anna',
      trigger: { beforeCommand: 'git push' },
      apply: state => teammateCommit(state, { author: 'Anna', message: 'Anna on main', files: { 'anna.txt': 'hi\n' } }),
      notice: 'Anna pushed a commit to main.'
    },
    {
      id: 'ben-docs',
      author: 'Ben',
      trigger: { afterCommands: 2 },
      apply: state => teammateCommit(state, { author: 'Ben', message: 'Ben on docs', files: { 'docs.txt': 'docs\n' }, branch: 'docs' }),
      notice: 'Ben pushed a commit to docs.'
    }
  ],
  hints: ['First hint', 'Second hint', 'Third hint'],
  debrief: { title: 'Done', paragraphs: ['Why.'] },
  solution: ['touch notes.txt', 'git add notes.txt', 'git commit -m "Add notes"']
}

const textOf = (result: SubmitResult) => result.output.map(line => 'text' in line ? line.text : `<${line.kind}>`).join('\n')

/** Submits lines one after another on frozen sessions; returns the last result. */
function play(session: Session, ...lines: string[]) {
  let result: SubmitResult = { session, output: [], notices: [], solvedNow: false }
  const all: SubmitResult[] = []
  for (const line of lines) {
    result = submit(deepFreeze(result.session), fixture, line)
    all.push(result)
  }
  return { ...result, all }
}

describe('startLevel', () => {
  it('starts from the setup with goals computed and nothing done', () => {
    const session = startLevel(fixture)
    expect(session.levelId).toBe('test-01-fixture')
    expect(session.state).toEqual(fixture.setup())
    expect(session.goalsMet).toEqual({ written: false, committed: false })
    expect(session).toMatchObject({ history: [], snapshots: [], firedEvents: [], hintsUsed: 0, solved: false, commandCount: 0 })
  })
})

describe('submit', () => {
  it('treats an empty line as a no-op', () => {
    const session = startLevel(fixture)
    const result = play(session, '   ')
    expect(result.session).toEqual(session)
    expect(result.output).toEqual([])
  })

  it('runs git and shell lines, records them with their exit code and counts them', () => {
    const result = play(startLevel(fixture), 'touch notes.txt', 'git frobnicate')
    expect(result.session.history).toEqual([{ line: 'touch notes.txt', exitCode: 0 }, { line: 'git frobnicate', exitCode: 1 }])
    expect(result.session.commandCount).toBe(2)
    expect(result.session.goalsMet).toEqual({ written: true, committed: false })
    expect(textOf(result)).toContain('frobnicate')
  })

  it('solves the level once and stays playable', () => {
    const result = play(startLevel(fixture), ...fixture.solution, 'git status', 'undo', 'git commit -m "Add notes"')
    expect(result.all.map(step => step.solvedNow)).toEqual([false, false, true, false, false, false])
    expect(result.session.solved).toBe(true)
    expect(result.session.goalsMet).toEqual({ written: true, committed: true })
  })
})

describe('trainer commands', () => {
  it('undo restores the previous state and history, and is not counted', () => {
    const session = startLevel(fixture)
    const result = play(session, 'touch notes.txt', 'git add notes.txt', 'undo')
    expect(result.session.state).toEqual(play(session, 'touch notes.txt').session.state)
    expect(result.session.history).toEqual([{ line: 'touch notes.txt', exitCode: 0 }])
    expect(result.session.commandCount).toBe(2)
    expect(textOf(result)).toContain('git add notes.txt')
  })

  it('undo with nothing to undo says so', () => {
    const session = startLevel(fixture)
    const result = play(session, 'undo')
    expect(result.session).toEqual(session)
    expect(textOf(result)).toBe('Nothing to undo.')
  })

  it('reset goes back to the setup as a new attempt but keeps the hints used', () => {
    const result = play(startLevel(fixture), 'hint', ...fixture.solution, 'reset')
    expect(result.session.state).toEqual(fixture.setup())
    expect(result.session).toMatchObject({ history: [], snapshots: [], firedEvents: [], hintsUsed: 1, solved: false, commandCount: 0 })
    expect(result.session.goalsMet).toEqual({ written: false, committed: false })
    // a new attempt can be solved again
    expect(play(result.session, ...fixture.solution).solvedNow).toBe(true)
  })

  it('hint reveals the next hint and counts it, up to three', () => {
    const result = play(startLevel(fixture), 'hint', 'hint', 'hint', 'hint')
    expect(result.all.map(textOf)).toEqual([
      'Hint 1/3: First hint',
      'Hint 2/3: Second hint',
      'Hint 3/3: Third hint',
      'Hint 3/3: Third hint\nNo more hints. `undo` steps back, `reset` starts over.'
    ])
    expect(result.all[0]!.output[0]).toMatchObject({ kind: 'hint' })
    expect(result.session.hintsUsed).toBe(3)
    expect(result.session.commandCount).toBe(0)
    expect(result.session.history).toEqual([])
  })

  it('help lists trainer, git and shell commands', () => {
    const text = textOf(play(startLevel(fixture), 'help'))
    for (const word of ['undo', 'reset', 'hint', 'clear', 'edit', 'git rebase', 'git push', 'ls', 'echo']) expect(text).toContain(word)
  })

  it('clear and edit return markers for the UI and are not counted', () => {
    const session = startLevel(fixture)
    expect(play(session, 'clear').output).toEqual([{ kind: 'clear' }])
    expect(play(session, 'edit README.md').output).toEqual([{ kind: 'edit', path: 'README.md' }])
    expect(textOf(play(session, 'edit'))).toBe('usage: edit <file>')
    expect(play(session, 'clear', 'edit README.md').session).toEqual(session)
  })

  it('accepts trainer commands with surrounding spaces and any case', () => {
    expect(play(startLevel(fixture), '  HINT ').session.hintsUsed).toBe(1)
  })
})

describe('saveFile (editor panel)', () => {
  it('writes the file as a counted, undoable command', () => {
    const session = startLevel(fixture)
    const saved = saveFile(deepFreeze(session), fixture, 'notes.txt', 'hello\n')
    expect(saved.session.state.workdir['notes.txt']).toBe('hello\n')
    expect(saved.session.history).toEqual([{ line: 'edit notes.txt', exitCode: 0 }])
    expect(saved.session.goalsMet.written).toBe(true)
    expect(play(saved.session, 'undo').session.state).toEqual(session.state)
  })
})

describe('saveEditor (the file git waits for)', () => {
  const tidy = play(startLevel(fixture), 'git switch -c topic', 'touch notes.txt', 'git add notes.txt', 'git commit -m "notes"', 'git rebase -i main').session

  it('saves the todo list as a counted, undoable command, recorded as edit <path>', () => {
    const id = headCommit(tidy.state)!.id.slice(0, 7)
    const saved = saveEditor(deepFreeze(tidy), fixture, `reword ${id}\n`)
    expect(saved.session.history.at(-1)).toEqual({ line: 'edit .git/rebase-merge/git-rebase-todo', exitCode: 0 })
    expect(saved.session.commandCount).toBe(tidy.commandCount + 1)
    expect(saved.output).toEqual([{ kind: 'hint', text: 'hint: Waiting for your editor to close the file...' }])
    const message = playStep(saved.session, fixture, { save: 'Add the notes' })
    expect(headCommit(message.session.state)!.message).toBe('Add the notes')
    expect(play(message.session, 'undo').session.state).toEqual(saved.session.state)
  })

  it('answers without counting when git waits for nothing', () => {
    const session = startLevel(fixture)
    const result = saveEditor(deepFreeze(session), fixture, 'pick abc')
    expect(result.session).toBe(session)
    expect(textOf(result)).toBe('error: git is not waiting for a file in the editor')
  })
})

describe('teammate events', () => {
  const withLocalCommit = (session: Session) => play(session, 'touch notes.txt', 'git add notes.txt').session

  it('fires a beforeCommand event before the line runs, so the push is rejected', () => {
    const session = withLocalCommit(startLevel(fixture))
    const commit = play(session, 'git commit -m "Add notes"')
    expect(commit.notices).toEqual([])
    const pushed = play(commit.session, 'git push')
    expect(pushed.notices).toEqual([{ eventId: 'anna-main', author: 'Anna', text: 'Anna pushed a commit to main.' }])
    expect(textOf(pushed)).toContain('[rejected]')
    expect(pushed.session.history.at(-1)).toEqual({ line: 'git push', exitCode: 1 })
    expect(pushed.session.firedEvents).toContain('anna-main')
  })

  it('fires each event once per session', () => {
    const first = play(startLevel(fixture), 'git push')
    expect(first.notices).toHaveLength(1)
    const again = play(first.session, 'git push', 'git push')
    expect(again.all.map(step => step.notices.map(notice => notice.eventId))).toEqual([['ben-docs'], []])
  })

  it('matches the prefix on whole words, inside chained lines and with extra spaces', () => {
    const session = startLevel(fixture)
    expect(play(session, 'git   push origin main').notices).toHaveLength(1)
    expect(play(session, 'git status && git push').notices).toHaveLength(1)
    expect(play(session, 'git pushy').notices).toHaveLength(0)
    expect(play(session, 'echo "git push"').notices).toHaveLength(0)
  })

  it('fires an afterCommands event after the Nth counted command, ignoring trainer commands', () => {
    const result = play(startLevel(fixture), 'git status', 'hint', 'help', 'git status')
    expect(result.all.map(step => step.notices.map(notice => notice.eventId))).toEqual([[], [], [], ['ben-docs']])
    expect(remoteBranchHead(result.session.state, 'docs')).not.toBeNull()
  })

  it('lets an event fire again after an undo rewinds past it', () => {
    const fired = play(startLevel(fixture), 'git status', 'git status')
    expect(fired.session.firedEvents).toEqual(['ben-docs'])
    const undone = play(fired.session, 'undo')
    expect(undone.session.firedEvents).toEqual([])
    expect(remoteBranchHead(undone.session.state, 'docs')).toBeNull()
    const refired = play(undone.session, 'git log')
    expect(refired.notices.map(notice => notice.eventId)).toEqual(['ben-docs'])

    const pushed = play(startLevel(fixture), 'git push')
    const again = play(pushed.session, 'undo', 'git push')
    expect(again.notices.map(notice => notice.eventId)).toEqual(['anna-main'])
  })
})

describe('session data', () => {
  it('survives a JSON round trip and keeps playing', () => {
    const session = play(startLevel(fixture), 'hint', 'touch notes.txt', 'git push', 'git add notes.txt').session
    const copy = JSON.parse(JSON.stringify(session)) as Session
    expect(copy).toEqual(session)
    expect(play(copy, 'git commit -m "Add notes"').solvedNow).toBe(true)
    expect(play(copy, 'undo').session.state).toEqual(play(session, 'undo').session.state)
  })

  it('bounds the undo stack', () => {
    let session = startLevel(fixture)
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) session = submit(session, fixture, 'pwd').session
    expect(session.snapshots).toHaveLength(MAX_SNAPSHOTS)
    expect(session.commandCount).toBe(MAX_SNAPSHOTS + 5)
  })
})

describe('when triggers', () => {
  // Maya merges notes.txt on origin once the commit with it reached origin's main
  const merging: Level = {
    ...fixture,
    teammates: [{
      id: 'maya-sees-notes',
      author: 'Maya',
      trigger: { when: state => !!remoteBranchHead(state, 'main') && state.origin!.commits[remoteBranchHead(state, 'main')!]!.tree['notes.txt'] !== undefined },
      apply: state => teammateCommit(state, { author: 'Maya', message: 'Thanks for the notes', files: { 'thanks.txt': 'thanks\n' } }),
      notice: 'Maya saw your notes.'
    }]
  }

  it('fires right after the command that makes the check pass, once per timeline', () => {
    let session = startLevel(merging)
    const steps: SubmitResult[] = []
    for (const line of [...fixture.solution, 'git status', 'git push', 'git status']) {
      const result = submit(deepFreeze(session), merging, line)
      steps.push(result)
      session = result.session
    }
    expect(steps.map(step => step.notices.map(notice => notice.author))).toEqual([[], [], [], [], ['Maya'], []])
    expect(session.firedEvents).toEqual(['maya-sees-notes'])
    const undone = submit(submit(session, merging, 'undo').session, merging, 'undo')
    expect(undone.session.firedEvents).toEqual([])
    expect(submit(undone.session, merging, 'git push').notices.map(notice => notice.author)).toEqual(['Maya'])
  })
})
