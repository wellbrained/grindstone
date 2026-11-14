// What a sent review found, and the goals that read it (ADR 0008, docs/features/levels.md "The review environment").
// A planted issue is found when a comment touches its lines (on the side it is on, or one of its `also` places) with a
// category the issue accepts, and the comment is **focused**: at most FOCUS_SLACK of its rows belong to no planted issue,
// and at most FOCUS_SLACK to issues its category doesn't fit (since chapter 6: a bug comment over a reformat isn't
// focused on the one lost line in it). One comment can find several issues it covers. A wider comment over an issue and lines of context finds nothing
// ("narrow it down"); a wider one that also covers changed (+/-) rows with nothing wrong in them is a false alarm, like a
// comment that touches no issue at all: it costs the best run, it never fails the level, and on a tempting spot it is
// told why nothing is wrong there. A comment can sit on Sous's description too (its numbered lines): there only
// `false-claim` fits, and the comment must be on the false lines alone (no slack: a line of the description is a whole
// statement, there is no context around a claim; a line that holds counts like a fine change, so a comment over a
// false claim and lines that hold is broad, a false alarm, and gives no "there is a problem here"). Solved: every issue found and the right verdict; an approval says nothing is wrong, so one
// whose comments flag problems is not the right verdict. Scripted by lines and categories only: what a comment says is
// never read.
import type { Goal } from '../types'
import { DESCRIPTION_PATH, commentTargets, rowIn } from './diff'
import type { DiffRow } from './diff'
import type { CommentFeedback, CommentPlace, LineSpan, PlantedIssue, ReviewComment, ReviewFields, ReviewRecord, ReviewResult, ReviewState, Spot, Verdict } from './types'

/** How many of a comment's rows may belong to no planted issue for it still to find one (a line of context either side). */
export const FOCUS_SLACK = 2

/** The same on the description: none (each line is one paragraph or one claim; a comment points at the claim itself). */
export const DESCRIPTION_SLACK = 0

const overlaps = (span: LineSpan | null, lines: readonly [number, number] | undefined) =>
  span !== null && lines !== undefined && span.start <= lines[1] && span.end >= lines[0]

const within = (line: number | null, lines: readonly [number, number] | undefined) => line !== null && lines !== undefined && line >= lines[0] && line <= lines[1]

/** The comment touches the spot: a line of it after the pull request is in `lines`, or one before it in `removed`. */
export function touches(place: CommentPlace, spot: Spot): boolean {
  return place.path === spot.path && (overlaps(place.head, spot.lines) || overlaps(place.base, spot.removed))
}

/** The comment touches a planted issue: its own spot, or one of the other places it may be pointed at. */
export const touchesIssue = (place: CommentPlace, issue: PlantedIssue): boolean => touches(place, issue) || (issue.also ?? []).some(spot => touches(place, spot))

/** The row is one of the issue's (its own spot or an `also` place), in this file. */
const issueRow = (path: string, row: DiffRow, issue: PlantedIssue) =>
  [issue, ...(issue.also ?? [])].some(spot => spot.path === path && (within(row.new, spot.lines) || within(row.old, spot.removed)))

type Level = Pick<ReviewFields, 'issues' | 'tempting' | 'verdict' | 'pr'>

/**
 * A comment's rows outside the issues it is about (`own`), in two counts, each held against the focus slack: those of
 * another planted issue (`other`) and those of no issue at all (`loose`); and how many of the loose ones are changed
 * (+/-) rows or lines of the description (each one a statement that holds, like a change with nothing wrong in it):
 * with more loose rows than the slack, those make a wide comment broad. Rows of another issue never do: they can make a
 * comment wide, not a false alarm.
 */
function unrelatedRows(level: Level, place: CommentPlace, own: readonly PlantedIssue[]): { other: number, loose: number, changed: number } {
  const file = commentTargets(level.pr).find(each => each.path === place.path)
  const rows = file ? file.hunks.flatMap(hunk => hunk.rows).filter(row => rowIn(row, place)) : []
  const outside = rows.filter(row => !own.some(issue => issueRow(place.path, row, issue)))
  const statements = place.path === DESCRIPTION_PATH
  const loose = outside.filter(row => !level.issues.some(issue => issueRow(place.path, row, issue)))
  return { other: outside.length - loose.length, loose: loose.length, changed: loose.filter(row => statements || row.kind !== 'same').length }
}

/** What one comment found. */
export function commentFeedback(level: Level, comment: ReviewComment): CommentFeedback {
  const touched = level.issues.filter(issue => touchesIssue(comment, issue))
  const onDescription = comment.path === DESCRIPTION_PATH
  // what is wrong with a line of the description can only be that it isn't true
  const fits = (issue: PlantedIssue) => issue.categories.includes(comment.category) && (!onDescription || comment.category === 'false-claim')
  // the issues the comment is about: those its category fits, else (near) every one it touches. Rows of another issue
  // count as its own only when its category fits that issue too (chapter 6): a bug comment over twelve lines of an
  // unrelated reformat isn't focused on the one line in it that is a bug. They are counted apart from the rows of no
  // issue, each against the slack, so a comment that was focused before chapter 6 (at most two rows of no issue, and
  // at most two of an issue of another kind beside it) still is (ADR 0008, review of chapter 6)
  const fitting = touched.filter(fits)
  const unrelated = touched.length ? unrelatedRows(level, comment, fitting.length ? fitting : touched) : { other: 0, loose: 0, changed: 0 }
  const slack = onDescription ? DESCRIPTION_SLACK : FOCUS_SLACK
  const focused = unrelated.loose <= slack && unrelated.other <= slack
  // a comment with more rows of no issue than the slack, some of them changes with nothing wrong in them, points at
  // nothing in particular (on the description, lines that hold: a comment over a false claim and claims that hold is
  // broad). Only rows of no issue count here, as before chapter 6: a comment that is wide only for another issue's rows
  // is told to narrow it down, never a false alarm
  const broad = touched.length > 0 && unrelated.loose > slack && unrelated.changed > 0
  const tempting = touched.length === 0 ? (level.tempting ?? []).find(spot => touches(comment, spot)) : undefined
  return {
    id: comment.id,
    found: focused ? fitting.map(issue => issue.id) : [],
    near: focused ? touched.filter(issue => !fits(issue)).map(issue => issue.id) : [],
    wide: !focused && !broad ? touched.map(issue => issue.id) : [],
    falseAlarm: touched.length === 0 || broad,
    broad,
    why: tempting?.why ?? null
  }
}

/** What a review's comments found and whether it solves the level, with the verdict it was sent with. */
export function checkReview(level: Level, comments: readonly ReviewComment[], verdict: Verdict): ReviewResult {
  const feedback = comments.map(comment => commentFeedback(level, comment))
  const found = level.issues.filter(issue => feedback.some(each => each.found.includes(issue.id))).map(issue => issue.id)
  const missed = level.issues.map(issue => issue.id).filter(id => !found.includes(id))
  const flaggedApproval = verdict === 'approve' && comments.length > 0
  const verdictRight = verdict === level.verdict && !flaggedApproval
  return {
    verdict,
    found,
    missed,
    verdictRight,
    flaggedApproval,
    falseAlarms: feedback.filter(each => each.falseAlarm).length,
    feedback,
    solved: missed.length === 0 && verdictRight
  }
}

type ReviewGoal = Goal<ReviewState, ReviewRecord>

/**
 * A review level's goals, all decided by the last sent review: the problems (how many, never where) and the verdict; a
 * verdict practice task has one goal, the whole review ("is it fine, and if not, what is wrong").
 */
export function reviewGoals(options: { issues: number, verdictTask?: boolean }): ReviewGoal[] {
  if (options.verdictTask) {
    return [{ id: 'verdict', label: 'Approve it or request changes, with a one-line reason', check: ({ state }) => state.sent?.result.solved === true }]
  }
  const { issues } = options
  return [
    {
      id: 'found',
      label: issues === 1 ? 'Find the problem in the diff (1)' : `Find the problems in the diff (${issues})`,
      check: ({ state }) => state.sent !== null && state.sent.result.missed.length === 0
    },
    { id: 'verdict', label: 'Send your review with the right verdict', check: ({ state }) => state.sent?.result.verdictRight === true }
  ]
}

/**
 * A steer level's goals (chapter 7), both decided by an approval, so no round says whether Sous got it right before you
 * looked: the pull request you approved has no problem left (its found and missed are the round's open problems), and
 * the approval is the right verdict (no comments). A request for changes never meets them, not even in the last round,
 * where a review that finds every open problem is graded "solved" by `checkReview` (its verdict is the round's) and
 * Sous pushes nothing more (review of chapter 7). The round limit is in the label; the engine keeps to it.
 */
export function steerGoals(options: { problems: number, rounds: number }): ReviewGoal[] {
  const { problems, rounds } = options
  return [
    {
      id: 'fixed',
      label: problems === 1 ? 'Steer Sous to fix the problem (1)' : `Steer Sous to fix the problems (${problems})`,
      check: ({ state }) => state.sent?.verdict === 'approve' && state.sent.result.found.length + state.sent.result.missed.length === 0
    },
    { id: 'verdict', label: `Approve it once it is right, by round ${rounds}`, check: ({ state }) => state.sent?.verdict === 'approve' && state.sent.result.solved }
  ]
}
