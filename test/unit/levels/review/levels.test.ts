import { describe, expect, it } from 'vitest'
import { CATEGORIES, addComment, aiLevels, aiTrack, checkReview, isReviewLevel, placeFor, placeOf, playReviewSolution, playReviewStep, reviewDiff, startReview, submitReview, touchesIssue } from '../../../../shared/levels'
import type { ReviewLevel, ReviewSession, ReviewStep, Spot, Verdict } from '../../../../shared/levels'

// Every Working with AI level (ADR 0008): its shape, where its planted issues and tempting spots sit in the diff, a
// start that solves nothing, its solution replayed, and the reviews that must not solve it (the right comments with the
// wrong verdict, only false alarms); every hint points at real content.

const other = (verdict: Verdict): Verdict => verdict === 'approve' ? 'request-changes' : 'approve'
const summaryFor = (level: ReviewLevel) => level.reason ? 'A one-line reason.' : ''

/** The session after a list of steps; every step must apply. */
function played(level: ReviewLevel, steps: readonly ReviewStep[]): ReviewSession {
  let session = startReview(level)
  for (const step of steps) {
    const result = playReviewStep(session, level, step)
    expect(result.output.refused, `${level.id}: ${JSON.stringify(step)}`).toBeNull()
    session = result.session
  }
  return session
}

const range = ([from, to]: readonly [number, number]) => Array.from({ length: to - from + 1 }, (_, index) => from + index)
const comments = (level: ReviewLevel) => level.solution.filter(step => !('submit' in step))
const lineCount = (text: string | undefined) => text === undefined ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

/** Lines the hints point at, with what is there (after the pull request): a hint may only name a line that says what it claims. */
const POINTED_AT: Record<string, [path: string, line: number, contains: string][]> = {
  'ai-01-twelve-croissants': [['cart.js', 37, 'line.quantity < MAX_PER_PRODUCT - 1']],
  'ai-02-line-totals': [['summary.js', 13, 'line.price * count'], ['summary.js', 10, 'const count = itemCount()']],
  'ai-03-free-coffee': [['summary.js', 14, 'coffee.hidden = total >= FREE_COFFEE_FROM']],
  'ai-04-pickup-locker': [['delivery.js', 9, 'switch (method) {'], ['delivery.js', 14, '  }']],
  'ai-05-office-discount': [['discount.js', 8, 'total * (1 - BULK_DISCOUNT)'], ['discount.js', 9, 'Math.round(discounted)']]
}

/** Code quoted in a hint that is worked out, not written anywhere in the pull request ("`11 < MAX_PER_PRODUCT - 1`"). */
const COMPUTED: Record<string, string[]> = {
  'ai-01-twelve-croissants': ['11 < MAX_PER_PRODUCT - 1'],
  'ai-03-free-coffee': ['total < FREE_COFFEE_FROM'],
  'ai-04-pickup-locker': ['deliveryFee(\'locker\')', 'case \'locker\'', 'undefined', 'NaN'],
  'ai-05-office-discount': ['1 - BULK_DISCOUNT', '1 - 10'],
  'ai-practice-open-days': ['slice(start, end)', 'start', 'end'],
  'ai-practice-medium-coffee': ['\'medium\'', 'EXTRA[\'medium\']'],
  'ai-practice-ten-cents': ['Math.round(amount * 10) / 10']
}

describe('the Working with AI levels', () => {
  it('are fifteen in chapter 1, with unique ids, in the track\'s id forms', () => {
    expect(aiLevels).toHaveLength(15)
    expect(new Set(aiLevels.map(level => level.id)).size).toBe(15)
    for (const level of aiLevels) {
      expect(level.id).toMatch(level.kind === 'scenario' ? /^ai-\d{2}-[a-z-]+$/ : /^ai-practice-[a-z-]+$/)
    }
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s has the shape of its kind', (_, level) => {
    expect(level.track).toBe('ai')
    expect(level.hints).toHaveLength(level.kind === 'scenario' ? 3 : 1)
    expect(level.verdict).toBe(level.issues.length ? 'request-changes' : 'approve')
    if (level.kind === 'scenario') {
      expect(level.issues.length).toBeGreaterThan(0)
      expect(level.debrief.paragraphs.length).toBeGreaterThanOrEqual(2)
      expect(level.run, 'a scenario can run in the sandbox').toBeDefined()
      expect(level.teaches).toBeTruthy()
      expect(level.reason).toBeUndefined()
      expect(level.goals.map(goal => goal.id)).toEqual(['found', 'verdict'])
    } else {
      expect(level.minutes).toBe(0.5)
      expect(level.why).not.toBe('')
      expect(level.goals.map(goal => goal.id)).toEqual(level.reason ? ['verdict'] : ['found', 'verdict'])
      // spot it: one problem, one comment
      if (!level.reason) expect(level.issues).toHaveLength(1)
    }
    expect(new Set(level.issues.map(issue => issue.id)).size).toBe(level.issues.length)
    for (const issue of level.issues) {
      expect(issue.categories.length).toBeGreaterThan(0)
      expect(issue.categories.every(category => CATEGORIES.includes(category))).toBe(true)
      expect(issue.title).not.toBe('')
      expect(issue.explanation).not.toBe('')
    }
    // Sous's texts are plain text: no markup, no vue-i18n syntax
    const texts = [level.pr.title, ...level.pr.description, ...level.pr.claims, ...level.hints, ...level.issues.flatMap(issue => [issue.title, issue.explanation]), ...(level.tempting ?? []).map(spot => spot.why)]
    for (const text of texts) expect(text).not.toMatch(/<\/?[a-z][^>]*>|[{}|@]/i)
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s plants its issues where a comment can sit, on the side they are on', (_, level) => {
    const diff = reviewDiff(level)
    expect(diff.length).toBeGreaterThan(0)
    const rowsOf = (path: string) => diff.find(file => file.path === path)?.hunks.flatMap(hunk => hunk.rows) ?? []
    /** A comment on each single line of a spot: every one must be a place a comment can have. */
    const singleLines = (spot: Spot) => [
      ...(spot.lines ? range(spot.lines).map(line => placeFor(diff, { path: spot.path, lines: [line, line] })) : []),
      ...(spot.removed ? range(spot.removed).map(line => placeFor(diff, { path: spot.path, removed: [line, line] })) : [])
    ]
    for (const issue of level.issues) {
      for (const spot of [issue, ...(issue.also ?? [])]) {
        // a removed spot is on removed rows, a head spot on lines the diff shows
        for (const line of spot.removed ? range(spot.removed) : []) expect(rowsOf(spot.path).find(row => row.old === line)?.kind, `${spot.path} removed ${line}`).toBe('del')
        for (const line of spot.lines ? range(spot.lines) : []) expect(rowsOf(spot.path).some(row => row.new === line), `${spot.path}:${line}`).toBe(true)
        expect(singleLines(spot).every(place => place !== null && touchesIssue(place, issue)), `${issue.id} at ${JSON.stringify(spot)}`).toBe(true)
      }
    }
    for (const spot of level.tempting ?? []) {
      const places = singleLines(spot)
      expect(places.every(place => place !== null), `tempting ${JSON.stringify(spot)}`).toBe(true)
      // a tempting spot is a false alarm: a comment on any of its lines touches no planted issue
      expect(places.flatMap(place => level.issues.filter(issue => touchesIssue(place!, issue)).map(issue => issue.id))).toEqual([])
      expect(spot.why).not.toBe('')
    }
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s is not solved by the starting review, with either verdict', (_, level) => {
    const session = startReview(level)
    expect(Object.values(session.goalsMet).some(Boolean)).toBe(false)
    for (const verdict of ['approve', 'request-changes'] as const) {
      const sent = submitReview(session, level, verdict, '')
      expect(sent.session.solved, verdict).toBe(false)
      expect(sent.solvedNow).toBe(false)
    }
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s is solved by its solution, with no false alarm', (_, level) => {
    const results = playReviewSolution(level)
    expect(results.every(result => result.output.refused === null)).toBe(true)
    expect(results.at(-1)!.solvedNow).toBe(true)
    expect(results.slice(0, -1).some(result => result.solvedNow)).toBe(false)
    expect(results.at(-1)!.session).toMatchObject({ solved: true, falseAlarms: 0 })
    expect(level.solution.at(-1)).toMatchObject({ submit: level.verdict })
    // one comment per planted issue at most: the solution shows the short way
    expect(comments(level).length).toBe(level.issues.length)
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s is not solved by every issue found with the wrong verdict', (_, level) => {
    const session = played(level, comments(level))
    const sent = submitReview(session, level, other(level.verdict), summaryFor(level))
    expect(sent.output.result).toMatchObject({ missed: [], verdictRight: false })
    expect(sent.session.solved).toBe(false)
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s is not solved by a review with only false alarms', (_, level) => {
    // a comment on every row of the diff that touches no planted issue
    const diff = reviewDiff(level)
    const alarms = diff.flatMap(file => file.hunks.flatMap((hunk, index) => hunk.rows.flatMap((row, at) => {
      const place = placeFor(diff, { path: file.path, ...(row.new !== null ? { lines: [row.new, row.new] as const } : { removed: [row.old!, row.old!] as const }) })
      return place && !level.issues.some(issue => touchesIssue(place, issue)) ? [{ place, key: `${index}:${at}` }] : []
    })))
    expect(alarms.length, 'there is somewhere to raise a false alarm').toBeGreaterThan(0)
    let session = startReview(level)
    for (const { place } of alarms.slice(0, 3)) {
      for (const category of ['bug', 'unclear'] as const) {
        const result = playReviewStep(session, level, { comment: place.path, lines: place.head ? [place.head.start, place.head.end] : undefined, removed: place.base ? [place.base.start, place.base.end] : undefined, category, text: '' })
        session = result.session
      }
    }
    for (const verdict of ['approve', 'request-changes'] as const) {
      const sent = submitReview(session, level, verdict, summaryFor(level))
      expect(sent.session.solved, verdict).toBe(false)
      expect(sent.output.result!.falseAlarms).toBe(session.state.comments.length)
    }
    // and the false alarms on top of the solution's comments don't take a solve away (they cost the best run)
    const withSolution = played(level, comments(level))
    const extra = playReviewStep(withSolution, level, { comment: alarms[0]!.place.path, lines: alarms[0]!.place.head ? [alarms[0]!.place.head.start, alarms[0]!.place.head.end] : undefined, removed: alarms[0]!.place.base ? [alarms[0]!.place.base.start, alarms[0]!.place.base.end] : undefined, category: 'bug', text: '' }).session
    const result = checkReview(level, extra.state.comments, level.verdict)
    // an approval with a comment flags a problem: only a request for changes keeps its solve
    expect(result.solved).toBe(level.verdict === 'request-changes')
  })

  // the blanket review (ADR 0008, review of 2026-11-14): comments of `size` rows tiling every hunk, each of the kind bug,
  // whatever is in them; `aligned`: the last one ends at the hunk's end, so every comment is full size (a hunk shorter
  // than `size` gets one comment over all of it); else the last one is what is left
  function blanket(level: ReviewLevel, size: number, aligned: boolean): ReviewSession {
    let session = startReview(level)
    for (const file of reviewDiff(level)) {
      file.hunks.forEach((hunk, index) => {
        for (let from = 0; from < hunk.rows.length; from += size) {
          const start = aligned ? Math.max(0, Math.min(from, hunk.rows.length - size)) : from
          const place = placeOf(file, index, start, Math.min(start + size, hunk.rows.length) - 1)!
          session = addComment(session, level, { ...place, category: 'bug', text: '' }).session
        }
      })
    }
    return session
  }

  it.each(aiLevels.map(level => [level.id, level] as const))('%s is not solved by a blanket review of 12-row comments over every hunk', (_, level) => {
    for (const size of [12, 10]) {
      const session = blanket(level, size, true)
      expect(session.state.comments.length).toBeGreaterThan(0)
      for (const verdict of ['request-changes', 'approve'] as const) {
        expect(submitReview(session, level, verdict, 'A reason.').session.solved, `${size} rows, ${verdict}`).toBe(false)
      }
    }
  })

  it.each(aiLevels.filter(level => level.kind === 'scenario').map(level => [level.id, level] as const))('%s never comes free to a blanket of smaller comments', (_, level) => {
    // small enough, a blanket finds the issues by chance; in a scenario it always costs false alarms on the way (a
    // practice task's whole diff is a handful of lines: two small comments over it are close to reading it)
    for (let size = 1; size <= 12; size++) {
      for (const aligned of [false, true]) {
        const sent = submitReview(blanket(level, size, aligned), level, 'request-changes', 'A reason.')
        if (sent.session.solved) expect(sent.session.falseAlarms, `size ${size}, aligned: ${aligned}`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('keeps the category from being decorative after chapter 1: there, not every issue accepts bug', () => {
    // Read the diff is about plain bugs, so every issue there accepts `bug` (ADR 0008); a later chapter's issues are
    // claims, tests, invented APIs, security and scope, and a chapter whose every issue took `bug` would grade nothing
    for (const chapter of aiTrack.chapters.filter(each => each.id !== 'read-the-diff')) {
      const issues = chapter.levels.filter(isReviewLevel).flatMap(level => level.issues)
      if (issues.length) expect(issues.some(issue => !issue.categories.includes('bug')), chapter.id).toBe(true)
    }
    expect(aiTrack.chapters[0]!.levels.filter(isReviewLevel).flatMap(level => level.issues).every(issue => issue.categories.includes('bug'))).toBe(true)
  })

  it.each(aiLevels.map(level => [level.id, level] as const))('%s points its hints at real content', (_, level) => {
    const shownRows = reviewDiff(level).flatMap(file => file.hunks.flatMap(hunk => hunk.rows.map(row => row.text)))
    const prText = [level.pr.title, ...level.pr.description, ...level.pr.claims].join('\n')
    for (const hint of level.hints) {
      // `cart.js:37`: a file of the pull request, and a line it has (after the pull request)
      for (const [, path, line] of hint.matchAll(/([\w-]+\.(?:js|css|html|md)):(\d+)/g)) {
        expect(Object.hasOwn(level.pr.head, path!), `${path} in ${level.id}`).toBe(true)
        expect(Number(line)).toBeLessThanOrEqual(lineCount(level.pr.head[path!]))
        expect(POINTED_AT[level.id]?.some(([p, l]) => p === path && l === Number(line)), `${path}:${line} is in POINTED_AT`).toBe(true)
      }
      // quoted code is in what the page shows: a row of the diff or the pull request's text, unless it is worked out
      for (const [, code] of hint.matchAll(/`([^`]+)`/g)) {
        const shown = shownRows.some(text => text.includes(code!)) || prText.includes(code!) || /^[\w-]+\.(?:js|css|html|md)(?::\d+)?$/.test(code!)
        expect(shown || COMPUTED[level.id]?.includes(code!), `${level.id}: \`${code}\` is not in the diff`).toBe(true)
      }
    }
    for (const [path, line, contains] of POINTED_AT[level.id] ?? []) {
      expect(level.pr.head[path]?.split('\n')[line - 1], `${path}:${line}`).toContain(contains)
      // and the diff shows that line
      expect(reviewDiff(level).find(file => file.path === path)?.hunks.some(hunk => hunk.rows.some(row => row.new === line)), `${path}:${line} in the diff`).toBe(true)
    }
  })
})
