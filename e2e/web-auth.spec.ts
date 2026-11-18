import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'

// Plays chapter 3 of Web fundamentals like a player (ADR 0009: auth & tokens): the prediction first, then the
// Application panel (the token in Local storage, decoded), the Server panel (the thief's request from outside the
// browser, with what reached cheap-flour.example), the Network panel (the widget's request), a fix in two files,
// Reload, the debrief; and the new panel parts at a phone's width, light and dark.

/** A file as the level's solution leaves it. */
function solved(id: string, path: string): string {
  const level = levelById(id) as WebLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files[path]!
}

test('plays 3.1: predicts what the thief can do, reads the token in Local storage and the thief in the Server panel, fixes both files', async ({ page }) => {
  await page.goto('/web/11-token-in-storage')
  await expect(page.getByRole('heading', { level: 1, name: /The token the widget took/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  // the prediction, with the keyboard
  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /Be Lena from anywhere/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')

  // the scene ran: Lena signed in, the widget opened
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#who')).toHaveText('Signed in as Lena')
  await expect(app.locator('#reviews')).toHaveText('“Best croissants in town.” · Mara')

  // Application: Local storage holds the token, decoded below its table
  const tabs = page.getByRole('tablist', { name: 'Console, Network, Server and Application' })
  await tabs.getByRole('tab', { name: 'Application' }).click()
  await page.getByRole('button', { name: 'Local storage' }).click()
  const table = page.getByRole('region', { name: 'Local storage of https://cornerbakery.shop' })
  await expect(table.getByRole('row', { name: /token/ })).toContainText('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.')
  await expect(page.getByTestId('application-count')).toHaveText('1 item')
  const token = page.getByTestId('token')
  await expect(token.getByTestId('token-payload')).toContainText('"sub": "lena"')
  await expect(token.getByTestId('token-times')).toHaveText('issued 09:41 · expires 10:41, in 60 min')
  // Session storage is empty
  await page.getByRole('button', { name: 'Session storage' }).click()
  await expect(page.getByTestId('application-empty')).toBeVisible()

  // Server: the thief's GET /account from outside the browser, answered 200, with the token that reached cheap-flour.example
  await tabs.getByRole('tab', { name: 'Server' }).click()
  const outside = page.getByTestId('server-outside')
  await expect(outside).toHaveCount(1)
  await expect(outside).toHaveAttribute('data-status', '200')
  await expect(outside).toContainText('cheap-flour.example\'s server')
  await expect(outside).toContainText('GET /account → 200')
  await expect(outside).toContainText('its token: sub lena · issued 09:41 · expires 10:41')

  // Network: the widget's request carried the token away
  await tabs.getByRole('tab', { name: 'Network' }).click()
  await page.getByTestId('network-list').getByRole('option', { name: /collect/ }).first().click()
  await expect(page.getByTestId('network-detail')).toContainText('cheap-flour.example/collect?s=%7B%22token%22%3A%22eyJ')

  // the fix: server.js sets an HttpOnly cookie and reads it, app.js sends the cookie and keeps nothing
  for (const path of ['server.js', 'app.js']) {
    await page.getByRole('tab', { name: path }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(solved('web-11-token-in-storage', path))
    await page.keyboard.press('ControlOrMeta+s')
  }
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Where a token lives decides who can take it')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.getByRole('button', { name: 'Stay here' }).click()

  // the reloaded app: nothing in storage, an HttpOnly session cookie (its token decoded), and the thief gets 401
  await expect(app.locator('#who')).toHaveText('Signed in as Lena')
  await tabs.getByRole('tab', { name: 'Application' }).click()
  await page.getByRole('button', { name: 'Local storage' }).click()
  await expect(page.getByTestId('application-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Cookies' }).click()
  const session = page.getByTestId('application-cookie').filter({ hasText: 'session' })
  await expect(session.locator('[data-flag]').first()).toHaveAttribute('data-flag', 'true')
  await expect(page.getByTestId('token').getByTestId('token-payload')).toContainText('"sub": "lena"')
  await tabs.getByRole('tab', { name: 'Server' }).click()
  await expect(page.getByTestId('server-outside')).toHaveAttribute('data-status', '401')
})

test('shows a token without exp as one that never runs out, and the expired copy at work (3.3)', async ({ page }) => {
  await page.goto('/web/13-token-never-expires')
  await page.getByTestId('prediction').getByRole('radio', { name: /200, as Lena/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#who')).toHaveText('Not signed in: please sign in again.')
  const tabs = page.getByRole('tablist', { name: 'Console, Network, Server and Application' })
  await tabs.getByRole('tab', { name: 'Server' }).click()
  const outside = page.getByTestId('server-outside')
  await expect(outside).toHaveAttribute('data-status', '200')
  await expect(outside).toContainText('someone with a copy')
  await expect(outside).toContainText('its token: sub lena · issued 09:41 · no exp: it never runs out')
  // at 10:01 the browser has forgotten the cookie (Max-Age 15 minutes)
  await tabs.getByRole('tab', { name: 'Application' }).click()
  await expect(page.getByTestId('application-empty')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: Local storage, the decoded token and the thief's line, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/11-token-in-storage')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    await page.getByTestId('prediction').getByRole('radio', { name: /Be Lena from anywhere/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await tabs.getByRole('tab', { name: 'Application' }).click()
    await page.getByRole('button', { name: 'Local storage' }).click()
    await expect(page.getByTestId('application-item')).toHaveCount(1)
    await expect(page.getByTestId('token')).toBeVisible()
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Server' }).click()
    await expect(page.getByTestId('server-outside')).toBeVisible()
    expect(await scrollsSideways()).toBe(false)
  })
}
