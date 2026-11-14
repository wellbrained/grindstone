// What a sent review found, and the goals that read it (ADR 0008, docs/features/levels.md "The review environment").
// A planted issue is found when a comment touches its lines (on the side it is on, or one of its `also` places) with a
// category the issue accepts, and the comment is **focused**: at most FOCUS_SLACK of its rows belong to no planted issue.
// One comment can find several issues it covers. A wider comment over an issue and lines of context finds nothing
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
 * A comment's rows that belong to no planted issue: how many, and how many of them are changed (+/-) rows, or lines of
 * the description (each one a statement that holds, like a change with nothing wrong in it).
 */
function unrelatedRows(level: Level, place: CommentPlace): { all: number, changed: number } {
  const file = commentTargets(level.pr).find(each => each.path === place.path)
  const rows = file ? file.hunks.flatMap(hunk => hunk.rows).filter(row => rowIn(row, place)) : []
  const unrelated = rows.filter(row => !level.issues.some(issue => issueRow(place.path, row, issue)))
  const statements = place.path === DESCRIPTION_PATH
  return { all: unrelated.length, changed: unrelated.filter(row => statements || row.kind !== 'same').length }
}

/** What one comment found. */
export function commentFeedback(level: Level, comment: ReviewComment): CommentFeedback {
  const touched = level.issues.filter(issue => touchesIssue(comment, issue))
  const unrelated = touched.length ? unrelatedRows(level, comment) : { all: 0, changed: 0 }
  const onDescription = comment.path === DESCRIPTION_PATH
  const focused = unrelated.all <= (onDescription ? DESCRIPTION_SLACK : FOCUS_SLACK)
  // a wide comment that also covers changes with nothing wrong in them points at nothing in particular (on the
  // description, lines that hold: a comment over a false claim and claims that hold is broad)
  const broad = touched.length > 0 && !focused && unrelated.changed > 0
  // what is wrong with a line of the description can only be that it isn't true
  const fits = (issue: PlantedIssue) => issue.categories.includes(comment.category) && (!onDescription || comment.category === 'false-claim')
  const tempting = touched.length === 0 ? (level.tempting ?? []).find(spot => touches(comment, spot)) : undefined
  return {
    id: comment.id,
    found: focused ? touched.filter(fits).map(issue => issue.id) : [],
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
