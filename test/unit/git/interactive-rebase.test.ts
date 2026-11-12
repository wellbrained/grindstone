import { describe, expect, it } from 'vitest'
import { MESSAGE_PATH, TODO_PATH, commitsOf, createState, operationInProgress, resolve, submitEditor, waitingEditor } from '../../../shared/git'
import type { CommandResult, GitState } from '../../../shared/git'
import { deepFreeze, exec, ok, textOf } from './helpers'

const short = (state: GitState, rev: string) => resolve(state, rev)!.slice(0, 7)

/** main with one commit; feature with "Add a" (a.txt), "wip" (b.txt), "fix typo" (a.txt again). */
const feature = () => ok(createState(),
  'git init', 'echo base > base.txt', 'git add .', 'git commit -m "Start"',
  'git switch -c feature',
  'echo "a" > a.txt', 'git add .', 'git commit -m "Add a"',
  'echo "b" > b.txt', 'git add .', 'git commit -m "wip"',
  'echo "a, fixed" > a.txt', 'git commit -am "fix typo"'
)

/** Saves the waiting file; fails the test when git is not waiting. */
function save(state: GitState, text: string): CommandResult {
  expect(waitingEditor(state)).not.toBeNull()
  return submitEditor(deepFreeze(state), text)
}

const todoOf = (state: GitState, lines: string[]) => lines.map(line => line.replace(/<(\w+~?\d*)>/g, (_, rev: string) => short(state, rev))).join('\n')
const messages = (state: GitState, range = 'main..feature') => commitsOf(state, range).map(commit => commit.message)

describe('git rebase -i', () => {
  it('writes the todo list, oldest first, and waits for the editor without moving anything', () => {
    const state = feature()
    const { state: waiting, text, last } = exec(state, 'git rebase -i main')
    expect(text).toBe('hint: Waiting for your editor to close the file...')
    expect(last.exitCode).toBe(0)
    expect(operationInProgress(waiting)).toBe('rebase')
    expect(waiting.repo!.head).toEqual({ type: 'branch', name: 'feature' })
    expect(waiting.repo!.branches).toEqual(state.repo!.branches)
    const editor = waitingEditor(waiting)!
    expect(editor.kind).toBe('todo')
    expect(editor.path).toBe(TODO_PATH)
    const main = short(state, 'main')
    expect(editor.text).toBe([
      `pick ${short(state, 'feature~2')} # Add a`,
      `pick ${short(state, 'feature~1')} # wip`,
      `pick ${short(state, 'feature')} # fix typo`,
      '',
      `# Rebase ${main}..${short(state, 'feature')} onto ${main} (3 commands)`,
      '#',
      '# Commands:',
      '# p, pick <commit> = use commit',
      '# r, reword <commit> = use commit, but edit the commit message',
      '# s, squash <commit> = use commit, but meld into previous commit',
      '# f, fixup <commit> = like "squash" but keep only the previous',
      '#                    commit\'s log message',
      '# d, drop <commit> = remove commit',
      '#',
      '# These lines can be re-ordered; they are executed from top to bottom.',
      '#',
      '# If you remove a line here THAT COMMIT WILL BE LOST.',
      '#',
      '# However, if you remove everything, the rebase will be aborted.',
      '#',
      ''
    ].join('\n'))
    expect(exec(state, 'git rebase --interactive main').state).toEqual(waiting)
  })

  it('keeps the commits as they are when the list is saved unchanged (fast-forward, same ids)', () => {
    const waiting = exec(feature(), 'git rebase -i main').state
    const result = save(waiting, waitingEditor(waiting)!.text)
    expect(textOf(result)).toBe('Successfully rebased and updated refs/heads/feature.')
    expect(result.exitCode).toBe(0)
    expect(result.state.repo!.branches).toEqual(waiting.repo!.branches)
    expect(result.state.repo!.head).toEqual({ type: 'branch', name: 'feature' })
    expect(result.state.repo!.operation).toBeNull()
  })

  it('refuses every other command while the editor is open, but lets git rebase --abort through (edge case)', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    for (const line of ['git status', 'ls', 'git rebase --continue', 'git commit -m x', 'git rebase --abort --quiet']) {
      const result = exec(waiting, line)
      expect(result.last.exitCode).toBe(1)
      expect(result.state).toBe(waiting)
      expect(result.text).toBe('error: git is waiting for you to close git-rebase-todo in the editor\nhint: Save it or cancel it there first, or run "git rebase --abort".')
    }
    const aborted = ok(waiting, 'git rebase --abort')
    expect(aborted).toEqual(state)
  })

  it('rewords: picks the commit, then opens its message; the saved message replaces it', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    const first = save(waiting, todoOf(state, ['reword <feature~2> Add a', 'pick <feature~1> wip', 'pick <feature> fix typo']))
    expect(textOf(first)).toBe('hint: Waiting for your editor to close the file...')
    const editor = waitingEditor(first.state)!
    expect(editor.kind).toBe('message')
    expect(editor.path).toBe(MESSAGE_PATH)
    expect(editor.text).toBe([
      'Add a',
      '',
      '# Please enter the commit message for your changes. Lines starting',
      '# with \'#\' will be ignored, and an empty message aborts the commit.',
      '#',
      `# interactive rebase in progress; onto ${short(state, 'main')}`,
      '# Last command done (1 command done):',
      `#    reword ${short(state, 'feature~2')} # Add a`,
      '# Next commands to do (2 remaining commands):',
      `#    pick ${short(state, 'feature~1')} # wip`,
      `#    pick ${short(state, 'feature')} # fix typo`,
      '#   (use "git rebase --edit-todo" to view and edit)',
      ''
    ].join('\n'))
    // still busy while the message is open
    expect(exec(first.state, 'git log').last.exitCode).toBe(1)

    const done = save(first.state, `Add the a file\n${editor.text.slice('Add a\n'.length)}`)
    expect(textOf(done)).toMatch(/^\[detached HEAD [0-9a-f]{7}\] Add the a file\n 1 file changed, 1 insertion\(\+\)\n create mode 100644 a\.txt\nSuccessfully rebased and updated refs\/heads\/feature\.$/)
    expect(messages(done.state)).toEqual(['fix typo', 'wip', 'Add the a file'])
    expect(done.state.workdir).toEqual(state.workdir)
    expect(commitsOf(done.state, 'feature')[0]!.tree).toEqual(commitsOf(state, 'feature')[0]!.tree)
  })

  it('reword plus fixups: asks for the message once, then melds the fixups in silently', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    const asked = save(waiting, todoOf(state, ['r <feature~2>', 'f <feature~1> anything here is ignored', 'fixup <feature> fix typo']))
    const done = save(asked.state, 'Add a and b\n')
    expect(done.exitCode).toBe(0)
    expect(textOf(done)).toContain('Successfully rebased and updated refs/heads/feature.')
    expect(messages(done.state)).toEqual(['Add a and b'])
    expect(commitsOf(done.state, 'feature')[0]!.tree).toEqual(commitsOf(state, 'feature')[0]!.tree)
    expect(commitsOf(done.state, 'feature')[0]!.parents).toEqual([resolve(state, 'main')])
  })

  it('squash: opens git\'s combination of the messages at the end of the chain, fixups commented out', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    const asked = save(waiting, todoOf(state, ['pick <feature~2> Add a', 'squash <feature~1> wip', 'fixup <feature> fix typo']))
    expect(waitingEditor(asked.state)!.text).toBe([
      '# This is a combination of 3 commits.',
      '# This is the 1st commit message:',
      '',
      'Add a',
      '',
      '# This is the commit message #2:',
      '',
      'wip',
      '',
      '# The commit message #3 will be skipped:',
      '',
      '# fix typo',
      '',
      '# Please enter the commit message for your changes. Lines starting',
      '# with \'#\' will be ignored, and an empty message aborts the commit.',
      '#',
      `# interactive rebase in progress; onto ${short(state, 'main')}`,
      '# Last commands done (3 commands done):',
      `#    squash ${short(state, 'feature~1')} # wip`,
      `#    fixup ${short(state, 'feature')} # fix typo`,
      '#   (see more in file .git/rebase-merge/done)',
      '# No commands remaining.',
      ''
    ].join('\n'))
    // saved as it is: the # lines go, the kept messages stay
    const done = save(asked.state, waitingEditor(asked.state)!.text)
    expect(messages(done.state)).toEqual(['Add a\n\nwip'])
  })

  it('fixups alone keep the first message and never open the editor', () => {
    const state = feature()
    const done = save(exec(state, 'git rebase -i main').state, todoOf(state, ['pick <feature~2>', 'fixup <feature~1>', 'fixup <feature>']))
    expect(waitingEditor(done.state)).toBeNull()
    expect(messages(done.state)).toEqual(['Add a'])
  })

  it('drops a commit (drop, d, or a deleted line) and runs the lines in the new order', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    const dropped = save(waiting, todoOf(state, ['pick <feature~2>', 'd <feature~1> wip', 'pick <feature>']))
    expect(messages(dropped.state)).toEqual(['fix typo', 'Add a'])
    expect(dropped.state.workdir['b.txt']).toBeUndefined()
    expect(messages(save(waiting, todoOf(state, ['pick <feature~2>', 'pick <feature>'])).state)).toEqual(['fix typo', 'Add a'])
    const reordered = save(waiting, todoOf(state, ['pick <feature~1>', 'pick <feature~2>', 'pick <feature>']))
    expect(messages(reordered.state)).toEqual(['fix typo', 'Add a', 'wip'])
  })

  it('cancels the rebase when the list is empty, like git (edge case)', () => {
    const state = feature()
    const result = save(exec(state, 'git rebase -i main').state, '# only comments\n\n')
    expect(textOf(result)).toBe('error: nothing to do')
    expect(result.exitCode).toBe(1)
    expect(result.state).toEqual(state)
  })

  it('refuses a broken list and keeps the editor open (edge cases)', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    const a = short(state, 'feature~2')
    const cases: [string, string][] = [
      [`frob ${a} Add a`, `error: invalid line 1: frob ${a} Add a`],
      [`pick ${a}\npick`, 'error: missing arguments for pick\nerror: invalid line 2: pick'],
      [`pick ${a}\nr`, 'error: missing arguments for reword\nerror: invalid line 2: r'],
      ['pick zzzzzzz Nope', 'error: could not parse \'zzzzzzz\'\nerror: invalid line 1: pick zzzzzzz Nope'],
      [`fixup ${a}`, 'error: cannot \'fixup\' without a previous commit'],
      [`edit ${a}`, 'error: \'edit\' in the todo list is not in this trainer yet']
    ]
    for (const [todo, error] of cases) {
      const result = save(waiting, todo)
      expect(textOf(result)).toBe(`${error}\nhint: Fix the list in the editor and save it again, or run "git rebase --abort".`)
      expect(result.exitCode).toBe(1)
      expect(result.state).toBe(waiting)
    }
  })

  it('stops on an empty message; the commit keeps its message and --continue goes on (edge case)', () => {
    const state = feature()
    const asked = save(exec(state, 'git rebase -i main').state, todoOf(state, ['reword <feature~2>', 'pick <feature~1>', 'pick <feature>']))
    const empty = save(asked.state, '# nothing but comments\n\n')
    const picked = resolve(asked.state, 'HEAD')!.slice(0, 7)
    expect(textOf(empty)).toBe(`Aborting commit due to empty commit message.\nCould not apply ${picked}... Add a`)
    expect(empty.exitCode).toBe(1)
    expect(waitingEditor(empty.state)).toBeNull()
    expect(exec(empty.state, 'git status').text).toContain(`interactive rebase in progress; onto ${short(state, 'main')}`)
    const continued = ok(empty.state, 'git rebase --continue')
    expect(messages(continued)).toEqual(['fix typo', 'wip', 'Add a'])
  })

  it('aborts while the message is open: everything back as before', () => {
    const state = feature()
    const asked = save(exec(state, 'git rebase -i main').state, todoOf(state, ['reword <feature~2>', 'pick <feature~1>', 'pick <feature>']))
    const aborted = ok(asked.state, 'git rebase --abort')
    // only the reflog remembers the rebase: its start, the pick, and the way back
    const { reflog, origHead, ...repo } = aborted.repo!
    expect({ ...aborted, repo }).toEqual({ ...state, clock: asked.state.clock, repo: { ...state.repo!, reflog: undefined } })
    expect(reflog!.HEAD!.slice(0, 3).map(entry => entry.message)).toEqual(['rebase (abort): returning to refs/heads/feature', 'rebase: fast-forward', 'rebase (start): checkout main'])
    expect(reflog!.feature).toEqual(state.repo!.reflog!.feature)
    expect(origHead).toBe(resolve(state, 'feature'))
  })

  it('works on HEAD~n: rewords the commit before last, the newest keeps its message and files', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i HEAD~2').state
    expect(waitingEditor(waiting)!.text.split('\n').slice(0, 2)).toEqual([`pick ${short(state, 'feature~1')} # wip`, `pick ${short(state, 'feature')} # fix typo`])
    const asked = save(waiting, todoOf(state, ['reword <feature~1> wip', 'pick <feature> fix typo']))
    const done = save(asked.state, 'Add b')
    expect(messages(done.state)).toEqual(['fix typo', 'Add b', 'Add a'])
    // the oldest one was not touched at all
    expect(resolve(done.state, 'feature~2')).toBe(resolve(state, 'feature~2'))
    expect(commitsOf(done.state, 'feature')[0]!.tree).toEqual(commitsOf(state, 'feature')[0]!.tree)
  })

  it('stops on a conflict like a plain rebase; after --continue a reword still asks for the message', () => {
    const state = ok(feature(), 'git switch main', 'echo "a from main" > a.txt', 'git add .', 'git commit -m "a on main"', 'git switch feature')
    const asked = save(exec(state, 'git rebase -i main').state, todoOf(state, ['reword <feature~2>', 'pick <feature~1>', 'pick <feature>']))
    expect(asked.exitCode).toBe(1)
    expect(textOf(asked)).toContain('CONFLICT (add/add): Merge conflict in a.txt')
    expect(waitingEditor(asked.state)).toBeNull()
    const resolved = ok(asked.state, 'echo "a" > a.txt', 'git add a.txt')
    const continued = exec(resolved, 'git rebase --continue')
    expect(continued.text).toMatch(/^\[detached HEAD [0-9a-f]{7}\] Add a\n.*\nhint: Waiting for your editor to close the file\.\.\.$/s)
    expect(waitingEditor(continued.state)!.kind).toBe('message')
    const done = save(continued.state, 'Add a, rebased')
    expect(done.exitCode).toBe(0)
    expect(messages(done.state)).toEqual(['fix typo', 'wip', 'Add a, rebased'])
    expect(done.state.workdir['a.txt']).toBe('a, fixed\n')
  })

  it('offers noop when there is nothing to replay', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i HEAD').state
    expect(waitingEditor(waiting)!.text.split('\n').slice(0, 3)).toEqual(['noop', '', `# Rebase ${short(state, 'HEAD')}..${short(state, 'HEAD')} onto ${short(state, 'HEAD')} (1 command)`])
    const result = save(waiting, waitingEditor(waiting)!.text)
    expect(textOf(result)).toBe('Successfully rebased and updated refs/heads/feature.')
    expect(result.state.repo!.branches).toEqual(state.repo!.branches)
  })

  it('refuses to start with uncommitted changes, and answers when nothing waits for the editor', () => {
    const dirty = ok(feature(), 'echo dirty >> a.txt')
    expect(exec(dirty, 'git rebase -i main').text).toBe('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.')
    const result = submitEditor(feature(), 'pick abc')
    expect(textOf(result)).toBe('error: git is not waiting for a file in the editor')
    expect(result.exitCode).toBe(1)
  })
})
