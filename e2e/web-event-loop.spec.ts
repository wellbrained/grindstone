import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'
import { SHOW_AT_ONCE } from '../shared/levels/web/24-toast'
import { expected } from '../test/unit/levels/web/expected'

// Plays chapter 5 of Web fundamentals like a player (ADR 0009: the event loop): the prediction with the keyboard, the
// Event loop panel (the tap's task, its listener, the frames and what they painted), a fix in app.js, Reload with the
// keyboard, the debrief; a real tap in the app you see giving the same order as the check run's modelled tap; and the
// Event loop panel at a phone's width, light and dark. The app you see runs on the model as a check run does: what its
// frames started is what the check run's started (one requestAnimationFrame is no fade there either).
// Trace snapshots read the page's layout from outside its code while it loads: off here, so the panel shows only the
// page's own forced layouts.
test.use({ trace: 'off' })

/** A file as the level's solution leaves it. */
function solved(id: string, path: string): string {
  const level = levelById(id) as WebLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files[path]!
}

/** What the frames of the app you see started, as the Event loop panel lists it ('p#a.toast.visible opacity'). */
const startedInPanel = async (page: Page) => (await page.getByTestId('loop-started').allInnerTexts()).flatMap(text => text.replace(/^Started: /, '').split(' · '))

/** The Event loop panel's log lines (what the page logged), as they read. */
const loggedLines = (page: Page) => page.getByTestId('loop-line').and(page.locator('[data-kind="log"]')).getByTestId('loop-text').allInnerTexts()

test('plays 5.1 with the keyboard: predicts the frames, finds no spinner in them, waits for a frame, and the spinner shows', async ({ page }) => {
  await page.goto('/web/21-spinner')
  await expect(page.getByRole('heading', { level: 1, name: /The spinner that never spins/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  // the prediction, with the keyboard
  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /No spinner at all/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  await expect(page.getByTestId('prediction-result')).toBeFocused()

  // the scene ran: Lena's tap, then the thank-you
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#status')).toHaveText('Thank you! Order 1042: 9.80 €')

  // the Event loop panel is the chapter's own, first under the code: the tap, its listener, the frames
  const tabs = page.getByRole('tablist', { name: 'Event loop and Console' })
  await expect(tabs.getByRole('tab', { name: 'Event loop' })).toHaveAttribute('aria-selected', 'true')
  const lines = page.getByTestId('loop-line')
  await expect(lines.filter({ hasText: 'A tap on button#place.action' })).toHaveCount(1)
  await expect(lines.filter({ hasText: 'click listener on button#place.action' })).toHaveCount(1)
  await expect(page.getByTestId('loop-painted').filter({ hasText: 'Thank you! Order 1042' })).toHaveCount(1)
  await expect(page.getByTestId('loop-painted').filter({ hasText: 'spinner' })).toHaveCount(0)
  expect(await loggedLines(page)).toEqual(['Spinner shown', 'Receipt ready'])
  await expect(page.getByTestId('loop-summary')).toContainText('2 frames')

  // the fix: a frame before the work, typed into app.js and saved with the keyboard
  await page.getByRole('tab', { name: 'app.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solved('web-21-spinner', 'app.js'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').focus()
  await page.keyboard.press('Enter')
  const debrief = page.getByRole('dialog')
  await expect(debrief).toContainText('Nothing is painted in the middle of a task')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.keyboard.press('Escape')
  await expect(debrief).toBeHidden()

  // the reloaded app: a frame painted the spinner (its spin started there), then the work, then the thank-you
  await expect(page.getByTestId('loop-painted').filter({ hasText: /On screen: spinner/ })).toHaveCount(1)
  await expect(page.getByTestId('loop-started')).toContainText('p#spinner.spinner spin')
  await expect(lines.filter({ hasText: 'requestAnimationFrame' })).toHaveCount(1)
  await expect(app.locator('#status')).toHaveText('Thank you! Order 1042: 9.80 €')
  // a line of the timeline opens where it was set up: the frame callback's
  await lines.filter({ hasText: 'requestAnimationFrame' }).getByTestId('loop-source').click()
  await expect(page.getByRole('tab', { name: 'app.js' })).toHaveAttribute('aria-selected', 'true')
})

test('a real tap in the app you see runs its listeners as the check run\'s modelled tap does: a microtask checkpoint after each', async ({ page }) => {
  await page.goto('/web/practice-tap-order')
  // the right order with the keyboard: Listener 1 up twice, its microtask up once
  await page.getByRole('button', { name: 'Move “Listener 1” up' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Move “Microtask from listener 1” up' }).focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')

  // the scene's modelled tap
  const order = ['Listener 1', 'Microtask from listener 1', 'Listener 2', 'Microtask from listener 2']
  await expect.poll(() => loggedLines(page)).toEqual(order)
  // a tap of the browser's own (trusted): the same order, and the panel names it the browser's click event
  await page.frameLocator('[data-testid="app-frame"]').locator('#order').click()
  await expect.poll(() => loggedLines(page)).toEqual([...order, ...order])
  await expect(page.getByTestId('loop-line').filter({ hasText: 'The browser\'s click event on button#order.action' })).toHaveCount(1)
  const kinds = await page.getByTestId('loop-line').evaluateAll(rows => rows.map(row => `${row.getAttribute('data-kind')} ${row.getAttribute('data-source')}`))
  expect(kinds.slice(-7)).toEqual(['task event', 'listener ', 'log sync', 'log microtask', 'listener ', 'log sync', 'log microtask'])
})

test('the pickup menu in the app you see: a real tap opens and closes it, as the prediction said (5.2)', async ({ page }) => {
  await page.goto('/web/22-pickup-menu')
  await page.getByTestId('prediction').getByRole('radio', { name: /opens and closes within her tap/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect.poll(() => loggedLines(page)).toEqual(['Menu opened', 'Menu closed'])
  await app.locator('#pickup').click()
  await expect.poll(() => loggedLines(page)).toEqual(['Menu opened', 'Menu closed', 'Menu opened', 'Menu closed'])
  await expect(app.locator('#slots')).toBeHidden()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: the Event loop panel with 40 forced layouts, the Console and Code, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/23-kitchen-screen')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    await page.getByTestId('prediction').getByRole('radio', { name: /^40 times/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    expect(await scrollsSideways()).toBe(false)
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await expect(tabs.getByRole('tab')).toHaveCount(4)
    await tabs.getByRole('tab', { name: 'Event loop' }).click()
    const layout = page.getByTestId('loop-line').and(page.locator('[data-kind="layout"]'))
    await expect(layout).toHaveCount(1)
    await expect(layout.getByTestId('loop-text')).toHaveText('Forced layout: scrollHeight')
    await expect(layout.getByTestId('loop-times')).toHaveText('×40')
    await expect(layout.getByTestId('loop-source')).toHaveText('app.js:13')
    await expect(page.getByTestId('loop-summary')).toContainText('40 forced layouts')
    expect(await scrollsSideways()).toBe(false)
    // the panel's log takes the keyboard
    await page.getByTestId('loop-log').focus()
    await expect(page.getByTestId('loop-log')).toBeFocused()
    await tabs.getByRole('tab', { name: 'Console' }).click()
    await expect(page.getByTestId('console-log')).toContainText('40 orders added')
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Code' }).click()
    expect(await scrollsSideways()).toBe(false)
  })
}

test('the app you see starts the same transitions as the check run: Does it fade? (toast B, one requestAnimationFrame, pops there too)', async ({ page }) => {
  await page.goto('/web/practice-does-it-fade')
  const card = page.getByTestId('prediction')
  for (const answer of ['Yes: it fades in over 300 ms.', 'No: it appears at once.', 'Yes: it fades in over 300 ms.']) {
    await card.getByRole('radio', { name: answer }).check()
    await page.getByTestId('prediction-submit').click()
  }
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await expect.poll(() => startedInPanel(page)).toEqual(expected['web-practice-does-it-fade']!.start.animated)
})

test('the app you see: 5.4 with one requestAnimationFrame starts no fade-in there either, two do', async ({ page }) => {
  await page.goto('/web/24-toast')
  await page.getByTestId('prediction').getByRole('radio', { name: /appears at once/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  const app = (levelById('web-24-toast') as WebLevel).setup().files['app.js']!
  const oneFrame = app.replace(SHOW_AT_ONCE, '  area.append(element)\n  requestAnimationFrame(() => element.classList.add(\'visible\'))\n')
  const twoFrames = solved('web-24-toast', 'app.js')
  for (const [code, fades] of [[oneFrame, false], [twoFrames, true]] as const) {
    await page.getByRole('tab', { name: 'app.js' }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(code)
    await page.keyboard.press('ControlOrMeta+s')
    await page.getByTestId('reload').click()
    if (fades) {
      await expect(page.getByRole('dialog')).toContainText('A transition needs a before')
      await page.keyboard.press('Escape')
    }
    // the scene's tap ran, and its frames have been painted
    await expect(page.getByTestId('loop-painted').filter({ hasText: 'Butter croissant is in your basket' }).first()).toBeVisible()
    await page.waitForTimeout(800)
    const started = await startedInPanel(page)
    expect(started.includes('p.toast.visible opacity'), started.join(', ')).toBe(fades)
  }
})
