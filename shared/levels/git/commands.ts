// Which git commands a level practises, derived from its solution so it never goes stale (cheat sheet, level rows).
import { isTerminalStep } from './types'
import type { GitLevel } from './types'

/** The git subcommands a command line runs, e.g. 'git add . && git commit -m "x"' gives ['add', 'commit']. */
export function gitSubcommands(line: string): string[] {
  return [...line.matchAll(/(?:^|&&|;)\s*git\s+([a-z-]+)/g)].map(match => match[1]!)
}

/** Every git subcommand of the level's solution, once each, in order of first use. */
export function levelCommands(level: Pick<GitLevel, 'solution'>): string[] {
  return [...new Set(level.solution.filter(isTerminalStep).flatMap(gitSubcommands))]
}
