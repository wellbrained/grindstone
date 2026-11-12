import { expect, test } from '@playwright/test'

// Home -> the git track page -> a level from its chapter row -> back to the chapter via the breadcrumb.
test('goes from home to a level through the track page and back', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('continue-card')).toHaveCount(0)
  await expect(page.getByTestId('track-git-primary')).toHaveAttribute('data-action', 'start')
  await page.getByTestId('track-git-open').click()

  await expect(page).toHaveURL(/\/git$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Git' })).toBeVisible()
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-kind', 'start')
  await expect(page.locator('[data-level="git-01-first-commit"]')).toHaveAttribute('data-state', 'next')

  // the rail jumps to a chapter, marks it current and moves the focus to its heading
  const rail = page.getByRole('navigation', { name: 'Git chapters' }).filter({ visible: true })
  await rail.getByRole('link', { name: /Merging/ }).click()
  await expect(rail.getByRole('link', { name: /Merging/ })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('#merging-heading')).toBeFocused()
  await expect(page).toHaveURL(/\/git#merging$/)

  // the whole row is the link
  await page.locator('[data-level="git-04-merge-conflict"]').click()
  await expect(page).toHaveURL(/\/git\/04-merge-conflict$/)
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(crumbs).toContainText('Git')
  await expect(crumbs).toContainText('Merging')
  await expect(crumbs).toContainText('3.2 Merge conflict')

  // typing a command makes this the level Continue opens
  const input = page.getByRole('textbox', { name: /Terminal input/ })
  await input.pressSequentially('git status')
  await input.press('Enter')

  await crumbs.getByRole('link', { name: 'Merging' }).click()
  await expect(page).toHaveURL(/\/git#merging$/)
  await expect(page.locator('#merging')).toBeInViewport()
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-kind', 'resume')
  await expect(page.getByTestId('continue-card')).toContainText('Merge conflict')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tracks' }).click()
  await expect(page.getByTestId('continue-card')).toContainText('3.2')
  // one Continue on the page: the git card now opens the track instead
  await expect(page.getByTestId('track-git-primary')).toHaveAttribute('data-action', 'open')
  await expect(page.getByTestId('track-git-primary')).toHaveAttribute('href', '/git')
})

test('the track page has no sideways scroll at 360px and the strip takes over the rail', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/git')
  await expect(page.getByRole('heading', { level: 1, name: 'Git' })).toBeVisible()
  const strip = page.locator('[data-chapter-strip]')
  await expect(strip).toBeVisible()
  // nothing sticks out of the page; only the strip scrolls sideways, inside itself
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(el => !el.closest('[data-chapter-strip]') && el.getBoundingClientRect().right > window.innerWidth + 1)
    .map(el => el.tagName + '.' + el.className))
  expect(wide).toEqual([])
  await strip.getByRole('link', { name: /Workflows/ }).click()
  await expect(strip.getByRole('link', { name: /Workflows/ })).toHaveAttribute('aria-current', 'true')
})
