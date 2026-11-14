// The review environment on the shared level core (ADR 0008, docs/features/levels.md "The review environment"): adding,
// editing and deleting a comment and sending a review are the counted actions. A sent review keeps its comments and
// what it found (checks.ts); the goals read only that, and its new false alarms (comments that touch no planted issue,
// each counted once per attempt) go into the session's `falseAlarms`, the measure of the best run after hints.
// Pure and immutable, like the core; never throws on what a player sends (a comment that can't sit there is refused).
import { act, startSession } from '../engine'
import { checkReview } from './checks'
import { canonicalPlace, diffOf, placeFor } from './diff'
import type { FileDiff } from './diff'
import { CATEGORIES, VERDICTS } from './types'
import type { Category, CommentDraft, Refusal, ReviewActResult, ReviewLevel, ReviewOutput, ReviewSession, ReviewStep, Verdict } from './types'

/** The longest comment text (the form stops there too). */
export const MAX_COMMENT_TEXT = 500
/** The longest review summary; a longer one is cut. */
export const MAX_SUMMARY = 500

/** The level's diff, worked out once per pull request. */
export const reviewDiff = (level: ReviewLevel): FileDiff[] => diffOf(level.pr)

const refuse = (session: ReviewSession, refused: Refusal): ReviewActResult =>
  ({ session, output: { refused, result: null, comment: null }, notices: [], solvedNow: false })

const DONE: ReviewOutput = { refused: null, result: null, comment: null }

const isCategory = (value: unknown): value is Category => typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
/** A comment's text as kept: trimmed; null when it is too long. */
const textOf = (text: unknown): string | null => typeof text === 'string' && text.trim().length <= MAX_COMMENT_TEXT ? text.trim() : null

/** A fresh review: no comments, nothing sent. */
export const startReview = (level: ReviewLevel): ReviewSession => startSession(level)

/**
 * Adds a comment on one stretch of rows of the diff (counted), kept with every line its rows have; one that can't sit
 * there (lines not in the diff, two stretches, too long) is refused.
 */
export function addComment(session: ReviewSession, level: ReviewLevel, draft: CommentDraft): ReviewActResult {
  const text = textOf(draft.text)
  const place = canonicalPlace(reviewDiff(level), { path: draft.path, head: draft.head, base: draft.base })
  if (text === null || !isCategory(draft.category) || !place) return refuse(session, 'invalid')
  const id = session.state.nextId
  return act(session, level, {
    commands: ['comment'],
    execute: state => ({
      state: { ...state, comments: [...state.comments, { id, ...place, category: draft.category, text }], nextId: id + 1 },
      record: { kind: 'comment', id },
      output: { ...DONE, comment: id }
    })
  })
}

/** Changes a comment's category and text (its lines stay, as on GitHub); counted. */
export function editComment(session: ReviewSession, level: ReviewLevel, id: number, change: { category: Category, text: string }): ReviewActResult {
  if (!session.state.comments.some(each => each.id === id)) return refuse(session, 'unknown')
  const text = textOf(change.text)
  if (text === null || !isCategory(change.category)) return refuse(session, 'invalid')
  return act(session, level, {
    commands: ['edit'],
    execute: state => ({
      state: { ...state, comments: state.comments.map(each => each.id === id ? { ...each, category: change.category, text } : each) },
      record: { kind: 'edit', id },
      output: DONE
    })
  })
}

/** Deletes a comment (counted); its id is never given out again. */
export function deleteComment(session: ReviewSession, level: ReviewLevel, id: number): ReviewActResult {
  if (!session.state.comments.some(each => each.id === id)) return refuse(session, 'unknown')
  return act(session, level, {
    commands: ['delete'],
    execute: state => ({ state: { ...state, comments: state.comments.filter(each => each.id !== id) }, record: { kind: 'delete', id }, output: DONE })
  })
}

/**
 * Sends the review with a verdict and a summary (counted): what its comments found decides the goals, and its false
 * alarms that were not counted before go into the session's count. A verdict task refuses a review without a reason.
 * You can send again as often as you like; the comments stay.
 */
export function submitReview(session: ReviewSession, level: ReviewLevel, verdict: Verdict, summary: string): ReviewActResult {
  if (!(VERDICTS as readonly string[]).includes(verdict)) return refuse(session, 'invalid')
  const kept = typeof summary === 'string' ? summary.trim().slice(0, MAX_SUMMARY) : ''
  if (level.reason && !kept) return refuse(session, 'reason')
  const comments = session.state.comments.map(each => ({ ...each }))
  const result = checkReview(level, comments, verdict)
  const alarms = result.feedback.filter(each => each.falseAlarm && !session.state.alarmed.includes(each.id)).map(each => each.id)
  return act(session, level, {
    commands: ['submit'],
    falseAlarms: alarms.length,
    execute: state => ({
      state: { ...state, sent: { verdict, summary: kept, comments, result }, alarmed: [...state.alarmed, ...alarms], reviews: state.reviews + 1 },
      record: { kind: 'submit', verdict },
      output: { ...DONE, result }
    })
  })
}

/** Plays one solution step. A comment whose lines are not one stretch of the diff is a broken level: it throws. */
export function playReviewStep(session: ReviewSession, level: ReviewLevel, step: ReviewStep): ReviewActResult {
  if ('submit' in step) return submitReview(session, level, step.submit, step.summary ?? '')
  const place = placeFor(reviewDiff(level), { path: step.comment, lines: step.lines, removed: step.removed })
  if (!place) throw new Error(`${level.id}: no comment can sit on ${step.comment} ${JSON.stringify({ lines: step.lines, removed: step.removed })}`)
  return addComment(session, level, { ...place, category: step.category, text: step.text })
}

/** Replays the level's solution from a fresh session (the tests prove with it that every level is solvable). */
export function playReviewSolution(level: ReviewLevel): ReviewActResult[] {
  const results: ReviewActResult[] = []
  let session = startReview(level)
  for (const step of level.solution) {
    const result = playReviewStep(session, level, step)
    results.push(result)
    session = result.session
  }
  return results
}
