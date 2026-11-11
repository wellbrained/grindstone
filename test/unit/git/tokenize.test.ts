import { describe, expect, it } from 'vitest'
import { tokenize } from '../../../shared/git/tokenize'

const words = (line: string) => {
  const result = tokenize(line)
  if (!result.ok) throw new Error(result.error)
  return result.tokens.map(token => token.type === 'word' ? token.value : `<${token.value}>`)
}

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(words('  git   status ')).toEqual(['git', 'status'])
  })

  it('keeps double and single quoted strings together', () => {
    expect(words('git commit -m "Add login form"')).toEqual(['git', 'commit', '-m', 'Add login form'])
    expect(words('echo \'a "b" c\'')).toEqual(['echo', 'a "b" c'])
  })

  it('joins quoted parts that touch a word', () => {
    expect(words('git commit -m"fix it"')).toEqual(['git', 'commit', '-mfix it'])
  })

  it('handles escapes in double quotes and outside quotes', () => {
    expect(words('echo "say \\"hi\\"" a\\ b')).toEqual(['echo', 'say "hi"', 'a b'])
  })

  it('keeps an empty quoted string as a word', () => {
    expect(words('git commit -m ""')).toEqual(['git', 'commit', '-m', ''])
  })

  it('recognises redirection and chaining operators', () => {
    expect(words('echo hi > a.txt')).toEqual(['echo', 'hi', '<>>', 'a.txt'])
    expect(words('echo hi>>a.txt')).toEqual(['echo', 'hi', '<>>>', 'a.txt'])
    expect(words('git add . && git commit -m x; ls | wc')).toEqual(['git', 'add', '.', '<&&>', 'git', 'commit', '-m', 'x', '<;>', 'ls', '<|>', 'wc'])
  })

  it('treats quoted operators as plain words', () => {
    expect(words('echo ">" \'&&\'')).toEqual(['echo', '>', '&&'])
  })

  it('reports an unterminated quote', () => {
    expect(tokenize('git commit -m "oops')).toEqual({ ok: false, error: 'unexpected end of input: missing closing "' })
  })
})
