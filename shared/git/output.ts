import type { CommandResult, GitState, OutputKind, OutputLine, OutputTone, RefSpan } from './types'

/** A piece of an output line: plain text, or a ref name the UI may colour. */
export type Part = string | { ref: string }

export const ref = (name: string): Part => ({ ref: name })

export function line(kind: OutputKind, ...parts: Part[]): OutputLine {
  let text = ''
  const refs: RefSpan[] = []
  for (const part of parts) {
    if (typeof part === 'string') {
      text += part
    } else {
      refs.push({ start: text.length, end: text.length + part.ref.length, ref: part.ref })
      text += part.ref
    }
  }
  return refs.length ? { kind, text, refs } : { kind, text }
}

export const out = (...parts: Part[]) => line('out', ...parts)
export const err = (...parts: Part[]) => line('err', ...parts)
export const hint = (...parts: Part[]) => line('hint', ...parts)

export const toned = (output: OutputLine, tone: OutputTone): OutputLine => ({ ...output, tone })

/** Turns multi-line text into output lines of one kind. */
export const lines = (kind: OutputKind, text: string): OutputLine[] => text.split('\n').map(part => line(kind, part))

export const done = (state: GitState, output: OutputLine[] = []): CommandResult => ({ state, output, exitCode: 0 })

/** A failed command: the state stays as it was. */
export const fail = (state: GitState, output: OutputLine[], exitCode = 1): CommandResult => ({ state, output, exitCode })

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
