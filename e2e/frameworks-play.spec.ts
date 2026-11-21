import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { FrameworksLevel } from '../shared/levels'

// Plays Framework deep dives like a player (ADR 0010): the prediction with the keyboard, real Vue running in the app you
// see once it is answered, the Reactivity panel (what Vue rendered, and why), a fix in app.js, Reload with the keyboard,
// the debrief; a practice task; the track page; and the play page at a phone's width, light and dark.

/** A file as the level's solution leaves it. */
function solved(id: string, path: string): string {
  const level = levelById(id) as FrameworksLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files[path]!
}

test('plays 1.1 with the keyboard: predicts an empty basket, sees no render after a tap, fixes add, and the basket fills', async ({ page }) => {
  await page.goto('/frameworks/01-raw-basket')
  await expect(page.getByRole('heading', { level: 1, name: /The basket that never fills/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /Your basket is empty/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')

  // real Vue runs in the app you see: the menu is there; a tap logs, and the Basket never renders again
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#add-croissant')).toBeVisible()
  const tabs = page.getByRole('tablist', { name: 'Reactivity and Console' })
  await expect(tabs.getByRole('tab', { name: 'Reactivity' })).toHaveAttribute('aria-selected', 'true')
  const lines = page.getByTestId('reaction-line')
  await expect(lines.filter({ hasText: 'Basket renders' })).toHaveCount(1)
  await expect(lines.filter({ hasText: 'Basket renders' }).getByTestId('reaction-why')).toHaveText('because: mount')
  await app.locator('#add-croissant').click()
  await expect(lines.filter({ hasText: 'Added Butter croissant' })).toHaveCount(1)
  await expect(lines.filter({ hasText: 'Basket renders' })).toHaveCount(1)
  await expect(app.locator('#basket')).toContainText('Your basket is empty.')
  await expect(page.getByTestId('reactions-summary')).toHaveText('1 render · 2 computed runs · no watcher runs')
  // a computed's line opens where it was made
  await lines.filter({ hasText: 'getter runs' }).first().getByTestId('reaction-source').click()
  await expect(page.getByRole('tab', { name: 'app.js' })).toHaveAttribute('aria-selected', 'true')

  // the fix, typed into app.js and saved with the keyboard, then Reload
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solved('frameworks-01-raw-basket', 'app.js'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').focus()
  await page.keyboard.press('Enter')
  const debrief = page.getByRole('dialog')
  await expect(debrief).toContainText('Only the proxy tells Vue')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.keyboard.press('Escape')
  await expect(debrief).toBeHidden()

  // the reloaded app: a tap renders the Basket, and the panel says what triggered it
  await app.locator('#add-rye').click()
  await expect(app.locator('#basket')).toContainText('1 × Rye loaf')
  await expect(app.locator('#count')).toHaveText('Basket (1)')
  await expect(lines.filter({ hasText: 'Basket renders' })).toHaveCount(2)
  await expect(lines.filter({ hasText: 'Basket renders' }).last().getByTestId('reaction-why')).toContainText('add [0]')
})

test('a practice task: three answers, the app shows who was right, nothing to fix', async ({ page }) => {
  await page.goto('/frameworks/practice-same-object')
  const card = page.getByTestId('prediction')
  for (const answer of ['No', 'Yes', 'Yes']) {
    await card.getByRole('radio', { name: answer, exact: true }).check()
    await page.getByTestId('prediction-submit').click()
  }
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await page.getByRole('tab', { name: 'Console' }).first().click()
  await expect(page.getByTestId('console-log')).toContainText('A: false')
  await expect(page.getByTestId('console-log')).toContainText('C: true')
})

test('the track page lists the chapters and links the cheat sheet', async ({ page }) => {
  await page.goto('/frameworks')
  await expect(page.getByRole('heading', { level: 1, name: 'Framework deep dives' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^1\.1 The basket that never fills/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Lost reactivity/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Shallow, raw & readonly/ })).toBeVisible()
  // the chapter descriptions show their code as code
  await expect(page.locator('code', { hasText: 'toRefs' }).first()).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: App, Reactivity, Console and Code as tabs, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/frameworks/03-special-proxy')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    await page.getByTestId('prediction').getByRole('radio', { name: /^None: every item/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    expect(await scrollsSideways()).toBe(false)
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await expect(tabs.getByRole('tab')).toHaveCount(4)
    await tabs.getByRole('tab', { name: 'Reactivity' }).click()
    await expect(page.getByTestId('reaction-line').filter({ hasText: 'Menu renders' })).toHaveCount(1)
    await expect(page.getByTestId('reaction-line').filter({ hasText: 'Special today: Cinnamon bun' })).toHaveCount(1)
    expect(await scrollsSideways()).toBe(false)
    await page.getByTestId('reactions-log').focus()
    await expect(page.getByTestId('reactions-log')).toBeFocused()
    // the tabs are tap-sized
    for (const tab of await tabs.getByRole('tab').all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await tabs.getByRole('tab', { name: 'Code' }).click()
    expect(await scrollsSideways()).toBe(false)
  })
}
