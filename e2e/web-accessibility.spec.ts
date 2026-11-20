import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'
import { expected } from '../test/unit/levels/web/expected'

// Plays chapter 6 of Web fundamentals like a player (ADR 0009: accessibility): the prediction with the keyboard, the
// Accessibility panel (the reader's lines, the tree with its names and states, the modelled keyboard's keys), a fix,
// Reload with the keyboard, the debrief; the app you see speaking as the check run does; a real click in the app moving
// the model's focus; and the panel at a phone's width, light and dark.
// Trace snapshots read the page from outside its code: off here, as in chapter 5, so nothing but the model touches focus.
test.use({ trace: 'off' })

/** A file as the level's solution leaves it. */
function solved(id: string, path: string): string {
  const level = levelById(id) as WebLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files[path]!
}

/** What the reader said, line by line, as 'kind: text' (the panel's badge and words). */
const said = async (page: Page) => (await page.getByTestId('a11y-line').evaluateAll(rows => rows.map(row => `${row.getAttribute('data-kind')}: ${row.getAttribute('data-said') ?? ''}`)))

test('plays 6.1 with the keyboard: predicts "button", hears it, names the buttons, and the reader says which product', async ({ page }) => {
  await page.goto('/web/26-every-button')
  await expect(page.getByRole('heading', { level: 1, name: /Every button says/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  // the prediction, with the keyboard
  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /“Button”, and nothing else/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')

  // the Accessibility panel is the chapter's own, first under the code; the scene tabbed to the croissant's button
  const tabs = page.getByRole('tablist', { name: 'Accessibility and Console' })
  await expect(tabs.getByRole('tab', { name: 'Accessibility' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => said(page)).toEqual(expected['web-26-every-button']!.start.heard)
  await expect(page.getByTestId('a11y-focus')).toHaveText('button')
  const rows = page.getByTestId('a11y-row')
  await expect(rows.filter({ hasText: 'heading “Today\'s menu”' })).toHaveCount(1)
  await expect(rows.filter({ hasText: /^button “”/ })).toHaveCount(3)
  await expect(rows.filter({ hasText: 'heading “Corner Bakery” level 1' })).toHaveCount(1)
  await expect(page.locator('[data-testid="a11y-row"][data-focused]')).toHaveCount(1)

  // the panel's Tab key, with the keyboard: the next button says nothing more
  await page.getByTestId('a11y-key-Tab').focus()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await said(page)).at(-1)).toBe('focus: button')
  await expect(page.getByTestId('a11y-line').last()).toContainText('after Tab')

  // the fix, typed into app.js and saved with the keyboard
  await page.getByRole('tab', { name: 'app.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solved('web-26-every-button', 'app.js'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').focus()
  await page.keyboard.press('Enter')
  const debrief = page.getByRole('dialog')
  await expect(debrief).toContainText('A name for every button')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.keyboard.press('Escape')
  await expect(debrief).toBeHidden()

  // the reloaded app: every button has its name, and the reader says it
  await expect.poll(() => said(page)).toEqual(expected['web-26-every-button']!.solved!.heard)
  await expect(rows.filter({ hasText: 'button “Add Cinnamon bun to your basket”' })).toHaveCount(1)
  await page.getByTestId('a11y-key-Tab').click()
  await expect.poll(async () => (await said(page)).at(-1)).toBe('focus: Add Pain au chocolat to your basket, button')
  // Enter on it adds it in the app you see
  await page.getByTestId('a11y-key-Enter').click()
  await expect(page.frameLocator('[data-testid="app-frame"]').locator('#cart-count')).toHaveText('1')
})

test('the app you see speaks as the check run does: the five messages, the toggles\' states', async ({ page }) => {
  await page.goto('/web/practice-announced')
  const card = page.getByTestId('prediction')
  await card.getByRole('checkbox', { name: /^A:/ }).check()
  await card.getByRole('checkbox', { name: /^B:/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await expect.poll(() => said(page)).toEqual(expected['web-practice-announced']!.start.heard)

  await page.goto('/web/practice-which-state')
  for (const answer of ['“Pressed”', '“Expanded”', /Nothing: aria-checked/]) {
    await page.getByTestId('prediction').getByRole('radio', { name: answer }).check()
    await page.getByTestId('prediction-submit').click()
  }
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await expect.poll(() => said(page)).toEqual(expected['web-practice-which-state']!.start.heard)
  await expect(page.getByTestId('a11y-row').filter({ hasText: 'button “Opening hours”' })).toContainText('expanded')
})

test('a real click in the app you see moves the model\'s focus, and its keys go on from there (6.4)', async ({ page }) => {
  await page.goto('/web/29-silent-error')
  await page.getByTestId('prediction').getByRole('radio', { name: /^Nothing:/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  await expect.poll(() => said(page)).toEqual(expected['web-29-silent-error']!.start.heard)
  // a real click into the field: the reader follows it
  await page.frameLocator('[data-testid="app-frame"]').locator('#email').click()
  await expect.poll(async () => (await said(page)).at(-1)).toBe('focus: Email for your receipt, textbox, tomas@')
  await expect(page.getByTestId('a11y-line').last()).toContainText('after your click or key')
  // the panel's Tab goes on from there, to Send receipt; Enter on it says nothing, as the prediction said
  await page.getByTestId('a11y-key-Tab').click()
  await expect.poll(async () => (await said(page)).at(-1)).toBe('focus: Send receipt, button')
  await page.getByTestId('a11y-key-Enter').click()
  await page.waitForTimeout(400)
  expect((await said(page)).at(-1)).toBe('focus: Send receipt, button')
  await expect(page.frameLocator('[data-testid="app-frame"]').locator('#email-error')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: the Accessibility panel's keys, reader and tree, the Console and Code, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/30-focus-lost')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    await page.getByTestId('prediction').getByRole('radio', { name: /^Out of the page/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    expect(await scrollsSideways()).toBe(false)
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await tabs.getByRole('tab', { name: 'Accessibility' }).click()
    await expect.poll(() => said(page)).toEqual(expected['web-30-focus-lost']!.start.heard)
    await expect(page.getByTestId('a11y-focus')).toHaveText('the page itself (nothing has focus)')
    // the panel says in words what happened when Tab left the page
    await expect(page.locator('[data-testid="a11y-line"][data-kind="leave"] [data-testid="a11y-said"]')).toHaveText('Tab left the page: the browser\'s own controls (the address bar) have focus')
    expect(await scrollsSideways()).toBe(false)
    // the keys work at this width: Tab from out of the page comes back in at the top
    await page.getByTestId('a11y-key-Tab').click()
    await expect.poll(async () => (await said(page)).at(-1)).toBe('focus: Add Butter croissant, button')
    await expect(page.getByTestId('a11y-row').filter({ hasText: 'button “Change pickup time”' })).toHaveCount(1)
    expect(await scrollsSideways()).toBe(false)
    // the reader's log takes the keyboard
    await page.getByTestId('a11y-log').focus()
    await expect(page.getByTestId('a11y-log')).toBeFocused()
    await tabs.getByRole('tab', { name: 'Console' }).click()
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Code' }).click()
    expect(await scrollsSideways()).toBe(false)
  })
}
