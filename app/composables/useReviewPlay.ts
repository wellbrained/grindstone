// The Working with AI play page on top of usePlaySession (ADR 0008, docs/features/ui.md "Working with AI play page"):
// Sous's pull request with its description (numbered lines, a comment can sit on them) and its diff, your comments on
// them (one open form at a time, a new one or an edit), the review's
// summary and verdict, and what the last review you sent found. The session, goals, recording of the solve, stats
// events and debrief are shared. The session, the open form and the summary live in the play state (they survive
// leaving the page); the selection of rows being made lives as long as the page.
import { MAX_COMMENT_LINES, addComment, deleteComment, editComment, locate, placeOf, restart, reviewDiff, reviewTargets, startReview, submitReview, takeHint } from '#shared/levels'
import type { Category, CommentFeedback, CommentPlace, FileDiff, ReviewActResult, ReviewComment, ReviewLevel, ReviewResult, ReviewSession, Verdict } from '#shared/levels'

/**
 * The rows a comment is being written on (one stretch of one hunk: from the row it started at to the other end). The
 * description's lines are rows too, of its one hunk (path `description`).
 */
export interface RowRange {
  path: string
  hunk: number
  /** The row it started at. */
  anchor: number
  /** The other end (before or after the anchor). */
  end: number
}

/** A comment being written: its rows, category and text. */
export interface CommentForm extends RowRange {
  category: Category
  text: string
}

interface PlayState {
  session: ReviewSession
  /** The new comment being written; null when no form is open. */
  draft: CommentForm | null
  /** The comment being edited (its id) with the form's values; null when none. */
  editing: { id: number, category: Category, text: string } | null
  /** The review's summary as typed (a verdict task's reason). */
  summary: string
}

/** What the page says under a comment: what the review it was sent with found, or that it changed since. */
export type CommentStatus
  = | { kind: 'unsent' }
    | { kind: 'changed' }
    | { kind: 'sent', feedback: CommentFeedback }

/** A comment's rows in the diff: where it is drawn (after its last row). */
export interface CommentAnchor {
  path: string
  hunk: number
  from: number
  to: number
}

const first = (range: Pick<RowRange, 'anchor' | 'end'>) => Math.min(range.anchor, range.end)
const last = (range: Pick<RowRange, 'anchor' | 'end'>) => Math.max(range.anchor, range.end)

export function useReviewPlay(level: ReviewLevel) {
  const fresh = (): PlayState => ({ session: startReview(level), draft: null, editing: null, summary: '' })
  // Again, a reset from the menu or a loaded backup start over: the rows being picked and the reason's warning go too
  const play = usePlaySession(level, { fresh, onRestart: () => clearPage() })
  const { store, session, next, goals, best, debriefOpen, progressBefore, sparkKey } = play

  /** The changed files. */
  const diff: FileDiff[] = reviewDiff(level)
  /** Everywhere a comment can sit: Sous's description (numbered lines), then the changed files. */
  const targets: FileDiff[] = reviewTargets(level)
  const description = targets[0]!
  const fileOf = (path: string) => targets.find(file => file.path === path) ?? null
  const comments = computed(() => session.value.state.comments)
  const sent = computed(() => session.value.state.sent)
  const falseAlarms = computed(() => session.value.falseAlarms ?? 0)
  /** A verdict task: the review needs a one-line reason. */
  const needsReason = level.reason === true
  /** A verdict task's review was refused for want of a reason: the field says so. */
  const reasonMissing = ref(false)

  /** Rows picked with Shift and the arrow keys or by dragging, before a form opens on them. */
  const selection = ref<RowRange | null>(null)

  /** Where each comment is drawn, by id. */
  const anchors = computed(() => {
    const found = new Map<number, CommentAnchor>()
    for (const comment of comments.value) {
      const at = locate(targets, comment)
      if (at) found.set(comment.id, { path: at.file.path, hunk: at.hunk, from: at.from, to: at.to })
    }
    return found
  })

  /** The comments drawn after this row (their last row), in the order they were written. */
  function commentsAfter(path: string, hunk: number, row: number): ReviewComment[] {
    return comments.value.filter((comment) => {
      const at = anchors.value.get(comment.id)
      return at?.path === path && at.hunk === hunk && at.to === row
    })
  }

  /** The row is one of a comment's (its number cell is marked). */
  function inComment(path: string, hunk: number, row: number): boolean {
    for (const at of anchors.value.values()) {
      if (at.path === path && at.hunk === hunk && row >= at.from && row <= at.to) return true
    }
    return false
  }

  /** The rows being picked or commented on right now: the ones being picked, else the open form's. */
  const active = computed<RowRange | null>(() => selection.value ?? store.value.draft)
  const isActive = (path: string, hunk: number, row: number) => {
    const range = active.value
    return range !== null && range.path === path && range.hunk === hunk && row >= first(range) && row <= last(range)
  }

  /** Where the open form's comment would sit. */
  const draftPlace = computed<CommentPlace | null>(() => {
    const draft = store.value.draft
    const file = draft ? fileOf(draft.path) : null
    return draft && file ? placeOf(file, draft.hunk, draft.anchor, draft.end) : null
  })

  /** A range from `anchor` towards `row`, no longer than a comment may be. */
  function clamp(anchor: number, row: number): number {
    const reach = MAX_COMMENT_LINES - 1
    return Math.min(Math.max(row, anchor - reach), anchor + reach)
  }

  /**
   * Picks rows without opening the form (Shift and the arrow keys, a drag): from where the picking started to `row` in
   * the same hunk. An open form stays as it is until Enter moves it onto the picked rows.
   */
  function select(path: string, hunk: number, row: number, extend: boolean) {
    const current = selection.value
    if (extend && current && current.path === path && current.hunk === hunk) selection.value = { ...current, end: clamp(current.anchor, row) }
    else selection.value = { path, hunk, anchor: row, end: row }
  }

  /** The open form on other rows: what you typed and picked in it comes along. */
  function moveDraft(range: RowRange) {
    const draft = store.value.draft
    store.value.draft = { ...range, category: draft?.category ?? 'bug', text: draft?.text ?? '' }
  }

  /**
   * A line number: opens the form for a comment on that row, or with `extend` (Shift) stretches the rows being picked,
   * or the open form, in the same hunk to it. An open form moves there with what you typed in it.
   */
  function startComment(path: string, hunk: number, row: number, extend = false) {
    const current = active.value
    if (extend && current && current.path === path && current.hunk === hunk) moveDraft({ ...current, end: clamp(current.anchor, row) })
    else moveDraft({ path, hunk, anchor: row, end: row })
    selection.value = null
  }

  /** Opens the form on the picked rows (Enter after picking them); an open form moves there with what you typed. */
  function commentSelection() {
    const range = selection.value
    if (!range) return
    moveDraft(range)
    selection.value = null
  }

  function clearSelection() {
    selection.value = null
  }

  function apply(result: ReviewActResult) {
    play.update(result.session)
    if (result.solvedNow) play.solved(result.session)
  }

  /** Adds the open form's comment (counted); returns its id, or null when it was refused. */
  function saveDraft(): number | null {
    const draft = store.value.draft
    const place = draftPlace.value
    if (!draft || !place) return null
    play.markPlayed()
    const result = addComment(session.value, level, { ...place, category: draft.category, text: draft.text })
    if (result.output.refused) return null
    store.value.draft = null
    apply(result)
    return result.output.comment
  }

  function cancelDraft() {
    store.value.draft = null
  }

  function startEdit(id: number) {
    const comment = comments.value.find(each => each.id === id)
    if (!comment) return
    // an open new comment stays open: editing another one does not throw away what you typed there
    store.value.editing = { id, category: comment.category, text: comment.text }
  }

  /** Saves the edited comment (counted; a comment that did not change costs nothing). */
  function saveEdit() {
    const editing = store.value.editing
    if (!editing) return
    const comment = comments.value.find(each => each.id === editing.id)
    store.value.editing = null
    if (!comment || (comment.category === editing.category && comment.text === editing.text.trim())) return
    play.markPlayed()
    const result = editComment(session.value, level, editing.id, { category: editing.category, text: editing.text })
    if (!result.output.refused) apply(result)
  }

  function cancelEdit() {
    store.value.editing = null
  }

  function removeComment(id: number) {
    play.markPlayed()
    if (store.value.editing?.id === id) store.value.editing = null
    const result = deleteComment(session.value, level, id)
    if (!result.output.refused) apply(result)
  }

  /** Sends the review (counted): a verdict task without a reason is refused, and the reason field says so. */
  function submit(verdict: Verdict): ReviewResult | null {
    play.markPlayed()
    const result = submitReview(session.value, level, verdict, store.value.summary)
    if (result.output.refused === 'reason') {
      reasonMissing.value = true
      return null
    }
    if (result.output.refused) return null
    reasonMissing.value = false
    apply(result)
    return result.output.result
  }

  /** What to say under a comment: nothing before it was sent, what the review found, or that it changed since. */
  function statusOf(comment: ReviewComment): CommentStatus {
    const review = sent.value
    const then = review?.comments.find(each => each.id === comment.id)
    if (!review || !then) return { kind: 'unsent' }
    if (then.category !== comment.category) return { kind: 'changed' }
    const feedback = review.result.feedback.find(each => each.id === comment.id)
    return feedback ? { kind: 'sent', feedback } : { kind: 'unsent' }
  }

  const issueTitle = (id: string) => level.issues.find(issue => issue.id === id)?.title ?? id

  function hint() {
    play.update(takeHint(session.value, level).session)
  }

  /** What lives only as long as the page: the rows being picked, the reason's warning. */
  function clearPage() {
    selection.value = null
    reasonMissing.value = false
  }

  /** Reset: no comments, nothing sent, as a new attempt; hints stay revealed (and counted). */
  function reset() {
    play.update(restart(session.value, level))
    store.value.draft = null
    store.value.editing = null
    store.value.summary = ''
    clearPage()
  }

  const stats = computed(() => ({
    hints: session.value.hintsUsed,
    falseAlarms: falseAlarms.value,
    // the best run so far (this one included, once it is recorded)
    best: best.value
  }))

  return {
    level,
    diff,
    description,
    session,
    store,
    goals,
    next,
    stats,
    comments,
    sent,
    falseAlarms,
    needsReason,
    reasonMissing,
    selection,
    anchors,
    draftPlace,
    debriefOpen,
    progressBefore,
    sparkKey,
    commentsAfter,
    inComment,
    isActive,
    select,
    startComment,
    commentSelection,
    clearSelection,
    saveDraft,
    cancelDraft,
    startEdit,
    saveEdit,
    cancelEdit,
    removeComment,
    submit,
    statusOf,
    issueTitle,
    hint,
    reset,
    again: play.again
  }
}

export type ReviewPlaySession = ReturnType<typeof useReviewPlay>
