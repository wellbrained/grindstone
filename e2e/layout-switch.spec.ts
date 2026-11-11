import { expect, test } from '@playwright/test'

// Switching layouts opens and closes panels in place: the terminal stays mounted, keeps its log and keeps the prompt in
// view when it gets shorter; switching back closes the IDE panels (0px and inert).
test('switching layouts keeps the terminal and its prompt in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/git/01-first-commit')
  const input = page.getByRole('textbox', { name: /Terminal input/ })
  await expect(input).toBeFocused()

  // fill the log until it scrolls
  for (let i = 0; i < 6; i++) {
    await input.pressSequentially('help')
    await input.press('Enter')
  }
  await expect(input).toBeInViewport({ ratio: 1 })

  await page.getByRole('radio', { name: 'IDE' }).click()
  await expect.poll(async () => (await page.locator('.reveal-editor').boundingBox())?.height ?? 0).toBeGreaterThan(200)
  await expect(input).toBeInViewport({ ratio: 1 })
  // the log survived the switch (same terminal, not a new one)
  await expect(page.getByRole('log')).toContainText('help')

  await page.getByRole('radio', { name: 'Terminal' }).click()
  await expect(page.locator('.reveal-files')).toHaveAttribute('inert')
  await expect.poll(async () => (await page.locator('.reveal-files').boundingBox())?.height ?? -1).toBe(0)
  await expect(input).toBeInViewport({ ratio: 1 })
})
