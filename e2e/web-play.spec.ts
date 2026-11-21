import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'

// Plays the Web fundamentals track like a player (ADR 0009): the prediction card first (a form, answered with the
// keyboard; the focus goes to the verdict), the app only then, the Network panel's preflight and its reason, the Server
// panel (what reached server.js), a fix in server.js, Reload, the debrief's run with its wrong prediction, the track
// page's best run. A practice task's lines are put in order with the keyboard alone. And the page at a phone's width,
// light and dark.

/** server.js as the level's solution leaves it. */
function solvedServer(id: string): string {
  const level = levelById(id) as WebLevel
  const step = level.solution.find(each => typeof each === 'object' && 'save' in each && each.save === 'server.js') as { save: string, replace: readonly [string, string] }
  return editedText(level.setup().files, step)
}

test('plays 1.2: a wrong prediction, the preflight in the Network panel, the fix in server.js', async ({ page }) => {
  await page.goto('/web/02-order-preflight')
  await expect(page.getByRole('heading', { level: 1, name: /The order won't go through/ })).toBeVisible()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)
  // the app waits for the prediction; Reload is off
  await expect(page.getByTestId('app-waits')).toBeVisible()
  await expect(page.getByTestId('app-frame')).toHaveCount(0)
  await expect(page.getByTestId('reload')).toBeDisabled()

  // the card is a form: a radio group under the question, answered with the keyboard (a wrong answer here)
  const card = page.getByTestId('prediction')
  const group = card.getByRole('group')
  await expect(group).toContainText('Lena taps Place order')
  await expect(card.getByRole('radio')).toHaveCount(4)
  await card.getByRole('radio', { name: /The order goes through/ }).focus()
  await page.keyboard.press('Space')
  await expect(card.getByRole('radio', { name: /The order goes through/ })).toBeChecked()
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')

  // who was right, the rule, and the focus on the verdict; it never blocks
  const result = page.getByTestId('prediction-result')
  await expect(result).toBeFocused()
  // a group named by the verdict and described by the rule: focused, a screen reader reads both
  await expect(result).toHaveRole('group')
  await expect(result).toHaveAccessibleName(/^Not quite/)
  await expect(result).toHaveAccessibleDescription(/is not a simple request/)
  await expect(result).toHaveAttribute('data-right', 'false')
  await expect(result).toContainText('Not quite')
  await expect(page.getByTestId('prediction-right')).toContainText('The browser first asks with an OPTIONS request')
  await expect(page.getByTestId('prediction-rule')).toContainText('is not a simple request')
  await expect(page.getByTestId('wrong-predictions')).toHaveText('Wrong predictions: 1')
  await expect(page.locator('[data-goal="predicted"]')).toHaveAttribute('data-met', 'true')

  // the app runs now: Place order fails
  const app = page.frameLocator('[data-testid="app-frame"]')
  await app.locator('#order').click()
  await expect(app.locator('#order-status')).toHaveText('Sorry, your order did not go through. Please try again.')
  const log = page.getByTestId('console-log')
  await expect(log.locator('[data-level="error"]').first()).toContainText('has been blocked by CORS policy: Response to preflight request doesn\'t pass access control check: No \'Access-Control-Allow-Origin\' header is present on the requested resource.')

  // the Network panel: the POST refused, never sent, and its preflight as a row of its own
  const tabs = page.getByRole('tablist', { name: 'Console, Network and Server' })
  await tabs.getByRole('tab', { name: /Network/ }).click()
  const list = page.getByTestId('network-list')
  await expect(list.getByRole('option')).toHaveCount(2)
  const post = list.getByRole('option', { name: /^POST https:\/\/api\.cornerbakery\.shop\/orders, CORS error/ })
  const preflight = list.getByRole('option', { name: /^OPTIONS https:\/\/api\.cornerbakery\.shop\/orders, preflight, 200 OK/ })
  await expect(preflight.getByTestId('network-preflight')).toHaveText('preflight')
  await post.click()
  await expect(page.getByTestId('network-reason')).toContainText('Response to preflight request doesn\'t pass access control check')
  await expect(page.getByTestId('network-response')).toContainText('Never sent: the preflight\'s answer did not allow it.')
  await expect(page.getByTestId('network-request')).toContainText('origin')
  await preflight.click()
  await expect(page.getByTestId('network-detail')).toContainText('Preflight for')
  await expect(page.getByTestId('network-request')).toContainText('access-control-request-headers')
  await expect(page.getByTestId('network-response')).toContainText('allow')
  await expect(page.getByTestId('network-reason')).toHaveCount(0)

  // the Server panel: only the OPTIONS reached server.js
  await tabs.getByRole('tab', { name: 'Server' }).click()
  const server = page.getByTestId('server-log')
  await expect(server.getByTestId('server-text')).toHaveText(['OPTIONS /orders 200'])

  // the fix in server.js, Save, Reload: the debrief has the run with its wrong prediction
  await page.getByRole('tab', { name: 'server.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solvedServer('web-02-order-preflight'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Asked first, and refused')
  await expect(page.getByTestId('debrief-stats')).toContainText('Wrong predictions')
  await expect(page.getByTestId('debrief-stats')).toContainText('1 wrong prediction · no hints · 1 reload')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)

  // the reloaded app orders, and server.js got the POST this time
  await app.locator('#order').click()
  await expect(app.locator('#order-status')).toHaveText('Thanks! Order 1042 is in.')
  await expect(server.getByTestId('server-text')).toHaveText(['OPTIONS /orders 204', 'POST /orders 201'])

  // the track page: the best run by the track's measure
  await page.goto('/web')
  const row = page.locator('[data-level="web-02-order-preflight"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('best 1 wrong · 0 hints · 1 reload')
  await expect(page.locator('[data-level="web-practice-simple-or-preflight"]')).toContainText('predict')
})

test('puts a practice task\'s lines in order with the keyboard alone; the moves are said, the code is read-only', async ({ page }) => {
  await page.goto('/web/practice-console-order')
  const form = page.getByTestId('prediction-form')
  await expect(form).toHaveAttribute('data-form', 'order')
  await expect(page.getByTestId('read-only')).toBeVisible()
  const lines = page.getByTestId('prediction-line')
  await expect(lines).toHaveCount(4)
  const text = async () => (await lines.allInnerTexts()).map(line => line.replace(/^\d+\s*/, '').trim())
  expect((await text())[3]).toBe('Asking for the specials…')

  // "Asking for the specials…" up three times: the focus stays on its Up button, then moves to Down at the top
  await page.getByRole('button', { name: 'Move “Asking for the specials…” up' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-moved')).toHaveText('“Asking for the specials…” is now line 1 of 4.')
  await expect(page.getByRole('button', { name: 'Move “Asking for the specials…” down' })).toBeFocused()
  expect((await text())[0]).toBe('Asking for the specials…')

  // then "Page ready" up past the CORS line: asking, ready, blocked, none
  await page.getByRole('button', { name: 'Move “Page ready” up' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-moved')).toHaveText('“Page ready” is now line 2 of 4.')
  expect((await text()).map(line => line.slice(0, 20))).toEqual(['Asking for the speci', 'Page ready', 'Access to fetch at \'', 'No specials: Failed '])

  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toBeFocused()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await expect(page.getByTestId('wrong-predictions')).toHaveText('Wrong predictions: 0')
  // the app ran: the Console shows the lines in that order
  const log = page.getByTestId('console-log')
  await expect(log).toContainText('No specials: Failed to fetch')
})

test('answers a pick-lines question with checkboxes, and every answer of a set of three in turn', async ({ page }) => {
  await page.goto('/web/04-basket-header')
  const card = page.getByTestId('prediction')
  await expect(card.getByRole('checkbox')).toHaveCount(3)
  await card.getByRole('checkbox', { name: 'GET /menu' }).check()
  await card.getByRole('checkbox', { name: 'OPTIONS /basket' }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  await expect(page.getByTestId('wrong-predictions')).toHaveText('Wrong predictions: 0')

  await page.goto('/web/practice-same-origin')
  for (const [n, answer] of [[1, /Same origin/], [2, /Another origin/], [3, /Another origin/]] as const) {
    await expect(page.getByTestId('prediction-form')).toContainText(`Question ${n} of 3`)
    await page.getByTestId('prediction').getByRole('radio', { name: answer }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result').nth(n - 1)).toBeFocused()
  }
  await expect(page.getByTestId('prediction-result')).toHaveCount(3)
  await expect(page.getByTestId('practice-solved')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: the card, the App after the answer, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/01-menu-blocked')
    const card = page.getByTestId('prediction')
    await expect(card).toBeVisible()
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(await scrollsSideways()).toBe(false)
    await card.getByRole('radio', { name: /keeps the answer from the page/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    expect(await scrollsSideways()).toBe(false)
    await page.getByRole('tab', { name: 'Network' }).click()
    await expect(page.getByTestId('network-list').getByRole('option')).toHaveCount(1)
    await page.getByTestId('network-list').getByRole('option').click()
    await expect(page.getByTestId('network-reason')).toContainText('No \'Access-Control-Allow-Origin\' header')
    expect(await scrollsSideways()).toBe(false)
    await page.getByRole('tab', { name: 'Server' }).click()
    await expect(page.getByTestId('server-text')).toHaveText(['GET /menu 200'])
    await page.getByRole('tab', { name: 'App' }).click()
    await expect(page.getByTestId('app-frame')).toBeVisible()
    expect(await scrollsSideways()).toBe(false)
  })
}
