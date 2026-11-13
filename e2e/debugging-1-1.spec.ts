import { expect, test } from '@playwright/test'
import { debuggingLevels } from '../shared/levels'

// Plays Debugging 1.1 like a player: the app breaks on Add, the Console shows the error, its trace opens cart.js at the
// line, the typo gets fixed and saved, Reload runs the goals, the debrief shows the run, the track page the best run.
test('plays Debugging 1.1 end to end', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('track-debugging-primary').click()
  await expect(page).toHaveURL(/\/debugging\/01-add-to-cart$/)
  await expect(page.getByRole('heading', { level: 1, name: /Add to cart does nothing/ })).toBeVisible()
  await expect(page.locator('[data-goal]')).toHaveCount(2)
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)
  await expect(page.getByTestId('reloads')).toHaveText('Reloads: 0')

  // the app runs in its sealed frame and says so in the Console
  const app = page.frameLocator('[data-testid="app-frame"]')
  const log = page.getByTestId('console-log')
  await expect(log).toContainText('Corner Bakery shop ready · 3 products')
  await expect(app.locator('#cart-count')).toHaveText('0')

  // Add does nothing on the page, but the Console has the error with its trace
  await app.locator('[data-id="croissant"] .add').click()
  await expect(app.locator('#cart-count')).toHaveText('0')
  const error = log.locator('[data-level="error"]')
  await expect(error).toContainText('Uncaught TypeError: Cannot read properties of undefined (reading \'push\')')
  await expect(error.locator('[data-frame]')).toHaveText(['cart.js:17', 'app.js:17'])

  // the top frame opens cart.js at line 17, marked
  await error.locator('[data-frame="cart.js:17"]').click()
  await expect(page.getByRole('tab', { name: 'cart.js' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.cm-line.cm-mark-error')).toContainText('cart.itmes.push(line)')

  // the Console input looks inside the app
  const input = page.getByTestId('console-input')
  await input.fill('cart.items')
  await input.press('Enter')
  await expect(log.locator('[data-level="result"]').last()).toHaveText(/\(0\) \[\]/)

  // fix the typo and save (Ctrl+S); the app still runs the old code until a reload
  const fixed = debuggingLevels[0]!.setup().files['cart.js']!.replace('cart.itmes.push', 'cart.items.push')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(fixed)
  await expect(page.getByRole('tab', { name: /cart\.js/ })).toContainText('●')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('tab', { name: /cart\.js/ })).not.toContainText('●')
  await expect(page.getByTestId('stale')).toBeVisible()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)

  // Reload: the goals are checked, the level is solved, the debrief shows the run
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('A typo that only shows up as undefined')
  await expect(page.getByTestId('debrief-stats')).toContainText('Reloads')
  await expect(page.getByTestId('debrief-stats')).toContainText('no hints · 1 reload')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)
  await expect(page.getByTestId('reloads')).toHaveText('Reloads: 1')

  // the reloaded app works
  await app.locator('[data-id="croissant"] .add').click()
  await expect(app.locator('#cart-count')).toHaveText('1')

  // the track page shows it solved, with the best run by Debugging's measure
  await page.goto('/debugging')
  const row = page.locator('[data-level="debugging-01-add-to-cart"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('best: no hints, 1 reload')
  await expect(page.locator('[data-level="debugging-practice-line-that-throws"]')).toHaveAttribute('data-state', 'next')
})

test('solves a find task with a click, after a wrong one that says why', async ({ page }) => {
  await page.goto('/debugging/practice-line-that-throws')
  const error = page.getByTestId('console-log').locator('[data-level="error"]')
  await expect(error.locator('[data-frame]')).toHaveText(['specials.js:11', 'specials.js:17', 'app.js:6'])

  await error.locator('[data-frame="specials.js:17"]').click()
  await expect(page.getByTestId('pick-verdict')).toContainText('Not specials.js:17. That line calls specialText')
  await expect(page.locator('.cm-line.cm-mark-warning')).toContainText('specialText(special)')
  await expect(page.locator('[data-goal="found"]')).toHaveAttribute('data-met', 'false')

  // the editor is read-only: a click on the right line answers
  await page.locator('.cm-line', { hasText: 'special.price.amount.toFixed(2)' }).click()
  await expect(page.locator('[data-goal="found"]')).toHaveAttribute('data-met', 'true')
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await expect(page.getByTestId('reloads')).toHaveText('Reloads: 0')
})
