import { expect, test } from '@playwright/test'

// The level's app runs sealed (ADR 0007): sandbox="allow-scripts" only, an opaque origin. Code typed into the Console
// runs inside the app and can't read Grindstone's localStorage (where progress lives), its page, or the network.
test('the app cannot reach Grindstone\'s storage, page or the network', async ({ page }) => {
  await page.goto('/debugging/01-add-to-cart')
  await page.evaluate(() => localStorage.setItem('grindstone:secret-check', 'only-for-grindstone'))
  await expect(page.getByTestId('app-frame')).toHaveAttribute('sandbox', 'allow-scripts')

  const log = page.getByTestId('console-log')
  await expect(log).toContainText('Corner Bakery shop ready')
  const input = page.getByTestId('console-input')
  const run = async (code: string) => {
    await input.fill(code)
    await input.press('Enter')
  }

  await run('localStorage.getItem("grindstone:secret-check")')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('parent.localStorage.getItem("grindstone:secret-check")')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('parent.document.title')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('document.cookie = "a=1"; document.cookie')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('fetch("https://example.com/").catch(error => console.error(error.message))')
  await expect(log).toContainText('Refused to load')
  await expect(log).not.toContainText('only-for-grindstone')

  // the page's own storage is untouched, and the app still works
  expect(await page.evaluate(() => localStorage.getItem('grindstone:secret-check'))).toBe('only-for-grindstone')
  await run('1 + 1')
  await expect(log.locator('[data-level="result"]').last()).toHaveText(/2/)
})
