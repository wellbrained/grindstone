import { describe, expect, it } from 'vitest'
import { fittingProfile, functionRows, needsCounting, profileLines, profileSummary, readProfile, renderRows, requestRows, timelineEnd, withUncounted } from '../../../../shared/levels/debugging/profile'
import type { ProfileMap } from '../../../../shared/levels/debugging/profile'
import { meets, probesGoal } from '../../../../shared/levels/debugging/checks'
import { readBridgeMessage } from '../../../../shared/levels/debugging/messages'
import { PROFILE_LIMITS } from '../../../../shared/levels/debugging/recorder'
import type { NetworkEntry } from '../../../../shared/levels/debugging/network'
import type { Observation } from '../../../../shared/levels'

// A recorded profile (chapter 6, ADR 0007 "Performance"): what the counting recorder posts at Stop, read on the page's
// side (anything malformed is dropped whole), and the Performance panel's tables: functions by their work, renders with
// the lines that changed the page, and the requests on the server's clock, a waterfall and a repeat told apart.

const MAP: ProfileMap = {
  functions: [
    { name: '(anonymous)', path: 'app.js', line: 1, module: true },
    { name: 'renderMenu', path: 'menu.js', line: 4 },
    { name: 'formatPrice', path: 'money.js', line: 2 },
    { name: 'renderBasket', path: 'basket.js', line: 6 }
  ],
  points: [
    { path: 'app.js', line: 3, column: 1, fn: 0, scopes: [] },
    { path: 'menu.js', line: 9, column: 3, fn: 1, scopes: [] },
    { path: 'menu.js', line: 11, column: 3, fn: 1, scopes: [] },
    { path: 'basket.js', line: 8, column: 3, fn: 3, scopes: [] }
  ]
}

/** The raw message the recorder posts: a load that loads the menu, then a click on Add that renders everything again. */
const RAW = {
  type: 'profile',
  reason: 'stopped',
  work: 1300,
  actions: [
    { kind: 'load', target: '', label: '', at: 0, work: 800, more: 0, fns: [[0, 1, 20, 800], [1, 1, 180, 780], [2, 24, 600, 600]], dom: [[1, 1, 48]], renders: [[1, 1, 48]], requests: [1, 2, 3] },
    { kind: 'click', target: 'button.add', label: 'Add', at: 700, work: 500, more: 0, fns: [[1, 1, 160, 480], [2, 24, 320, 320], [3, 1, 20, 20]], dom: [[1, 1, 48], [2, 1, 2], [3, 2, 3]], renders: [[1, 1, 50], [3, 1, 3]], requests: [4] }
  ],
  requests: [[1, 0, 400], [2, 400, 700], [3, 400, 600], [4, 700, -1]]
}

const entry = (id: number, method: string, path: string, line: number, body: string | null = null): NetworkEntry => ({
  id,
  method,
  url: `https://cornerbakery.shop${path}`,
  name: path.split('/').at(-1)!,
  requestHeaders: [],
  requestBody: body,
  initiator: { path: 'load.js', line },
  response: null
})
const ENTRIES = [entry(1, 'GET', '/api/menu', 4), entry(2, 'GET', '/api/specials', 5), entry(3, 'GET', '/api/hours', 6), entry(4, 'GET', '/api/menu', 4)]

const profile = () => readProfile(RAW)!

describe('readProfile', () => {
  it('reads a well-formed profile as plain data', () => {
    const read = profile()
    expect(read).toMatchObject({ ended: 'stopped', work: 1300 })
    expect(read.actions[1]).toMatchObject({ kind: 'click', target: 'button.add', label: 'Add', at: 700, work: 500, requests: [4] })
    expect(read.actions[0]!.fns[2]).toEqual({ fn: 2, calls: 24, self: 600, total: 600 })
    expect(read.actions[1]!.dom[2]).toEqual({ point: 3, updates: 2, nodes: 3 })
    expect(read.actions[1]!.renders[0]).toEqual({ fn: 1, renders: 1, nodes: 50 })
    expect(read.requests.at(-1)).toEqual({ id: 4, start: 700, end: null })
    // through the bridge's reader, with this load's token
    expect(readBridgeMessage(RAW)).toEqual({ type: 'profile', profile: read })
    expect(readBridgeMessage({ type: 'profileTick', work: 1024, actions: 2 })).toEqual({ type: 'profileTick', work: 1024, actions: 2 })
  })

  it('cuts long texts', () => {
    const long = readProfile({ ...RAW, actions: [{ ...RAW.actions[0], label: 'x'.repeat(500), target: 'y'.repeat(500) }] })!
    expect(long.actions[0]!.label).toHaveLength(60)
    expect(long.actions[0]!.target).toHaveLength(120)
  })

  it('drops a malformed profile whole, and never throws on hostile input', () => {
    const broken: unknown[] = [
      { ...RAW, reason: 'paused' },
      { ...RAW, work: -1 },
      { ...RAW, work: 1.5 },
      { ...RAW, actions: 'many' },
      { ...RAW, actions: [{ ...RAW.actions[0], kind: 'hover' }] },
      { ...RAW, actions: [{ ...RAW.actions[0], fns: [[1, 2, 3]] }] },
      { ...RAW, actions: [{ ...RAW.actions[0], fns: [[1, 2, 3, '4']] }] },
      { ...RAW, actions: [{ ...RAW.actions[0], dom: [[1, 2, Number.NaN]] }] },
      { ...RAW, actions: [{ ...RAW.actions[0], renders: [[1, 2, 1e12]] }] },
      { ...RAW, actions: [{ ...RAW.actions[0], requests: ['1'] }] },
      { ...RAW, actions: [{ ...RAW.actions[0], label: 5 }] },
      { ...RAW, actions: [null] },
      { ...RAW, requests: [[1, 0]] },
      { ...RAW, requests: [[1, 0, -2]] },
      { ...RAW, actions: Array.from({ length: PROFILE_LIMITS.maxActions + 1 }, () => RAW.actions[0]) },
      { ...RAW, actions: [{ ...RAW.actions[0], fns: Array.from({ length: PROFILE_LIMITS.maxRows + 1 }, (_, i) => [i, 1, 1, 1]) }] },
      { ...RAW, requests: Array.from({ length: PROFILE_LIMITS.maxRequests + 1 }, (_, i) => [i, 0, 1]) }
    ]
    for (const raw of broken) expect(readProfile(raw as Record<string, unknown>), JSON.stringify(raw).slice(0, 80)).toBeNull()
    expect(readBridgeMessage({ type: 'profileTick', work: -1, actions: 1 })).toBeNull()
    expect(readBridgeMessage({ type: 'profile' })).toBeNull()
  })

  it('refuses a request id sent twice or more ids than the recorder keeps, quickly; the largest real profile stays quick to show', () => {
    const forged = { ...RAW, actions: Array.from({ length: PROFILE_LIMITS.maxActions }, () => ({ ...RAW.actions[0], requests: Array.from({ length: PROFILE_LIMITS.maxRequests }, () => 1) })) }
    let started = performance.now()
    expect(readProfile(forged)).toBeNull()
    expect(readProfile({ ...RAW, actions: [{ ...RAW.actions[0], requests: [1, 2] }, { ...RAW.actions[1], requests: [2] }] })).toBeNull()
    expect(readProfile({ ...RAW, requests: [[1, 0, 400], [1, 0, 400]] })).toBeNull()
    const many = Array.from({ length: PROFILE_LIMITS.maxActions }, (_, action) => ({ ...RAW.actions[0], requests: [action * 2 + 1, action * 2 + 2] }))
    expect(readProfile({ ...RAW, actions: [...many, { ...RAW.actions[0], requests: [999] }] })).toBeNull()
    expect(performance.now() - started).toBeLessThan(200)
    // the most a recorder posts: every request the same address (each one a repeat), on one clock
    const largest = readProfile({ ...RAW, actions: many, requests: Array.from({ length: PROFILE_LIMITS.maxRequests }, (_, i) => [i + 1, i * 10, i * 10 + 10]) })!
    const entries = Array.from({ length: PROFILE_LIMITS.maxRequests }, (_, i) => entry(i + 1, 'GET', '/api/menu', 4))
    started = performance.now()
    expect(requestRows(largest, entries, null)).toHaveLength(PROFILE_LIMITS.maxRequests)
    expect(profileSummary(largest, entries, null).requests).toBe(PROFILE_LIMITS.maxRequests)
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('keeps only rows that fit the counted code', () => {
    const odd = readProfile({ ...RAW, actions: [{ ...RAW.actions[0], fns: [[0, 1, 1, 1], [9, 1, 1, 1]], dom: [[0, 1, 1], [40, 1, 1]], renders: [[0, 1, 1], [7, 1, 1]] }] })!
    const fitted = fittingProfile(odd, MAP)
    expect(fitted.actions[0]!.fns.map(row => row.fn)).toEqual([0])
    expect(fitted.actions[0]!.dom.map(row => row.point)).toEqual([0])
    expect(fitted.actions[0]!.renders.map(row => row.fn)).toEqual([0])
  })
})

describe('the Performance panel\'s tables', () => {
  it('lists the functions of a view by their total work, summed over the actions it covers', () => {
    const all = functionRows(profile(), MAP, null)
    expect(all.map(row => [row.name, row.calls, row.self, row.total])).toEqual([
      ['renderMenu', 2, 340, 1260],
      ['formatPrice', 48, 920, 920],
      ['(anonymous)', 1, 20, 800],
      ['renderBasket', 1, 20, 20]
    ])
    expect(all[2]).toMatchObject({ module: true, path: 'app.js', line: 1 })
    expect(all[0]).toMatchObject({ module: false, path: 'menu.js', line: 4 })
    expect(functionRows(profile(), MAP, 1).map(row => row.name)).toEqual(['renderMenu', 'formatPrice', 'renderBasket'])
    // an action that is not there shows nothing
    expect(functionRows(profile(), MAP, 7)).toEqual([])
  })

  it('lists the renders of a view, the most nodes first, each with the lines that changed the page', () => {
    const click = renderRows(profile(), MAP, 1)
    expect(click.map(row => [row.name, row.renders, row.nodes])).toEqual([['renderMenu', 1, 50], ['renderBasket', 1, 3]])
    expect(click[0]!.lines).toEqual([{ path: 'menu.js', line: 9, updates: 1, nodes: 48 }, { path: 'menu.js', line: 11, updates: 1, nodes: 2 }])
    expect(click[1]!.lines).toEqual([{ path: 'basket.js', line: 8, updates: 2, nodes: 3 }])
    expect(renderRows(profile(), MAP, null)[0]).toMatchObject({ name: 'renderMenu', renders: 2, nodes: 98 })
  })

  it('puts the requests on the server\'s clock: a waterfall (sent once another had answered) and a repeat are told apart', () => {
    const rows = requestRows(profile(), ENTRIES, null)
    expect(rows.map(row => [row.id, row.action, row.start, row.end, row.after, row.repeats])).toEqual([
      [1, 0, 0, 400, null, null],
      [2, 0, 400, 700, 1, null],
      [3, 0, 400, 600, 1, null],
      [4, 1, 700, null, null, 1]
    ])
    expect(rows[0]!.entry?.initiator).toEqual({ path: 'load.js', line: 4 })
    // an action's view counts from its start
    expect(requestRows(profile(), ENTRIES, 1).map(row => [row.id, row.start, row.end])).toEqual([[4, 0, null]])
    expect(timelineEnd(rows)).toBe(700)
    expect(timelineEnd([])).toBe(1)
    // a request the Network panel did not list still shows, without its entry
    expect(requestRows(profile(), [], null)[0]).toMatchObject({ id: 1, entry: null, repeats: null })
  })

  it('a POST with another body is no repeat', () => {
    const posts = [entry(1, 'POST', '/api/orders', 4, '{"id":1}'), entry(2, 'POST', '/api/orders', 4, '{"id":2}'), entry(3, 'POST', '/api/orders', 4, '{"id":1}')]
    const read = readProfile({ ...RAW, actions: [{ ...RAW.actions[0], requests: [1, 2, 3] }], requests: [[1, 0, 30], [2, 0, 30], [3, 0, 30]] })!
    expect(requestRows(read, posts, null).map(row => row.repeats)).toEqual([null, null, 1])
  })

  it('sums a view: work, renders and their nodes, requests, the server time until the last answer', () => {
    expect(profileSummary(profile(), ENTRIES, null)).toEqual({ work: 1300, renders: 3, nodes: 101, requests: 4, serverTime: 700 })
    expect(profileSummary(profile(), ENTRIES, 0)).toEqual({ work: 800, renders: 1, nodes: 48, requests: 3, serverTime: 700 })
    expect(profileSummary(profile(), ENTRIES, 1)).toEqual({ work: 500, renders: 2, nodes: 53, requests: 1, serverTime: null })
  })

  it('names every line the panel links: functions, the lines that changed the page, Sent from', () => {
    expect(profileLines(profile(), MAP, ENTRIES).sort()).toEqual(['app.js:1', 'basket.js:6', 'basket.js:8', 'load.js:4', 'load.js:5', 'load.js:6', 'menu.js:11', 'menu.js:4', 'menu.js:9', 'money.js:2'])
  })
})

describe('the check run\'s work probes', () => {
  const probes = [{ id: 'load', steps: [{ work: 'load' as const }] }, { id: 'menu', steps: [{ count: '#menu li' }] }]
  const observation: Observation = { finished: true, errors: [], probes: { load: 120, menu: 24 }, probeErrors: {}, logs: [] }

  it('count only when a probe reads the work', () => {
    expect(needsCounting(probes)).toBe(true)
    expect(needsCounting([probes[1]!])).toBe(false)
  })

  it('have no value when a file ran without counting, and say why', () => {
    expect(withUncounted(observation, probes, [])).toBe(observation)
    const left = withUncounted(observation, probes, [{ path: 'menu.js', reason: 'clash' }])
    expect(left.probes).toEqual({ menu: 24 })
    expect(left.probeErrors.load).toMatch(/^menu\.js declares a function twice/)
    expect(observation.probes).toEqual({ load: 120, menu: 24 })
  })
})

describe('bounds in goals', () => {
  it('meets an exact value or a bound, never with a missing value', () => {
    expect(meets(1, { atMost: 1 })).toBe(true)
    expect(meets(2, { atMost: 1 })).toBe(false)
    expect(meets(5, { atLeast: 5 })).toBe(true)
    expect(meets('1', { atMost: 1 })).toBe(false)
    expect(meets(undefined, { atMost: 1 })).toBe(false)
    expect(meets(null, null)).toBe(true)
    expect(meets('a', 'a')).toBe(true)
  })

  it('probesGoal takes bounds next to exact values', () => {
    const goal = probesGoal('one', 'One request, and the results', { requests: { atMost: 1 }, heading: '2 results' })
    const state = (probes: Record<string, string | number>) => ({ files: {}, picked: null, observed: { finished: true, errors: [], probes, probeErrors: {}, logs: [] } })
    expect(goal.check({ state: state({ requests: 1, heading: '2 results' }), history: [] })).toBe(true)
    expect(goal.check({ state: state({ requests: 0, heading: '2 results' }), history: [] })).toBe(true)
    expect(goal.check({ state: state({ requests: 7, heading: '2 results' }), history: [] })).toBe(false)
    expect(goal.check({ state: state({ heading: '2 results' }), history: [] })).toBe(false)
  })
})
