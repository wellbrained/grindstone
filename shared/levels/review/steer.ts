// Steer the assistant (ADR 0008, chapter 7; docs/features/levels.md "Steer levels"): you write the review that makes
// Sous fix it. A steer level's pull request has rounds: round 1 is Sous's pull request; each request for changes Sous
// answers with a commit (the next round), until the level's round limit. What the commit does is scripted by the
// comments of the review, matched as every review is (checks.ts: lines and categories, never the text): for each open
// problem, a comment that finds it gets the right fix; one on its lines with a kind that doesn't fit, a plausible
// wrong fix (the problem's `misread` for that category: a security comment on a rounding bug and Sous escapes the
// number), or nothing when no wrong fix is scripted for that kind; no comment, and it stays. A false alarm on a fine
// place Sous "fixes" (its `overreach`: a new small problem); any other false alarm, or a comment too wide to point at
// a line, changes nothing. A round is worked out from the commits alone (the files, the open problems, where they
// are), so the session keeps only what Sous answered. Pure; levels are checked by the tests to reach a defined state on
// every path (test/unit/levels/review/steer.test.ts).
import { steerGoals, touches } from './checks'
import { claimAt, paragraphAt } from './diff'
import { emptyReview, withEdits } from './shop'
import type {
  CommentFeedback,
  Files,
  PlantedIssue,
  PullRequest,
  ReviewComment,
  ReviewFields,
  ReviewPracticeTask,
  ReviewResult,
  ReviewScenario,
  ReviewState,
  SteerAnswer,
  SteerCommit,
  SteerEdit,
  SteerProblem,
  SteerReaction,
  SteerSpec,
  SteerSpot,
  SteerTempting,
  Spot,
  TemptingSpot
} from './types'

/** What a review is graded against: a level, or one round of a steer level. */
export type ReviewView = Pick<ReviewFields, 'pr' | 'issues' | 'tempting' | 'verdict'>

/** What the round model needs of a steer level. */
export interface SteerLevel {
  id: string
  pr: PullRequest
  steer: SteerSpec
}

/** One version of a steer level's pull request. */
export interface SteerRound {
  /** 1 for Sous's pull request, one more for each commit. */
  number: number
  /** The pull request's files in this round. */
  head: Files
  /** Ids of the problems the files have, in the level's order. */
  open: string[]
  /** The fine places the files still have, with what Sous does to each when flagged. */
  spots: { id: string, spot: TemptingSpot, overreach?: SteerReaction }[]
  /** The round as a review is graded: the pull request with these files, its open problems as planted issues. */
  view: ReviewView
}

/** The lines `text` is on in `file` (1-based, both ends); it must be there exactly once. */
export function linesOf(file: string | undefined, text: string, where: string): readonly [number, number] {
  const at = file === undefined || text === '' ? -1 : file.indexOf(text)
  if (file === undefined || at < 0 || file.indexOf(text, at + 1) >= 0) throw new Error(`${where}: ${JSON.stringify(text)} must be in the file exactly once`)
  const start = file.slice(0, at).split('\n').length
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return [start, start + body.split('\n').length - 1]
}

/** A steer spot as lines of this round: `text` in the head, `removed` in main's file. */
export function resolveSpot(spot: SteerSpot, base: Files, head: Files, where: string): Spot {
  if (spot.text === undefined && spot.removed === undefined) throw new Error(`${where}: a spot needs text or removed`)
  return {
    path: spot.path,
    ...(spot.text !== undefined ? { lines: linesOf(head[spot.path], spot.text, `${where} in ${spot.path}`) } : {}),
    ...(spot.removed !== undefined ? { removed: linesOf(base[spot.path], spot.removed, `${where} in main's ${spot.path}`) } : {})
  }
}

const problemOf = (spec: SteerSpec, id: string): SteerProblem => {
  const found = spec.problems.find(problem => problem.id === id)
  if (!found) throw new Error(`no steer problem ${id}`)
  return found
}

/** A problem as a planted issue of the round: its places as lines, the claims it breaks among them. */
function issueOf(problem: SteerProblem, pr: PullRequest, head: Files): PlantedIssue {
  const own = resolveSpot(problem.at, pr.base, head, problem.id)
  const also = [
    ...(problem.also ?? []).map(spot => resolveSpot(spot, pr.base, head, problem.id)),
    ...(problem.says ?? []).map(index => paragraphAt(pr, index)),
    ...(problem.breaks ?? []).map(index => claimAt(pr, index))
  ]
  return {
    id: problem.id,
    ...own,
    ...(also.length ? { also } : {}),
    categories: problem.categories,
    title: problem.title,
    explanation: problem.explanation
  }
}

/** A fine place as this round has it; null when the files no longer have its text (Sous changed it). */
function spotOf(tempting: SteerTempting, pr: PullRequest, head: Files): TemptingSpot | null {
  const at = tempting.at
  if ('claim' in at) return { ...claimAt(pr, at.claim), why: tempting.why, id: tempting.id }
  if (at.text !== undefined && !(head[at.path] ?? '').includes(at.text)) return null
  return { ...resolveSpot(at, pr.base, head, tempting.id), why: tempting.why, id: tempting.id }
}

/** The files after these edits: a replace as `withEdits` does it (it throws when the text is not there), a revert to main's file. */
export function applyEdits(base: Files, files: Files, edits: readonly SteerEdit[]): Files {
  let next: Record<string, string> = { ...files }
  for (const edit of edits) {
    if ('revert' in edit) {
      next = Object.hasOwn(base, edit.path)
        ? { ...next, [edit.path]: base[edit.path]! }
        : Object.fromEntries(Object.entries(next).filter(([path]) => path !== edit.path))
    } else {
      next = withEdits(next, [edit])
    }
  }
  return next
}

/** The reaction an answer applies; null for one that changes nothing. */
export function reactionOf(spec: SteerSpec, answer: SteerAnswer): SteerReaction | null {
  if (answer.kind === 'fix') return problemOf(spec, answer.problem).fix
  if (answer.kind === 'misread') return problemOf(spec, answer.problem).misread?.[answer.misread] ?? null
  if (answer.kind === 'overreach') return spec.tempting?.find(spot => spot.id === answer.spot)?.overreach ?? null
  return null
}

/** What a commit changes, as a key: its answers that apply a reaction. */
const commitKey = (commit: Pick<SteerCommit, 'answers'>) => commit.answers
  .map(answer => answer.kind === 'fix' ? `f:${answer.problem}` : answer.kind === 'misread' ? `m:${answer.problem}:${answer.misread}` : answer.kind === 'overreach' ? `o:${answer.spot}` : '')
  .filter(Boolean)
  .join(',')

const spans = (a: readonly [number, number] | undefined, b: readonly [number, number] | undefined) => a !== undefined && b !== undefined && a[0] <= b[1] && a[1] >= b[0]
/** Two places share a line (after the pull request, or one it removed). */
const overlap = (a: Spot, b: Spot) => a.path === b.path && (spans(a.lines, b.lines) || spans(a.removed, b.removed))

const rounds = new WeakMap<SteerSpec, Map<string, SteerRound>>()

function build(level: SteerLevel, head: Files, open: string[], number: number): SteerRound {
  const { pr: start, steer } = level
  // round 1 is Sous's pull request as the level wrote it (its diff is worked out once, as for any level)
  const pr = number === 1 && head === start.head ? start : { ...start, head }
  const order = (ids: string[]) => steer.problems.map(problem => problem.id).filter(id => ids.includes(id))
  const ids = order(open)
  const issues = ids.map(id => issueOf(problemOf(steer, id), pr, head))
  // a fine place stays fine while no open problem is on it (a claim that holds until a commit breaks it)
  const spots = (steer.tempting ?? []).flatMap((tempting) => {
    const spot = spotOf(tempting, pr, head)
    if (!spot || issues.some(issue => [issue, ...(issue.also ?? [])].some(place => overlap(place, spot)))) return []
    return [{ id: tempting.id, spot, ...(tempting.overreach ? { overreach: tempting.overreach } : {}) }]
  })
  return {
    number,
    head,
    open: ids,
    spots,
    view: { pr, issues, tempting: spots.map(each => each.spot), verdict: issues.length ? 'request-changes' : 'approve' }
  }
}

/**
 * The round after these commits (none: round 1, Sous's pull request), worked out once per level and commits: each
 * commit applies the reactions of its answers in order (their edits, and the problems they leave in place of theirs).
 */
export function steerRound(level: SteerLevel, commits: readonly Pick<SteerCommit, 'answers'>[]): SteerRound {
  let cache = rounds.get(level.steer)
  if (!cache) {
    cache = new Map()
    rounds.set(level.steer, cache)
  }
  const key = commits.map(commitKey).join('|') + `#${commits.length}`
  const known = cache.get(key)
  if (known) return known
  let round: SteerRound
  if (!commits.length) {
    round = build(level, level.pr.head, [...level.steer.start], 1)
  } else {
    const before = steerRound(level, commits.slice(0, -1))
    let head = before.head
    let open = [...before.open]
    for (const answer of commits.at(-1)!.answers) {
      const reaction = reactionOf(level.steer, answer)
      if (!reaction) continue
      head = applyEdits(level.pr.base, head, reaction.edits)
      if (answer.kind !== 'overreach' && 'problem' in answer) open = open.filter(id => id !== answer.problem)
      for (const id of reaction.becomes ?? []) if (!open.includes(id)) open.push(id)
    }
    round = build(level, head, open, commits.length + 1)
  }
  cache.set(key, round)
  return round
}

/** What a review is graded against now: a steer level's current round, any other level as it is. */
export function reviewNow(level: ReviewView & { id: string, steer?: SteerSpec }, state: Pick<ReviewState, 'commits'>): ReviewView {
  return level.steer ? steerRound(level as SteerLevel, state.commits ?? []).view : level
}

/**
 * What Sous does with a review that asks for changes in this round: for each open problem (in the level's order), the
 * first comment that finds it gets the right fix, else the first one on its lines with a kind that doesn't fit gets
 * the wrong fix scripted for that kind (or none); then for each fine place, the first false alarm on it gets its
 * overreach. Every other comment is answered too: one too wide to tell which line, or a false alarm elsewhere, changes
 * nothing; one whose problem another comment already settled says nothing more.
 */
export function sousAnswers(spec: SteerSpec, round: SteerRound, comments: readonly ReviewComment[], result: ReviewResult): SteerAnswer[] {
  const feedback = new Map<number, CommentFeedback>(result.feedback.map(each => [each.id, each]))
  const of = (comment: ReviewComment) => feedback.get(comment.id)!
  const answers: SteerAnswer[] = []
  const answered = new Set<number>()
  for (const id of round.open) {
    const finder = comments.find(comment => of(comment).found.includes(id))
    if (finder) {
      answers.push({ comment: finder.id, kind: 'fix', problem: id })
      answered.add(finder.id)
      continue
    }
    const near = comments.find(comment => of(comment).near.includes(id))
    if (!near) continue
    const misread = (problemOf(spec, id).misread ?? []).findIndex(each => each.as.includes(near.category))
    answers.push(misread >= 0 ? { comment: near.id, kind: 'misread', problem: id, misread } : { comment: near.id, kind: 'shrug', problem: id })
    answered.add(near.id)
  }
  for (const { id, spot, overreach } of round.spots) {
    if (!overreach) continue
    const flagged = comments.find(comment => of(comment).falseAlarm && !of(comment).broad && touches(comment, spot))
    if (!flagged) continue
    answers.push({ comment: flagged.id, kind: 'overreach', spot: id })
    answered.add(flagged.id)
  }
  for (const comment of comments) {
    if (answered.has(comment.id)) continue
    const each = of(comment)
    if (each.broad || each.wide.length) answers.push({ comment: comment.id, kind: 'unsure' })
    else if (each.falseAlarm) answers.push({ comment: comment.id, kind: 'nothing' })
  }
  return answers
}

/** A commit's short id, as git shows one ('3f9c2a1'): the same for the same answers in the same place, every time. */
export function commitId(levelId: string, commits: readonly Pick<SteerCommit, 'answers'>[]): string {
  const text = `${levelId}:${commits.length}:${commits.map(commitKey).join('|')}`
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').slice(0, 7)
}

/** A steer scenario as a level file writes it: a scenario without the fields its round 1 gives (issues, fine places, verdict, goals). */
export type SteerScenarioSpec = Omit<ReviewScenario, 'issues' | 'tempting' | 'verdict' | 'goals' | 'setup' | 'steer'> & { steer: SteerSpec }

/** A steer practice task as written: one problem to steer, one request for changes, then the approval. */
export type SteerPracticeSpec = Omit<ReviewPracticeTask, 'issues' | 'tempting' | 'verdict' | 'goals' | 'setup' | 'steer' | 'reason'> & { steer: SteerSpec }

/** A fresh steer review: no comments, nothing sent, no commit yet (round 1). */
export const emptySteer = (): ReviewState => ({ ...emptyReview(), commits: [] })

function steerFields(spec: { id: string, pr: PullRequest, steer: SteerSpec }) {
  const round = steerRound(spec, [])
  return {
    issues: round.view.issues,
    tempting: round.view.tempting ?? [],
    verdict: 'request-changes' as const,
    setup: emptySteer,
    goals: steerGoals({ problems: round.open.length, rounds: spec.steer.rounds })
  }
}

/** A steer scenario (chapter 7): its round 1 as the level's issues and fine places, request changes first. */
export function steerScenario(spec: SteerScenarioSpec): ReviewScenario {
  return { ...spec, ...steerFields(spec) }
}

/** A steer practice task: the same, over one small pull request. */
export function steerPractice(spec: SteerPracticeSpec): ReviewPracticeTask {
  return { ...spec, ...steerFields(spec) }
}
