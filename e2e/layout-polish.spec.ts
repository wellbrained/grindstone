import { expect, test } from '@playwright/test'

// Small layout rules that only show with real text widths (docs/features/ui.md): the track page's rail between lg and xl,
// the practice page's breadcrumb with a long title, and the commit graph's labels.

for (const track of ['git', 'debugging']) {
  for (const width of [1024, 1279, 1280]) {
    test(`${track} track page at ${width}px: no chapter name in the rail is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/${track}`)
      const names = page.locator('aside [data-chapter-link] span.truncate')
      await expect(names.first()).toBeVisible()
      const cut = await names.evaluateAll(list => list.filter(el => el.scrollWidth > el.clientWidth).map(el => el.textContent))
      expect(cut).toEqual([])
      // the mini bars show wherever the list is wide enough, also from xl beside a classic scrollbar, and not in the narrow rail
      const bar = await page.locator('aside [data-chapter-link] [aria-hidden="true"].h-1').first().evaluate(el => getComputedStyle(el).display)
      expect(bar).toBe(width >= 1280 ? 'block' : 'none')
    })
  }
}

for (const [width, height] of [[1024, 800], [1440, 900], [390, 844]] as const) {
  test(`a practice task's breadcrumb stays on one line at ${width}px, the last item cut with its full name as a tooltip`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/debugging/practice-pass-the-data-on')
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('list')
    await expect(trail).toBeVisible()
    expect((await trail.boundingBox())!.height).toBeLessThan(24)
    const last = trail.getByRole('link').last()
    await expect(last).toHaveAttribute('title', /^\d+\.\d+ .{20,}/)
    expect(await last.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // the cut part shows in full while the link has the keyboard focus
    await last.focus()
    expect(await last.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
  })
}

test('the commit graph fits long branch and tag names: wrapped pills, a cut name keeps its full name as a tooltip', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/git/09-read-history')
  const input = page.getByRole('textbox', { name: /Terminal input/ })
  const graph = page.getByRole('region', { name: 'Commit graph' })
  for (const command of [
    'git switch -c feature/newsletter-form-with-a-really-long-name',
    'git tag -a v1.4.0-release-candidate-annotated-2 -m x',
    'git tag lightweight-tag-name'
  ]) {
    await input.click()
    await input.pressSequentially(command)
    await input.press('Enter')
  }
  const pills = graph.locator('svg g[transform^="translate"]')
  await expect(pills).toHaveCount(4)
  await expect(graph.locator('svg title', { hasText: 'HEAD -> feature/newsletter-form-with-a-really-long-name' })).not.toHaveCount(0)

  const fits = await graph.locator('svg').evaluate((svg) => {
    const box = svg.parentElement!
    const texts = [...svg.querySelectorAll<SVGTextElement>('g[transform^="translate"] text')]
    const rects = [...svg.querySelectorAll('g[transform^="translate"] rect')]
    return {
      // no sideways scroll in the graph's box
      scrolls: box.scrollWidth > box.clientWidth,
      // every label's text sits inside its pill
      textOutside: texts.some((text, i) => text.getComputedTextLength() > Number(rects[i]!.getAttribute('width')) - 6),
      cut: texts.filter(text => text.textContent!.includes('…')).length
    }
  })
  expect(fits.scrolls).toBe(false)
  expect(fits.textOutside).toBe(false)
  expect(fits.cut).toBeGreaterThanOrEqual(1)

  // pills that do not fit side by side sit on lines of their own, one under the other, without overlapping
  const boxes = await pills.evaluateAll(list => list.map((g) => {
    const r = g.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }))
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart = a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5 || a.right <= b.left + 0.5 || b.right <= a.left + 0.5
      expect(apart).toBe(true)
    }
  }
})
