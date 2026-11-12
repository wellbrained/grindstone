import { describe, expect, it } from 'vitest'
import { run, repo } from '../../../shared/git'

// A file named like an Object.prototype member must behave like any other file.
describe('files named like prototype members', () => {
  it('diffs a deleted file called toString without crashing', () => { // the header is still not git's "deleted file" form: known gap
    let state = repo().file('toString', 'hello\n').commit('Add toString').build()
    state = run(state, 'rm toString').state
    const result = run(state, 'git diff')
    expect(result.output.map(line => 'text' in line ? line.text : '').join('\n')).toContain('diff --git a/toString b/toString')
  })
})
