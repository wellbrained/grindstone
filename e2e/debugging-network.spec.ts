import { expect, test } from '@playwright/test'
import { levelById } from '../shared/levels'
import type { DebugLevel } from '../shared/levels'

// Plays Network 2.1 like a player, through the Network panel: the menu stays empty, the Console has the browser's 404
// line and the SyntaxError after it, the Network panel lists the request in red, its details show the server's HTML
// error page as text, "Sent from" opens the line, the fix and a Reload solve it, and the reloaded app's request is a 200.
test('plays Network 2.1 through the Network panel', async ({ page }) => {
  await page.goto('/debugging/06-menu-wont-load')
  await expect(page.getByRole('heading', { level: 1, name: /The menu won't load/ })).toBeVisible()
  const app = page.frameLocator('[data-testid="app-frame"]')
  const log = page.getByTestId('console-log')

  // the page stays empty; the Console has the browser's line for the request, then the error it led to
  await expect(log.locator('[data-level="error"]').first()).toContainText('GET https://cornerbakery.shop/api/products 404 (Not Found)')
  await expect(log.locator('[data-level="error"]').nth(1)).toContainText('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON')
  await expect(app.locator('.product')).toHaveCount(0)

  // the Network tab next to the Console, with the request in red
  const tabs = page.getByRole('tablist', { name: 'Console and Network' })
  await expect(tabs.getByRole('tab', { name: /Network/ })).toContainText('1')
  await tabs.getByRole('tab', { name: /Network/ }).click()
  await expect(page.getByTestId('console-log')).toBeHidden()
  const list = page.getByTestId('network-list')
  const request = list.getByRole('option', { name: /GET \/api\/products, 404 Not Found/ })
  await expect(request).toHaveAttribute('data-status', '404')
  await expect(request.locator('.text-error')).toHaveText('404')

  // the details: what was asked, what came back (the error page as text, never rendered)
  await request.click()
  const detail = page.getByTestId('network-detail')
  await expect(detail).toContainText('https://cornerbakery.shop/api/products')
  await expect(page.getByTestId('network-status')).toHaveText('404 Not Found')
  await expect(page.getByTestId('network-response')).toContainText('text/html; charset=utf-8')
  await expect(page.getByTestId('network-response-body')).toContainText('<pre>Cannot GET /api/products</pre>')
  await expect(page.getByTestId('network-response-body').locator('pre')).toHaveCount(0)
  await expect(page.getByTestId('network-request')).toContainText('No body.')

  // "Sent from" opens the line that sent it
  await page.getByTestId('network-initiator').click()
  await expect(page.getByRole('tab', { name: 'menu.js' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.cm-line.cm-mark-error')).toContainText('fetch(\'/api/products\')')

  // the fix: ask for the path the server has, Save, Reload
  const level = levelById('debugging-06-menu-wont-load') as DebugLevel
  const fixed = level.setup().files['menu.js']!.replace('/api/products', '/api/menu')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(fixed)
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Read the status before the error')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)

  // the reload emptied the panel; the new request is a 200, and the menu is there
  await expect(list.getByRole('option')).toHaveCount(1)
  await expect(list.getByRole('option', { name: /GET \/api\/menu, 200 OK/ })).toBeVisible()
  await expect(app.locator('.product')).toHaveCount(3)
  await expect(tabs.getByRole('tab', { name: /Network/ })).not.toContainText('some failed')
})

test('moves through the requests with the keyboard, and shows the Network tab on phones', async ({ page }) => {
  await page.goto('/debugging/practice-failing-request')
  await page.getByRole('tablist', { name: 'Console and Network' }).getByRole('tab', { name: /Network/ }).click()
  const list = page.getByTestId('network-list')
  await expect(list.getByRole('option')).toHaveCount(3)
  await expect(list.getByRole('option', { name: /GET \/api\/specials, 503 Service Unavailable/ })).toBeVisible()

  // Down and Up move the selection, the details follow
  await list.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('network-status')).toHaveText('200 OK')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('network-status')).toHaveText('503 Service Unavailable')
  await expect(page.getByTestId('network-response-body')).toContainText('"error": "The specials board is being updated."')

  // in a find task, "Sent from" is an answer
  await page.getByTestId('network-initiator').click()
  await expect(page.locator('[data-goal="found"]')).toHaveAttribute('data-met', 'true')

  // on a phone the panels are four tabs, Network among them
  await page.setViewportSize({ width: 390, height: 844 })
  const phoneTabs = page.getByRole('tablist', { name: 'Panels' })
  await expect(phoneTabs.getByRole('tab')).toHaveText(['App', 'Console', /^Network, some failed/, 'Code'])
  await phoneTabs.getByRole('tab', { name: 'Network' }).click()
  await expect(list).toBeVisible()
  // narrow: the details follow the list, which stays (the keyboard keeps working)
  await list.getByRole('option').first().click()
  await expect(page.getByTestId('network-status')).toHaveText('200 OK')
  await expect(list).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByTestId('network-status')).toHaveText('200 OK')
  await expect(list.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a level without a backend has no Network panel', async ({ page }) => {
  await page.goto('/debugging/01-add-to-cart')
  await expect(page.getByTestId('console-log')).toContainText('Corner Bakery shop ready')
  await expect(page.getByRole('tablist', { name: 'Console and Network' })).toHaveCount(0)
  await expect(page.getByTestId('network-list')).toHaveCount(0)
})
