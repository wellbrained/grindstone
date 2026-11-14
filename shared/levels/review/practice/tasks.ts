// The two kinds of Working with AI practice task (ADR 0008), about 30 s each over one small file. "Spot it": the pull
// request has one problem, comment on it and request changes. "Verdict": is it fine? Approve it or request changes,
// with a one-line reason (the review's summary). An issue names the claims of the description it breaks (`breaks`, by
// their index in `claims`) and the paragraphs that state what it breaks (`says`, by their index in `description`), and
// a tempting spot may be a claim that holds (`claim`): all become lines of the description (`claimAt`, `paragraphAt`),
// where a comment may point at them.
import { reviewGoals } from '../checks'
import { claimAt, paragraphAt } from '../diff'
import { emptyReview } from '../shop'
import type { PlantedIssue, PullRequest, ReviewPracticeTask, ReviewStep, TemptingSpot } from '../types'

/** A planted issue, with the claims it breaks and the paragraphs that state them (indexes in `claims`, `description`). */
export type IssueSpec = PlantedIssue & { breaks?: readonly number[], says?: readonly number[] }

/** A tempting spot in the diff, or a claim that holds (its index in `claims`). */
export type TemptingSpec = TemptingSpot | { claim: number, why: string }

export interface TaskSpec {
  id: string
  practises: string
  title: string
  task: string
  pr: PullRequest
  issues: readonly IssueSpec[]
  tempting?: readonly TemptingSpec[]
  hint: string
  why: string
  solution: ReviewStep[]
  difficulty?: 1 | 2
}

/** The level's issues, each also found on the paragraphs and claims of the description that it makes false. */
export function issuesOf(pr: PullRequest, issues: readonly IssueSpec[]): PlantedIssue[] {
  return issues.map(({ breaks = [], says = [], ...issue }) => {
    const places = [...says.map(index => paragraphAt(pr, index)), ...breaks.map(index => claimAt(pr, index))]
    return places.length ? { ...issue, also: [...(issue.also ?? []), ...places] } : issue
  })
}

/** The level's tempting spots, a claim that holds as its line of the description. */
export function temptingOf(pr: PullRequest, tempting: readonly TemptingSpec[]): TemptingSpot[] {
  return tempting.map(spot => 'claim' in spot ? { ...claimAt(pr, spot.claim), why: spot.why } : spot)
}

/** A "spot it" task: one planted issue; find it and request changes. */
export function spotIt(spec: TaskSpec): ReviewPracticeTask {
  return {
    track: 'ai',
    kind: 'practice',
    difficulty: spec.difficulty ?? 1,
    minutes: 0.5,
    id: spec.id,
    practises: spec.practises,
    title: spec.title,
    task: spec.task,
    pr: spec.pr,
    issues: issuesOf(spec.pr, spec.issues),
    ...(spec.tempting ? { tempting: temptingOf(spec.pr, spec.tempting) } : {}),
    verdict: 'request-changes',
    setup: emptyReview,
    goals: reviewGoals({ issues: spec.issues.length }),
    hints: [spec.hint],
    why: spec.why,
    solution: spec.solution
  }
}

/** A "verdict" task: fine (no issue: approve) or not (request changes on it), always with a one-line reason. */
export function verdict(spec: TaskSpec): ReviewPracticeTask {
  return {
    ...spotIt(spec),
    verdict: spec.issues.length ? 'request-changes' : 'approve',
    reason: true,
    goals: reviewGoals({ issues: spec.issues.length, verdictTask: true })
  }
}
