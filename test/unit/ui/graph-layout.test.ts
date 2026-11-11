import { describe, expect, it } from 'vitest'
import { layoutGraph } from '../../../app/utils/graph-layout'
import type { LayoutCommit, LayoutInput } from '../../../app/utils/graph-layout'

const commit = (id: string, parents: string[], timestamp: number, message = `commit ${id}`): LayoutCommit => ({ id, parents, message, timestamp })
const commitsOf = (...list: LayoutCommit[]) => Object.fromEntries(list.map(c => [c.id, c]))
const input = (overrides: Partial<LayoutInput>): LayoutInput => ({
  commits: {},
  branches: {},
  remoteBranches: {},
  head: { type: 'branch', name: 'main' },
  ...overrides
})
const node = (layout: ReturnType<typeof layoutGraph>, id: string) => layout.nodes.find(n => n.id === id)!

describe('layoutGraph', () => {
  it('is empty without refs', () => {
    expect(layoutGraph(input({}))).toEqual({ nodes: [], edges: [], laneCount: 0, rowCount: 0 })
  })

  it('draws a linear history newest first in one lane', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(commit('a1', [], 1), commit('b2', ['a1'], 2), commit('c3', ['b2'], 3)),
      branches: { main: 'c3' }
    }))
    expect(layout.nodes.map(n => [n.id, n.row, n.lane])).toEqual([['c3', 0, 0], ['b2', 1, 0], ['a1', 2, 0]])
    expect(layout.laneCount).toBe(1)
    expect(layout.edges.map(e => e.id)).toEqual(['c3>b2', 'b2>a1'])
    expect(node(layout, 'c3').labels).toEqual([{ name: 'main', kind: 'local', branch: 'main', head: true }])
    expect(node(layout, 'c3').message).toBe('commit c3')
    expect(node(layout, 'c3').shortId).toBe('c3')
  })

  it('uses only the first line of a message', () => {
    const layout = layoutGraph(input({ commits: commitsOf(commit('a1', [], 1, 'Subject\n\nBody')), branches: { main: 'a1' } }))
    expect(layout.nodes[0]!.message).toBe('Subject')
  })

  it('gives a branch its own lane and interleaves by time', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(commit('a1', [], 1), commit('b2', ['a1'], 2), commit('c3', ['b2'], 4), commit('f4', ['b2'], 3)),
      branches: { 'main': 'c3', 'feature/x': 'f4' },
      head: { type: 'branch', name: 'feature/x' }
    }))
    expect(layout.nodes.map(n => [n.id, n.row, n.lane])).toEqual([['c3', 0, 0], ['f4', 1, 1], ['b2', 2, 0], ['a1', 3, 0]])
    expect(node(layout, 'f4').branch).toBe('feature/x')
    expect(node(layout, 'b2').branch).toBe('main')
    expect(layout.laneCount).toBe(2)
    // the fork edge takes the colour of the new branch and leaves lane 1 for lane 0
    expect(layout.edges.find(e => e.id === 'f4>b2')).toMatchObject({ fromLane: 1, toLane: 0, branch: 'feature/x' })
    expect(node(layout, 'f4').labels[0]).toMatchObject({ name: 'feature/x', head: true })
    expect(node(layout, 'c3').labels[0]).toMatchObject({ name: 'main', head: false })
  })

  it('puts a fast-forwarded branch on the main lane with both pills on one commit', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(commit('a1', [], 1), commit('b2', ['a1'], 2)),
      branches: { 'main': 'b2', 'feature/x': 'b2' },
      head: { type: 'branch', name: 'main' }
    }))
    expect(layout.laneCount).toBe(1)
    expect(node(layout, 'b2').labels.map(l => l.name)).toEqual(['main', 'feature/x'])
  })

  it('draws a merge commit with two parents and keeps the merged line coloured', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(
        commit('a1', [], 1),
        commit('f2', ['a1'], 2),
        commit('m3', ['a1'], 3),
        commit('x4', ['m3', 'f2'], 4, 'Merge branch feature/x')
      ),
      branches: { 'main': 'x4', 'feature/x': 'f2' }
    }))
    expect(layout.nodes.map(n => n.id)).toEqual(['x4', 'm3', 'f2', 'a1'])
    expect(layout.edges.filter(e => e.from === 'x4').map(e => [e.to, e.toLane, e.branch])).toEqual([['m3', 0, 'main'], ['f2', 1, 'feature/x']])
  })

  it('gives a deleted merged branch its own lane and colour', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(commit('a1', [], 1), commit('f2', ['a1'], 2), commit('m3', ['a1'], 3), commit('x4', ['m3', 'f2'], 4)),
      branches: { main: 'x4' }
    }))
    expect(layout.laneCount).toBe(2)
    expect(node(layout, 'f2').lane).toBe(1)
    expect(node(layout, 'f2').branch).toBe('line:f2')
  })

  it('does not draw commits that a rebase orphaned', () => {
    // feature/x was a1 -> f2 -> f3; after the rebase it is g2 -> g3 on top of m4, and the old f2, f3 belong to no ref
    const layout = layoutGraph(input({
      commits: commitsOf(
        commit('a1', [], 1),
        commit('m2', ['a1'], 2),
        commit('f2', ['a1'], 3),
        commit('f3', ['f2'], 4),
        commit('m4', ['m2'], 5),
        commit('g2', ['m4'], 6),
        commit('g3', ['g2'], 7)
      ),
      branches: { 'main': 'm4', 'feature/x': 'g3' },
      head: { type: 'branch', name: 'feature/x' }
    }))
    const ids = layout.nodes.map(n => n.id)
    expect(ids).not.toContain('f2')
    expect(ids).not.toContain('f3')
    expect(ids).toEqual(['g3', 'g2', 'm4', 'm2', 'a1'])
    expect(layout.rowCount).toBe(5)
    expect(layout.edges.every(e => ids.includes(e.from) && ids.includes(e.to))).toBe(true)
  })

  it('draws origin/* as remote labels, on their own lane when origin is ahead', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(commit('a1', [], 1), commit('b2', ['a1'], 2), commit('r3', ['a1'], 3)),
      branches: { main: 'b2' },
      remoteBranches: { main: 'r3' }
    }))
    expect(node(layout, 'r3').labels).toEqual([{ name: 'origin/main', kind: 'remote', branch: 'main', head: false }])
    expect(node(layout, 'r3').lane).toBe(1)
    expect(node(layout, 'r3').branch).toBe('main')
  })

  it('shows the unfetched commits and heads of origin only when asked', () => {
    const base = {
      commits: commitsOf(commit('a1', [], 1)),
      branches: { main: 'a1' },
      remoteBranches: { main: 'a1' }
    }
    const origin = { commits: commitsOf(commit('a1', [], 1), commit('r2', ['a1'], 2)), branches: { main: 'r2' } }
    expect(layoutGraph(input(base)).nodes.map(n => n.id)).toEqual(['a1'])
    const shown = layoutGraph(input({ ...base, origin }))
    expect(shown.nodes.map(n => n.id)).toEqual(['r2', 'a1'])
    expect(node(shown, 'r2').labels).toEqual([{ name: 'origin: main', kind: 'origin', branch: 'main', head: false }])
    // a fetched head is not drawn twice
    const fetched = layoutGraph(input({ ...base, remoteBranches: { main: 'r2' }, origin }))
    expect(node(fetched, 'r2').labels.map(l => l.name)).toEqual(['origin/main'])
  })

  it('marks a detached HEAD', () => {
    const layout = layoutGraph(input({
      commits: commitsOf(commit('a1', [], 1), commit('b2', ['a1'], 2)),
      branches: { main: 'b2' },
      head: { type: 'detached', commit: 'a1' }
    }))
    expect(node(layout, 'a1').labels).toEqual([{ name: 'HEAD', kind: 'head', branch: 'HEAD', head: true }])
    expect(node(layout, 'b2').labels[0]!.head).toBe(false)
  })

  it('ignores refs that point at unknown commits', () => {
    const layout = layoutGraph(input({ commits: commitsOf(commit('a1', [], 1)), branches: { main: 'a1', broken: 'zzz' } }))
    expect(layout.nodes.map(n => n.id)).toEqual(['a1'])
  })
})
