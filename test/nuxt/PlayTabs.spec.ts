import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, ref } from 'vue'
import PlayTabs from '~/components/PlayTabs.vue'
import { REVIEW_PANES } from '~/utils/review-panes'
import type { ReviewPane } from '~/utils/review-panes'

// The phone tab set (Working with AI: Diff, Review, Run): a click or an arrow key picks the pane, and it only picks:
// the panes themselves stay mounted, so what is in them stays (the e2e test keeps a comment and a draft across switches).
const LABELS = { diff: 'Diff', review: 'Review', run: 'Run' }

function host() {
  const pane = ref<ReviewPane>('diff')
  const Host = defineComponent({
    setup: () => () => [
      h(PlayTabs<ReviewPane>, {
        'modelValue': pane.value,
        'onUpdate:modelValue': (value: ReviewPane) => { pane.value = value },
        'names': REVIEW_PANES,
        'labels': LABELS,
        'label': 'Pull request, review and run',
        'idPrefix': 'review'
      }),
      ...REVIEW_PANES.map(name => h('div', { 'id': `review-${name}`, 'data-pane': name, 'class': pane.value === name ? '' : 'max-lg:hidden' }, h('input', { 'data-draft': name })))
    ]
  })
  return { pane, Host }
}

describe('PlayTabs', () => {
  it('names each tab, marks the chosen one and points it at its pane', async () => {
    const { Host } = host()
    const wrapper = await mountSuspended(Host)
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(tab => tab.text())).toEqual(['Diff', 'Review', 'Run'])
    expect(tabs.map(tab => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map(tab => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    expect(tabs[1]!.attributes('aria-controls')).toBe('review-review')
    expect(tabs[1]!.attributes('id')).toBe('review-tab-review')
    expect(wrapper.find('[role="tablist"]').classes()).toContain('grid-cols-3')
  })

  it('switches on a click and on the arrow keys, and keeps every pane (and what was typed in it) mounted', async () => {
    const { pane, Host } = host()
    const wrapper = await mountSuspended(Host)
    await wrapper.find('[data-draft="review"]').setValue('Two things to fix')
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    expect(pane.value).toBe('review')
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(pane.value).toBe('run')
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(pane.value).toBe('diff')
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'End' })
    expect(pane.value).toBe('run')
    expect(wrapper.findAll('[data-pane]')).toHaveLength(3)
    expect((wrapper.find('[data-draft="review"]').element as HTMLInputElement).value).toBe('Two things to fix')
    expect(wrapper.find('[data-pane="review"]').classes()).toContain('max-lg:hidden')
    expect(wrapper.find('[data-pane="run"]').classes()).not.toContain('max-lg:hidden')
  })
})
