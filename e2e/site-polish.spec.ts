import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// The 0.5.1 polish pass (docs/features/ui.md): the footer's version, the home page's one ember action, the track page's
// "Next up" jump and folded chapters, tap targets at phone width and the Reset button's contrast.

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

/** Stored progress with these levels solved (the shape of `grindstone:progress`, version 3). */
async function seedSolved(page: Page, ids: string[]) {
  await page.evaluate((levelIds) => {
    const entry = { solved: true, best: { commands: 3, hints: 0 }, latest: { commands: 3, hints: 0 }, practiseAgain: false, lastPlayed: null, fewestHints: 0 }
    localStorage.setItem('grindstone:progress', JSON.stringify({ version: 3, levels: Object.fromEntries(levelIds.map(id => [id, entry])) }))
  }, ids)
}

/** The level ids of one chapter, as the track page lists them. */
async function chapterLevels(page: Page, chapter: string) {
  await page.goto('/git')
  await expect(page.locator(`[data-chapter="${chapter}"] [data-level]`).first()).toBeVisible()
  return page.locator(`[data-chapter="${chapter}"] [data-level]`).evaluateAll(rows => rows.map(row => row.getAttribute('data-level')!))
}

test('the footer shows the version from package.json', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-version')).toHaveText(`v${version}`)
})

test('home: a first visit has one ember action (the first track), a returning one only the Continue card', async ({ page }) => {
  const filled = () => page.locator('[data-testid$="-primary"]').evaluateAll(links => links.filter(link => getComputedStyle(link).backgroundColor !== 'rgba(0, 0, 0, 0)').map(link => link.getAttribute('data-testid')))
  await page.goto('/')
  await expect(page.getByTestId('continue-card')).toHaveCount(0)
  await expect(page.locator('[data-testid$="-primary"]').first()).toBeVisible()
  expect(await filled()).toEqual(['track-git-primary'])

  await seedSolved(page, ['git-01-first-commit'])
  await page.reload()
  await expect(page.getByTestId('continue-card')).toBeVisible()
  expect(await filled()).toEqual([])
  // the Continue card's action is the page's ember one
  await expect(page.getByTestId('continue-card').getByRole('link').first()).toBeVisible()
  await expect(page.getByTestId('overview-radar').locator('text[data-label]')).toHaveCount(4)
})

test('track page: Next up jumps to the next unsolved level and solved chapters fold', async ({ page }) => {
  const basics = await chapterLevels(page, 'basics')
  expect(basics.length).toBeGreaterThan(3)
  // nothing solved: every chapter is open and there is no fold button
  await expect(page.getByTestId('fold-basics')).toHaveCount(0)
  await expect(page.locator(`[data-level="${basics[0]}"]`)).toBeVisible()

  await seedSolved(page, basics)
  await page.reload()
  const fold = page.getByTestId('fold-basics')
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator(`[data-level="${basics[0]}"]`)).toBeHidden()
  // keyboard: Enter on the button opens it, and again folds it
  await fold.focus()
  await page.keyboard.press('Enter')
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator(`[data-level="${basics[0]}"]`)).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator(`[data-level="${basics[0]}"]`)).toBeHidden()

  // Next up is the first level of the next chapter, far below: one step takes you there
  const jump = page.getByTestId('jump-next')
  await expect(jump).toContainText('Next up')
  await jump.click()
  const next = page.locator('[data-level][data-state="next"]')
  await expect(next).toBeInViewport()
  await expect(next).toBeFocused()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`About, ${scheme}: "Reset everything…" keeps AA contrast, enabled or not; the file input has a name`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/about')
    await expect(page.getByTestId('load-progress-file')).toHaveAttribute('aria-label', 'Load progress')
    const contrast = () => page.getByTestId('reset-everything').evaluate((el) => {
      const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(n => (css.startsWith('color(') ? n * 255 : n))
      const luminance = ([r, g, b]: number[]) => {
        const [lr, lg, lb] = [r, g, b].map(v => (v! / 255 <= 0.03928 ? v! / 255 / 12.92 : ((v! / 255 + 0.055) / 1.055) ** 2.4))
        return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!
      }
      const opacity = Number(getComputedStyle(el).opacity)
      const fg = channels(getComputedStyle(el).color)
      let node: HTMLElement | null = el
      let bg = [255, 255, 255]
      while (node) {
        const colour = getComputedStyle(node).backgroundColor
        if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') {
          bg = channels(colour)
          break
        }
        node = node.parentElement
      }
      const mixed = fg.map((v, i) => v * opacity + bg[i]! * (1 - opacity))
      const [a, b] = [luminance(mixed), luminance(bg)]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
    expect(await page.getByTestId('reset-everything').isDisabled()).toBe(true)
    expect(await contrast()).toBeGreaterThanOrEqual(4.5)
    await seedSolved(page, ['git-01-first-commit'])
    await page.reload()
    await expect(page.getByTestId('reset-everything')).toBeEnabled()
    expect(await contrast()).toBeGreaterThanOrEqual(4.5)
  })
}

test('at phone width the footer links, the theme toggle and the row menus are comfortable to tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/git')
  for (const link of await page.getByRole('navigation', { name: 'Footer' }).getByRole('link').all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  const toggle = await page.getByRole('button', { name: 'Switch between light and dark mode' }).boundingBox()
  expect(Math.min(toggle!.width, toggle!.height)).toBeGreaterThanOrEqual(40)
  const menu = await page.getByTestId('more-menu').nth(2).boundingBox()
  expect(Math.min(menu!.width, menu!.height)).toBeGreaterThanOrEqual(32)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
