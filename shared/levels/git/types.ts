// The git environment's level types: a level runs on a GitState, the history records terminal lines, a solution step is
// a line or an editor save (docs/features/levels.md). Registers git in the core's `Environments`.
import type { GitState, OutputLine } from '../../git'
import type { ActResult } from '../engine'
import type { Level, PracticeTask, Scenario, Session } from '../types'

/** One counted line that reached git or the shell (trainer commands are not recorded), or an editor save (`edit <path>`). */
export interface CommandRecord {
  line: string
  exitCode: number
}

/**
 * One step of a solution: a terminal line, or `{ save }`, saving the file git waits for in the editor (the todo list or
 * the commit message of `git rebase -i`) with this text; it counts like a command (docs/features/levels.md).
 */
export type SolutionStep = string | { save: string }

/** A step typed in the terminal (not an editor save). */
export const isTerminalStep = (step: SolutionStep): step is string => typeof step === 'string'

declare module '../types' {
  interface Environments {
    git: { state: GitState, record: CommandRecord, step: SolutionStep }
  }
}

export type GitLevel = Level<'git'>
export type GitScenario = Scenario<'git'>
export type GitPracticeTask = PracticeTask<'git'>
export type GitSession = Session<'git'>

/** A level of the git track (the play page picks the git workbench for it). */
export const isGitLevel = (level: Pick<Level, 'track'>): level is GitLevel => level.track === 'git'

/** Terminal output plus markers the UI interprets: clear the screen, open the editor panel. */
export type TerminalLine
  = | OutputLine
    | { kind: 'clear' }
    | { kind: 'edit', path: string }

export type SubmitResult = ActResult<GitState, CommandRecord, TerminalLine[]>
