import { describe, expect, it } from 'vitest'
import { restart, takeHint } from '../../../../shared/levels'
import { MAX_COMMENT_TEXT, MAX_SUMMARY, addComment, deleteComment, editComment, playReviewSolution, playReviewStep, reviewDiff, reviewTargets, startReview, submitReview } from '../../../../shared/levels/review/engine'
import type { CommentDraft, ReviewSession } from '../../../../shared/levels/review/types'
import { claimFixture, fineFixture, fixture } from './fixture'

// The review environment on the shared core (ADR 0008): comments added, edited and deleted, a review sent with a verdict
// are the counted actions; a sent review decides the goals and counts its new false alarms once each.

const draft = (path: string, start: number, end = start, category: CommentDraft['category'] = 'bug', text = ''): CommentDraft =>
  ({ path, head: { start, end }, base: null, category, text })
const removed = (path: string, start: number, end = start): CommentDraft => ({ path, head: null, base: { start, end }, category: 'bug', text: '' })

function commented(session: ReviewSession, ...drafts: CommentDraft[]): ReviewSession {
  return drafts.reduce((current, each) => {
    const result = addComment(current, fixture, each)
    expect(result.output.refused).toBeNull()
    return result.session
  }, session)
}

describe('a review session', () => {
  it('starts with no comments, no review sent and no goal met', () => {
    const session = startReview(fixture)
    expect(session.state).toEqual({ comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0 })
    expect(session.goalsMet).toEqual({ found: false, verdict: false })
    expect(session.falseAlarms).toBeUndefined()
    expect(reviewDiff(fixture).map(file => file.path)).toEqual(['cart.js', 'money.js'])
    // worked out once per level
    expect(reviewDiff(fixture)).toBe(reviewDiff(fixture))
  })

  it('adds comments with ids that only go up, each a counted action', () => {
    const first = addComment(startReview(fixture), fixture, draft('cart.js', 11, 11, 'bug', '  Stops at 11.  '))
    expect(first.output).toEqual({ refused: null, result: null, comment: 1 })
    expect(first.session.state.comments).toEqual([{ id: 1, path: 'cart.js', head: { start: 11, end: 11 }, base: null, category: 'bug', text: 'Stops at 11.' }])
    // an unchanged row has a line on each side: the comment keeps both
    expect(addComment(first.session, fixture, draft('cart.js', 1)).session.state.comments[1]).toMatchObject({ head: { start: 1, end: 1 }, base: { start: 1, end: 1 } })
    const second = addComment(first.session, fixture, removed('cart.js', 9, 10))
    expect(second.session.state.nextId).toBe(3)
    expect(second.session).toMatchObject({ commandCount: 2, history: [{ kind: 'comment', id: 1 }, { kind: 'comment', id: 2 }] })
    // a deleted comment's id is never given out again
    const deleted = deleteComment(second.session, fixture, 2)
    expect(deleted.session.state.comments.map(each => each.id)).toEqual([1])
    expect(addComment(deleted.session, fixture, draft('money.js', 2)).output.comment).toBe(3)
  })

  it('refuses a comment that cannot sit there, counting nothing', () => {
    const session = startReview(fixture)
    const refused = [
      draft('nope.js', 1),
      // unchanged files are not in the diff, nor are lines outside it
      draft('cart.js', 40),
      // a stretch that is not one: head 2 and head 11 have rows between them that are not covered
      { path: 'cart.js', head: { start: 2, end: 2 }, base: { start: 9, end: 9 } },
      { path: 'cart.js', head: null, base: null },
      draft('cart.js', 11, 11, 'typo' as CommentDraft['category']),
      draft('cart.js', 11, 11, 'bug', 'x'.repeat(MAX_COMMENT_TEXT + 1))
    ].map(each => addComment(session, fixture, { category: 'bug', text: '', ...each } as CommentDraft))
    for (const result of refused) {
      expect(result.output.refused).toBe('invalid')
      expect(result.session).toBe(session)
    }
    expect(addComment(session, fixture, draft('cart.js', 11, 11, 'bug', 'x'.repeat(MAX_COMMENT_TEXT))).output.refused).toBeNull()
  })

  it('edits a comment\'s category and text (its lines stay), and refuses an unknown one', () => {
    const session = commented(startReview(fixture), draft('cart.js', 11))
    const edited = editComment(session, fixture, 1, { category: 'false-claim', text: 'The description says 12.' })
    expect(edited.session.state.comments[0]).toMatchObject({ id: 1, head: { start: 11, end: 11 }, category: 'false-claim', text: 'The description says 12.' })
    expect(edited.session.history.at(-1)).toEqual({ kind: 'edit', id: 1 })
    expect(editComment(session, fixture, 9, { category: 'bug', text: '' }).output.refused).toBe('unknown')
    expect(editComment(session, fixture, 1, { category: 'nope' as 'bug', text: '' }).output.refused).toBe('invalid')
    expect(deleteComment(session, fixture, 9).output.refused).toBe('unknown')
  })
})

describe('a comment on the description', () => {
  it('sits on its numbered lines like on a file, with the line on both sides', () => {
    expect(reviewTargets(claimFixture).map(file => file.path)).toEqual(['description', 'avg.js'])
    // the diff itself is the files only
    expect(reviewDiff(claimFixture).map(file => file.path)).toEqual(['avg.js'])
    const added = addComment(startReview(claimFixture), claimFixture, { path: 'description', head: { start: 4, end: 4 }, base: null, category: 'false-claim', text: '' })
    expect(added.output.refused).toBeNull()
    expect(added.session.state.comments[0]).toMatchObject({ path: 'description', head: { start: 4, end: 4 }, base: { start: 4, end: 4 } })
    // past its last line there is nothing to comment on
    expect(addComment(startReview(claimFixture), claimFixture, { path: 'description', head: { start: 6, end: 6 }, base: null, category: 'false-claim', text: '' }).output.refused).toBe('invalid')
  })

  it('is a solution step like any other', () => {
    const results = playReviewSolution(claimFixture)
    expect(results.map(result => result.output.refused)).toEqual([null, null, null])
    expect(results.at(-1)!.session).toMatchObject({ solved: true, falseAlarms: 0 })
  })
})

describe('sending a review', () => {
  it('decides the goals from what it found, and solves the level on the first review that finds everything with the right verdict', () => {
    let session = commented(startReview(fixture), draft('money.js', 2))
    const partial = submitReview(session, fixture, 'request-changes', '')
    expect(partial.output.result).toMatchObject({ found: ['one-decimal'], missed: ['one-early', 'count-gone'] })
    expect(partial.session.goalsMet).toEqual({ found: false, verdict: true })
    expect(partial).toMatchObject({ solvedNow: false, session: { solved: false, falseAlarms: 0, state: { reviews: 1 } } })
    expect(partial.session.history.at(-1)).toEqual({ kind: 'submit', verdict: 'request-changes' })

    // you go on from the review you sent: its comments are still there
    session = commented(partial.session, draft('cart.js', 11), removed('cart.js', 9, 10))
    const wrongVerdict = submitReview(session, fixture, 'approve', '')
    expect(wrongVerdict.session.goalsMet).toEqual({ found: true, verdict: false })
    const solved = submitReview(wrongVerdict.session, fixture, 'request-changes', 'Three things.')
    expect(solved).toMatchObject({ solvedNow: true, session: { solved: true, state: { reviews: 3, sent: { verdict: 'request-changes', summary: 'Three things.' } } } })
    // the sent review keeps the comments as they were
    expect(solved.session.state.sent!.comments).toEqual(solved.session.state.comments)
    expect(solved.session.state.sent!.comments).not.toBe(solved.session.state.comments)
    // solved stays; sending again solves nothing new
    expect(submitReview(solved.session, fixture, 'approve', '')).toMatchObject({ solvedNow: false, session: { solved: true } })
  })

  it('counts each false alarm once, however often it is sent or edited; a new comment counts again', () => {
    let session = commented(startReview(fixture), draft('cart.js', 1), draft('cart.js', 6))
    session = submitReview(session, fixture, 'request-changes', '').session
    expect(session).toMatchObject({ falseAlarms: 2, state: { alarmed: [1, 2] } })
    session = submitReview(session, fixture, 'request-changes', '').session
    expect(session.falseAlarms).toBe(2)
    session = editComment(session, fixture, 1, { category: 'unclear', text: 'Hm.' }).session
    session = submitReview(session, fixture, 'request-changes', '').session
    expect(session.falseAlarms).toBe(2)
    // deleted and written again: a new comment, a new false alarm
    session = commented(deleteComment(session, fixture, 1).session, draft('cart.js', 1))
    session = submitReview(session, fixture, 'request-changes', '').session
    expect(session).toMatchObject({ falseAlarms: 3, state: { alarmed: [1, 2, 3] } })
    // the review itself has two (comments 2 and 3); the attempt counted three
    expect(session.state.sent!.result.falseAlarms).toBe(2)
  })

  it('needs a reason in a verdict task, and takes the summary trimmed and cut', () => {
    const session = startReview(fineFixture)
    for (const summary of ['', '   ']) {
      const refused = submitReview(session, fineFixture, 'approve', summary)
      expect(refused.output.refused).toBe('reason')
      expect(refused.session).toBe(session)
    }
    const sent = submitReview(session, fineFixture, 'approve', `  ${'y'.repeat(MAX_SUMMARY + 20)}  `)
    expect(sent.solvedNow).toBe(true)
    expect(sent.session.state.sent!.summary).toBe('y'.repeat(MAX_SUMMARY))
    // a scenario needs none
    expect(submitReview(startReview(fixture), fixture, 'request-changes', '').output.refused).toBeNull()
  })

  it('starts over on Reset: no comments, ids from 1; hints and false alarms stay counted', () => {
    let session = takeHint(startReview(fixture), fixture).session
    session = submitReview(commented(session, draft('cart.js', 1)), fixture, 'approve', '').session
    const restarted = restart(session, fixture)
    expect(restarted).toMatchObject({ hintsUsed: 1, falseAlarms: 1, commandCount: 0, state: { comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0 } })
    // the blanket-then-Reset route: the finders sent again after Reset still carry the false alarms from before
    const again = submitReview(commented(restarted, draft('cart.js', 11)), fixture, 'request-changes', '')
    expect(again.session.falseAlarms).toBe(1)
  })
})

describe('solutions', () => {
  it('replay comment by comment, then the review', () => {
    const results = playReviewSolution(fixture)
    expect(results.map(result => result.output.refused)).toEqual([null, null, null, null])
    expect(results.map(result => result.solvedNow)).toEqual([false, false, false, true])
    expect(results.at(-1)!.session).toMatchObject({ solved: true, falseAlarms: 0, commandCount: 4 })
    expect(playReviewSolution(fineFixture).at(-1)!.session.solved).toBe(true)
  })

  it('refuse a comment step whose lines are not one stretch of the diff', () => {
    const session = startReview(fixture)
    expect(() => playReviewStep(session, fixture, { comment: 'cart.js', lines: [40, 41], category: 'bug', text: '' })).toThrow(/cart\.js/)
  })
})
