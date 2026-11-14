import { describe, expect, it } from 'vitest'
import { DESCRIPTION_PATH, aiLevels, checkReview, commentTargets, placeFor, placeOf, restart, touchesIssue } from '../../../../shared/levels'
import { addComment, playReviewSolution, playReviewStep, reviewTargets, startReview, submitReview } from '../../../../shared/levels/review/engine'
import { applyEdits, commitId, linesOf, reviewNow, sousAnswers, steerRound } from '../../../../shared/levels/review/steer'
import type { SteerLevel, SteerRound } from '../../../../shared/levels/review/steer'
import type { Category, ReviewComment, ReviewLevel, ReviewSession, ReviewStep, SteerAnswer, SteerSpec } from '../../../../shared/levels/review/types'
import { fixture, steerFixture } from './fixture'

// Steer the assistant (ADR 0008, chapter 7): a request for changes is answered by Sous's commit, chosen by what the
// review's comments found: the right fix, a wrong fix for a misleading kind, nothing for a kind no wrong fix is scripted
// for, an overreach on a fine place flagged, nothing for a comment too wide or a false alarm elsewhere. The next round
// is reviewed afresh; the level is solved by approving it once nothing is left, within the round limit.

const level = steerFixture

function play(steps: readonly ReviewStep[], session = startReview(level)): ReviewSession {
  for (const step of steps) {
    const result = playReviewStep(session, level, step)
    expect(result.output.refused, JSON.stringify(step)).toBeNull()
    session = result.session
  }
  return session
}

const on = (lines: [number, number], category: Category): ReviewStep => ({ comment: 'price.js', lines, category, text: '' })
const requestChanges: ReviewStep = { submit: 'request-changes' }
const round = (session: ReviewSession) => steerRound(level, session.state.commits ?? [])
const range = ([from, to]: readonly [number, number]) => Array.from({ length: to - from + 1 }, (_, index) => from + index)

describe('a steer level', () => {
  it('starts in round 1: Sous\'s pull request, its problems as the level\'s issues, no commit', () => {
    const start = startReview(level)
    expect(start.state).toEqual({ comments: [], nextId: 1, sent: null, alarmed: [], reviews: 0, commits: [] })
    const first = round(start)
    expect(first).toMatchObject({ number: 1, open: ['raw'] })
    expect(first.view.pr).toBe(level.pr)
    expect(first.view.issues).toEqual(level.issues)
    expect(level.issues).toEqual([{ id: 'raw', path: 'price.js', lines: [4, 4], categories: ['bug'], title: 'the saving is not rounded', explanation: '2.3999999999999986 €.' }])
    expect(level.tempting).toEqual([{ path: 'price.js', lines: [3, 3], why: 'no discount means the same number: nothing to show.', id: 'strict' }])
    expect(level.goals.map(goal => [goal.id, goal.label])).toEqual([['fixed', 'Steer Sous to fix the problem (1)'], ['verdict', 'Approve it once it is right, by round 3']])
    expect(reviewNow(level, start.state)).toBe(first.view)
    // any other level is graded as it is
    expect(reviewNow(fixture, startReview(fixture).state)).toBe(fixture)
  })

  it('answers the right kind on the right line with the right fix, and the fixed pull request is approved', () => {
    const asked = play([on([4, 4], 'bug'), requestChanges])
    expect(asked).toMatchObject({ rounds: 1, falseAlarms: 0, solved: false })
    // the review moves into the commit, the next round starts empty
    expect(asked.state).toMatchObject({ comments: [], sent: null, reviews: 1, nextId: 2 })
    const [commit] = asked.state.commits!
    expect(commit!.answers).toEqual([{ comment: 1, kind: 'fix', problem: 'raw' }])
    expect(commit!.review).toMatchObject({ verdict: 'request-changes', comments: [{ id: 1, category: 'bug' }], result: { found: ['raw'] } })
    const second = round(asked)
    expect(second).toMatchObject({ number: 2, open: [] })
    expect(second.head['price.js']).toContain('text: (full - total).toFixed(2)')
    // nothing open: approving solves it, both goals at once
    const approved = submitReview(asked, level, 'approve', '')
    expect(approved.solvedNow).toBe(true)
    expect(approved.session.goalsMet).toEqual({ fixed: true, verdict: true })
    expect(approved.session.rounds).toBe(1)
  })

  it('replays the solution: one comment, the request, the approval', () => {
    const results = playReviewSolution(level)
    expect(results.at(-1)!.session).toMatchObject({ solved: true, falseAlarms: 0, rounds: 1 })
  })

  it('answers a misleading kind with a plausible wrong fix: a new problem in the next round, fixed when named right', () => {
    const misled = play([on([4, 4], 'security'), requestChanges])
    expect(misled.state.commits![0]!.answers).toEqual([{ comment: 1, kind: 'misread', problem: 'raw', misread: 0 }])
    // a misleading kind is near, not a false alarm
    expect(misled.falseAlarms).toBe(0)
    const second = round(misled)
    expect(second.open).toEqual(['escaped'])
    expect(second.head['price.js']).toContain('escape(String(full - total))')
    expect(second.view.issues[0]).toMatchObject({ id: 'escaped', lines: [4, 4] })
    // approving now is too early: a problem is left
    const early = submitReview(misled, level, 'approve', '')
    expect(early.session.solved).toBe(false)
    expect(early.output.result).toMatchObject({ verdictRight: false, missed: ['escaped'] })
    expect(early.session.goalsMet).toEqual({ fixed: false, verdict: false })
    // name it right in round 2: fixed in round 3, approved
    const fixed = play([on([4, 4], 'bug'), requestChanges], misled)
    expect(round(fixed)).toMatchObject({ number: 3, open: [] })
    const approved = submitReview(fixed, level, 'approve', '')
    expect(approved.session).toMatchObject({ solved: true, rounds: 2, falseAlarms: 0 })
  })

  it('leaves a problem as it is for a kind no wrong fix is scripted for, and for no comment', () => {
    const shrugged = play([on([4, 4], 'unclear'), requestChanges])
    expect(shrugged.state.commits![0]!.answers).toEqual([{ comment: 1, kind: 'shrug', problem: 'raw' }])
    expect(round(shrugged)).toMatchObject({ number: 2, open: ['raw'] })
    expect(round(shrugged).head).toEqual(level.pr.head)
  })

  it('"fixes" a fine place you flagged: an overreach brings a new small problem, and costs a false alarm', () => {
    const flagged = play([on([3, 3], 'bug'), on([4, 4], 'bug'), requestChanges])
    expect(flagged.state.commits![0]!.answers).toEqual([{ comment: 2, kind: 'fix', problem: 'raw' }, { comment: 1, kind: 'overreach', spot: 'strict' }])
    expect(flagged.falseAlarms).toBe(1)
    const second = round(flagged)
    expect(second.open).toEqual(['loose'])
    expect(second.head['price.js']).toContain('const hidden = total < full')
    // the fine place is gone from this round: its text changed
    expect(second.spots).toEqual([])
    // named right, put back: the fine place is there again
    const third = round(play([on([3, 3], 'bug'), requestChanges], flagged))
    expect(third).toMatchObject({ number: 3, open: [] })
    expect(third.spots.map(spot => spot.id)).toEqual(['strict'])
  })

  it('changes nothing for a false alarm elsewhere or a comment too wide to point at a line', () => {
    const vague = play([on([1, 1], 'bug'), on([4, 7], 'bug'), requestChanges])
    expect(vague.state.commits![0]!.answers).toEqual([{ comment: 1, kind: 'nothing' }, { comment: 2, kind: 'unsure' }])
    expect(round(vague)).toMatchObject({ number: 2, open: ['raw'] })
    expect(vague.falseAlarms).toBe(1)
  })

  it('takes the first comment that finds a problem; another on it says nothing more', () => {
    const twice = play([on([4, 4], 'security'), on([4, 4], 'bug'), requestChanges])
    expect(twice.state.commits![0]!.answers).toEqual([{ comment: 2, kind: 'fix', problem: 'raw' }])
    expect(round(twice).open).toEqual([])
  })

  it('refuses a request for changes without a comment: Sous changes only what a comment points at', () => {
    const start = startReview(level)
    expect(submitReview(start, level, 'request-changes', 'Fix it.').output.refused).toBe('comments')
    // an approval needs none
    expect(submitReview(start, level, 'approve', '').output.refused).toBeNull()
  })

  it('stops at the round limit: in the last round a request for changes is graded, and Sous pushes nothing more', () => {
    const third = play([on([4, 4], 'unclear'), requestChanges, on([4, 4], 'unclear'), requestChanges])
    expect(round(third).number).toBe(3)
    const last = play([on([4, 4], 'bug'), requestChanges], third)
    expect(last.state.commits).toHaveLength(2)
    expect(last.state.sent).toMatchObject({ verdict: 'request-changes', result: { found: ['raw'] } })
    expect(last.rounds).toBe(2)
    // and it can't be solved from here: approving finds the problem left
    expect(submitReview(last, level, 'approve', '').session.solved).toBe(false)
    // the last round's request found every open problem, and still meets no goal: only an approval does (review of chapter 7)
    expect(last.state.sent!.result).toMatchObject({ missed: [], solved: true })
    expect(last.goalsMet).toEqual({ fixed: false, verdict: false })
    expect(last.solved).toBe(false)
  })

  it('comments on the current round\'s lines: a line only round 2 has takes a comment there, not in round 1', () => {
    const misled = play([on([4, 4], 'security'), requestChanges])
    const draft = (session: ReviewSession, line: number) => addComment(session, level, { path: 'price.js', head: { start: line, end: line }, base: null, category: 'bug', text: '' })
    expect(draft(misled, 4).output.refused).toBeNull()
    expect(reviewTargets(level)[1]!.hunks[0]!.rows.map(row => row.text)).toContain('  return { hidden, text: String(full - total) }')
  })

  it('keeps rounds and false alarms across Reset, and starts again at round 1', () => {
    const flagged = play([on([3, 3], 'bug'), requestChanges])
    const again = restart(flagged, level)
    expect(again).toMatchObject({ rounds: 1, falseAlarms: 1 })
    expect(again.state.commits).toEqual([])
    expect(round(again).number).toBe(1)
  })

  it('names each commit with a short id, the same for the same answers', () => {
    const asked = play([on([4, 4], 'bug'), requestChanges])
    const id = commitId(level.id, asked.state.commits!)
    expect(id).toMatch(/^[0-9a-f]{7}$/)
    expect(commitId(level.id, play([on([4, 4], 'bug'), requestChanges]).state.commits!)).toBe(id)
    expect(commitId(level.id, play([on([4, 4], 'security'), requestChanges]).state.commits!)).not.toBe(id)
  })
})

describe('the steer levels (chapter 7): every path through their rounds ends in a defined state', () => {
  const steerLevels = aiLevels.filter((each): each is ReviewLevel & SteerLevel => each.steer !== undefined)

  /** Every different commit Sous can push in a round: per open problem nothing, its fix or one of its wrong fixes; per fine place with an overreach, nothing or it. */
  function commitsFrom(spec: SteerSpec, round: SteerRound): SteerAnswer[][] {
    const options: SteerAnswer[][] = [
      ...round.open.map((id) => {
        const problem = spec.problems.find(each => each.id === id)!
        return [
          { comment: 0, kind: 'fix', problem: id } as const,
          ...(problem.misread ?? []).map((_, misread) => ({ comment: 0, kind: 'misread', problem: id, misread }) as const)
        ]
      }),
      ...round.spots.filter(spot => spot.overreach).map(spot => [{ comment: 0, kind: 'overreach', spot: spot.id } as const])
    ]
    // each option may also not happen
    return options.reduce<SteerAnswer[][]>((all, choices) => all.flatMap(answers => [answers, ...choices.map(choice => [...answers, choice])]), [[]])
  }

  type Path = { answers: SteerAnswer[] }[]

  /** Every round a level can reach, once each (by its files and open problems), with the commits that lead there. */
  function reachable(level: SteerLevel): { round: SteerRound, commits: Path }[] {
    const seen = new Map<string, { round: SteerRound, commits: Path }>()
    let frontier: Path[] = [[]]
    while (frontier.length) {
      const next: Path[] = []
      for (const commits of frontier) {
        const round = steerRound(level, commits)
        const key = `${round.number}:${JSON.stringify(round.head)}:${round.open.join(',')}`
        if (seen.has(key)) continue
        seen.set(key, { round, commits })
        if (round.number < level.steer.rounds) for (const answers of commitsFrom(level.steer, round)) next.push([...commits, { answers }])
      }
      frontier = next
    }
    return [...seen.values()]
  }

  /** One comment per open problem, on its first line, with the first kind it accepts. */
  function rightComments(round: SteerRound): ReviewComment[] {
    return round.view.issues.map((issue, index) => {
      const spot = issue.lines ? { lines: [issue.lines[0], issue.lines[0]] as const } : { removed: [issue.removed![0], issue.removed![0]] as const }
      const place = placeFor(commentTargets(round.view.pr), { path: issue.path, ...spot })!
      return { id: index + 1, ...place, category: issue.categories[0]!, text: '' }
    })
  }

  it('has five scenarios and five practice tasks, each practice task right after its scenario', () => {
    expect(steerLevels.map(each => each.kind)).toEqual(['scenario', 'practice', 'scenario', 'practice', 'scenario', 'practice', 'scenario', 'practice', 'scenario', 'practice'])
  })

  it('steers every kind the track teaches, and makes bug the kind that misleads most', () => {
    const scenarios = steerLevels.filter(each => each.kind === 'scenario')
    const start = (each: SteerLevel) => each.steer.start.map(id => each.steer.problems.find(problem => problem.id === id)!)
    // the kinds that get the right fix in Sous's pull requests: chapters 1 to 6's
    const right = new Set(scenarios.flatMap(each => start(each).flatMap(problem => problem.categories)))
    for (const kind of ['bug', 'false-claim', 'missing-test', 'invented-api', 'security', 'scope'] as const) expect(right, kind).toContain(kind)
    // the reflex "bug" is the misleading kind in most of them, and each scenario has an unclear or bug comment that misleads
    expect(scenarios.filter(each => start(each).some(problem => (problem.misread ?? []).some(wrong => wrong.as.includes('bug')))).length).toBeGreaterThanOrEqual(3)
  })

  it.each(steerLevels.map(each => [each.id, each] as const))('%s: its problems and wrong fixes are well formed', (_, each) => {
    const ids = each.steer.problems.map(problem => problem.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const problem of each.steer.problems) {
      expect(problem.fix.becomes ?? [], `${problem.id}: a fix leaves nothing behind`).toEqual([])
      const misread = (problem.misread ?? []).flatMap(wrong => wrong.as)
      // a wrong fix is for a kind that doesn't fit, and each kind has one at most
      expect(misread.filter(category => problem.categories.includes(category)), problem.id).toEqual([])
      expect(new Set(misread).size, problem.id).toBe(misread.length)
      for (const wrong of problem.misread ?? []) for (const id of wrong.becomes ?? []) expect(ids, `${problem.id} becomes ${id}`).toContain(id)
    }
    for (const spot of each.steer.tempting ?? []) for (const id of spot.overreach?.becomes ?? []) expect(ids, `${spot.id} becomes ${id}`).toContain(id)
    // every round 1 problem has a scripted wrong fix, and a scenario a fine place Sous "fixes" when flagged
    for (const id of each.steer.start) expect(each.steer.problems.find(problem => problem.id === id)!.misread?.length, id).toBeGreaterThan(0)
    if (each.kind === 'scenario') expect((each.steer.tempting ?? []).some(spot => spot.overreach), 'a fine place with an overreach').toBe(true)
  })

  it.each(steerLevels.map(each => [each.id, each] as const))('%s: every round it can reach is reviewable, and the right review fixes it', (_, each) => {
    const all = reachable(each)
    expect(all.length).toBeGreaterThan(1)
    const opened = new Set<string>()
    for (const { round: now, commits } of all) {
      const where = `round ${now.number} after ${JSON.stringify(commits.map(commit => commit.answers.map(answer => 'problem' in answer ? `${answer.kind}:${answer.problem}` : answer.kind)))}`
      now.open.forEach(id => opened.add(id))
      const targets = commentTargets(now.view.pr)
      expect(targets.length, `${where}: the pull request changes something`).toBeGreaterThan(1)
      // every open problem can be commented on, line by line, and each line touches it
      for (const issue of now.view.issues) {
        for (const spot of [issue, ...(issue.also ?? [])]) {
          const lines = [
            ...(spot.lines ? range(spot.lines).map(line => ({ lines: [line, line] as const })) : []),
            ...(spot.removed ? range(spot.removed).map(line => ({ removed: [line, line] as const })) : [])
          ]
          for (const one of lines) {
            const place = placeFor(targets, { path: spot.path, ...one })
            expect(place !== null && touchesIssue(place, issue), `${where}: ${issue.id} at ${spot.path} ${JSON.stringify(one)}`).toBe(true)
          }
        }
      }
      // a fine place is one a comment can sit on, and touches no open problem
      for (const { id, spot } of now.spots) {
        const place = placeFor(targets, spot)
        expect(place, `${where}: fine place ${id}`).not.toBeNull()
        expect(now.view.issues.filter(issue => touchesIssue(place!, issue)).map(issue => issue.id), `${where}: ${id}`).toEqual([])
      }
      // with a round left, one comment per problem, of the kind it is, gets every one fixed
      if (now.number < each.steer.rounds && now.open.length) {
        const comments = rightComments(now)
        const result = checkReview(now.view, comments, 'request-changes')
        expect(result.missed, where).toEqual([])
        const next = steerRound(each, [...commits, { answers: sousAnswers(each.steer, now, comments, result) }])
        expect(next.open, where).toEqual([])
      }
    }
    // every problem the level writes can happen
    expect([...opened].sort()).toEqual(each.steer.problems.map(problem => problem.id).sort())
  })

  /**
   * Every line of each steer level's description (its paragraphs, then its claims, numbered from 1), audited by hand
   * per problem: the lines a problem makes false (review of chapter 7). A problem missing here makes nothing false.
   */
  const DESCRIPTION_BROKEN: Record<string, Record<string, number[]>> = {
    'ai-31-what-offices-save': { 'inverted-saving': [1, 2] },
    'ai-practice-fixed-not-pinned': { 'twenty-pays': [1, 2] },
    'ai-32-afternoon-deal': { 'no-check': [3], 'defined-only': [3], 'renamed-no-check': [3] },
    'ai-practice-a-real-check': { 'truthy': [2], 'lost-zero': [3] },
    'ai-33-undo-last-add': { 'no-last': [1, 2], 'swallowed': [1, 2] },
    'ai-practice-not-a-fallback': { 'sum-by': [1, 2], 'always-zero': [1, 2] },
    'ai-34-order-by-email': { 'mail-key': [3], 'split-key': [3], 'commented-key': [3], 'strict-email': [2] },
    'ai-practice-not-a-filter': { 'note-html': [3], 'filtered': [3] },
    'ai-35-raise-free-delivery': { 'above-25': [2], 'above-25-explained': [2], 'back-to-20': [1, 2, 3] },
    'ai-practice-take-it-out': { 'sorted': [3], 'sorted-kept': [3] }
  }

  it.each(steerLevels.map(each => [each.id, each] as const))('%s grades every line of its description in every round by what is open then', (_, each) => {
    const audit = DESCRIPTION_BROKEN[each.id]
    expect(audit, 'audited in DESCRIPTION_BROKEN').toBeDefined()
    // the problems name exactly the lines the audit says they make false
    for (const problem of each.steer.problems) {
      const named = [...(problem.says ?? []).map(index => index + 1), ...(problem.breaks ?? []).map(index => each.pr.description.length + index + 1)].sort((a, b) => a - b)
      expect(named, problem.id).toEqual(audit![problem.id] ?? [])
      if (named.length) expect(problem.categories, problem.id).toContain('false-claim')
    }
    const lines = each.pr.description.length + each.pr.claims.length
    for (const { round: now } of reachable(each)) {
      for (let line = 1; line <= lines; line++) {
        const breaking = now.open.filter(id => (audit![id] ?? []).includes(line))
        const place = placeFor(commentTargets(now.view.pr), { path: DESCRIPTION_PATH, lines: [line, line] })!
        const feedback = checkReview(now.view, [{ id: 1, ...place, category: 'false-claim', text: '' }], now.view.verdict).feedback[0]!
        const where = `round ${now.number} with ${now.open.join(', ') || 'nothing'} open, line ${line}`
        if (breaking.length) expect(feedback, where).toMatchObject({ found: breaking, falseAlarm: false })
        else expect(feedback, where).toMatchObject({ found: [], near: [], wide: [], falseAlarm: true })
      }
    }
  })

  it('makes 7.4\'s right fix a route that sends the mail: products from the database, awaited, and an unknown one refused', () => {
    const level = steerLevels.find(each => each.id === 'ai-34-order-by-email')!
    const fixed = steerRound(level, [{ answers: [{ comment: 1, kind: 'fix', problem: 'mail-key' }] }])
    expect(fixed.open).toEqual([])
    const route = fixed.head['server/confirm-routes.js']!
    expect(route).toContain('const product = await db.products.find(item.id)')
    expect(route).toContain('if (!product) return res.status(400)')
    expect(route).toContain('process.env.MAILCRATE_KEY')
    expect(fixed.head['confirm.js']).not.toContain('mk_live_')
  })

  it.each(steerLevels.map(each => [each.id, each] as const))('%s: a misleading kind on the right line gets a wrong fix, never the right one', (_, each) => {
    const first = steerRound(each, [])
    const right = rightComments(first)
    first.open.forEach((id, at) => {
      const problem = each.steer.problems.find(one => one.id === id)!
      for (const [index, misread] of (problem.misread ?? []).entries()) {
        for (const category of misread.as) {
          const comment = { ...right[at]!, category }
          const result = checkReview(first.view, [comment], 'request-changes')
          expect(result.feedback[0], `${id} as ${category}`).toMatchObject({ found: [], near: [id], falseAlarm: false })
          const answers = sousAnswers(each.steer, first, [comment], result)
          expect(answers, `${id} as ${category}`).toEqual([{ comment: comment.id, kind: 'misread', problem: id, misread: index }])
          // and the next round still has a problem
          expect(steerRound(each, [{ answers }]).open.length, `${id} as ${category}`).toBeGreaterThan(0)
        }
      }
    })
  })

  // the blankets of levels.test.ts, steered: comments of one or two kinds tiling every hunk and the description, in
  // every round there is, then the approval. A blanket finds problems by chance and gets fixes for them; it never
  // solves a level without false alarms
  const KINDS: Category[][] = [['bug'], ['false-claim'], ['missing-test'], ['invented-api'], ['security'], ['scope'], ['unclear'], ['bug', 'scope'], ['bug', 'security'], ['missing-test', 'invented-api'], ['bug', 'false-claim']]
  function blanket(session: ReviewSession, each: ReviewLevel, size: number, kinds: readonly Category[]): ReviewSession {
    for (const file of commentTargets(reviewNow(each, session.state).pr)) {
      file.hunks.forEach((hunk, index) => {
        for (let from = 0; from < hunk.rows.length; from += size) {
          const place = placeOf(file, index, from, Math.min(from + size, hunk.rows.length) - 1)!
          for (const category of kinds) session = addComment(session, each, { ...place, category, text: '' }).session
        }
      })
    }
    return session
  }

  it.each(steerLevels.map(each => [each.id, each] as const))('%s is never solved for free by blanket reviews, round after round', (_, each) => {
    for (const kinds of KINDS) {
      for (const size of [1, 2, 3, 6, 12]) {
        let session = startReview(each)
        for (let number = 1; number < each.steer.rounds; number++) {
          session = submitReview(blanket(session, each, size, kinds), each, 'request-changes', '').session
          const approved = submitReview(session, each, 'approve', '').session
          if (approved.solved) expect(approved.falseAlarms, `${kinds.join('+')}, size ${size}, round ${number + 1}`).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })
})

describe('the round model\'s helpers', () => {
  it('finds a text\'s lines only when it is in the file once', () => {
    expect(linesOf('a\nb\nc\n', 'b', 'x')).toEqual([2, 2])
    expect(linesOf('a\nb\nc\n', 'b\nc\n', 'x')).toEqual([2, 3])
    expect(() => linesOf('a\na\n', 'a', 'x')).toThrow(/exactly once/)
    expect(() => linesOf('a\n', 'z', 'x')).toThrow(/exactly once/)
    expect(() => linesOf(undefined, 'a', 'x')).toThrow()
  })

  it('applies edits: a replace (it must apply), a file put back as main has it or taken out', () => {
    const base = { 'a.js': 'one\n' }
    const head = { 'a.js': 'two\n', 'b.js': 'new\n' }
    expect(applyEdits(base, head, [{ path: 'a.js', replace: ['two', 'three'] }])).toEqual({ 'a.js': 'three\n', 'b.js': 'new\n' })
    expect(applyEdits(base, head, [{ path: 'a.js', revert: true }, { path: 'b.js', revert: true }])).toEqual({ 'a.js': 'one\n' })
    expect(() => applyEdits(base, head, [{ path: 'a.js', replace: ['nope', 'x'] }])).toThrow()
  })
})
