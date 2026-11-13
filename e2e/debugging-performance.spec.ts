import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { levelById } from '../shared/levels'
import type { DebugLevel } from '../shared/levels'

// Performance (ADR 0007, chapter 6) in a real browser: Record reloads the app with its code counted, the customer uses
// it, Stop shows the profile. Counted, not timed, so the numbers are exact: 6.3's Functions (formatPrice 2,304 times),
// a function's link into Code, the fix, Save and Reload, the debrief, and the work recorded again; 6.4's waterfall on the
// server's clock (each request sent once the one before had answered) and the same after Promise.all; 6.1's request per
// key, one action at a time; 6.5's repeated request; a find task answered from the Renders table after a wrong click; a
// recording on a phone (App and back, no sideways scroll); the focus on Show after either Stop; and a level without the
// panel has none. Run in Chromium, Firefox and WebKit.

const panel = (page: Page) => page.getByTestId('performance')
const app = (page: Page) => page.frameLocator('[data-testid="app-frame"]')
const functionRow = (page: Page, name: string) => panel(page).getByTestId('performance-functions').locator(`[data-function="${name}"]`)

async function record(page: Page) {
  await panel(page).getByTestId('performance-record').click()
  await expect(page.getByTestId('record-banner')).toBeVisible()
}

async function stop(page: Page) {
  await page.getByTestId('record-banner').getByRole('button', { name: 'Stop' }).click()
  await expect(panel(page).getByTestId('performance-recorded')).toContainText('Counted, not timed')
}

/** Replaces a file's text in Code, then saves it. */
async function replaceFile(page: Page, path: string, text: string) {
  await page.getByRole('tab', { name: path }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(text)
  await page.keyboard.press('ControlOrMeta+s')
}

test('plays 6.3: the Functions count formatPrice 2,304 times, a function opens its line, the fix does a fraction of the work', async ({ page }) => {
  await page.goto('/debugging/28-formatted-thousands')
  await expect(page.getByRole('heading', { level: 1, name: /Prices are formatted thousands of times/ })).toBeVisible()
  const lower = page.getByRole('tablist', { name: 'Performance and Console' })
  await expect(lower.getByRole('tab', { name: 'Performance' })).toHaveAttribute('aria-selected', 'true')
  await expect(panel(page)).toContainText('Record a run')

  await record(page)
  await expect(app(page).locator('#products .price')).toHaveCount(48)
  await stop(page)
  await expect(panel(page).getByTestId('performance-work')).toHaveText('10,540 units')
  await expect(functionRow(page, 'formatPrice').locator('td').nth(1)).toHaveText('2,304')
  await expect(functionRow(page, 'priceLabel').locator('td').nth(1)).toHaveText('48')
  // the most work first: priceLabel's total is everything formatPrice did and more
  const names = await panel(page).getByTestId('performance-functions').locator('[data-function]').evaluateAll(rows => rows.map(row => row.getAttribute('data-function')))
  expect(names.indexOf('priceLabel')).toBeLessThan(names.indexOf('formatPrice'))

  // a function opens its line in Code
  await functionRow(page, 'priceLabel').getByRole('button').click()
  await expect(page.locator('#debugging-editor')).toHaveAttribute('data-path', 'prices.js')

  // the fix: every price written once; the profile says its code is old now
  const level = levelById('debugging-28-formatted-thousands') as DebugLevel
  const fixed = level.setup().files['prices.js']!.replace(
    'export function priceLabel(id) {\n  const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\n  return labels.find(entry => entry.id === id).label\n}\n',
    'const labels = new Map(PRICES.map(entry => [entry.id, formatPrice(entry.cents)]))\n\nexport function priceLabel(id) {\n  return labels.get(id)\n}\n'
  )
  await replaceFile(page, 'prices.js', fixed)
  await expect(panel(page).getByTestId('performance-outdated')).toBeVisible()
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Work inside a loop runs once per round')
  await page.getByRole('button', { name: 'Stay here' }).click()
  // the focus goes back to the open panel: Record (a reload ended the profile)
  await expect(panel(page).getByTestId('performance-record')).toBeFocused()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)

  // recorded again: the same list, a fraction of the work
  await record(page)
  await expect(app(page).locator('#products .price')).toHaveCount(48)
  await stop(page)
  await expect(panel(page).getByTestId('performance-work')).toHaveText('293 units')
  await expect(functionRow(page, 'formatPrice').locator('td').nth(1)).toHaveText('48')
})

test('shows 6.4\'s waterfall on the server\'s clock, and Promise.all puts the requests side by side', async ({ page }) => {
  await page.goto('/debugging/29-one-after-another')
  await record(page)
  await expect(app(page).locator('#hours')).toHaveText('Mon–Fri 7:00–18:00 · Sat 7:00–13:00')
  await stop(page)
  const timeline = panel(page).getByTestId('performance-timeline')
  await expect(timeline.getByTestId('request-range')).toHaveText(['0–400 ms', '400–700 ms', '700–900 ms'])
  await expect(timeline.getByTestId('request-after')).toHaveText(['sent once menu answered', 'sent once specials answered'])
  await expect(panel(page).getByTestId('performance-server-time')).toHaveText('900 ms')
  // Sent from opens the line that sent it
  await timeline.locator('[data-line="load.js:6"]').first().click()
  await expect(page.locator('#debugging-editor')).toHaveAttribute('data-path', 'load.js')

  const level = levelById('debugging-29-one-after-another') as DebugLevel
  const fixed = level.setup().files['load.js']!.replace(
    '  const menu = await getJson(\'/api/menu\')\n  const specials = await getJson(\'/api/specials\')\n  const hours = await getJson(\'/api/hours\')\n',
    '  const [menu, specials, hours] = await Promise.all([getJson(\'/api/menu\'), getJson(\'/api/specials\'), getJson(\'/api/hours\')])\n'
  )
  await replaceFile(page, 'load.js', fixed)
  await panel(page).getByTestId('performance-record').click()
  await expect(app(page).locator('#hours')).toHaveText('Mon–Fri 7:00–18:00 · Sat 7:00–13:00')
  await stop(page)
  await expect(timeline.getByTestId('request-range')).toHaveText(['0–400 ms', '0–300 ms', '0–200 ms'])
  await expect(timeline.getByTestId('request-after')).toHaveCount(0)
  await expect(panel(page).getByTestId('performance-server-time')).toHaveText('400 ms')
})

test('tells 6.1\'s actions apart: a request per key while typing, one action at a time', async ({ page }) => {
  await page.goto('/debugging/26-request-per-key')
  await expect(page.getByRole('tablist', { name: 'Performance, Console and Network' })).toBeVisible()
  await record(page)
  await expect(page.getByTestId('record-banner')).toContainText('units')
  await app(page).locator('#search').pressSequentially('croissant', { delay: 60 })
  await expect(app(page).locator('#results-heading')).toHaveText('2 results for “croissant”')
  await stop(page)
  await expect(panel(page).getByTestId('performance-requests')).toHaveText('7')
  const choice = panel(page).getByTestId('performance-action')
  // the page's load, then one action per key (and the field's change, once Stop takes the focus away)
  await expect(choice.locator('option').nth(11)).toHaveText(/^11\. Change of input#search: croissant · 0 units$/)
  await expect(choice.locator('option').nth(1)).toHaveText(/^1\. Page load · \d+ units$/)
  await expect(choice.locator('option').nth(10)).toHaveText(/^10\. Typing in input#search: “croissant” · \d+ units$/)
  await choice.selectOption({ index: 10 })
  await expect(panel(page).getByTestId('performance-requests')).toHaveText('1')
  await expect(panel(page).getByTestId('performance-timeline').locator('[data-request]')).toHaveCount(1)
  await expect(panel(page).getByTestId('performance-timeline')).toContainText('GET search?q=croissant')
  // the second letter sends nothing yet
  await choice.selectOption({ index: 3 })
  await expect(panel(page)).toContainText('No requests here.')
})

test('marks 6.5\'s repeated request as the same request again', async ({ page }) => {
  await page.goto('/debugging/30-asks-again')
  await record(page)
  await expect(app(page).locator('#products .name').first()).toHaveText('Butter croissant')
  await app(page).locator('#tab-specials').click()
  await expect(app(page).locator('#products .name').first()).toHaveText('Plum cake')
  await app(page).locator('#tab-menu').click()
  await expect(app(page).locator('#products .name').first()).toHaveText('Butter croissant')
  await stop(page)
  const timeline = panel(page).getByTestId('performance-timeline')
  await expect(timeline.locator('[data-request]')).toHaveCount(3)
  await expect(timeline.getByTestId('request-repeats')).toHaveText(['the same request again'])
})

test('answers a find task from the Renders table, after a wrong click', async ({ page }) => {
  await page.goto('/debugging/practice-draws-all-days')
  await record(page)
  await app(page).locator('[data-day="Fri"]').click()
  await expect(app(page).locator('#chosen')).toHaveText('Pick up on Fri')
  await stop(page)
  await panel(page).getByTestId('performance-action').selectOption({ index: 2 })
  const renders = panel(page).getByTestId('performance-renders-table')
  await expect(renders.locator('[data-render]')).toHaveCount(2)
  await expect(renders.locator('[data-render="drawDays"] td').nth(2)).toHaveText('14')
  await renders.locator('[data-render="showChosen"]').getByRole('button', { name: /^showChosen: answer days\.js, line 11$/ }).click()
  await expect(page.getByTestId('pick-verdict')).toContainText('Not days.js:11.')
  await renders.locator('[data-render="drawDays"]').getByRole('button', { name: /^drawDays: answer/ }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)
})

test('records on a phone: the App to use, then back to the panel, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/debugging/27-redraws-menu')
  const tabs = page.getByRole('tablist', { name: 'Panels' })
  // the phone's tab is short, its name is not
  await expect(tabs.getByRole('tab', { name: 'Performance' })).toHaveText('PerfPerformance')
  await tabs.getByRole('tab', { name: 'Performance' }).click()
  await panel(page).getByTestId('performance-record').click()
  await expect(tabs.getByRole('tab', { name: 'App' })).toHaveAttribute('aria-selected', 'true')
  await app(page).locator('[data-id="croissant"] .add').click()
  await expect(app(page).locator('#basket li')).toHaveCount(1)
  await page.getByTestId('record-banner').getByRole('button', { name: 'Stop' }).click()
  await expect(tabs.getByRole('tab', { name: 'Performance' })).toHaveAttribute('aria-selected', 'true')
  await panel(page).getByTestId('performance-action').selectOption({ index: 2 })
  await expect(panel(page).getByTestId('performance-renders-table').locator('[data-render="renderMenu"] td').nth(2)).toHaveText('48')
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(390)
})

test('after Stop (in the panel or in the App) the focus goes to Show', async ({ page }) => {
  await page.goto('/debugging/27-redraws-menu')
  await record(page)
  await expect(app(page).locator('#products .add')).toHaveCount(24)
  await panel(page).getByTestId('performance-stop').click()
  await expect(panel(page).getByTestId('performance-action')).toBeFocused()
  await panel(page).getByTestId('performance-record').click()
  await expect(page.getByTestId('record-banner')).toBeVisible()
  await page.getByTestId('record-banner').getByRole('button', { name: 'Stop' }).press('Enter')
  await expect(panel(page).getByTestId('performance-action')).toBeFocused()
})

test('a level without the panel has none', async ({ page }) => {
  await page.goto('/debugging/21-discount-twice')
  await expect(page.getByRole('tablist', { name: 'Debugger and Console' })).toBeVisible()
  await expect(page.getByTestId('performance')).toHaveCount(0)
})
