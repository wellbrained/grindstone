export type Operator = '>' | '>>' | '&&' | ';' | '|'

export type Token
  = | { type: 'word', value: string }
    | { type: 'op', value: Operator }

export type TokenizeResult
  = | { ok: true, tokens: Token[] }
    | { ok: false, error: string }

/** Splits a command line like a small POSIX shell: quotes, backslash escapes, > >> && ; |. */
export function tokenize(line: string): TokenizeResult {
  const tokens: Token[] = []
  let word = ''
  let inWord = false
  let i = 0

  const flush = () => {
    if (inWord) tokens.push({ type: 'word', value: word })
    word = ''
    inWord = false
  }

  while (i < line.length) {
    const char = line[i]!

    if (char === ' ' || char === '\t') {
      flush()
      i++
    } else if (char === '\'') {
      const end = line.indexOf('\'', i + 1)
      if (end === -1) return { ok: false, error: 'unexpected end of input: missing closing \'' }
      word += line.slice(i + 1, end)
      inWord = true
      i = end + 1
    } else if (char === '"') {
      i++
      inWord = true
      let closed = false
      while (i < line.length) {
        const inner = line[i]!
        if (inner === '"') {
          closed = true
          i++
          break
        }
        if (inner === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1]!)) {
          word += line[i + 1]
          i += 2
        } else {
          word += inner
          i++
        }
      }
      if (!closed) return { ok: false, error: 'unexpected end of input: missing closing "' }
    } else if (char === '\\') {
      if (i + 1 < line.length) word += line[i + 1]
      inWord = true
      i += 2
    } else if (char === '>' || char === ';' || char === '|' || (char === '&' && line[i + 1] === '&')) {
      flush()
      const two = line.slice(i, i + 2)
      if (two === '>>' || two === '&&') {
        tokens.push({ type: 'op', value: two })
        i += 2
      } else {
        tokens.push({ type: 'op', value: char as Operator })
        i++
      }
    } else {
      word += char
      inWord = true
      i++
    }
  }
  flush()
  return { ok: true, tokens }
}
