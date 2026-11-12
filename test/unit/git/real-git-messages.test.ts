// Messages checked against real git (2.55): every expectation below was produced by running the real `git` CLI in a
// throwaway repository. Paths, dates and authors are simplified in the simulation; the wording is git's.
import { describe, expect, it } from 'vitest'
import { createState, resolve, submitEditor, waitingEditor } from '../../../shared/git'
import type { GitState } from '../../../shared/git'
import { deepFreeze, exec, ok } from './helpers'

const short = (state: GitState, rev: string) => resolve(state, rev)!.slice(0, 7)
const full = (state: GitState, rev: string) => resolve(state, rev)!
const log = (state: GitState, name = 'HEAD') => (state.repo!.reflog?.[name] ?? []).map(entry => entry.message)

/** a.txt in "one" and "two" on main. */
const base = () => ok(createState(), 'git init', 'echo a > a.txt', 'git add .', 'git commit -m one', 'echo b >> a.txt', 'git commit -am two')

const DETACHED_NOTE = (label: string) => [
  `Note: switching to '${label}'.`,
  '',
  'You are in \'detached HEAD\' state. You can look around, make experimental',
  'changes and commit them, and you can discard any commits you make in this',
  'state without impacting any branches by switching back to a branch.',
  '',
  'If you want to create a new branch to retain commits you create, you may',
  'do so (now or later) by using -c with the switch command. Example:',
  '',
  '  git switch -c <new-branch-name>',
  '',
  'Or undo this operation with:',
  '',
  '  git switch -',
  '',
  'Turn off this advice by setting config variable advice.detachedHead to false',
  ''
]

describe('stash messages', () => {
  const stashed = (count: number) => {
    let state = base()
    for (let i = 0; i < count; i++) state = ok(state, `echo ${i} >> a.txt`, 'git stash')
    return state
  }

  it('names a missing stash entry the way git does', () => {
    expect(exec(base(), 'git stash pop').text).toBe('No stash entries found.')
    expect(exec(base(), 'git stash drop').text).toBe('No stash entries found.')
    // an explicit entry without any stash: error, exit 1
    for (const [line, text] of [
      ['git stash apply stash@{3}', 'error: stash@{3} is not a valid reference'],
      ['git stash drop stash@{0}', 'error: stash@{0} is not a valid reference'],
      ['git stash pop 1', 'error: refs/stash@{1} is not a valid reference'],
      ['git stash drop 0', 'error: refs/stash@{0} is not a valid reference']
    ] as const) {
      const result = exec(base(), line)
      expect(result.text).toBe(text)
      expect(result.last.exitCode).toBe(1)
    }
  })

  it('counts the entries when the asked-for one does not exist, and rejects other names', () => {
    const two = stashed(2)
    for (const [line, text] of [
      ['git stash apply stash@{5}', 'fatal: log for \'stash\' only has 2 entries'],
      ['git stash drop stash@{2}', 'fatal: log for \'stash\' only has 2 entries'],
      ['git stash pop 2', 'fatal: log for \'refs/stash\' only has 2 entries']
    ] as const) {
      const result = exec(two, line)
      expect(result.text).toBe(text)
      expect(result.last.exitCode).toBe(128)
    }
    const one = exec(stashed(1), 'git stash drop stash@{1}')
    expect(one.text).toBe('fatal: log for \'stash\' only has 1 entries')
    const bad = exec(two, 'git stash apply foo')
    expect(bad.text).toBe('error: foo is not a valid reference')
    expect(bad.last.exitCode).toBe(1)
    expect(exec(stashed(1), 'git stash drop stash@{x}').text).toBe('error: stash@{x} is not a valid reference')
  })

  it('says which entry was dropped: refs/stash@{n} for the default or a bare number, stash@{n} when typed so', () => {
    const three = stashed(3)
    const id = (state: GitState, index: number) => state.repo!.stash[index]!.id
    expect(exec(three, 'git stash drop').text).toBe(`Dropped refs/stash@{0} (${id(three, 0)})`)
    expect(exec(three, 'git stash drop 1').text).toBe(`Dropped refs/stash@{1} (${id(three, 1)})`)
    expect(exec(three, 'git stash drop stash@{2}').text).toBe(`Dropped stash@{2} (${id(three, 2)})`)
  })

  it('shows the status after a refused pop, then says the entry is kept', () => {
    const state = ok(stashed(1), 'echo other >> a.txt')
    const result = exec(state, 'git stash pop')
    expect(result.last.exitCode).toBe(1)
    expect(result.text).toBe([
      'error: Your local changes to the following files would be overwritten by merge:',
      '\ta.txt',
      'Please commit your changes or stash them before you merge.',
      'Aborting',
      'On branch main',
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
      '\tmodified:   a.txt',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")',
      'The stash entry is kept in case you need it again.'
    ].join('\n'))
  })
})

describe('switch and checkout messages', () => {
  it('has no previous branch to go back to at first', () => {
    const state = base()
    const result = exec(state, 'git switch -')
    expect(result.text).toBe('fatal: invalid reference: @{-1}')
    expect(result.last.exitCode).toBe(128)
    expect(exec(state, 'git checkout -').text).toBe('error: pathspec \'-\' did not match any file(s) known to git')
  })

  it('refuses to switch back to a detached commit and names it in full', () => {
    const state = ok(base(), 'git checkout --detach HEAD~1', 'git switch main')
    const result = exec(state, 'git switch -')
    expect(result.last.exitCode).toBe(128)
    expect(result.text).toBe([
      `fatal: a branch is expected, got commit '${full(state, 'main~1')}'`,
      'hint: If you want to detach HEAD at the commit, try again with the --detach option.'
    ].join('\n'))
  })

  it('shows the long detached-HEAD advice only when the commit was not asked for with --detach', () => {
    const state = base()
    const plain = exec(state, 'git checkout HEAD~1')
    expect(plain.text).toBe([...DETACHED_NOTE('HEAD~1'), `HEAD is now at ${short(state, 'HEAD~1')} one`].join('\n'))
    for (const line of ['git checkout --detach HEAD~1', 'git switch --detach HEAD~1']) {
      expect(exec(state, line).text).toBe(`HEAD is now at ${short(state, 'HEAD~1')} one`)
    }
  })

  it('names the commit in full when `checkout -` goes back to a detached position', () => {
    const state = ok(base(), 'git checkout --detach HEAD~1', 'git switch main')
    const result = exec(state, 'git checkout -')
    expect(result.text).toBe([...DETACHED_NOTE(full(state, 'main~1')), `HEAD is now at ${short(state, 'main~1')} one`].join('\n'))
    expect(log(result.state)[0]).toBe(`checkout: moving from main to ${full(state, 'main~1')}`)
  })

  it('mentions the previous HEAD position only when it differs from where you land', () => {
    const state = ok(base(), 'git checkout --detach main')
    expect(exec(state, 'git switch main').text).toBe('Switched to branch \'main\'')
    const away = ok(base(), 'git checkout --detach HEAD~1')
    expect(exec(away, 'git switch main').text).toBe(`Previous HEAD position was ${short(away, 'HEAD')} one\nSwitched to branch 'main'`)
  })

  it('logs "moving from main to main" when you are already there', () => {
    const state = base()
    const result = exec(state, 'git switch main')
    expect(result.text).toBe('Already on \'main\'')
    expect(log(result.state)[0]).toBe('checkout: moving from main to main')
    expect(log(exec(state, 'git checkout main').state)[0]).toBe('checkout: moving from main to main')
  })

  it('treats `checkout HEAD` as a no-op and `--detach` without a commit as detaching at HEAD', () => {
    const state = base()
    const noop = exec(state, 'git checkout HEAD')
    expect(noop.text).toBe('')
    expect(noop.state.repo!.head).toEqual({ type: 'branch', name: 'main' })
    expect(log(noop.state)).toEqual(log(state))
    for (const line of ['git checkout --detach', 'git switch --detach']) {
      const detached = exec(state, line)
      expect(detached.text).toBe(`HEAD is now at ${short(state, 'HEAD')} two`)
      expect(detached.state.repo!.head).toEqual({ type: 'detached', commit: full(state, 'HEAD') })
      expect(log(detached.state)[0]).toBe('checkout: moving from main to HEAD')
    }
  })
})

describe('branch messages', () => {
  it('logs a new branch as created from the branch HEAD is on, or from HEAD when detached', () => {
    const state = ok(base(), 'git branch b1', 'git branch b2 main', 'git branch b3 HEAD', 'git switch -c s1')
    expect(log(state, 'b1')).toEqual(['branch: Created from main'])
    expect(log(state, 'b2')).toEqual(['branch: Created from main'])
    expect(log(state, 'b3')).toEqual(['branch: Created from HEAD'])
    expect(log(state, 's1')).toEqual(['branch: Created from HEAD'])
    expect(log(ok(base(), 'git checkout --detach', 'git branch d1'), 'd1')).toEqual(['branch: Created from HEAD'])
  })

  it('cannot hold a branch and a folder of the same name', () => {
    const state = ok(base(), 'git branch a/b')
    const result = exec(state, 'git branch a')
    expect(result.last.exitCode).toBe(128)
    expect(result.text).toBe('fatal: cannot lock ref \'refs/heads/a\': \'refs/heads/a/b\' exists; cannot create \'refs/heads/a\'')
    const reverse = exec(ok(base(), 'git branch a'), 'git branch a/b')
    expect(reverse.last.exitCode).toBe(128)
    expect(reverse.text).toBe('fatal: cannot lock ref \'refs/heads/a/b\': \'refs/heads/a\' exists; cannot create \'refs/heads/a/b\'')
  })
})

describe('tag messages', () => {
  it('git tag -d without a name does nothing', () => {
    const result = exec(base(), 'git tag -d')
    expect(result.text).toBe('')
    expect(result.last.exitCode).toBe(0)
  })
})

describe('log decorations', () => {
  it('lists HEAD -> branch, then tags, remote branches and the other local branches, each group newest name first', () => {
    const state = ok(base(), 'git branch zeta', 'git branch alpha', 'git tag v1', 'git tag a-tag', 'git tag -a v0 -m x')
    const line = exec(state, 'git log --oneline').text.split('\n')[0]
    expect(line).toBe(`${short(state, 'HEAD')} (HEAD -> main, tag: v1, tag: v0, tag: a-tag, zeta, alpha) two`)
    const detached = ok(state, 'git checkout --detach')
    expect(exec(detached, 'git log --oneline').text.split('\n')[0]).toBe(`${short(state, 'HEAD')} (HEAD, tag: v1, tag: v0, tag: a-tag, zeta, main, alpha) two`)
  })
})

describe('cherry-pick and revert messages', () => {
  /** main has "featc" cherry-picked already, so picking it again is empty. */
  const picked = () => ok(base(), 'git switch -c feat', 'echo f > f.txt', 'git add .', 'git commit -m featc', 'git switch main', 'git cherry-pick feat')

  it('--skip without a pick in progress says so in git\'s own words', () => {
    const result = exec(base(), 'git cherry-pick --skip')
    expect(result.text).toBe('error: no cherry-pick in progress\nfatal: cherry-pick failed')
    expect(result.last.exitCode).toBe(128)
    expect(exec(base(), 'git cherry-pick --abort').text).toBe('error: no cherry-pick or revert in progress\nfatal: cherry-pick failed')
    expect(exec(base(), 'git cherry-pick --continue').text).toBe('error: no cherry-pick or revert in progress\nfatal: cherry-pick failed')
  })

  it('--abort and --skip write a reset entry with the full commit id, even when HEAD did not move', () => {
    const state = exec(picked(), 'git cherry-pick feat').state
    const head = full(state, 'HEAD')
    expect(log(exec(state, 'git cherry-pick --skip').state)[0]).toBe(`reset: moving to ${head}`)
    expect(log(exec(state, 'git cherry-pick --abort').state)[0]).toBe(`reset: moving to ${head}`)
  })

  it('prints git\'s full usage for a missing commit', () => {
    const pick = exec(base(), 'git cherry-pick')
    expect(pick.last.exitCode).toBe(129)
    expect(pick.text.split('\n').slice(0, 3)).toEqual([
      'usage: git cherry-pick [--edit] [-n] [-m <parent-number>] [-s] [-x] [--ff]',
      '                       [-S[<keyid>]] <commit>...',
      '   or: git cherry-pick (--continue | --skip | --abort | --quit)'
    ])
    const revert = exec(base(), 'git revert')
    expect(revert.last.exitCode).toBe(129)
    expect(revert.text.split('\n').slice(0, 2)).toEqual([
      'usage: git revert [--[no-]edit] [-n] [-m <parent-number>] [-s] [-S[<keyid>]] <commit>...',
      '   or: git revert (--continue | --skip | --abort | --quit)'
    ])
  })

  it('ends a conflicted pick with the hint about turning the advice off', () => {
    const state = ok(base(), 'git switch -c feat', 'echo f > a.txt', 'git commit -am featc', 'git switch main', 'echo m > a.txt', 'git commit -am mc')
    const result = exec(state, 'git cherry-pick feat')
    expect(result.text.split('\n').slice(-2)).toEqual([
      'hint: run "git cherry-pick --abort".',
      'hint: Disable this message with "git config set advice.mergeConflict false"'
    ])
  })
})

describe('status messages', () => {
  it('asks for "git add/rm" "as appropriate" when a conflict involves a deletion', () => {
    const state = ok(createState(), 'git init', 'echo a > a.txt', 'echo k > k.txt', 'git add .', 'git commit -m one',
      'git switch -c feat', 'echo f > a.txt', 'git rm -q k.txt', 'git commit -am featc',
      'git switch main', 'echo m > a.txt', 'echo k2 >> k.txt', 'git commit -am mc')
    expect(exec(exec(state, 'git merge feat').state, 'git status').text).toContain([
      'Unmerged paths:',
      '  (use "git add/rm <file>..." as appropriate to mark resolution)',
      '\tboth modified:   a.txt',
      '\tdeleted by them: k.txt'
    ].join('\n'))
  })

  it('leaves out the "restore --staged" hint while a merge or cherry-pick is going on, but not otherwise', () => {
    const merging = ok(createState(), 'git init', 'echo a > a.txt', 'git add .', 'git commit -m one',
      'git switch -c feat', 'echo f > a.txt', 'echo n > n.txt', 'git add .', 'git commit -m featc', 'git switch main', 'echo m > a.txt', 'git commit -am mc')
    const text = exec(exec(merging, 'git merge feat').state, 'git status').text
    expect(text).toContain('Changes to be committed:\n\tnew file:   n.txt')
    expect(text).not.toContain('restore --staged')
    const plain = ok(base(), 'echo n > n.txt', 'git add .')
    expect(exec(plain, 'git status').text).toContain('Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)')
  })
})

describe('checkout --ours / --theirs messages', () => {
  it('tells a tree-ish with paths from a branch switch', () => {
    const state = ok(base(), 'git branch feat')
    expect(exec(state, 'git checkout feat --ours a.txt').text).toBe('fatal: \'--merge\', \'--ours\', or \'--theirs\' cannot be used when checking out of a tree')
    expect(exec(state, 'git checkout -b x --ours').text).toBe('fatal: \'--ours/--theirs\' cannot be used with switching branches')
  })
})

describe('rebase messages', () => {
  /** main "Start"; feature c1, c2, c3 (each its own file). */
  const feature = () => ok(createState(),
    'git init', 'echo base > a.txt', 'git add .', 'git commit -m Start',
    'git switch -c feature',
    'echo one > c1.txt', 'git add .', 'git commit -m c1',
    'echo two > c2.txt', 'git add .', 'git commit -m c2',
    'echo three > c3.txt', 'git add .', 'git commit -m c3')
  /** The same, with main moved on so that every pick is a real replay. */
  const moved = () => ok(feature(), 'git switch main', 'echo more > m.txt', 'git add .', 'git commit -m mc', 'git switch feature')

  /** Runs `git rebase -i main`, edits the todo list, and edits the commit message when git asks for one. */
  const edit = (state: GitState, todo: (text: string) => string, message?: (text: string) => string) => {
    const waiting = exec(state, 'git rebase -i main').state
    let result = submitEditor(deepFreeze(waiting), todo(waitingEditor(waiting)!.text))
    if (message && waitingEditor(result.state)) result = submitEditor(deepFreeze(result.state), message(waitingEditor(result.state)!.text))
    return result
  }

  it('says "no rebase in progress" in lower case, like git 2.55', () => {
    for (const flag of ['--abort', '--continue', '--skip']) {
      const result = exec(feature(), `git rebase ${flag}`)
      expect(result.text).toBe('fatal: no rebase in progress')
      expect(result.last.exitCode).toBe(128)
    }
  })

  it('skips the leading picks that already sit on the base: the start entry points at the last of them', () => {
    const state = feature()
    const waiting = exec(state, 'git rebase -i main').state
    const result = submitEditor(deepFreeze(waiting), waitingEditor(waiting)!.text)
    expect(result.exitCode).toBe(0)
    expect(log(result.state)).toEqual([
      'rebase (finish): returning to refs/heads/feature',
      'rebase (start): checkout main',
      ...log(state)
    ])
    expect(result.state.repo!.reflog!.HEAD![1]!.id).toBe(full(state, 'feature'))
  })

  it('logs a reword of an unmoved commit as a fast-forward, then as the reword', () => {
    const state = feature()
    const result = edit(state, text => text.replace(/^pick (\w+ # c3)/m, 'reword $1'), text => text.replace('c3', 'c3, better'))
    expect(result.exitCode).toBe(0)
    expect(log(result.state).slice(0, 4)).toEqual([
      'rebase (finish): returning to refs/heads/feature',
      'rebase (reword): c3, better',
      'rebase: fast-forward',
      'rebase (start): checkout main'
    ])
    expect(result.state.repo!.reflog!.HEAD![3]!.id).toBe(full(state, 'feature~1'))
  })

  it('logs a replayed reword under the name of the step: first the pick, then the new message', () => {
    const result = edit(moved(), text => text.replace(/^pick (\w+ # c2)/m, 'reword $1'), text => text.replace('c2', 'c2, better'))
    expect(result.exitCode).toBe(0)
    expect(log(result.state).slice(0, 6)).toEqual([
      'rebase (finish): returning to refs/heads/feature',
      'rebase (pick): c3',
      'rebase (reword): c2, better',
      'rebase (reword): c2',
      'rebase (pick): c1',
      'rebase (start): checkout main'
    ])
  })

  it('writes the todo lines the way git does: pick <id> # <subject>', () => {
    const state = feature()
    const text = waitingEditor(exec(state, 'git rebase -i main').state)!.text
    expect(text.split('\n').slice(0, 3)).toEqual([
      `pick ${short(state, 'feature~2')} # c1`,
      `pick ${short(state, 'feature~1')} # c2`,
      `pick ${short(state, 'feature')} # c3`
    ])
  })

  /** feature has c1, cc (changes a.txt, which main changes too: a conflict), c3 and c4. */
  const conflicting = () => ok(createState(),
    'git init', 'echo base > a.txt', 'git add .', 'git commit -m Start',
    'git switch -c feature',
    'echo one > c1.txt', 'git add .', 'git commit -m c1',
    'echo feature > a.txt', 'git commit -am cc',
    'echo three > c3.txt', 'git add .', 'git commit -m c3',
    'echo four > c4.txt', 'git add .', 'git commit -m c4',
    'git switch main', 'echo main > a.txt', 'git commit -am mc', 'git switch feature')

  it('ends a conflicted replay with the advice hint and git\'s "Could not apply <id>... # <subject>"', () => {
    const state = conflicting()
    const stopped = exec(state, 'git rebase main')
    expect(stopped.last.exitCode).toBe(1)
    expect(stopped.text.split('\n').slice(-3)).toEqual([
      'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
      'hint: Disable this message with "git config set advice.mergeConflict false"',
      `Could not apply ${short(state, 'feature~2')}... # cc`
    ])
  })

  it('shows the finished and the coming steps in the status while a rebase waits', () => {
    const state = conflicting()
    const stopped = exec(state, 'git rebase main')
    expect(exec(stopped.state, 'git status').text.split('\n').slice(0, 9)).toEqual([
      `interactive rebase in progress; onto ${short(state, 'main')}`,
      'Last commands done (2 commands done):',
      `   pick ${short(state, 'feature~3')} # c1`,
      `   pick ${short(state, 'feature~2')} # cc`,
      'Next commands to do (2 remaining commands):',
      `   pick ${short(state, 'feature~1')} # c3`,
      `   pick ${short(state, 'feature')} # c4`,
      '  (use "git rebase --edit-todo" to view and edit)',
      `You are currently rebasing branch 'feature' on '${short(state, 'main')}'.`
    ])
  })

  it('uses the singular for one step, and points to the done file when more than two are done', () => {
    const many = ok(feature(), 'git switch main', 'echo main > c3.txt', 'git add .', 'git commit -m mc', 'git switch feature')
    const first = exec(many, 'git rebase main')
    expect(first.last.exitCode).toBe(1)
    expect(exec(first.state, 'git status').text.split('\n').slice(0, 6)).toEqual([
      `interactive rebase in progress; onto ${short(many, 'main')}`,
      'Last commands done (3 commands done):',
      `   pick ${short(many, 'feature~1')} # c2`,
      `   pick ${short(many, 'feature')} # c3`,
      '  (see more in file .git/rebase-merge/done)',
      'No commands remaining.'
    ])
    const single = ok(createState(), 'git init', 'echo base > a.txt', 'git add .', 'git commit -m Start', 'git switch -c feature', 'echo f > a.txt', 'git commit -am f1', 'echo g > b.txt', 'git add .', 'git commit -m f2',
      'git switch main', 'echo m > a.txt', 'git commit -am mc', 'git switch feature')
    const stopped = exec(single, 'git rebase main').state
    expect(exec(stopped, 'git status').text.split('\n').slice(0, 6)).toEqual([
      `interactive rebase in progress; onto ${short(single, 'main')}`,
      'Last command done (1 command done):',
      `   pick ${short(single, 'feature~1')} # f1`,
      'Next command to do (1 remaining command):',
      `   pick ${short(single, 'feature')} # f2`,
      '  (use "git rebase --edit-todo" to view and edit)'
    ])
  })
})

describe('refusals', () => {
  /** A merge of feat into main that stopped on a conflict in a.txt. */
  const merging = () => exec(ok(createState(), 'git init', 'echo a > a.txt', 'git add .', 'git commit -m one',
    'git switch -c feat', 'echo f > a.txt', 'git commit -am featc', 'git switch main', 'echo m > a.txt', 'git commit -am mc'), 'git merge feat').state

  it('lists what is wrong when a rebase is refused: unstaged and staged changes together say "additionally"', () => {
    const both = ok(base(), 'git branch other', 'echo u >> a.txt', 'git add a.txt', 'echo v >> a.txt')
    const result = exec(both, 'git rebase other')
    expect(result.last.exitCode).toBe(1)
    expect(result.text).toBe([
      'error: cannot rebase: You have unstaged changes.',
      'error: additionally, your index contains uncommitted changes.',
      'error: Please commit or stash them.'
    ].join('\n'))
    expect(exec(ok(base(), 'git branch other', 'echo v >> a.txt'), 'git rebase other').text).toBe('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.')
    expect(exec(ok(base(), 'git branch other', 'echo v >> a.txt', 'git add a.txt'), 'git rebase other').text).toBe('error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.')
  })

  it('treats a conflicted merge as dirty for a rebase, and says "Merging" for another merge', () => {
    const state = merging()
    const rebase = exec(state, 'git rebase main')
    expect(rebase.last.exitCode).toBe(1)
    expect(rebase.text).toBe([
      'a.txt: needs merge',
      'error: cannot rebase: You have unstaged changes.',
      'error: additionally, your index contains uncommitted changes.',
      'error: Please commit or stash them.'
    ].join('\n'))
    const again = exec(state, 'git merge feat')
    expect(again.last.exitCode).toBe(128)
    expect(again.text).toBe([
      'error: Merging is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add/rm <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.'
    ].join('\n'))
  })

  it('names the unmerged paths first when a commit is refused, and says "Cherry-picking" or "Reverting" for the others', () => {
    const state = merging()
    expect(exec(state, 'git commit -m x').text.split('\n')[0]).toBe('U\ta.txt')
    expect(exec(state, 'git cherry-pick feat').text.split('\n')[0]).toBe('error: Cherry-picking is not possible because you have unmerged files.')
    expect(exec(state, 'git revert HEAD').text.split('\n')[0]).toBe('error: Reverting is not possible because you have unmerged files.')
  })

  it('pushes nowhere without a remote, and explains remote groups too', () => {
    const result = exec(base(), 'git push')
    expect(result.last.exitCode).toBe(128)
    expect(result.text).toBe([
      'fatal: No configured push destination.',
      'Either specify the URL from the command-line or configure a remote repository using',
      '',
      '    git remote add <name> <url>',
      '',
      'and then push using the remote name',
      '',
      '    git push <name>',
      '',
      'To push to multiple remotes at once, configure a remote group using',
      '',
      '    git config remotes.<groupname> "<remote1> <remote2>"',
      '',
      'and then push using the group name',
      '',
      '    git push <groupname>',
      ''
    ].join('\n'))
  })

  it('adds git\'s "Disable this message" line to the hints that have one', () => {
    const state = ok(base(), 'git branch wip', 'git switch wip', 'echo w > w.txt', 'git add .', 'git commit -m wip', 'git switch main')
    expect(exec(state, 'git branch -d wip').text.split('\n').at(-1)).toBe('hint: Disable this message with "git config set advice.forceDeleteBranch false"')
    expect(exec(state, 'git add').text.split('\n').at(-1)).toBe('hint: Disable this message with "git config set advice.addEmptyPathspec false"')
  })
})
