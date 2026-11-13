import { expect, test } from '@playwright/test'
import { levelById } from '../shared/levels'
import type { DebugLevel } from '../shared/levels'

// State & async (ADR 0007, chapter 4) in a real browser. 4.2 played like a player: typing "cro", a pause, then the rest
// of "croissant" leaves the results for "cro" on the page (the slow answer came last), the Network panel shows both
// searches and their times, the fix drops an answer for older words, Save and Reload solve it, and the reloaded app
// keeps the results for what is in the field after the slow answer is in. 4.1: the Console awaits a promise.
test('plays State & async 4.2: a search race, read in the Network panel and fixed', async ({ page }) => {
  await page.goto('/debugging/17-wrong-results')
  await expect(page.getByRole('heading', { level: 1, name: /Search shows results for the wrong word/ })).toBeVisible()
  const app = page.frameLocator('[data-testid="app-frame"]')
  const field = app.locator('#search')
  const heading = app.locator('#results-heading')
  const tabs = page.getByRole('tablist', { name: 'Console and Network' })
  const networkTab = tabs.getByRole('tab', { name: /Network/ })
  const list = page.getByTestId('network-list')

  // a customer types "cro", stops while it is on its way, then types the rest
  await networkTab.click()
  await field.click()
  await page.keyboard.type('cro')
  await expect(list.getByRole('option', { name: /^GET https:\/\/cornerbakery\.shop\/api\/search\?q=cro, pending/ })).toBeVisible()
  await page.keyboard.type('issant')
  await expect(field).toHaveValue('croissant')

  // the last answer to arrive is the old one: the field says croissant, the page shows what "cro" found
  await expect(list.getByRole('option', { name: /^GET https:\/\/cornerbakery\.shop\/api\/search\?q=cro, 200 OK, 1\.\d\d s$/ })).toBeVisible()
  await expect(list.getByRole('option', { name: /^GET https:\/\/cornerbakery\.shop\/api\/search\?q=croissant, 200 OK, \d+ ms$/ })).toBeVisible()
  await expect(heading).toHaveText('3 results for “cro”')
  await expect(app.locator('#results li')).toHaveCount(3)
  // the list names them like the browser's panel, the full address is the tooltip
  await expect(page.getByTestId('network-name').first()).toHaveText('search?q=cro')
  await expect(page.getByTestId('network-name').first()).toHaveAttribute('title', 'https://cornerbakery.shop/api/search?q=cro')
  await expect(page.getByTestId('network-name').last()).toHaveText('search?q=croissant')

  // the fix: an answer for older words is dropped; Save, Reload
  const level = levelById('debugging-17-wrong-results') as DebugLevel
  const fixed = level.setup().files['search.js']!.replace('  const products = await response.json()\n', '  const products = await response.json()\n  if (words !== field.value.trim().toLowerCase()) return\n')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(fixed)
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Answers do not wait their turn')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)

  // the reloaded app: the same typing, and the slow answer for "cro" no longer wins
  await expect(list.getByRole('option')).toHaveCount(0)
  await field.click()
  await page.keyboard.type('cro')
  await expect(list.getByRole('option', { name: /^GET https:\/\/cornerbakery\.shop\/api\/search\?q=cro, pending/ })).toBeVisible()
  await page.keyboard.type('issant')
  await expect(list.getByRole('option', { name: /^GET https:\/\/cornerbakery\.shop\/api\/search\?q=cro, 200 OK/ })).toBeVisible()
  await expect(heading).toHaveText('2 results for “croissant”')
  await expect(app.locator('#results li')).toHaveCount(2)
})

test('4.1: the Console shows the promise, and awaits it', async ({ page }) => {
  await page.goto('/debugging/16-object-promise')
  const app = page.frameLocator('[data-testid="app-frame"]')
  const log = page.getByTestId('console-log')
  const input = page.getByTestId('console-input')
  const result = log.locator('[data-level="result"]').last()

  await app.locator('[data-id="croissant"] .add').click()
  await expect(app.locator('#basket li')).toHaveText('Butter croissant · [object Promise]')
  await input.fill('cart.items[0]')
  await input.press('Enter')
  await expect(result).toHaveText(/\{id: 'croissant', name: 'Butter croissant', price: Promise\}/)
  await input.fill('priceOf(\'croissant\')')
  await input.press('Enter')
  await expect(result).toHaveText(/Promise \{…\}/)
  // a top-level await, as in the browser's own Console
  await input.fill('await priceOf(\'croissant\')')
  await input.press('Enter')
  await expect(result).toHaveText(/'2\.40 €'/)
  // with a trailing semicolon too, and a declaration keeps its value for the next input
  await input.fill('await priceOf(\'sourdough\');')
  await input.press('Enter')
  await expect(result).toHaveText(/'6\.50 €'/)
  await input.fill('const total = await priceOf(\'pain-au-chocolat\');')
  await input.press('Enter')
  await expect(result).toHaveText(/undefined/)
  await input.fill('total')
  await input.press('Enter')
  await expect(result).toHaveText(/'2\.80 €'/)
  await input.fill('await fetch(\'/api/prices/sourdough\').then(response => response.json())')
  await input.press('Enter')
  await expect(result).toHaveText(/\{id: 'sourdough', price: 6\.5, label: '6\.50 €'\}/)
  // a rejected await is an error, like any other
  await input.fill('await Promise.reject(new Error(\'no\'))')
  await input.press('Enter')
  await expect(log.locator('[data-level="error"]').last()).toContainText('Error: no')
})

// A check run types into the app in a hidden frame; it must never take the keyboard from Grindstone (Firefox lets a
// script in a sealed, inert frame take the focus: every key typed meanwhile went into the hidden app).
test('a check run never takes the keyboard: typing in the Console while 4.2\'s check runs keeps the focus and every key', async ({ page }) => {
  await page.goto('/debugging/17-wrong-results')
  const input = page.getByTestId('console-input')
  await expect(page.getByTestId('console-log')).toBeVisible()
  const typed = 'cart && "typed while the check run types into its own search field"'
  await page.getByTestId('reload').click()
  await input.click()
  // about 4 s of typing: longer than the check run, which types "cro", "croissant" and "cro" again
  await input.pressSequentially(typed, { delay: 60 })
  await expect(page.getByTestId('reloads')).toHaveText('Reloads: 1')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue(typed)
})
