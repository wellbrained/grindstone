import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper } from '@vue/test-utils'
import DebuggingRunStats from '~/components/DebuggingRunStats.vue'
import GitRunStats from '~/components/GitRunStats.vue'
import ReviewRunStats from '~/components/ReviewRunStats.vue'

// The debrief's result strip comes first: solved, the track's counts with their labels, the best run on one line, then
// the verdict. The git commands sit beside the shortest solution, as a comparison, never as a failure.
const text = (html: string) => html.replace(/\s+/g, ' ').trim()
interface Wrapper { findAll: (selector: string) => DOMWrapper<Element>[] }
/** The strip's cells, each as 'label value' (the first is the solved mark, its label for screen readers only). */
const cells = (wrapper: Wrapper) => wrapper.findAll('[data-testid="debrief-stats"] > div').map(cell => text(`${cell.find('dt').text()} ${cell.find('dd').text()}`))

describe('debrief result strip', () => {
  it('git: commands beside the shortest solution, hints, the best run, a verdict that does not scold', async () => {
    const wrapper = await mountSuspended(GitRunStats, { props: { stats: { commands: 5, solution: 3, hints: 1, best: { commands: 4, hints: 0 } } } })
    expect(cells(wrapper)).toEqual(['Result Solved', 'Commands 5 · shortest solution 3', 'Hints 1', 'Best run 4 commands · no hints'])
    const verdict = text(wrapper.find('[data-testid="debrief-results"] > p').text())
    expect(verdict).toContain('The shortest solution we know takes 3 commands')
    expect(verdict).not.toMatch(/more than|too many|failed/i)
  })

  it('git: a run as short as the solution says so; no best run before one is recorded', async () => {
    const wrapper = await mountSuspended(GitRunStats, { props: { stats: { commands: 3, solution: 3, hints: 0, best: null } } })
    expect(wrapper.text()).toContain('That matches the shortest solution we know.')
    expect(wrapper.text()).not.toContain('Best run')
  })

  it('Web fundamentals: wrong predictions first, the best run as one line', async () => {
    const wrapper = await mountSuspended(DebuggingRunStats, { props: { stats: { hints: 0, reloads: 1, wrongPredictions: 0, best: { commands: 0, hints: 0, reloads: 1, wrongPredictions: 0 } } } })
    expect(cells(wrapper)).toEqual(['Result Solved', 'Wrong predictions 0', 'Hints 0', 'Reloads 1', 'Best run no wrong predictions · no hints · 1 reload'])
  })

  it('Working with AI: hints, false alarms, a steer level\'s rounds, and the best run', async () => {
    const wrapper = await mountSuspended(ReviewRunStats, { props: { stats: { hints: 0, falseAlarms: 1, rounds: 2, best: { commands: 0, hints: 0, falseAlarms: 0, rounds: 2 } } } })
    expect(cells(wrapper)).toEqual(['Result Solved', 'Hints 0', 'False alarms 1', 'Rounds of changes 2', 'Best run no hints · no false alarms · 2 rounds'])
    expect(wrapper.find('[data-testid="debrief-rounds"]').text()).toBe('2')
  })
})
