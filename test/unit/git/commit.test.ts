import { describe, expect, it } from 'vitest'
import { createState, run } from '../../../shared/git'
import { exec, ok, textOf } from './helpers'

const initialised = () => ok(createState(), 'git init')

describe('git init', () => {
  it('refuses git commands outside a repository', () => {
    const result = run(createState(), 'git status')
    expect(textOf(result)).toBe('fatal: not a git repository (or any of the parent directories): .git')
    expect(result.exitCode).toBe(128)
  })

  it('creates an empty repository on main and keeps existing files', () => {
    const before = ok(createState(), 'echo hi > README.md')
    const { state, text } = exec(before, 'git init')
    expect(text).toBe('Initialized empty Git repository in /home/you/project/.git/')
    expect(state.repo?.head).toEqual({ type: 'branch', name: 'main' })
    expect(state.workdir['README.md']).toBe('hi\n')
    expect(exec(state, 'git init').text).toBe('Reinitialized existing Git repository in /home/you/project/.git/')
  })
})

describe('git add', () => {
  it('stages single paths, directories and everything with .', () => {
    const state = ok(initialised(), 'echo a > a.txt', 'echo b > src/b.ts', 'echo c > src/c.ts')
    expect(Object.keys(ok(state, 'git add a.txt').repo!.index)).toEqual(['a.txt'])
    expect(Object.keys(ok(state, 'git add src').repo!.index).sort()).toEqual(['src/b.ts', 'src/c.ts'])
    expect(Object.keys(ok(state, 'git add .').repo!.index).sort()).toEqual(['a.txt', 'src/b.ts', 'src/c.ts'])
  })

  it('stages deletions', () => {
    const state = ok(initialised(), 'echo a > a.txt', 'git add .', 'git commit -m "Add a"', 'rm a.txt', 'git add a.txt')
    expect(state.repo!.index).toEqual({})
  })

  it('reports unknown paths and an empty pathspec', () => {
    const missing = exec(initialised(), 'git add nope.txt')
    expect(missing.text).toBe('fatal: pathspec \'nope.txt\' did not match any files')
    expect(missing.last.exitCode).toBe(128)
    expect(exec(initialised(), 'git add').text).toBe('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?')
  })
})

describe('git commit', () => {
  it('creates the root commit with git\'s summary', () => {
    const { state, text } = exec(initialised(), 'echo hi > README.md', 'git add README.md', 'git commit -m "Initial commit"')
    const id = state.repo!.branches.main!
    expect(text).toBe(`[main (root-commit) ${id.slice(0, 7)}] Initial commit\n 1 file changed, 1 insertion(+)\n create mode 100644 README.md`)
    expect(state.repo!.commits[id]).toMatchObject({ parents: [], message: 'Initial commit', tree: { 'README.md': 'hi\n' } })
  })

  it('summarises insertions and deletions of later commits', () => {
    const state = ok(initialised(), 'echo a > a.txt', 'echo b > b.txt', 'git add .', 'git commit -m one')
    const { text } = exec(state, 'echo A > a.txt', 'echo c >> a.txt', 'rm b.txt', 'git add .', 'git commit -m two')
    expect(text).toMatch(/^\[main [0-9a-f]{7}\] two\n 2 files changed, 2 insertions\(\+\), 2 deletions\(-\)\n delete mode 100644 b\.txt$/)
  })

  it('refuses to commit with nothing staged (edge case)', () => {
    const clean = ok(initialised(), 'echo a > a.txt', 'git add .', 'git commit -m one')
    const nothing = exec(clean, 'git commit -m again')
    expect(nothing.text).toBe('On branch main\nnothing to commit, working tree clean')
    expect(nothing.last.exitCode).toBe(1)
    expect(nothing.state).toBe(clean)

    const unstaged = exec(clean, 'echo b >> a.txt', 'git commit -m again')
    expect(unstaged.text).toContain('Changes not staged for commit:')
    expect(unstaged.text).toContain('no changes added to commit (use "git add" and/or "git commit -a")')
    expect(unstaged.last.exitCode).toBe(1)
  })

  it('commits tracked changes with -a and -am', () => {
    const state = ok(initialised(), 'echo a > a.txt', 'git add .', 'git commit -m one', 'echo b >> a.txt', 'git commit -am two')
    const head = state.repo!.commits[state.repo!.branches.main!]!
    expect(head.message).toBe('two')
    expect(head.tree['a.txt']).toBe('a\nb\n')
  })

  it('asks for -m because the trainer has no editor', () => {
    const state = ok(initialised(), 'echo a > a.txt', 'git add .')
    expect(exec(state, 'git commit').text).toContain('git commit -m "message"')
    expect(exec(state, 'git commit -m ""').text).toBe('Aborting commit due to empty commit message.')
  })

  it('amends the last commit and changes its id (edge case)', () => {
    const state = ok(initialised(), 'echo a > a.txt', 'git add .', 'git commit -m "Add a"')
    const before = state.repo!.branches.main!

    const reworded = ok(state, 'git commit --amend -m "Add file a"')
    const after = reworded.repo!.branches.main!
    expect(after).not.toBe(before)
    expect(reworded.repo!.commits[after]).toMatchObject({ parents: [], message: 'Add file a' })

    const extended = ok(reworded, 'echo b > b.txt', 'git add b.txt', 'git commit --amend --no-edit')
    const amended = extended.repo!.commits[extended.repo!.branches.main!]!
    expect(amended.message).toBe('Add file a')
    expect(Object.keys(amended.tree).sort()).toEqual(['a.txt', 'b.txt'])

    expect(exec(initialised(), 'git commit --amend -m x').text).toBe('fatal: You have nothing to amend.')
  })

  it('gives every commit a deterministic id', () => {
    const lines = ['echo a > a.txt', 'git add .', 'git commit -m one']
    expect(ok(initialised(), ...lines).repo!.branches.main).toBe(ok(initialised(), ...lines).repo!.branches.main)
  })
})

describe('git status', () => {
  it('describes an empty repository', () => {
    expect(exec(initialised(), 'git status').text).toBe([
      'On branch main',
      '',
      'No commits yet',
      '',
      'nothing to commit (create/copy files and use "git add" to track)'
    ].join('\n'))
  })

  it('lists staged, unstaged and untracked files with git\'s wording', () => {
    const base = ok(initialised(), 'echo a > a.txt', 'echo b > b.txt', 'echo c > c.txt', 'git add .', 'git commit -m one')
    const { text, last } = exec(base,
      'echo A >> a.txt', 'git add a.txt',
      'echo new > n.txt', 'git add n.txt',
      'echo B >> b.txt', 'rm c.txt',
      'echo u > untracked.txt', 'echo x > docs/x.md',
      'git status'
    )
    expect(text).toBe([
      'On branch main',
      'Changes to be committed:',
      '  (use "git restore --staged <file>..." to unstage)',
      '\tmodified:   a.txt',
      '\tnew file:   n.txt',
      '',
      'Changes not staged for commit:',
      '  (use "git add/rm <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
      '\tmodified:   b.txt',
      '\tdeleted:    c.txt',
      '',
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      '\tdocs/',
      '\tuntracked.txt'
    ].join('\n'))
    expect(last.output.find(line => line.text.includes('a.txt'))?.tone).toBe('added')
    expect(last.output.find(line => line.text.includes('b.txt'))?.tone).toBe('removed')
    expect(last.output[0]!.refs).toEqual([{ start: 10, end: 14, ref: 'main' }])
  })

  it('reports a clean tree and only untracked files', () => {
    const base = ok(initialised(), 'echo a > a.txt', 'git add .', 'git commit -m one')
    expect(exec(base, 'git status').text).toBe('On branch main\nnothing to commit, working tree clean')
    expect(exec(base, 'touch x', 'git status').text).toContain('nothing added to commit but untracked files present (use "git add" to track)')
  })

  it('uses the short hint for unstaging before the first commit', () => {
    const text = exec(initialised(), 'echo a > a.txt', 'git add .', 'git status').text
    expect(text).toBe([
      'On branch main',
      '',
      'No commits yet',
      '',
      'Changes to be committed:',
      '  (use "git rm --cached <file>..." to unstage)',
      '\tnew file:   a.txt'
    ].join('\n'))
  })
})
