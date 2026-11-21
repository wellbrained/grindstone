import { expect, test } from '@playwright/test'

// The design critique's batch B (0.5.3, docs/features/ui.md "Play strip"): one strip on every play page, the panel
// tabs without a second name under them, and Working with AI's phone tabs that keep what you wrote.

const PLAY_PAGES = [
  { track: 'git', path: '/git/01-first-commit', counters: ['commands'] },
  { track: 'debugging', path: '/debugging/06-menu-wont-load', counters: ['reloads'] },
  { track: 'ai', path: '/ai/05-office-discount', counters: ['false-alarms'] },
  { track: 'web', path: '/web/02-order-preflight', counters: ['wrong-predictions', 'reloads'] }
]

test('every play page has the same one-line strip at 1440: the note left, its counters right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const heights: number[] = []
  for (const { path, counters } of PLAY_PAGES) {
    await page.goto(path)
    const strip = page.getByTestId('play-strip')
    await expect(strip).toHaveCount(1)
    await expect(strip).toBeVisible()
    for (const id of counters) await expect(strip.getByTestId(id)).toBeVisible()
    const box = (await strip.boundingBox())!
    heights.push(Math.round(box.height))
    // the note fits one line: no taller than its 16px icon's line
    const note = (await strip.getByTestId('play-note').boundingBox())!
    expect(note.height, path).toBeLessThanOrEqual(20)
    // counters sit right of the note
    const counter = (await strip.getByTestId(counters[0]!).boundingBox())!
    expect(counter.x, path).toBeGreaterThan(note.x + note.width)
  }
  expect(new Set(heights).size, `strip heights ${heights.join(', ')}`).toBe(1)
})

test('git: the Terminal / IDE switch is the strip\'s last item, and the command counter counts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/git/01-first-commit')
  const strip = page.getByTestId('play-strip')
  await expect(strip.getByRole('radiogroup', { name: 'Layout' })).toBeVisible()
  await expect(strip.getByTestId('commands')).toHaveText('Commands: 0')
  const input = page.getByRole('textbox', { name: /Terminal input/ })
  await input.fill('git init')
  await input.press('Enter')
  await expect(strip.getByTestId('commands')).toHaveText('Commands: 1')
})

test('the panel tabs name the panel once: no second "Console" header, Clear in the tab row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/debugging/06-menu-wont-load')
  const tabs = page.getByRole('tablist', { name: 'Console and Network' })
  await expect(tabs.getByRole('tab', { name: 'Console' })).toHaveAttribute('aria-selected', 'true')
  const console = page.locator('#debugging-console')
  await expect(console.locator('header')).toBeHidden()
  const clear = page.locator('#debugging-lower-actions').getByRole('button', { name: 'Clear the Console' })
  await expect(clear).toBeVisible()
  await expect(page.getByTestId('console-log').locator('[data-level="error"]').first()).toBeVisible()
  await clear.click()
  await expect(page.getByTestId('console-log').locator('[data-level="error"]')).toHaveCount(0)
  // Network's Clear takes its place with its tab
  await tabs.getByRole('tab', { name: /Network/ }).click()
  await expect(page.locator('#debugging-lower-actions').getByRole('button', { name: 'Clear the Network panel' })).toBeVisible()
  await expect(page.locator('#debugging-lower-actions').getByRole('button')).toHaveCount(1)
})

test('a level with the Console alone keeps the Console\'s own header from lg', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/debugging/01-add-to-cart')
  const header = page.locator('#debugging-console header')
  await expect(header).toBeVisible()
  await expect(header).toContainText('Console')
  await expect(header.getByRole('button', { name: 'Clear' })).toBeVisible()
})

test('Working with AI on a phone: Diff, Review and Run tabs keep a comment and a draft across switches', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto('/ai/05-office-discount')
  const tabs = page.getByRole('tablist', { name: 'Pull request, review and run' })
  await expect(tabs.getByRole('tab')).toHaveText(['Diff', 'Review', 'Run'])
  await expect(tabs.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('pull-request')).toBeVisible()
  await expect(page.getByTestId('review-box')).toBeHidden()
  await expect(page.getByTestId('run-pr')).toBeHidden()

  // a comment on a line, in the Diff tab
  await page.locator('[data-row="discount.js:7"] [data-testid="diff-number"]').tap()
  await page.getByTestId('comment-text').fill('Smaller orders?')
  await page.getByTestId('comment-save').tap()
  const card = page.locator('[data-comment="discount.js:7"]')
  await expect(card).toBeVisible()

  // a draft in the Review tab
  await tabs.getByRole('tab', { name: 'Review' }).tap()
  await expect(page.getByTestId('pull-request')).toBeHidden()
  await page.getByTestId('review-summary').fill('Two things to fix')

  // Run, then back: both are still there
  await tabs.getByRole('tab', { name: 'Run' }).tap()
  await expect(page.getByTestId('run-pr')).toBeVisible()
  await expect(page.getByTestId('review-box')).toBeHidden()
  await tabs.getByRole('tab', { name: 'Review' }).tap()
  await expect(page.getByTestId('review-summary')).toHaveValue('Two things to fix')
  await expect(page.getByTestId('review-box')).toContainText('1 comment')
  await tabs.getByRole('tab', { name: 'Diff' }).tap()
  await expect(card).toBeVisible()
  await expect(card).toContainText('Smaller orders?')

  // Finish your review (in the level panel) opens the Review tab; a comment in the list opens the Diff
  await page.getByRole('button', { name: 'Finish your review' }).tap()
  await expect(tabs.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('review-box')).toBeFocused()
  await page.getByTestId('comment-list').getByRole('button').first().tap()
  await expect(tabs.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true')
  await expect(card).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await context.close()
})

test('Working with AI\'s phone tabs move with the arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ai/05-office-discount')
  const tabs = page.getByRole('tablist', { name: 'Pull request, review and run' })
  await tabs.getByRole('tab', { name: 'Diff' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Review' })).toBeFocused()
  await expect(tabs.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tabs.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true')
})
