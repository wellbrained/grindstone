import { describe, expect, it } from 'vitest'
import { createState } from '../../../shared/git'
import { exec, ok } from './helpers'

const short = (id: string | undefined) => id!.slice(0, 7)

describe('git log', () => {
  const history = () => ok(createState(), 'git init', 'echo a > a.txt', 'git add .', 'git commit -m one', 'echo b >> a.txt', 'git commit -am two')

  it('shows HEAD history with author and date', () => {
    const state = history()
    const repo = state.repo!
    const head = repo.branches.main!
    const first = repo.commits[head]!.parents[0]!
    expect(exec(state, 'git log').text).toBe([
      `commit ${head} (HEAD -> main)`,
      'Author: You <you@example.com>',
      'Date:   Mon Mar 2 09:02:00 2026 +0000',
      '',
      '    two',
      '',
      `commit ${first}`,
      'Author: You <you@example.com>',
      'Date:   Mon Mar 2 09:01:00 2026 +0000',
      '',
      '    one'
    ].join('\n'))
  })

  it('prints one line per commit with decorations and ref spans', () => {
    const state = ok(history(), 'git branch feature')
    const head = state.repo!.branches.main!
    const { text, last } = exec(state, 'git log --oneline')
    expect(text.split('\n')[0]).toBe(`${short(head)} (HEAD -> main, feature) two`)
    expect(last.output[0]!.refs!.map(span => span.ref)).toEqual(['HEAD', 'main', 'feature'])
    expect(text.split('\n')).toHaveLength(2)
  })

  it('limits output with -n and -<number>', () => {
    expect(exec(history(), 'git log --oneline -1').text.split('\n')).toHaveLength(1)
    expect(exec(history(), 'git log --oneline -n 1').text.split('\n')).toHaveLength(1)
  })

  it('shows other branches only with --all or when named', () => {
    const state = ok(history(), 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m feature', 'git switch main')
    expect(exec(state, 'git log --oneline').text).not.toContain('feature')
    expect(exec(state, 'git log --oneline --all').text).toContain('(feature) feature')
    expect(exec(state, 'git log --oneline feature').text.split('\n')).toHaveLength(3)
    expect(exec(state, 'git log --oneline main..feature').text.split('\n')).toHaveLength(1)
  })

  it('draws a basic ASCII graph for branches and merges', () => {
    const state = ok(history(),
      'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f1', 'echo g >> f.txt', 'git commit -am f2',
      'git switch main', 'echo m > m.txt', 'git add .', 'git commit -m m1'
    )
    expect(exec(state, 'git log --oneline --graph --all').text.replace(/[0-9a-f]{7} /g, '')).toBe([
      '* (HEAD -> main) m1',
      '| * (feature) f2',
      '| * f1',
      '|/',
      '* two',
      '* one'
    ].join('\n'))

    const merged = ok(state, 'git merge feature')
    expect(exec(merged, 'git log --oneline --graph').text.replace(/[0-9a-f]{7} /g, '')).toBe([
      '*   (HEAD -> main) Merge branch \'feature\'',
      '|\\',
      '| * (feature) f2',
      '| * f1',
      '* | m1',
      '|/',
      '* two',
      '* one'
    ].join('\n'))
  })

  it('reports a branch without commits', () => {
    expect(exec(ok(createState(), 'git init'), 'git log').text).toBe('fatal: your current branch \'main\' does not have any commits yet')
  })
})
