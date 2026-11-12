// Level and session types for the scenario engine (docs/features/levels.md). Plain, JSON-serialisable data.
import type { GitState, OutputLine } from '../git'

/** Every track id, live and coming (shared/levels/tracks.ts). */
export type TrackId = 'git' | 'ai' | 'web' | 'debugging' | 'frameworks'

/** One submitted line that reached git or the shell (trainer commands are not recorded). */
export interface CommandRecord {
  line: string
  exitCode: number
}

export interface GoalContext {
  state: GitState
  /** Every counted line of the current timeline (undo rewinds it), oldest first. */
  history: CommandRecord[]
}

export interface Goal {
  id: string
  /** One line of the live checklist. */
  label: string
  check: (ctx: GoalContext) => boolean
}

export type TeammateTrigger
  /** Fires right after the Nth counted command of the current timeline. */
  = | { afterCommands: number }
  /** Fires right before a line that contains a command starting with this prefix (whole words), e.g. 'git push'. */
    | { beforeCommand: string }

export interface TeammateEvent {
  id: string
  author: string
  trigger: TeammateTrigger
  /** What the teammate does, usually `teammateCommit` on origin. */
  apply: (state: GitState) => GitState
  /** Shown to the player when the event fires, e.g. 'Anna pushed 2 commits to main.' */
  notice: string
}

export interface Debrief {
  title: string
  paragraphs: string[]
}

export interface Level {
  /** '<track>-<nn>-<slug>', e.g. 'git-01-first-commit'. */
  id: string
  track: TrackId
  title: string
  /** The situation in second person, one to three short paragraphs. */
  story: string
  setup: () => GitState
  goals: Goal[]
  teammates?: TeammateEvent[]
  /** Nudge, concept, exact commands. */
  hints: [string, string, string]
  debrief: Debrief
  /** Command lines that solve the level; the tests replay them. */
  solution: string[]
}

/** What `undo` restores. */
export interface SessionSnapshot {
  state: GitState
  history: CommandRecord[]
  firedEvents: string[]
}

export interface Session {
  levelId: string
  state: GitState
  history: CommandRecord[]
  /** Undo stack, newest last, bounded by MAX_SNAPSHOTS. */
  snapshots: SessionSnapshot[]
  /** Ids of teammate events that fired in the current timeline. */
  firedEvents: string[]
  hintsUsed: number
  goalsMet: Record<string, boolean>
  /** Sticky: true once every goal passed in this attempt (reset starts a new attempt). */
  solved: boolean
  /** Counted commands typed in this attempt, including undone ones. */
  commandCount: number
}

/** Terminal output plus markers the UI interprets: clear the screen, open the editor panel. */
export type TerminalLine
  = | OutputLine
    | { kind: 'clear' }
    | { kind: 'edit', path: string }

export interface Notice {
  eventId: string
  author: string
  text: string
}

export interface SubmitResult {
  session: Session
  output: TerminalLine[]
  notices: Notice[]
  /** True only for the command that first made every goal pass. */
  solvedNow: boolean
}
