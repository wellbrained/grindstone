import { describe, expect, it } from 'vitest'
import { aiLevels, emptyProgress, levelById, sandboxDocument, trackById } from '../../../shared/levels'
import type { ReviewLevel } from '../../../shared/levels'
import { highlightLines } from '../../../app/utils/review-highlight'
import { runLevel } from '../../../app/utils/review-run'
import { issuePlaces, placeShort, placeText } from '../../../app/utils/review-view'
import { taskKindOf, trackView } from '../../../app/utils/track-view'

// The review page's helpers: how a comment's place is named, the pull request as an app to run, the syntax colours of
// the diff, and the track page's tags for Working with AI.

const t = (key: string, named: Record<string, unknown>) => `${key} ${JSON.stringify(named)}`

describe('where a comment sits, in words', () => {
  it('names head lines first, removed lines when there are only those', () => {
    expect(placeText(t, { path: 'a.js', head: { start: 4, end: 4 }, base: { start: 3, end: 3 } })).toBe('review.place.line {"line":4}')
    expect(placeText(t, { path: 'a.js', head: { start: 10, end: 13 }, base: null })).toBe('review.place.lines {"from":10,"to":13}')
    expect(placeText(t, { path: 'a.js', head: null, base: { start: 9, end: 9 } })).toBe('review.place.removed {"line":9}')
    expect(placeText(t, { path: 'a.js', head: null, base: { start: 9, end: 10 } })).toBe('review.place.removeds {"from":9,"to":10}')
    expect(placeText(t, { path: 'a.js', head: null, base: null })).toBe('')
  })

  it('writes a short label like a link', () => {
    expect(placeShort({ path: 'cart.js', head: { start: 37, end: 37 }, base: null })).toBe('cart.js:37')
    expect(placeShort({ path: 'summary.js', head: { start: 10, end: 13 }, base: { start: 8, end: 9 } })).toBe('summary.js:10–13')
    expect(placeShort({ path: 'cart.js', head: null, base: { start: 9, end: 10 } })).toBe('cart.js:−9–10')
  })

  it('lists an issue\'s places in the page\'s order: the description first, then the files, each by line', () => {
    const issue = { path: 'cart.js', lines: [19, 19] as const, also: [{ path: 'description', lines: [2, 2] as const }, { path: 'description', lines: [1, 1] as const }, { path: 'app.js', removed: [4, 4] as const }] }
    expect(issuePlaces(issue)).toEqual(['description:1', 'description:2', 'app.js:−4', 'cart.js:19'])
    expect(issuePlaces({ path: 'cart.js', lines: [37, 37] })).toEqual(['cart.js:37'])
  })

  it('names a place on Sous\'s description as lines of the description', () => {
    expect(placeText(t, { path: 'description', head: { start: 3, end: 3 }, base: { start: 3, end: 3 } })).toBe('review.place.descriptionLine {"line":3}')
    expect(placeText(t, { path: 'description', head: { start: 2, end: 4 }, base: { start: 2, end: 4 } })).toBe('review.place.descriptionLines {"from":2,"to":4}')
    expect(placeShort({ path: 'description', head: { start: 3, end: 3 }, base: { start: 3, end: 3 } })).toBe('description:3')
  })
})

describe('Run the PR', () => {
  const level = levelById('ai-01-twelve-croissants') as ReviewLevel

  it('makes a Debugging app of either side: no probes, no goals, the page and files of the pull request', () => {
    const head = runLevel(level, 'head')!
    const base = runLevel(level, 'base')!
    expect(head).toMatchObject({ track: 'debugging', id: 'ai-01-twelve-croissants--run-head', goals: [], sandbox: { page: '/order', open: 'cart.js', probes: [] } })
    expect(head.setup().files).toEqual(level.pr.head)
    expect(base.setup().files).toEqual(level.pr.base)
    // a copy: running never changes the level
    expect(head.setup().files).not.toBe(level.pr.head)
  })

  it('runs every scenario (the sandbox takes its files) and nothing for a practice task without a page', () => {
    for (const each of aiLevels) {
      const app = runLevel(each, 'head')
      if (each.kind === 'scenario') {
        expect(app, each.id).not.toBeNull()
        expect(sandboxDocument(app!.setup().files, { token: 'tok' }).html).toContain('Corner Bakery')
      }
    }
    expect(runLevel(levelById('ai-practice-same-loop') as ReviewLevel, 'head')).toBeNull()
  })
})

describe('syntax colours of the diff', () => {
  it('cuts a file into lines of tokens whose text is the line', async () => {
    const text = 'export const MAX = 12 // most\nfunction f(id) {\n  return \'x\'\n}\n'
    const lines = (await highlightLines('cart.js', text))!
    expect(lines.slice(0, 4).map(line => line.map(token => token.text).join(''))).toEqual(text.split('\n').slice(0, 4))
    const classOf = (line: number, piece: string) => lines[line]!.find(token => token.text === piece)?.cls
    expect(classOf(0, 'export')).toBe('text-secondary')
    expect(classOf(0, '12')).toBe('text-warning')
    expect(classOf(0, '// most')).toBe('text-dimmed italic')
    expect(classOf(2, '\'x\'')).toBe('text-success')
  })

  it('reads CSS and HTML too, and leaves other files plain', async () => {
    expect((await highlightLines('style.css', '.add {\n  color: red;\n}\n'))![1]!.map(token => token.text).join('')).toBe('  color: red;')
    expect((await highlightLines('index.html', '<p class="x">Hi</p>\n'))![0]!.map(token => token.text).join('')).toBe('<p class="x">Hi</p>')
    expect(await highlightLines('api.md', '# API\n')).toBeNull()
  })
})

describe('the track page of Working with AI', () => {
  it('tags a scenario with what it teaches and a practice task with its kind', () => {
    const view = trackView(trackById('ai')!, emptyProgress())
    const rows = view.chapters[0]!.rows
    expect(rows.map(row => row.teaches ?? row.taskKind)).toEqual([
      'off-by-one', 'spot', 'verdict',
      'wrong variable', 'spot', 'verdict',
      'inverted condition', 'spot', 'verdict',
      'missing case', 'spot', 'verdict',
      'units', 'spot', 'verdict'
    ])
    expect(view.chapters[1]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual([
      'empty case', 'spot', 'verdict',
      'refactor', 'spot', 'verdict',
      'test report', 'spot', 'verdict',
      'linked issue', 'spot', 'verdict',
      'stale cache', 'spot', 'verdict'
    ])
    expect(view.chapters[2]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual([
      'no assertion', 'spot', 'verdict',
      'mocked', 'spot', 'verdict',
      'test bent to the bug', 'spot', 'verdict',
      'untested edge', 'spot', 'verdict',
      'snapshot', 'spot', 'verdict'
    ])
    expect(view.chapters[3]!.rows.map(row => row.teaches ?? row.taskKind)).toEqual([
      'invented method', 'spot', 'verdict',
      'ignored option', 'spot', 'verdict',
      'invented import', 'spot', 'verdict',
      'removed API', 'spot', 'verdict',
      'made-up package', 'spot', 'verdict'
    ])
    expect(view.chapters.map(chapter => chapter.coming)).toEqual([false, false, false, false, true, true, true])
    expect(taskKindOf(levelById('debugging-practice-line-that-throws')!)).toBe('find')
    expect(taskKindOf(levelById('git-01-first-commit')!)).toBeNull()
  })
})
