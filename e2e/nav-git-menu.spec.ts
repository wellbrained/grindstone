import { expect, test } from '@playwright/test'

// The header's Git entry is a small menu: Levels (the track page) and Cheat sheet. The entry stays active below /git.
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
  await expect(menu.getByRole('link', { name: 'Levels', exact: true })).toBeVisible()
  await menu.getByRole('link', { name: 'Cheat sheet', exact: true }).click()
  await expect(page).toHaveURL(/\/git\/cheat-sheet$/)
})
