import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'

// Plays chapter 4 of Web fundamentals like a player (ADR 0009: HTTP caching): the prediction first, then the Network
// panel (the Refresh answered from the disk cache, then a 304), the Application panel's Cache (the browser's copy, its
// age and freshness; the CDN's copies and its log, Sam's request a HIT on Lena's account), a fix, Reload, the debrief;
// and the Cache at a phone's width, light and dark.

/** A file as the level's solution leaves it. */
function solved(id: string, path: string): string {
  const level = levelById(id) as WebLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files[path]!
}

test('plays 4.1: predicts the Refresh, finds it in the disk cache and the copy in the Cache, fixes server.js', async ({ page }) => {
  await page.goto('/web/16-old-price')
  await expect(page.getByRole('heading', { level: 1, name: /Still the old price/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  // the prediction, with the keyboard
  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /answers from its own copy/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')

  // the scene ran: the price changed at 09:43, Lena's Refresh at 09:45 still shows the old one
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('[data-id="croissant"]')).toHaveText('Butter croissant · 2.40 €')

  // Network: the Refresh is the copy, tagged disk cache, its status as Chrome words it
  const tabs = page.getByRole('tablist', { name: 'Console, Network, Server and Application' })
  await tabs.getByRole('tab', { name: 'Network' }).click()
  const rows = page.getByTestId('network-list').getByRole('option')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).getByTestId('network-cache')).toHaveText('disk cache')
  await rows.nth(1).click()
  await expect(page.getByTestId('network-status')).toHaveText('200 OK (from disk cache)')

  // Application: the Cache opens first, Lena's browser holds the copy, fresh for most of the hour, used once
  await tabs.getByRole('tab', { name: 'Application' }).click()
  const copy = page.getByTestId('cache-table').filter({ hasText: 'Lena\'s browser' }).getByTestId('cache-row')
  await expect(copy).toHaveCount(1)
  await expect(copy).toContainText('/menu')
  await expect(copy).toContainText('fresh for 56 min 0 s')
  await expect(copy).toContainText('max-age=3600')
  await expect(page.getByTestId('application-count')).toHaveText('1 copy')
  // no CDN in this level
  await expect(page.getByTestId('cdn-log')).toHaveCount(0)

  // the fix: no-cache
  await page.getByRole('tab', { name: 'server.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solved('web-16-old-price', 'server.js'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('An hour is a promise')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.getByRole('button', { name: 'Stay here' }).click()

  // the reloaded app shows the new price; the Refresh asked and got the new menu
  await expect(app.locator('[data-id="croissant"]')).toHaveText('Butter croissant · 2.60 €')
  await tabs.getByRole('tab', { name: 'Network' }).click()
  await expect(page.getByTestId('network-cache')).toHaveCount(0)
})

test('shows the CDN handing Sam Lena\'s account in its log and its copy (4.3)', async ({ page }) => {
  await page.goto('/web/18-someone-elses-account')
  await page.getByTestId('prediction').getByRole('radio', { name: /hands Sam its copy/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#who')).toHaveText('Signed in as Lena')
  const tabs = page.getByRole('tablist', { name: 'Console, Network, Server and Application' })
  await tabs.getByRole('tab', { name: 'Application' }).click()
  const cdn = page.getByTestId('cache-table').filter({ hasText: 'The CDN' })
  await expect(cdn.getByTestId('cache-row').filter({ hasText: '/account' })).toContainText('Lena')
  const sam = page.getByTestId('cdn-line').filter({ hasText: 'Sam' })
  await expect(sam).toHaveAttribute('data-outcome', 'HIT')
  await expect(sam).toContainText('GET /account HIT 200')
  await expect(sam).toContainText('Its copy from 09:41:00, fetched for Lena.')
  // the Server panel never saw Sam's request
  await tabs.getByRole('tab', { name: 'Server' }).click()
  await expect(page.getByTestId('server-line').filter({ hasText: 'GET /account' })).toHaveCount(1)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: the Cache with the CDN's copies and log, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/19-vary-origin')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    await page.getByTestId('prediction').getByRole('radio', { name: /hands Lena Mia's copy/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await tabs.getByRole('tab', { name: 'Application' }).click()
    await expect(page.getByTestId('cdn-line')).toHaveCount(2)
    await expect(page.getByTestId('cdn-line').nth(1)).toHaveAttribute('data-outcome', 'HIT')
    // Mia's copy, kept for anyone: no Vary
    await expect(page.getByTestId('cache-table').filter({ hasText: 'The CDN' }).getByTestId('cache-row')).toContainText('anyone (no Vary)')
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Network' }).click()
    await expect(page.getByTestId('network-list').getByRole('option')).toHaveCount(1)
    expect(await scrollsSideways()).toBe(false)
  })
}
