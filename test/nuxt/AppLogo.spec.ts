import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppLogo from '~/components/AppLogo.vue'

describe('AppLogo', () => {
  it('is one image named after the site (app.config), with the wordmark as drawing', async () => {
    const wrapper = await mountSuspended(AppLogo)

    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe(useAppConfig().site.name)
    // the wordmark is the visible text, and nothing repeats the name for screen readers
    expect(wrapper.text()).toBe('grindstone')
    expect(wrapper.find('.sr-only').exists()).toBe(false)
  })
})
