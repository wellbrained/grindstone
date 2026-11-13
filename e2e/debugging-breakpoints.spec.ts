import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { levelById } from '../shared/levels'
import type { DebugLevel } from '../shared/levels'

// Breakpoints & stepping (ADR 0007, chapter 5) in a real browser: a breakpoint from the gutter, Record (the app reloads
// instrumented), using the app, Stop, then moving through the recording: Resume to each stop, the Call stack and Scope
// of that moment, Step out, over and back, the scrubber, a frame's own line; the fix, Save and Reload; the debrief over a
// recording (Stop gets the focus back, no stepping keys behind it, its title clear of the close button on a phone). A
// conditional breakpoint finds the one bad round of a loop, and the keys that stay the browser's (Shift+F8, Shift+F10,
// F11) do nothing; a find task is answered at a recorded step; on a phone, recording goes to the App and back to the
// Debugger; after Stop (in the panel or the App) the focus goes to the stepping controls. Run in Chromium, Firefox and
// WebKit.

const lineNumber = (page: Page, line: number) => page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: new RegExp(`^${line}$`) })
const frames = (page: Page) => page.getByTestId('debugger-stack').locator('[data-frame]')
const scopeRow = (page: Page, name: string) => page.getByTestId('debugger-scope').locator('div, summary').filter({ hasText: new RegExp(`^\\s*${name}:`) }).first()

test('plays 5.1: a breakpoint, a recording, the Call stack and stepping, then the fix', async ({ page }) => {
  await page.goto('/debugging/21-discount-twice')
  await expect(page.getByRole('heading', { level: 1, name: /The discount is applied twice/ })).toBeVisible()
  const lower = page.getByRole('tablist', { name: 'Debugger and Console' })
  await expect(lower.getByRole('tab', { name: 'Debugger' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('debugger')).toContainText('Record a run')

  // a breakpoint inside applyDiscount, from the line number
  await expect(page.locator('#debugging-editor')).toHaveAttribute('data-path', 'loyalty.js')
  await lineNumber(page, 5).click()
  await expect(page.locator('[data-breakpoint="loyalty.js:5"]')).toContainText('return total * (1 - LOYALTY_DISCOUNT)')
  await expect(page.locator('.cm-breakpoint')).toHaveCount(1)

  // Record: the app reloads instrumented; use it like the customer did
  await page.getByTestId('debugger-record').click()
  await expect(page.getByTestId('record-banner')).toBeVisible()
  const app = page.frameLocator('[data-testid="app-frame"]')
  await app.locator('[data-id="croissant"] .add').click()
  await app.locator('[data-id="croissant"] .add').click()
  await app.locator('#loyalty').check()
  await expect(app.locator('#order-total')).toHaveText('3.89')
  await page.getByTestId('record-banner').getByRole('button', { name: 'Stop' }).click()

  // a recording, never a paused app; it opens at the first stop of the breakpoint
  await expect(page.getByTestId('debugger-recorded')).toContainText('Recorded run: the app isn\'t paused')
  await expect(page.getByTestId('record-banner')).toHaveCount(0)
  await expect(page.getByTestId('debugger-location')).toHaveText('loyalty.js:5')
  await expect(frames(page)).toHaveText([/applyDiscount\s*loyalty\.js:5/, /basketTotal\s*cart\.js:17/, /renderTotal\s*checkout\.js:11/])
  await expect(scopeRow(page, 'total')).toContainText('4.8')
  await expect(page.locator('.cm-line.cm-step-line')).toHaveText('  return total * (1 - LOYALTY_DISCOUNT)')
  await expect(page.getByTestId('breakpoint-hits')).toHaveText('hit 2 times')

  // Resume (F8): the second stop, called by renderTotal with the total that already had the discount
  await page.keyboard.press('F8')
  await expect(frames(page)).toHaveText([/applyDiscount\s*loyalty\.js:5/, /renderTotal\s*checkout\.js:12/])
  await expect(scopeRow(page, 'total')).toContainText('4.32')
  await page.keyboard.press('F8')
  await expect(page.getByTestId('debugger-note')).toHaveText('No breakpoint stops after this: at the end of the recording.')
  const position = await page.getByTestId('debugger-position').textContent()
  expect(position).toMatch(/^Step (\d+) of \1$/)

  // back to the first stop, out of applyDiscount, over the rest of basketTotal, and back a step
  await page.getByTestId('debugger-resume-back').click()
  await page.getByTestId('debugger-resume-back').click()
  await expect(frames(page)).toHaveCount(3)
  await page.keyboard.press('Shift+F11')
  await expect(page.getByTestId('debugger-location')).toHaveText('cart.js:18')
  await expect(page.locator('#debugging-editor')).toHaveAttribute('data-path', 'cart.js')
  await expect(page.locator('.cm-line.cm-step-line')).toHaveText('  return total')
  await expect(scopeRow(page, 'total')).toContainText('4.32')
  await page.keyboard.press('F10')
  await expect(page.getByTestId('debugger-location')).toHaveText('checkout.js:12')
  await page.getByTestId('debugger-step-back').click()
  await expect(page.getByTestId('debugger-location')).toHaveText('cart.js:18')

  // a caller's frame: its own line and its values at that moment
  await frames(page).filter({ hasText: 'renderTotal' }).click()
  await expect(frames(page).filter({ hasText: 'renderTotal' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('#debugging-editor')).toHaveAttribute('data-path', 'checkout.js')
  await expect(page.locator('.cm-line.cm-step-line')).toHaveText('  let total = basketTotal()')

  // the scrubber goes anywhere
  await page.getByTestId('debugger-scrubber').fill('1')
  await expect(page.getByTestId('debugger-position')).toHaveText(/^Step 1 of \d+$/)

  // the fix: the page shows what basketTotal worked out; the recording says its code is old now
  const level = levelById('debugging-21-discount-twice') as DebugLevel
  const fixed = level.setup().files['checkout.js']!.replace('  if (card.checked) total = applyDiscount(total)\n', '')
  await page.getByRole('tab', { name: 'checkout.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(fixed)
  await expect(page.getByTestId('debugger-outdated')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('A breakpoint says how often, the Call stack says who')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)
  // a reload ends the recording; the breakpoint stays
  await expect(page.getByTestId('debugger')).toContainText('Record a run')
  await expect(page.locator('[data-breakpoint="loyalty.js:5"]')).toBeVisible()

  // recording again, the debrief shown and closed: the focus goes to Stop, the only control there is then
  const dialog = page.getByRole('dialog')
  await page.getByTestId('debugger-record').click()
  await expect(page.getByTestId('debugger-stop')).toBeVisible()
  await page.getByRole('button', { name: 'Show debrief' }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('debugger-stop')).toBeFocused()

  // recorded, the Debugger's keys do nothing behind the debrief
  await page.getByTestId('debugger-stop').click()
  await expect(page.getByTestId('debugger-recorded')).toBeVisible()
  const at = await page.getByTestId('debugger-position').textContent()
  await page.getByRole('button', { name: 'Show debrief' }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('F10')
  await page.keyboard.press('F8')
  await expect(page.getByTestId('debugger-position')).toHaveText(at!)

  // on a phone the debrief's title keeps clear of the close button
  await page.setViewportSize({ width: 390, height: 844 })
  const title = await dialog.getByRole('heading').first().boundingBox()
  const close = await dialog.getByRole('button', { name: 'Close' }).boundingBox()
  expect(title!.x + title!.width).toBeLessThanOrEqual(close!.x)
})

test('5.5: a conditional breakpoint stops only in the round that goes wrong', async ({ page }) => {
  await page.goto('/debugging/25-seventh-item')
  await expect(page.locator('#debugging-editor')).toHaveAttribute('data-path', 'wholesale.js')
  await lineNumber(page, 9).click()
  const condition = page.getByTestId('breakpoint-condition')
  // a condition can't change values
  await condition.fill('price = 1')
  await condition.press('Enter')
  await expect(page.getByTestId('breakpoint-condition-error')).toHaveText('A condition can\'t change values: use === to compare')
  await condition.fill('price < 1')
  await condition.press('Enter')
  await expect(page.getByTestId('breakpoint-condition-error')).toHaveCount(0)
  await expect(page.locator('.cm-breakpoint-conditional')).toHaveCount(1)

  // the total is worked out as the page loads: Record, then Stop
  await page.getByTestId('debugger-record').click()
  await expect(page.frameLocator('[data-testid="app-frame"]').locator('#wholesale-total')).toHaveText('57.12')
  await page.getByTestId('debugger-stop').click()
  await expect(page.getByTestId('debugger-location')).toHaveText('wholesale.js:9')
  await expect(page.getByTestId('breakpoint-hits')).toHaveText('hit once')
  await expect(scopeRow(page, 'bread')).toContainText('name: \'Rye loaf\', grams: 0.75')
  await expect(scopeRow(page, 'price')).toContainText('0.0048')
  // keys that stay the browser's: Shift+F8, Shift+F10 (the context menu), plain F11 (full screen); Ctrl+; steps into
  const position = page.getByTestId('debugger-position')
  const stop = await position.textContent()
  for (const key of ['Shift+F8', 'Shift+F10', 'F11']) await page.keyboard.press(key)
  await expect(position).toHaveText(stop!)
  await page.keyboard.press('Control+;')
  await expect(position).not.toHaveText(stop!)
  await page.getByTestId('debugger-step-back').click()
  await expect(position).toHaveText(stop!)
  // open the object: its entries
  await scopeRow(page, 'bread').click()
  await expect(scopeRow(page, 'grams')).toContainText('0.75')
  await page.keyboard.press('F8')
  await expect(page.getByTestId('debugger-note')).toContainText('No breakpoint stops after this')
})

test('a find task is answered at a recorded step, a wrong frame says why not', async ({ page }) => {
  await page.goto('/debugging/practice-stock-zero')
  // in a find task a line number sets a breakpoint; the line itself would answer
  await lineNumber(page, 6).click()
  await expect(page.locator('[data-breakpoint="stock.js:6"]')).toBeVisible()
  await expect(page.getByTestId('pick-verdict')).toHaveCount(0)
  await page.getByTestId('debugger-record').click()
  await expect(page.frameLocator('[data-testid="app-frame"]').locator('.price').first()).toHaveText('0 left')
  await page.getByTestId('debugger-stop').click()
  await expect(page.getByTestId('debugger-location')).toHaveText('stock.js:6')
  await expect(scopeRow(page, 'left')).toContainText('12')
  await page.keyboard.press('F10')
  await expect(page.getByTestId('debugger-location')).toHaveText('stock.js:7')
  await expect(scopeRow(page, 'left')).toContainText('0')
  await page.getByTestId('debugger-step-back').click()

  // the frame below is a link like the Console's: an answer, and this one is wrong
  await frames(page).filter({ hasText: 'app.js:10' }).click()
  await expect(page.getByTestId('pick-verdict')).toContainText('Not app.js:10.')
  await page.getByTestId('debugger-answer').click()
  await expect(page.getByTestId('pick-verdict')).toHaveCount(0)
  await expect(page.getByText('An assignment in a condition changes the value it was meant to check')).toBeVisible()
})

test('on a phone: Record goes to the App, Stop back to the Debugger, nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/debugging/24-always-pickup')
  const tabs = page.getByRole('tablist', { name: 'Panels' })
  await expect(tabs.getByRole('tab')).toHaveText(['App', 'Debugger', 'Console', 'Code'])
  await tabs.getByRole('tab', { name: 'Debugger' }).click()
  await page.getByTestId('debugger-record').click()
  await expect(tabs.getByRole('tab', { name: 'App' })).toHaveAttribute('aria-selected', 'true')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await app.locator('[data-id="croissant"] .add').click()
  await app.locator('[data-id="sourdough"] .add').click()
  await app.locator('input[value="delivery"]').check()
  await app.locator('#order').click()
  await expect(app.locator('#order-status')).toHaveText('Order 1: 2 items, for pickup tomorrow from 7:00.')
  await page.getByTestId('record-banner').getByRole('button', { name: 'Stop' }).click()
  await expect(tabs.getByRole('tab', { name: 'Debugger' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('debugger-recorded')).toBeVisible()
  // the line it is at shows in the panel itself, so stepping needs no tab switch
  await page.getByTestId('debugger-toggle-here').click()
  await expect(page.locator('[data-breakpoint]')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('after Stop (in the panel or in the App) the focus goes to the stepping controls', async ({ page }) => {
  await page.goto('/debugging/21-discount-twice')
  await page.getByTestId('debugger-record').click()
  await expect(page.getByTestId('record-banner')).toBeVisible()
  await page.frameLocator('[data-testid="app-frame"]').locator('[data-id="croissant"] .add').click()
  await page.getByTestId('debugger-stop').click()
  await expect(page.getByTestId('debugger-resume-back')).toBeFocused()
  await page.getByTestId('debugger-record').click()
  await expect(page.getByTestId('record-banner')).toBeVisible()
  await page.getByTestId('record-banner').getByRole('button', { name: 'Stop' }).press('Enter')
  await expect(page.getByTestId('debugger-resume-back')).toBeFocused()
})

test('a level without the Debugger has none, and runs its code as written', async ({ page }) => {
  await page.goto('/debugging/18-adds-sourdough')
  await expect(page.getByRole('heading', { level: 1, name: /Every Add button adds the sourdough/ })).toBeVisible()
  await expect(page.getByTestId('debugger')).toHaveCount(0)
  await expect(page.locator('.cm-breakpoint-gutter')).toHaveCount(0)
  const source = await page.locator('[data-testid="app-frame"]').getAttribute('srcdoc')
  expect(source).not.toContain('__gs$.s(')
})
