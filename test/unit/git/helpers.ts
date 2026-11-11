import { run } from '../../../shared/git'
import type { CommandResult, GitState } from '../../../shared/git'

/** Freezes deeply so any mutation inside the model throws (ES modules run in strict mode). */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

export function textOf(result: CommandResult): string {
  return result.output.map(line => line.text).join('\n')
}

/** Runs command lines one after another on frozen states; returns the final state and every result. */
export function exec(state: GitState, ...lines: string[]) {
  let current = state
  const results: CommandResult[] = []
  for (const line of lines) {
    const result = run(deepFreeze(current), line)
    results.push(result)
    current = result.state
  }
  const last = results[results.length - 1]!
  return { state: current, results, last, text: textOf(last) }
}

/** Like exec, but fails the test as soon as a command exits non-zero. */
export function ok(state: GitState, ...lines: string[]): GitState {
  let current = state
  for (const line of lines) {
    const result = run(deepFreeze(current), line)
    if (result.exitCode !== 0) throw new Error(`"${line}" failed:\n${textOf(result)}`)
    current = result.state
  }
  return current
}
