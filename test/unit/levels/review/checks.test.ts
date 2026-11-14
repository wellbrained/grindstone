import { describe, expect, it } from 'vitest'
import { FOCUS_SLACK, checkReview, reviewGoals, touches } from '../../../../shared/levels/review/checks'
import type { Category, CommentPlace, ReviewComment, ReviewState, Verdict } from '../../../../shared/levels/review/types'
import { fineFixture, fixture } from './fixture'

// Comment matching (ADR 0008): a sent review finds a planted issue when one of its comments touches the issue's lines
// with a category that fits; a comment that touches no issue is a false alarm (told why on a tempting spot); the level
// is solved when every issue is found and the verdict is right, and an approval may not flag problems.

const head = (start: number, end = start) => ({ start, end })
let ids = 0
const comment = (path: string, place: Omit<CommentPlace, 'path'>, category: Category = 'bug'): ReviewComment => ({ id: ++ids, path, ...place, category, text: '' })
const onHead = (path: string, start: number, end = start, category: Category = 'bug') => comment(path, { head: head(start, end), base: null }, category)
const onBase = (path: string, start: number, end = start, category: Category = 'bug') => comment(path, { head: null, base: head(start, end) }, category)

const allThree = () => [onHead('cart.js', 11), onBase('cart.js', 9, 10), onHead('money.js', 2)]

describe('a comment touches a spot', () => {
  it('when one of its lines on the head side is in the spot\'s lines', () => {
    expect(touches(onHead('cart.js', 11), { path: 'cart.js', lines: [11, 11] })).toBe(true)
    // a range that overlaps at either end
    expect(touches(onHead('cart.js', 9, 11), { path: 'cart.js', lines: [11, 12] })).toBe(true)
    expect(touches(onHead('cart.js', 12, 14), { path: 'cart.js', lines: [10, 12] })).toBe(true)
    expect(touches(onHead('cart.js', 12, 14), { path: 'cart.js', lines: [10, 11] })).toBe(false)
    // the same line number in another file
    expect(touches(onHead('money.js', 11), { path: 'cart.js', lines: [11, 11] })).toBe(false)
  })

  it('for a removed line, only on the base side: the added line beside it is another line', () => {
    const spot = { path: 'cart.js', removed: [9, 10] as const }
    expect(touches(onBase('cart.js', 10), spot)).toBe(true)
    expect(touches(onHead('cart.js', 10), spot)).toBe(false)
    // a comment over both sides (a removed and an added row) touches both kinds of spot
    const both = comment('cart.js', { head: head(10, 11), base: head(9, 10) })
    expect(touches(both, spot)).toBe(true)
    expect(touches(both, { path: 'cart.js', lines: [11, 11] })).toBe(true)
  })
})

describe('what a sent review found', () => {
  const review = (comments: ReviewComment[], verdict: Verdict = 'request-changes') => checkReview(fixture, comments, verdict)

  it('finds each issue a comment touches with a category that fits, and solves the level with the right verdict', () => {
    const result = review(allThree())
    expect(result).toMatchObject({ found: ['one-early', 'count-gone', 'one-decimal'], missed: [], verdictRight: true, falseAlarms: 0, solved: true })
    // 'false-claim' fits the first issue too
    expect(review([onHead('cart.js', 11, 11, 'false-claim'), onBase('cart.js', 9), onHead('money.js', 2)]).solved).toBe(true)
  })

  it('lists what is missing, in level order, and is not solved before every issue is found', () => {
    const result = review([onHead('money.js', 2)])
    expect(result).toMatchObject({ found: ['one-decimal'], missed: ['one-early', 'count-gone'], verdictRight: true, solved: false })
  })

  it('does not count a comment on the right lines with a category that does not fit, nor call it a false alarm', () => {
    const wrong = onHead('cart.js', 11, 11, 'security')
    const result = review([wrong, onBase('cart.js', 9), onHead('money.js', 2)])
    expect(result.missed).toEqual(['one-early'])
    expect(result.feedback.find(each => each.id === wrong.id)).toEqual({ id: wrong.id, found: [], near: ['one-early'], wide: [], falseAlarm: false, broad: false, why: null })
    expect(result.falseAlarms).toBe(0)
  })

  it('calls a comment that touches no issue a false alarm, with the reason on a tempting spot', () => {
    const tempting = onHead('cart.js', 6)
    const plain = onHead('cart.js', 1, 2)
    const result = review([...allThree(), tempting, plain])
    expect(result).toMatchObject({ solved: true, falseAlarms: 2 })
    expect(result.feedback.find(each => each.id === tempting.id)).toEqual({ id: tempting.id, found: [], near: [], wide: [], falseAlarm: true, broad: false, why: 'At 12 the basket is full: `>=` stops the 13th.' })
    expect(result.feedback.find(each => each.id === plain.id)).toMatchObject({ falseAlarm: true, why: null })
    // a comment that touches an issue and a tempting spot is about the issue (focused: one row of context)
    expect(review([onHead('cart.js', 10, 11)]).feedback[0]).toMatchObject({ found: ['one-early'], falseAlarm: false, why: null })
  })

  it('finds an issue from the other places it may be pointed at', () => {
    const level = { ...fixture, issues: [{ ...fixture.issues[0]!, also: [{ path: 'cart.js', lines: [3, 3] as const }] }] }
    expect(checkReview(level, [onHead('cart.js', 3)], 'request-changes')).toMatchObject({ found: ['one-early'], falseAlarms: 0 })
    expect(checkReview(level, [onHead('cart.js', 3, 3, 'security')], 'request-changes').feedback[0]).toMatchObject({ near: ['one-early'], falseAlarm: false })
  })

  it('finds an issue only with a focused comment: at most FOCUS_SLACK rows of it belong to no issue', () => {
    expect(FOCUS_SLACK).toBe(2)
    // cart.js rows around line 37 of the fixture: a10 (canAdd), a11 (the issue), s11/12 (closing brace)
    expect(review([onHead('cart.js', 10, 12)]).feedback[0]).toMatchObject({ found: ['one-early'], wide: [] })
    // wider, over the removed count() and three unchanged lines above it: right place, too much around it
    const wide = review([comment('cart.js', { head: head(7, 9), base: head(6, 10) })]).feedback[0]!
    expect(wide).toMatchObject({ found: [], near: [], wide: ['count-gone'], falseAlarm: false, broad: false })
    // wider and over changes with nothing wrong in them (the guard, canAdd's first line): a false alarm
    expect(review([onHead('cart.js', 6, 11)]).feedback[0]).toMatchObject({ found: [], wide: [], falseAlarm: true, broad: true, why: null })
    // a comment over a whole hunk of changes is one too
    const blanket = comment('cart.js', { head: head(1, 11), base: head(1, 10) })
    expect(review([blanket]).feedback[0]).toMatchObject({ found: [], wide: [], falseAlarm: true, broad: true, why: null })
    // rows of another issue are not unrelated: one comment over two issues side by side still finds both
    expect(review([comment('cart.js', { head: head(10, 11), base: head(9, 10) })]).found).toEqual(['one-early', 'count-gone'])
  })

  it('lets one comment find every issue it touches', () => {
    const across = comment('cart.js', { head: head(10, 11), base: head(9, 10) })
    expect(review([across]).found).toEqual(['one-early', 'count-gone'])
  })

  it('keeps feedback in the review\'s order, one entry per comment', () => {
    const comments = [onHead('money.js', 2), onHead('cart.js', 1)]
    expect(review(comments).feedback.map(each => each.id)).toEqual(comments.map(each => each.id))
  })

  it('is not solved with the wrong verdict, even with every issue found', () => {
    expect(review(allThree(), 'approve')).toMatchObject({ found: ['one-early', 'count-gone', 'one-decimal'], verdictRight: false, solved: false })
    expect(review([], 'request-changes')).toMatchObject({ verdictRight: true, solved: false })
  })

  it('takes an approval with no comments as right on a pull request that is fine, and one that flags problems as not', () => {
    expect(checkReview(fineFixture, [], 'approve')).toMatchObject({ verdictRight: true, flaggedApproval: false, solved: true })
    expect(checkReview(fineFixture, [], 'request-changes')).toMatchObject({ verdictRight: false, solved: false })
    // an approval says nothing is wrong: its comments say otherwise
    const flagged = checkReview(fineFixture, [onHead('loop.js', 1)], 'approve')
    expect(flagged).toMatchObject({ verdictRight: false, flaggedApproval: true, falseAlarms: 1, solved: false })
    expect(flagged.feedback[0]).toMatchObject({ falseAlarm: true, why: 'Both stop at the last index.' })
  })
})

describe('the goals of a review level', () => {
  it('ask for the problems (with their number, never where) and the verdict; a verdict task for the verdict alone', () => {
    expect(reviewGoals({ issues: 3 }).map(goal => [goal.id, goal.label])).toEqual([
      ['found', 'Find the problems in the diff (3)'],
      ['verdict', 'Send your review with the right verdict']
    ])
    expect(reviewGoals({ issues: 1 })[0]!.label).toBe('Find the problem in the diff (1)')
    expect(reviewGoals({ issues: 0, verdictTask: true }).map(goal => [goal.id, goal.label])).toEqual([['verdict', 'Approve it or request changes, with a one-line reason']])
    expect(reviewGoals({ issues: 1, verdictTask: true })).toHaveLength(1)
  })

  it('pass only on what the last sent review found', () => {
    const goals = reviewGoals({ issues: 3 })
    const state = (comments: ReviewComment[], verdict: Verdict): ReviewState => ({ comments, nextId: 9, alarmed: [], reviews: 1, sent: { verdict, summary: '', comments, result: checkReview(fixture, comments, verdict) } })
    const met = (current: ReviewState) => goals.map(goal => goal.check({ state: current, history: [] }))
    expect(met({ comments: [], nextId: 1, alarmed: [], reviews: 0, sent: null })).toEqual([false, false])
    expect(met(state(allThree(), 'approve'))).toEqual([true, false])
    expect(met(state([onHead('money.js', 2)], 'request-changes'))).toEqual([false, true])
    expect(met(state(allThree(), 'request-changes'))).toEqual([true, true])
    // a verdict task's one goal is the whole review
    const [verdict] = reviewGoals({ issues: 0, verdictTask: true })
    const sent = (verdictGiven: Verdict): ReviewState => ({ comments: [], nextId: 1, alarmed: [], reviews: 1, sent: { verdict: verdictGiven, summary: 'x', comments: [], result: checkReview(fineFixture, [], verdictGiven) } })
    expect(verdict!.check({ state: sent('approve'), history: [] })).toBe(true)
    expect(verdict!.check({ state: sent('request-changes'), history: [] })).toBe(false)
  })
})
