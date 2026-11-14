import { describe, expect, it } from 'vitest'
import { playReviewStep, startReview } from '../../../shared/levels'
import type { ReviewSession, ReviewStep } from '../../../shared/levels'
import { steerCommits } from '../../../app/utils/steer-view'
import { fixture, steerFixture } from '../levels/review/fixture'

// The rounds as the play page shows them (ADR 0008, chapter 7): per commit the review that asked for it, Sous's reply
// per comment and what the commit changed.

function play(steps: readonly ReviewStep[]): ReviewSession {
  return steps.reduce((session, step) => playReviewStep(session, steerFixture, step).session, startReview(steerFixture))
}

describe('the steer rounds on the page', () => {
  it('shows each commit: the review, Sous\'s reply per comment, its id and what it changed', () => {
    const session = play([
      { comment: 'price.js', lines: [4, 4], category: 'security', text: 'Escape it?' },
      { comment: 'price.js', lines: [1, 1], category: 'bug', text: '' },
      { submit: 'request-changes', summary: 'Two things.' }
    ])
    const [commit] = steerCommits(steerFixture, session.state.commits!)
    expect(commit).toMatchObject({ round: 1, review: { summary: 'Two things.' }, added: 1, removed: 1 })
    expect(commit!.id).toMatch(/^[0-9a-f]{7}$/)
    expect(commit!.replies.map(each => [each.place, each.comment.category, each.replies])).toEqual([
      ['price.js:4', 'security', [{ kind: 'said', text: 'Escaped it.' }]],
      ['price.js:1', 'bug', [{ kind: 'nothing' }]]
    ])
    // the change: the line Sous rewrote, removed and added
    expect(commit!.changes.map(file => file.path)).toEqual(['price.js'])
    const rows = commit!.changes[0]!.hunks.flatMap(hunk => hunk.rows).filter(row => row.kind !== 'same').map(row => [row.kind, row.text.trim()])
    expect(rows).toEqual([['del', 'return { hidden, text: String(full - total) }'], ['add', 'return { hidden, text: escape(String(full - total)) }']])
  })

  it('says a commit that changed nothing changed nothing, and lists a second commit after the first', () => {
    const session = play([
      { comment: 'price.js', lines: [4, 4], category: 'unclear', text: '' },
      { submit: 'request-changes' },
      { comment: 'price.js', lines: [4, 4], category: 'bug', text: '' },
      { submit: 'request-changes' }
    ])
    const commits = steerCommits(steerFixture, session.state.commits!)
    expect(commits.map(each => [each.round, each.added, each.removed, each.changes.length])).toEqual([[1, 0, 0, 0], [2, 1, 1, 1]])
    expect(commits[0]!.replies[0]!.replies).toEqual([{ kind: 'shrug' }])
    expect(commits[1]!.replies[0]!.replies).toEqual([{ kind: 'said', text: 'Rounded it to cents.' }])
    expect(commits[0]!.id).not.toBe(commits[1]!.id)
  })

  it('has no rounds for a review level', () => {
    expect(steerCommits(fixture, [])).toEqual([])
  })
})
