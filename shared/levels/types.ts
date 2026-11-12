// Level and session types for the scenario engine (docs/features/levels.md). Plain, JSON-serialisable data.
import type { GitState, OutputLine } from '../git'

/**
 * One step of a solution: a terminal line, or `{ save }`, saving the file git waits for in the editor (the todo list or
 * the commit message of `git rebase -i`) with this text; it counts like a command (docs/features/levels.md).
 */
export type SolutionStep = string | { save: string }

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
  /** Fires right after a counted command once this check passes on the new state, e.g. "your branch is on origin". */
    | { when: (state: GitState) => boolean }

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

/** How hard an entry is: 1 easy, 2 medium, 3 hard (shown as filled dots). */
export type Difficulty = 1 | 2 | 3

/** What every entry of a track has, scenario or practice task. */
interface LevelBase {
  /** '<track>-<nn>-<slug>' for scenarios, '<track>-practice-<slug>' for practice tasks; never changes (it is the URL). */
  id: string
  track: TrackId
  title: string
  difficulty: Difficulty
  /** Estimated time in minutes (a practice task: about 0.5). */
  minutes: number
  setup: () => GitState
  goals: Goal[]
  teammates?: TeammateEvent[]
  /** Steps that solve the level (command lines, editor saves); the tests replay them. */
  solution: SolutionStep[]
}

/** A scenario: a short story, goals, three hints, a debrief. Numbered chapter.position (1.2). */
export interface Scenario extends LevelBase {
  kind: 'scenario'
  /** The situation in second person, one to three short paragraphs. */
  story: string
  /** Nudge, concept, exact commands. */
  hints: [string, string, string]
  debrief: Debrief
}

/**
 * A practice task: one short task of one to three commands for the scenario it belongs to, ~30 s. No number: it sits
 * right after its scenario in the chapter (on the track page: a side branch forking off the scenario's dot).
 */
export interface PracticeTask extends LevelBase {
  kind: 'practice'
  /** Id of the scenario it trains; the chapter lists it right after that scenario (defineTrack checks). */
  practises: string
  /** The task in one or two short sentences. */
  task: string
  /** One hint. */
  hints: [string]
  /** One line, shown once it is solved: why it works. */
  why: string
}

/** One entry of a track: a scenario or a practice task. */
export type Level = Scenario | PracticeTask

/** The text that introduces an entry (Continue card, previews): a scenario's story, a practice task's task. */
export const levelIntro = (level: Level): string => level.kind === 'scenario' ? level.story : level.task

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
