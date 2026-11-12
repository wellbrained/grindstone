import { describe, expect, it } from 'vitest'
import { run, repo } from '../../../shared/git'

// A file named like an Object.prototype member must behave like any other file.
describe('files named like prototype members', () => {
  it('diffs a deleted file called toString in git\'s deleted form', () => {
    let state = repo().file('toString', 'hello\n').commit('Add toString').build()
    state = run(state, 'rm toString').state
    const result = run(state, 'git diff')
    const text = result.output.map(line => 'text' in line ? line.text : '').join('\n')
    expect(text).toContain('diff --git a/toString b/toString')
    expect(text).toContain('deleted file mode 100644')
    expect(text).toContain('--- a/toString')
    expect(text).toContain('+++ /dev/null')
  })
})
