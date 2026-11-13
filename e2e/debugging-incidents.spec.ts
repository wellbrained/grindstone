import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { levelById } from '../shared/levels'
import type { DebugLevel } from '../shared/levels'

// Incidents (ADR 0007, chapter 7) in a real browser: 7.1 played like a player, through the Logs panel (the history, a
// filter by the customer's reference and by level, this load's lines on the server's clock, a request id that opens the
// Network panel), the Deploys panel (a deploy's diff, a changed line that opens Code, Roll back after a confirmation, the
// colleague who speaks after a rollback that loses the notes, Back to live) and the fix forward with the debrief; a find
// task answered with a deploy after a wrong one; a find task answered from a stack frame in the Logs; and a phone, where
// the six panels are two rows of tabs and nothing scrolls sideways. Run in Chromium, Firefox and WebKit.

const logs = (page: Page) => page.getByTestId('logs-list')
const lines = (page: Page) => logs(page).getByTestId('log-line')
const deploy = (page: Page, id: string) => page.locator(`[data-deploy="${id}"]`)

/** Replaces a file's text in Code, then saves it. */
async function replaceFile(page: Page, path: string, text: string) {
  await page.getByRole('tab', { name: path, exact: true }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(text)
  await page.keyboard.press('ControlOrMeta+s')
}

test('plays 7.1: reads the logs, inspects the deploy, rolls back, and fixes forward', async ({ page }) => {
  await page.goto('/debugging/31-checkout-errors')
  await expect(page.getByRole('heading', { level: 1, name: /Checkout errors since this morning/ })).toBeVisible()
  // Anna's report opens the messages
  await expect(page.getByTestId('team-message')).toHaveCount(1)
  await expect(page.getByTestId('team-message')).toContainText('req-4093')

  // the Logs panel is the first tab under the code and open
  const lower = page.getByRole('tablist', { name: 'Logs, Deploys, Console and Network' })
  await expect(lower.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
  // the history, then this load's menu request on the server's clock (09:41:00 plus its 80 ms), after a divider
  await expect(logs(page).getByTestId('logs-divider')).toContainText('09:41:00')
  await expect(lines(page).last()).toContainText('09:41:00.080')
  await expect(lines(page).last()).toContainText('GET /api/menu 200 OK · 80 ms')

  // the customer's reference: the body the server got, and where it failed (server code: text, no link)
  await page.getByTestId('logs-filter').fill('req-4093')
  await expect(lines(page)).toHaveCount(3)
  await expect(lines(page).nth(0)).toContainText('"note":"Two of them, please"')
  await expect(lines(page).nth(1)).toContainText('Cannot read properties of undefined (reading \'map\')')
  await expect(lines(page).nth(1)).toContainText('at priceOrder (server/orders.js:41:28)')
  await expect(lines(page).nth(1).getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('logs-count')).toHaveText('3 of 21 lines')
  await page.getByTestId('logs-filter').fill('')
  await page.getByTestId('logs-level').selectOption('error')
  await expect(lines(page).first()).toContainText('08:05:47')
  await page.getByTestId('logs-level').selectOption('all')

  // an order in the app: the server's new lines, and their request id opens the request in the Network panel
  const app = page.frameLocator('[data-testid="app-frame"]')
  await app.locator('[data-id="croissant"] .add').click()
  await app.locator('#order').click()
  await expect(app.locator('#order-status')).toContainText('reference req-4128')
  const failed = lines(page).filter({ hasText: 'POST /api/orders 500' }).last()
  await expect(failed).toContainText('req-4128')
  await failed.getByTestId('log-request').click()
  await expect(lower.getByRole('tab', { name: /Network/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('network-detail')).toBeFocused()
  await expect(page.getByTestId('network-detail')).toContainText('https://cornerbakery.shop/api/orders')
  await expect(page.getByTestId('network-response')).toContainText('req-4128')

  // the deploy: its diff, and a changed line opens where it is in the code now
  await lower.getByRole('tab', { name: 'Deploys' }).click()
  await expect(page.getByTestId('deploys-saved')).toContainText('the live version, b7e41d0')
  await deploy(page, 'b7e41d0').locator('summary').click()
  // the removed line and the added one both open line 13 (where the removed one was)
  const changed = deploy(page, 'b7e41d0').locator('[data-testid="diff-line"][data-line="order.js:13"]').filter({ hasText: 'lines, note' })
  await expect(changed).toContainText('+    body: JSON.stringify({ lines, note })')
  await changed.click()
  await expect(page.getByRole('tab', { name: 'order.js', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.cm-line.cm-mark-info')).toContainText('body: JSON.stringify({ lines, note })')

  // roll back: the dialog says what changes; the code is yesterday's, and the focus says so
  await deploy(page, 'a1f0c93').getByTestId('deploy-rollback').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Roll back to a1f0c93?')
  await expect(dialog).toContainText('Files that change: api.md, index.html and order.js.')
  await dialog.getByRole('button', { name: 'Roll back' }).click()
  await expect(page.getByTestId('deploys-saved')).toBeFocused()
  await expect(page.getByTestId('deploys-saved')).toContainText('Your saved code is a1f0c93')
  await expect(deploy(page, 'a1f0c93').getByTestId('deploy-saved')).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('body: JSON.stringify({ items })')
  // reloaded, orders go through, the notes are gone: one goal, and Ben speaks up (after a fix that did not do it all)
  await page.getByTestId('reload').click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)
  await expect(page.getByTestId('team-message')).toHaveCount(2)
  await expect(page.getByTestId('team-message').last()).toContainText('keep the notes')
  await expect(app.locator('#note')).toHaveCount(0)

  // back to live, then the fix forward
  await deploy(page, 'b7e41d0').getByTestId('deploy-rollback').click()
  await expect(dialog).toContainText('Back to the live version, b7e41d0?')
  await dialog.getByRole('button', { name: 'Back to live' }).click()
  await expect(page.getByTestId('deploys-saved')).toContainText('the live version, b7e41d0')
  const level = levelById('debugging-31-checkout-errors') as DebugLevel
  await replaceFile(page, 'order.js', level.setup().files['order.js']!.replace('JSON.stringify({ lines, note })', 'JSON.stringify({ items: lines, note })'))
  await expect(page.getByTestId('deploys-saved')).toContainText('none of these versions')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Read what the server got, then fix forward')
  await page.getByRole('button', { name: 'Stay here' }).click()
  // the focus goes back to the open lower panel: the Deploys panel's first control
  await expect(deploy(page, 'b7e41d0').getByTestId('deploy-rollback')).toBeFocused()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)
})

test('answers a find task with a deploy, after a wrong one', async ({ page }) => {
  await page.goto('/debugging/practice-broke-the-hours')
  await page.getByRole('tablist', { name: 'Logs, Deploys, Console and Network' }).getByRole('tab', { name: 'Deploys' }).click()
  // the latest deploy is not it
  await deploy(page, '9f0e1d2').getByTestId('deploy-answer').click()
  await expect(page.getByTestId('pick-verdict')).toContainText('Not 9f0e1d2.')
  await expect(page.getByTestId('pick-verdict')).toContainText('after the hours had broken at 10:38')
  // rolling back to try is allowed in a find task: the code in the editor is that version's
  await deploy(page, '1a2b3c4').getByTestId('deploy-rollback').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Roll back' }).click()
  await expect(page.getByTestId('deploys-saved')).toContainText('1a2b3c4')
  await deploy(page, '5d6e7f8').getByTestId('deploy-answer').click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)
  await expect(page.getByText('Line the moment it broke up with the deploys')).toBeVisible()
})

test('answers a find task from a stack frame in the Logs', async ({ page }) => {
  await page.goto('/debugging/practice-customer-error')
  const frame = lines(page).filter({ hasText: 'error on a customer\'s phone' }).locator('[data-frame="basket.js:8"]')
  await expect(frame).toHaveText('basket.js:8:22')
  await frame.click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(1)
})

test('fits a phone: six panels as two rows of tabs, a log line\'s request opens the Network tab, nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/debugging/33-roll-back-now')
  const tabs = page.getByRole('tablist', { name: 'Panels' })
  await expect(tabs.getByRole('tab')).toHaveText(['App', 'Logs', 'Deploys', 'Console', /^Network/, 'Code'])
  await tabs.getByRole('tab', { name: 'Logs' }).click()
  const slots = lines(page).filter({ hasText: 'GET /api/slots 404 Not Found' }).last()
  await expect(slots.getByTestId('log-request')).toHaveText('req-9715')
  await slots.getByTestId('log-request').click()
  await expect(tabs.getByRole('tab', { name: /Network/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('network-status')).toHaveText('404 Not Found')
  await tabs.getByRole('tab', { name: 'Deploys' }).click()
  await deploy(page, 'a90f3e7').locator('summary').click()
  await expect(deploy(page, 'a90f3e7').getByTestId('deploy-diff')).toBeVisible()
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways).toBeLessThanOrEqual(0)
  // the rollback the level asks for, on a phone
  await deploy(page, '5e1b8c3').getByTestId('deploy-rollback').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Roll back' }).click()
  await expect(page.getByTestId('deploys-saved')).toContainText('5e1b8c3')
})

test('names the saved work a rollback replaces, and Undo roll back brings it back (review 2026-11-13)', async ({ page }) => {
  await page.goto('/debugging/31-checkout-errors')
  const level = levelById('debugging-31-checkout-errors') as DebugLevel
  const files = level.setup().files
  // a saved change in order.js, an unsaved one in cart.js
  await replaceFile(page, 'order.js', `// mine: tried the items again\n${files['order.js']!}`)
  await page.getByRole('tab', { name: 'cart.js', exact: true }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('// not saved\n')
  const lower = page.getByRole('tablist', { name: 'Logs, Deploys, Console and Network' })
  await lower.getByRole('tab', { name: 'Deploys' }).click()
  await expect(page.getByTestId('deploys-saved')).toContainText('none of these versions')
  await deploy(page, 'a1f0c93').getByTestId('deploy-rollback').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Your saved changes in order.js are replaced too: Undo roll back brings them back.')
  await expect(dialog).toContainText('Your unsaved changes in cart.js are dropped.')
  await dialog.getByRole('button', { name: 'Roll back' }).click()
  await expect(page.getByTestId('deploys-saved')).toContainText('a1f0c93')
  // back to live does not bring it back; Undo roll back does
  await deploy(page, 'b7e41d0').getByTestId('deploy-rollback').click()
  await expect(dialog).toContainText('To undo it, roll back to a1f0c93 the same way.')
  await dialog.getByRole('button', { name: 'Back to live' }).click()
  await page.getByTestId('deploys-undo').click()
  await expect(page.getByTestId('deploys-saved')).toBeFocused()
  await expect(page.getByTestId('deploys-saved')).toContainText('none of these versions')
  await expect(page.getByTestId('deploys-undo')).toHaveCount(0)
  await page.getByRole('tab', { name: 'order.js', exact: true }).click()
  await expect(page.locator('.cm-line').first()).toHaveText('// mine: tried the items again')
  await expect(page.getByTestId('save-file')).toBeDisabled()
})

test('opens a diff line where it is in the editor\'s text, unsaved edits and all (review 2026-11-13)', async ({ page }) => {
  await page.goto('/debugging/31-checkout-errors')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('// one\n// two\n')
  const lower = page.getByRole('tablist', { name: 'Logs, Deploys, Console and Network' })
  await lower.getByRole('tab', { name: 'Deploys' }).click()
  await deploy(page, 'b7e41d0').locator('summary').click()
  await deploy(page, 'b7e41d0').getByTestId('diff-line').filter({ hasText: 'lines, note' }).click()
  await expect(page.locator('.cm-line.cm-mark-info')).toContainText('body: JSON.stringify({ lines, note })')
})

test('Undo roll back is gone once you save on top of the rollback: it never throws that save away (review 2026-11-13)', async ({ page }) => {
  await page.goto('/debugging/31-checkout-errors')
  const level = levelById('debugging-31-checkout-errors') as DebugLevel
  const files = level.setup().files
  await replaceFile(page, 'order.js', `// mine: tried the items again\n${files['order.js']!}`)
  const lower = page.getByRole('tablist', { name: 'Logs, Deploys, Console and Network' })
  await lower.getByRole('tab', { name: 'Deploys' }).click()
  await deploy(page, 'a1f0c93').getByTestId('deploy-rollback').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Roll back' }).click()
  await expect(page.getByTestId('deploys-undo')).toBeVisible()
  // a save on top of the rollback: Undo would replace it with the older copy, so it goes
  await page.getByRole('tab', { name: 'order.js', exact: true }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('// mine again, on a1f0c93\n')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('save-file')).toBeDisabled()
  await expect(page.getByTestId('deploys-undo')).toHaveCount(0)
  await expect(page.getByTestId('deploys-saved')).toContainText('none of these versions')
})

test('drops a second server report for a request it already logged (review 2026-11-13)', async ({ page }) => {
  // the page's own record of the reports that arrive (the top window only)
  await page.addInitScript(() => {
    if (window !== window.top) return
    const reports: unknown[] = []
    Object.assign(window, { gsReports: reports })
    window.addEventListener('message', (event) => {
      if ((event.data as { type?: unknown } | null)?.type === 'serverlog') reports.push(event.data)
    })
  })
  await page.goto('/debugging/31-checkout-errors')
  await expect(lines(page).last()).toContainText('GET /api/menu 200 OK · 80 ms')
  const before = await lines(page).count()
  const report = await page.evaluate(() => (window as unknown as { gsReports: unknown[] }).gsReports.at(-1))
  expect(report).toMatchObject({ type: 'serverlog' })
  // the app's own code can read its load's token from the bridge's script, so it can send that report again
  await page.evaluate(() => {
    Object.assign(window, {
      gsNext: new Promise<void>(resolve => window.addEventListener('message', (event) => {
        if ((event.data as { type?: unknown } | null)?.type === 'serverlog') requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
    })
  })
  const frame = await (await page.getByTestId('app-frame').elementHandle())!.contentFrame()
  await frame!.evaluate((copy) => {
    const token = /\{"token":"([^"]+)"/.exec([...document.scripts].map(script => script.textContent).join('\n'))?.[1]
    parent.postMessage({ ...(copy as object), grindstone: token }, '*')
  }, report)
  await page.evaluate(() => (window as unknown as { gsNext: Promise<void> }).gsNext)
  await expect(lines(page)).toHaveCount(before)
})
