// What the play page shows of a steer level's rounds (ADR 0008, chapter 7; docs/features/ui.md "Working with AI play
// page"): for each commit Sous pushed, the review that asked for it, what Sous says about each of its comments (the
// level's reply for a fix, a wrong fix or an overreach; a fixed line for a comment it left alone), the commit's short
// id and what it changed (a diff from the round before to the round after it). Pure, so it is unit tested.
import { commitId, pullRequestDiff, reactionOf, steerRound } from '../../shared/levels'
import type { FileDiff, ReviewComment, ReviewLevel, SentReview, SteerAnswer, SteerCommit, SteerLevel } from '../../shared/levels'
import { placeShort } from './review-view'

/** What Sous says about a comment: the level's own words, or one of the fixed answers for a comment it left alone. */
export type SousReply
  = | { kind: 'said', text: string }
    | { kind: 'shrug' | 'unsure' | 'nothing' }

export interface SteerReplyView {
  comment: ReviewComment
  /** Where it sits, short ('summary.js:15'). */
  place: string
  /** What Sous says about it, in order; none when another comment's answer settled its problem. */
  replies: SousReply[]
}

export interface SteerCommitView {
  /** The round the review was of: 1 for Sous's pull request. */
  round: number
  /** The commit's short id ('3f9c2a1'). */
  id: string
  review: SentReview
  replies: SteerReplyView[]
  /** What the commit changed, file by file (from the round before it to the round after). */
  changes: FileDiff[]
  added: number
  removed: number
}

function replyOf(level: SteerLevel, answer: SteerAnswer): SousReply {
  if (answer.kind === 'shrug' || answer.kind === 'unsure' || answer.kind === 'nothing') return { kind: answer.kind }
  const reaction = reactionOf(level.steer, answer)
  return reaction ? { kind: 'said', text: reaction.reply } : { kind: 'nothing' }
}

/** Every commit of a steer level so far, oldest first; none for any other level. */
export function steerCommits(level: ReviewLevel, commits: readonly SteerCommit[]): SteerCommitView[] {
  if (!level.steer) return []
  const steer = level as ReviewLevel & SteerLevel
  return commits.map((commit, index) => {
    const before = steerRound(steer, commits.slice(0, index))
    const after = steerRound(steer, commits.slice(0, index + 1))
    const changes = pullRequestDiff(before.head, after.head)
    return {
      round: index + 1,
      id: commitId(level.id, commits.slice(0, index + 1)),
      review: commit.review,
      replies: commit.review.comments.map(comment => ({
        comment,
        place: placeShort(comment),
        replies: commit.answers.filter(answer => answer.comment === comment.id).map(answer => replyOf(steer, answer))
      })),
      changes,
      added: changes.reduce((sum, file) => sum + file.added, 0),
      removed: changes.reduce((sum, file) => sum + file.removed, 0)
    }
  })
}
