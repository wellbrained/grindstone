import { describe, expect, it } from 'vitest'
import { blobId, repo } from '../../../shared/git'
import { exec, ok } from './helpers'

const short = (content: string) => blobId(content).slice(0, 7)

describe('git diff', () => {
  const committed = () => repo().file('app.txt', 'one\ntwo\nthree\n').commit('Initial commit').build()

  it('shows unstaged changes against the index', () => {
    const state = ok(committed(), 'echo one > app.txt', 'echo 2 >> app.txt', 'echo three >> app.txt')
    const { text, last } = exec(state, 'git diff')
    expect(text).toBe([
      'diff --git a/app.txt b/app.txt',
      `index ${short('one\ntwo\nthree\n')}..${short('one\n2\nthree\n')} 100644`,
      '--- a/app.txt',
      '+++ b/app.txt',
      '@@ -1,3 +1,3 @@',
      ' one',
      '-two',
      '+2',
      ' three'
    ].join('\n'))
    expect(last.output.map(line => line.tone)).toEqual(['meta', 'meta', 'meta', 'meta', 'meta', undefined, 'removed', 'added', undefined])
  })

  it('is empty once changes are staged, and shows them with --staged', () => {
    const state = ok(committed(), 'echo four >> app.txt', 'git add app.txt')
    expect(exec(state, 'git diff').text).toBe('')
    expect(exec(state, 'git diff --staged').text).toContain('+four')
    expect(exec(state, 'git diff --cached app.txt').text).toContain('+four')
  })

  it('shows new and deleted files', () => {
    const state = ok(committed(), 'echo n > new.txt', 'git add new.txt', 'rm app.txt')
    expect(exec(state, 'git diff').text).toContain('deleted file mode 100644\n')
    expect(exec(state, 'git diff --staged').text).toContain('new file mode 100644\n')
    expect(exec(state, 'git diff --staged').text).toContain('--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+n')
  })

  it('filters by path', () => {
    const state = ok(committed(), 'echo x > other.txt', 'git add .', 'git commit -m other', 'echo y >> other.txt', 'echo z >> app.txt')
    expect(exec(state, 'git diff other.txt').text).not.toContain('app.txt')
  })
})
