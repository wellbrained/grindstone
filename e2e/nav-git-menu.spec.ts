import { expect, test } from '@playwright/test'

// The header's Git entry is a small menu: Levels (the track page) and Cheat sheet. The entry stays active below /git.
// Debugging's entry is the same menu, with its own cheat sheet (ADR 0007).
test('opens the Git menu in the header and goes to the cheat sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })
  const trigger = nav.getByRole('button', { name: 'Git' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('link', { name: 'Levels', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Cheat sheet', exact: true }).click()
  await expect(page).toHaveURL(/\/git\/cheat-sheet$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // the entry keeps the active style on a page below the track, the other links do not
  await expect(nav.getByRole('button', { name: 'Git' })).toHaveClass(/text-primary/)
  await expect(nav.getByRole('link', { name: 'Tracks' })).not.toHaveClass(/text-primary/)
})

test('shows Levels and Cheat sheet under Git in the mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: /menu/i }).click()

  const menu = page.getByRole('dialog')
  // one Levels link per live track: Git's and Debugging's
  const levels = menu.getByRole('link', { name: 'Levels', exact: true })
  await expect(levels).toHaveCount(2)
  await expect(levels.first()).toHaveAttribute('href', '/git')
  await expect(levels.last()).toHaveAttribute('href', '/debugging')
  // one Cheat sheet link per live track too
  const sheets = menu.getByRole('link', { name: 'Cheat sheet', exact: true })
  await expect(sheets).toHaveCount(2)
  await expect(sheets.last()).toHaveAttribute('href', '/debugging/cheat-sheet')
  await sheets.first().click()
  await expect(page).toHaveURL(/\/git\/cheat-sheet$/)
})

test('opens the Debugging menu in the header and goes to its cheat sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })
  const trigger = nav.getByRole('button', { name: 'Debugging' })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('link', { name: 'Levels', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Cheat sheet', exact: true }).click()
  await expect(page).toHaveURL(/\/debugging\/cheat-sheet$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Debugging cheat sheet' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Debugging' })).toHaveClass(/text-primary/)

  // an entry links to the level that teaches it
  const levelLink = page.locator('#network').getByRole('link', { name: /2\.1 The menu won't load/ }).first()
  await levelLink.click()
  await expect(page).toHaveURL(/\/debugging\/06-menu-wont-load$/)

  // the track page's Levels entry still goes to the track page
  await nav.getByRole('button', { name: 'Debugging' }).click()
  await page.getByRole('link', { name: 'Levels', exact: true }).click()
  await expect(page).toHaveURL(/\/debugging$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Debugging' })).toBeVisible()
})

// The Debugging cheat sheet: a filter over entries and error messages, and no sideways scroll on a phone in both colour schemes.
test('filters the Debugging cheat sheet and finds an error message', async ({ page }) => {
  await page.goto('/debugging/cheat-sheet')
  await expect(page.getByRole('heading', { level: 1, name: 'Debugging cheat sheet' })).toBeVisible()
  await expect(page.locator('#errors')).toContainText('TypeError: formatPrice is not a function')

  await page.getByRole('textbox', { name: 'Filter the sheet' }).fill('is not a function')
  await expect(page.locator('#errors')).toContainText('TypeError: formatPrice is not a function')
  await expect(page.locator('#console')).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Filter the sheet' }).fill('zzzz')
  await expect(page.getByText('Nothing matches "zzzz".')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`has no sideways scroll at 390px in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/debugging/cheat-sheet')
    await expect(page.getByRole('heading', { level: 1, name: 'Debugging cheat sheet' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /light/)
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map(el => el.tagName + '.' + el.className))
    expect(wide).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
