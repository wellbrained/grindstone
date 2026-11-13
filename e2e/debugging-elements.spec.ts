import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { DebugLevel } from '../shared/levels'

// The Elements panel (ADR 0007, chapter 3) in a real browser: Elements & CSS 3.2 played like a player (Pick shows that
// a click on Order lands on an invisible box, the rule's link opens its line, the fix and a Reload solve it, and the
// same element stays selected after the reload), the cascade of 3.3 (what lost is struck through), a find task answered
// through a rule's link, the tree's keyboard, phones, and that a level without the panel has none.
const tree = (page: import('@playwright/test').Page) => page.getByTestId('elements-tree')
const selectedRow = (page: import('@playwright/test').Page) => tree(page).locator('[role="treeitem"][aria-selected="true"]')

test('plays Elements & CSS 3.2 through the Elements panel: Pick, the rule, the fix', async ({ page }) => {
  await page.goto('/debugging/12-cant-click')
  await expect(page.getByRole('heading', { level: 1, name: /The button can't be clicked/ })).toBeVisible()
  const app = page.frameLocator('[data-testid="app-frame"]')

  // Elements is the first tab under the code, next to the Console; the tree comes from the app's DOM
  const tabs = page.getByRole('tablist', { name: 'Elements and Console' })
  await expect(tabs.getByRole('tab')).toHaveText(['Elements', 'Console'])
  await expect(tabs.getByRole('tab', { name: 'Elements' })).toHaveAttribute('aria-selected', 'true')
  await expect(tree(page).locator('[data-label="div.toast-area"]')).toBeVisible()
  await expect(page.getByTestId('app-width')).toContainText('px')

  // Order does nothing: a croissant in the basket, a click on Order, no confirmation
  await app.locator('[data-id="croissant"] .add').click()
  await app.locator('#order').click({ force: true })
  await expect(app.locator('#order-status')).toHaveText('')

  // Pick, then a click where Order is: the transparent area gets selected, and the app never saw the click
  await page.getByTestId('elements-pick').click()
  await expect(page.getByTestId('pick-banner')).toBeVisible()
  await app.locator('#order').click({ force: true })
  await expect(page.getByTestId('pick-banner')).toBeHidden()
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'div.toast-area')
  await expect(tree(page)).toBeFocused()
  await expect(app.locator('#order-status')).toHaveText('')

  // its rule: fixed to the bottom, on top; the link opens style.css at that line
  const detail = page.getByTestId('elements-detail')
  const rule = detail.locator('[data-testid="elements-rule"][data-selector=".toast-area"]')
  await expect(rule.locator('[data-property="z-index"]')).toContainText('z-index: 10;')
  await expect(detail.getByTestId('elements-computed').locator('[data-computed="position"]')).toHaveText('fixed')
  await expect(rule.getByTestId('elements-rule-link')).toHaveText('style.css:145')
  await rule.getByTestId('elements-rule-link').click()
  await expect(page.getByRole('tab', { name: 'style.css' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.cm-line.cm-mark-error')).toHaveText('.toast-area {')

  // the fix from the solution, Save, Reload: solved
  const level = levelById('debugging-12-cant-click') as DebugLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(files['style.css']!)
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('A click goes to what is on top')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)

  // after the reload the same element is selected, with the new rule; a click on Order now orders
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'div.toast-area')
  await expect(rule.locator('[data-property="pointer-events"]')).toHaveAttribute('data-status', 'active')
  await app.locator('[data-id="croissant"] .add').click()
  await app.locator('#order').click()
  await expect(app.locator('#order-status')).toHaveText('Thanks! Your order is in: pick it up tomorrow from 7:00.')
})

test('strikes through what lost the cascade, and links each rule (3.3)', async ({ page }) => {
  await page.goto('/debugging/13-style-doesnt-apply')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(tree(page).locator('[role="treeitem"]').first()).toBeVisible()
  await page.getByTestId('elements-pick').click()
  await app.locator('.special .price').click()
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'span.price')

  const rules = page.getByTestId('elements-detail').getByTestId('elements-rule')
  // the winner first: Ben's rule with the id, then Maya's, whose colour lost but whose bold did not
  await expect(rules.first()).toHaveAttribute('data-selector', '#products .price')
  await expect(rules.first().locator('[data-property="color"]')).toHaveAttribute('data-status', 'active')
  const maya = page.getByTestId('elements-detail').locator('[data-testid="elements-rule"][data-selector=".special .price"]')
  await expect(maya.locator('[data-property="color"]')).toHaveAttribute('data-status', 'overridden')
  await expect(maya.locator('[data-property="font-weight"]')).toHaveAttribute('data-status', 'active')
  await expect(maya.getByTestId('elements-rule-link')).toHaveText('style.css:126')
  // it inherits from the shop's own rules: the variables of :root among them
  await expect(page.getByTestId('elements-inherited').last()).toContainText('html')
})

test('answers a find task with a rule\'s link', async ({ page }) => {
  await page.goto('/debugging/practice-what-covers')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(tree(page).locator('[role="treeitem"]').first()).toBeVisible()
  await page.getByTestId('elements-pick').click()
  await app.locator('[data-id="croissant"] .add').click({ force: true })
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'div.notice-area')
  const link = page.getByTestId('elements-detail').locator('[data-testid="elements-rule"][data-selector=".notice-area"]').getByTestId('elements-rule-link')
  await expect(link).toHaveAccessibleName('Answer: style.css, line 126')
  await link.click()
  await expect(page.locator('[data-goal="found"]')).toHaveAttribute('data-met', 'true')
})

test('answers a find task with a declaration of a rule', async ({ page }) => {
  await page.goto('/debugging/practice-nowrap-line')
  const note = tree(page).locator('[data-label="p.note"]')
  await expect(note).toBeVisible()
  await note.click()
  const declaration = page.getByTestId('elements-detail').locator('[data-testid="elements-rule"][data-selector=".note"] [data-property="white-space"]').getByTestId('elements-declaration-link')
  await expect(declaration).toHaveAccessibleName(/white-space: nowrap; \(Answer: style\.css, line 129\)/)
  await declaration.click()
  await expect(page.locator('[data-goal="found"]')).toHaveAttribute('data-met', 'true')
})

test('keeps the app as wide as a phone at every window size', async ({ page }) => {
  for (const width of [700, 900, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/debugging/14-gone-on-phones')
    if (width < 1024) await page.getByRole('tablist', { name: 'Panels' }).getByRole('tab', { name: 'App' }).click()
    const frame = await page.getByTestId('app-frame').boundingBox()
    expect(frame!.width, `window ${width}`).toBeLessThanOrEqual(416)
    // so the phone rules hold: the basket box is hidden, like on a phone
    await expect(tree(page).locator('[data-label="section.basket"]')).toHaveAttribute('aria-label', /not shown/)
  }
})

test('moves through the tree with the keyboard, greys out what has no box, and works on phones', async ({ page }) => {
  await page.goto('/debugging/14-gone-on-phones')
  await expect(tree(page).locator('[role="treeitem"]').first()).toBeVisible()

  // the tree: Down selects, Right opens or goes in, Left closes or goes out
  await tree(page).focus()
  await page.keyboard.press('Home')
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'html')
  await page.keyboard.press('End')
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'script')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowLeft')
  await expect(tree(page).locator('[role="treeitem"]')).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'head')

  // both Order buttons have no box at this width: greyed out, and the rule that hides each names its media query
  const bar = tree(page).locator('[data-label="div.order-bar"]')
  await expect(bar).toHaveAttribute('aria-label', /not shown/)
  await bar.click()
  await expect(page.getByTestId('elements-detail').getByTestId('elements-box')).toContainText('No box')
  await tree(page).locator('[data-label="section.basket"]').click()
  await expect(page.getByTestId('elements-detail').getByTestId('elements-condition').first()).toContainText('@media (max-width: 600px)')

  // phones: the panels are tabs (this level has no Network); Pick goes to the App and back
  await page.setViewportSize({ width: 390, height: 844 })
  const phoneTabs = page.getByRole('tablist', { name: 'Panels' })
  await expect(phoneTabs.getByRole('tab')).toHaveText(['App', 'Elements', 'Console', 'Code'])
  await phoneTabs.getByRole('tab', { name: 'Elements' }).click()
  await page.getByTestId('elements-pick').click()
  await expect(phoneTabs.getByRole('tab', { name: 'App' })).toHaveAttribute('aria-selected', 'true')
  await page.frameLocator('[data-testid="app-frame"]').locator('h1').click()
  await expect(phoneTabs.getByRole('tab', { name: 'Elements' })).toHaveAttribute('aria-selected', 'true')
  await expect(selectedRow(page)).toHaveAttribute('data-label', 'h1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('shows what the DOM of the app says as text, never as HTML, and Refresh reads it again', async ({ page }) => {
  await page.goto('/debugging/11-invisible-order')
  await expect(tree(page).locator('[role="treeitem"]').first()).toBeVisible()
  await page.getByRole('tablist', { name: 'Elements and Console' }).getByRole('tab', { name: 'Console' }).click()
  const input = page.getByTestId('console-input')
  await input.fill('document.querySelector(\'main\').insertAdjacentHTML(\'beforeend\', \'<p id="x" title="<img src=x onerror=alert(1)>">&lt;b&gt;bold&lt;/b&gt;</p>\')')
  await input.press('Enter')
  await page.getByRole('tablist', { name: 'Elements and Console' }).getByRole('tab', { name: 'Elements' }).click()
  await page.getByTestId('elements-refresh').click()
  const row = tree(page).locator('[data-label="p#x"]')
  await expect(row).toContainText('<b>bold</b>')
  await expect(row).toContainText('<img src=x onerror=alert(1)>')
  await expect(tree(page).locator('img, b')).toHaveCount(0)
})

test('levels without it have no Elements panel', async ({ page }) => {
  await page.goto('/debugging/06-menu-wont-load')
  await expect(page.getByRole('tablist', { name: 'Console and Network' }).getByRole('tab')).toHaveText(['Console', /Network/])
  await expect(page.getByTestId('elements-tree')).toHaveCount(0)
})
