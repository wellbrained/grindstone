// Level and session types of the shared level core (docs/features/levels.md). Plain, JSON-serialisable data.
// Track-agnostic: every type is generic over the environment a level runs in (its state `S`, what the history records per
// counted action `R`, one solution step `Step`). This file never imports an environment; each one registers its types in
// `Environments` from its own folder (git: shared/levels/git/types.ts).

/** Every track id, live and coming (shared/levels/tracks.ts). */
export type TrackId = 'git' | 'ai' | 'web' | 'debugging' | 'frameworks'

export interface GoalContext<S, R> {
  state: S
  /** Every counted action of the current timeline (undo rewinds it), oldest first. */
  history: R[]
}

export interface Goal<S, R> {
  id: string
  /** One line of the live checklist. */
  label: string
  check: (ctx: GoalContext<S, R>) => boolean
}

export type TeammateTrigger<S>
  /** Fires right after the Nth counted action of the current timeline. */
  = | { afterCommands: number }
  /** Fires right before an action that runs a command starting with this prefix (whole words), e.g. 'git push'. */
    | { beforeCommand: string }
  /** Fires right after a counted action once this check passes on the new state, e.g. "your branch is on origin". */
    | { when: (state: S) => boolean }

/** Something a colleague does during play (git: a teammate pushes to origin), fired by its trigger. */
export interface TeammateEvent<S> {
  id: string
  author: string
  trigger: TeammateTrigger<S>
  /** What the colleague does, e.g. `teammateCommit` on origin. */
  apply: (state: S) => S
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
interface LevelBase<S, R, Step, T extends TrackId> {
  /** '<track>-<nn>-<slug>' for scenarios, '<track>-practice-<slug>' for practice tasks; never changes (it is the URL). */
  id: string
  track: T
  title: string
  difficulty: Difficulty
  /** Estimated time in minutes (a practice task: about 0.5). */
  minutes: number
  setup: () => S
  goals: Goal<S, R>[]
  teammates?: TeammateEvent<S>[]
  /** Steps that solve the level; the tests replay them. */
  solution: Step[]
}

/** A scenario: a short story, goals, three hints, a debrief. Numbered chapter.position (1.2). */
export interface ScenarioOf<S, R, Step, T extends TrackId = TrackId> extends LevelBase<S, R, Step, T> {
  kind: 'scenario'
  /** The situation in second person, one to three short paragraphs. */
  story: string
  /** Nudge, concept, the exact answer. */
  hints: [string, string, string]
  debrief: Debrief
}

/**
 * A practice task: one short task for the scenario it belongs to, ~30 s. No number: it sits right after its scenario in
 * the chapter (on the track page: a side branch forking off the scenario's dot).
 */
export interface PracticeTaskOf<S, R, Step, T extends TrackId = TrackId> extends LevelBase<S, R, Step, T> {
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

/** One entry of a track in an environment: a scenario or a practice task. */
export type LevelOf<S, R, Step, T extends TrackId = TrackId> = ScenarioOf<S, R, Step, T> | PracticeTaskOf<S, R, Step, T>

/** What `undo` restores. */
export interface SessionSnapshot<S, R> {
  state: S
  history: R[]
  firedEvents: string[]
}

/** One attempt at a level. */
export interface SessionOf<S, R> {
  levelId: string
  state: S
  history: R[]
  /** Undo stack, newest last, bounded by MAX_SNAPSHOTS. */
  snapshots: SessionSnapshot<S, R>[]
  /** Ids of teammate events that fired in the current timeline. */
  firedEvents: string[]
  hintsUsed: number
  goalsMet: Record<string, boolean>
  /** Sticky: true once every goal passed in this attempt (reset starts a new attempt). */
  solved: boolean
  /** Counted actions (git: commands) of this attempt, including undone ones. */
  commandCount: number
  /** Reloads of this attempt (Debugging), including undone ones; absent until the first. */
  reloads?: number
}

export interface Notice {
  eventId: string
  author: string
  text: string
}

/** What one environment brings: its state, what the history records per counted action, one solution step. */
export interface Environment {
  state: unknown
  record: unknown
  step: unknown
}

/**
 * The environments that have levels, by track id. Each registers itself from its own folder by declaration merging
 * (`declare module '../types'`, git: shared/levels/git/types.ts), so the core never imports one. `Level`, `Scenario`,
 * `PracticeTask` and `Session` below are the union over them; with a track id (`Level<'git'>`) one environment's.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by the environments (declaration merging)
export interface Environments {}

/** A track that has an environment (and so levels). */
export type EnvironmentId = Extract<keyof Environments, TrackId>

type Env<K extends EnvironmentId> = Environments[K] extends Environment ? Environments[K] : never

/** An entry of any track with an environment, or of one (`Level<'git'>`). */
export type Level<K extends EnvironmentId = EnvironmentId> = K extends EnvironmentId ? LevelOf<Env<K>['state'], Env<K>['record'], Env<K>['step'], K> : never
export type Scenario<K extends EnvironmentId = EnvironmentId> = K extends EnvironmentId ? ScenarioOf<Env<K>['state'], Env<K>['record'], Env<K>['step'], K> : never
export type PracticeTask<K extends EnvironmentId = EnvironmentId> = K extends EnvironmentId ? PracticeTaskOf<Env<K>['state'], Env<K>['record'], Env<K>['step'], K> : never
export type Session<K extends EnvironmentId = EnvironmentId> = K extends EnvironmentId ? SessionOf<Env<K>['state'], Env<K>['record']> : never

/** The text that introduces an entry (Continue card, previews): a scenario's story, a practice task's task. */
export const levelIntro = (level: { kind: 'scenario', story: string } | { kind: 'practice', task: string }): string =>
  level.kind === 'scenario' ? level.story : level.task
