// The review environment's level types (ADR 0008, docs/features/levels.md "The review environment"): a level of the
// Working with AI track is a pull request by Sous, the shop's scripted coding assistant (its title, description and
// claims, the files before and after it). You review it like on GitHub: comments on a line or a range of the diff, each
// with a category, then Approve or Request changes. The level knows its planted issues; a sent review finds an issue
// when a comment touches its lines with a category that fits. No model is called: everything Sous says is written into
// the level. Registers the track `ai` in the core's `Environments`.
import type { ActResult } from '../engine'
import type { Level, PracticeTask, Scenario, Session } from '../types'
import type { BackendSpec } from '../debugging/types'

/**
 * What a comment says is wrong. `invented-api` (since 0.3.6, ADR 0008 "chapter 4"): it calls a function, option,
 * export or package that doesn't exist, or a deprecated one; a real API used the wrong way is a `bug`.
 */
export type Category = 'bug' | 'security' | 'missing-test' | 'false-claim' | 'invented-api' | 'scope' | 'unclear'

/** Every category, in the order the comment form lists them. */
export const CATEGORIES: readonly Category[] = ['bug', 'security', 'missing-test', 'false-claim', 'invented-api', 'scope', 'unclear']

/** Approve: nothing is wrong, merge it. Request changes: something must change first. */
export type Verdict = 'approve' | 'request-changes'

export const VERDICTS: readonly Verdict[] = ['approve', 'request-changes']

/** A file set, by path ('cart.js'). */
export type Files = Readonly<Record<string, string>>

/** Lines on one side of a diff, both ends included (1-based). */
export interface LineSpan {
  start: number
  end: number
}

/**
 * Where a comment sits: its file, and the lines its rows of the diff cover on each side. `head` are lines of the file
 * after the pull request (added and unchanged rows), `base` lines of the file before it (removed and unchanged rows);
 * a side the rows have none of is null. A comment's rows are one stretch of one hunk.
 */
export interface CommentPlace {
  path: string
  head: LineSpan | null
  base: LineSpan | null
}

/** One comment of your review. */
export interface ReviewComment extends CommentPlace {
  /** Unique within the attempt, never reused (a deleted comment's id stays gone). */
  id: number
  category: Category
  /** What you wrote (Grindstone never reads it: the category and the lines decide); may be empty. */
  text: string
}

/**
 * A place in the pull request a level points at: lines of the file after it (`lines`, both ends included), or lines
 * the pull request removed (`removed`, numbers in the file before it). At least one of the two.
 */
export interface Spot {
  path: string
  lines?: readonly [number, number]
  removed?: readonly [number, number]
}

/** A problem the level planted in the pull request. */
export interface PlantedIssue extends Spot {
  /** Unique within the level ('one-early'). */
  id: string
  /**
   * Other places a comment may sit to find it, where a reviewer would rightly point at it too (the line that adds a value
   * a `switch` elsewhere in the diff never handles; the claim of the description it breaks, `claimAt(pr, index)`, where
   * only `false-claim` fits).
   */
  also?: readonly Spot[]
  /** The categories a comment on it may have to find it ('bug', and 'false-claim' when the description promises the opposite). */
  categories: readonly Category[]
  /** Its name in a comment's feedback, one short line: 'the Add button turns off at 11, one early'. */
  title: string
  /** Why it is a problem, for the debrief (one or two sentences). */
  explanation: string
}

/**
 * A place that looks wrong and isn't (a tempting false alarm): a comment that touches it, and no planted issue, is told
 * why it is fine.
 */
export interface TemptingSpot extends Spot {
  why: string
}

/** The issue on the shop's tracker that a pull request says it fixes ("Fixes #142"), shown with it. */
export interface LinkedIssue {
  number: number
  title: string
  /** Who opened it (a teammate: 'Anna'). */
  author: string
  /** What it says, paragraph by paragraph (text only; `backticks` mark code). */
  body: readonly string[]
}

/** Sous's pull request, as the level writes it. */
export interface PullRequest {
  /** Its number on the shop's repository (#41). */
  number: number
  title: string
  /** The branch Sous pushed ('sous/limit-per-product'); it goes into main. */
  branch: string
  /** What Sous wrote, paragraph by paragraph (text only; `backticks` mark code). */
  description: readonly string[]
  /**
   * What Sous says the change does, as a list under the description (text only). The description is shown as numbered
   * lines, the paragraphs and then the claims (`descriptionFile`), so a comment can sit on a claim.
   */
  claims: readonly string[]
  /** The issue it says it fixes, shown with the pull request (not a place to comment: Sous did not write it). */
  fixes?: LinkedIssue
  /** The files before the pull request (main). */
  base: Files
  /** The files after it (the branch); the diff is computed from the two. */
  head: Files
}

/** How a pull request runs in the Debugging sandbox (Run the PR): its page and, when it makes requests, the fake backend. */
export interface RunSpec {
  /** Shown in the address bar after the shop's host, e.g. '/order'. */
  page: string
  /** The file whose trace links matter most (the run's own editor never shows; it names the file a Console link opens). */
  open: string
  backend?: BackendSpec
}

/** What a review level adds to the shared level fields. */
export interface ReviewFields {
  pr: PullRequest
  /** The problems in it; a level that should be approved has none. */
  issues: readonly PlantedIssue[]
  /** Places that look wrong and aren't, with why (feedback on a false alarm there; the debrief explains them). */
  tempting?: readonly TemptingSpot[]
  /** The right verdict: request changes when there is an issue, approve when there is none. */
  verdict: Verdict
  /** A verdict practice task: the review needs a one-line reason (its summary) before it can be sent. */
  reason?: true
  /** The pull request can run in the sandbox (the head files, or the base files to compare). */
  run?: RunSpec
  /** A scenario: what it teaches you to see, its tag on the track page ('off-by-one'). */
  teaches?: string
}

/** What a comment of a sent review found: the feedback shown under it. */
export interface CommentFeedback {
  /** The comment's id. */
  id: number
  /** Ids of the planted issues it found (it touches them with a category that fits). */
  found: string[]
  /** Ids of the planted issues it touches, focused, with a category that does not fit. */
  near: string[]
  /** Ids of the planted issues it touches but with too many lines of context around (more than FOCUS_SLACK): narrow it down. */
  wide: string[]
  /** It touches no planted issue, or it is broad: wider than FOCUS_SLACK and over changed rows with nothing wrong in them. */
  falseAlarm: boolean
  /** A false alarm because it is broad (it touches an issue, but mostly covers changes with nothing wrong in them). */
  broad: boolean
  /** A comment that touches no issue, on a tempting spot: why nothing is wrong there; null otherwise. */
  why: string | null
}

/** What a sent review found. */
export interface ReviewResult {
  verdict: Verdict
  /** Ids of the planted issues some comment found, in level order. */
  found: string[]
  /** Ids of the planted issues no comment found, in level order. */
  missed: string[]
  /** The verdict is the level's, and an approval has no comments that flag problems. */
  verdictRight: boolean
  /** Approved, but comments flag problems: an approval says nothing is wrong. */
  flaggedApproval: boolean
  /** Comments of this review that touch no planted issue. */
  falseAlarms: number
  /** Per comment, in the review's order. */
  feedback: CommentFeedback[]
  /** Every planted issue found, and the verdict right. */
  solved: boolean
}

/** A review you sent: its verdict and summary, its comments as they were, and what it found. */
export interface SentReview {
  verdict: Verdict
  summary: string
  comments: ReviewComment[]
  result: ReviewResult
}

export interface ReviewState {
  /** Your comments, in the order you added them (sent reviews keep them: you go on from there). */
  comments: ReviewComment[]
  /** The id the next comment gets. */
  nextId: number
  /** The last review you sent; null before the first. */
  sent: SentReview | null
  /** Ids of comments already counted as false alarms in this attempt (each counts once, however often it is sent). */
  alarmed: number[]
  /** How many reviews you sent in this attempt. */
  reviews: number
}

/** One counted action: a comment added, edited or deleted, a review sent. */
export type ReviewRecord
  = | { kind: 'comment', id: number }
    | { kind: 'edit', id: number }
    | { kind: 'delete', id: number }
    | { kind: 'submit', verdict: Verdict }

/** A comment as a solution writes it: its file (`comment`), its lines (head lines or removed lines), category and text. */
export interface CommentStep extends Omit<Spot, 'path'> {
  comment: string
  category: Category
  text: string
}

/** One step of a solution: a comment, or sending the review with a verdict (and a summary). */
export type ReviewStep
  = | CommentStep
    | { submit: Verdict, summary?: string }

/** A comment being added or edited: everything but its id. */
export type CommentDraft = Omit<ReviewComment, 'id'>

declare module '../types' {
  interface Environments {
    ai: { state: ReviewState, record: ReviewRecord, step: ReviewStep, fields: ReviewFields }
  }
}

export type ReviewLevel = Level<'ai'>
export type ReviewScenario = Scenario<'ai'>
export type ReviewPracticeTask = PracticeTask<'ai'>
export type ReviewSession = Session<'ai'>

/** A level of the Working with AI track (the play page picks ReviewPlay for it). */
export const isReviewLevel = (level: Pick<Level, 'track'>): level is ReviewLevel => level.track === 'ai'

/** Why an action did nothing. */
export type Refusal = 'invalid' | 'reason' | 'unknown'

/** What an action reports besides the new session. */
export interface ReviewOutput {
  /** Null when it happened; else why not (a comment that can't sit there, a verdict task's review without a reason). */
  refused: Refusal | null
  /** A sent review: what it found. */
  result: ReviewResult | null
  /** An added comment: its id. */
  comment: number | null
}

export type ReviewActResult = ActResult<ReviewState, ReviewRecord, ReviewOutput>
