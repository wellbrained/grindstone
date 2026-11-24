import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'

// The 0.5.2 audit fixes (docs/features/ui.md): the skip link, the header's current entry in words, one focus outline
// that keeps 3:1 in both themes, the 404 page inside the site, a Web prediction and a solved level's Next level on
// screen at 1440x900, Hint handing the focus back to the terminal, the mobile menu's name.

/** The focused element's outline against what is behind it (WCAG 1.4.11 asks 3:1), with its width. */
async function focusRing(locator: Locator) {
  // the outline colour fades in with Nuxt UI's colour transition: measure once it settled
  await locator.page().waitForTimeout(350)
  return locator.evaluate((el) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string) => {
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = css
      canvas.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
      return [r!, g!, b!, a! / 255]
    }
    const luminance = ([r, g, b]: number[]) => {
      const [lr, lg, lb] = [r!, g!, b!].map(v => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
      return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!
    }
    // the colour behind the element: its ancestors' backgrounds, stacked over the page
    const layers: number[][] = []
    for (let node = el.parentElement; node; node = node.parentElement) {
      const colour = rgba(getComputedStyle(node).backgroundColor)
      if (colour[3]! > 0) layers.push(colour)
      if (colour[3] === 1) break
    }
    let behind = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3)
    for (const layer of layers.reverse()) behind = behind.map((v, i) => layer[i]! * layer[3]! + v * (1 - layer[3]!))
    const style = getComputedStyle(el)
    const outline = rgba(style.outlineColor)
    const ring = outline.slice(0, 3).map((v, i) => v * outline[3]! + behind[i]! * (1 - outline[3]!))
    const [a, b] = [luminance(ring), luminance(behind)]
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
  })
}

/** Tabs until the locator has the focus (at most `max` presses). */
async function tabTo(page: Page, locator: Locator, max = 30) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    if (await locator.evaluate(el => el === document.activeElement)) return
  }
  throw new Error('never reached by Tab')
}

test('the skip link is the first stop and takes the focus to the page content', async ({ page }) => {
  await page.goto('/git')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport({ ratio: 1 })
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  await expect(page).toHaveURL(/\/git$/)
  // the next stop is inside the content, not the header
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.getElementById('main')!.contains(document.activeElement))).toBe(true)
})

test('the header says which track you are in and which of its pages is open, not by colour alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/git/cheat-sheet')
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })
  // the trail: Tracks / Git · Levels · Cheat sheet, the page you are on marked
  await expect(nav).toContainText('Git')
  await expect(nav.getByRole('link', { name: 'Cheat sheet', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Levels', exact: true })).not.toHaveAttribute('aria-current')
  // the Tracks panel marks the track you are in, and closes when a link in it changes the page
  await nav.getByRole('button', { name: 'Tracks' }).click()
  const panel = page.getByTestId('tracks-panel')
  await expect(panel.getByRole('link', { name: /^Git Practice/ })).toHaveAttribute('aria-current', 'true')
  await expect(panel.getByRole('link', { name: /^Debugging Find/ })).not.toHaveAttribute('aria-current')
  await panel.getByRole('link', { name: 'Debugging cheat sheet' }).click()
  await expect(page).toHaveURL(/\/debugging\/cheat-sheet$/)
  await expect(panel).toBeHidden()
  await expect(nav.getByRole('link', { name: 'Cheat sheet', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.goto('/about')
  await expect(page.getByRole('banner').getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page')
  // the logo link has one name
  await expect(page.getByRole('banner').getByRole('link', { name: 'Grindstone', exact: true })).toHaveCount(1)
})

for (const scheme of ['dark', 'light'] as const) {
  test(`focus outlines keep 3:1 on a header entry and on a button, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/git')
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /light/)
    const entry = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true }).getByRole('button', { name: 'Tracks' })
    await tabTo(page, entry)
    const onEntry = await focusRing(entry)
    expect(onEntry.style).toBe('solid')
    expect(onEntry.width).toBeGreaterThanOrEqual(2)
    expect(onEntry.ratio).toBeGreaterThanOrEqual(3)

    const toggle = page.getByRole('button', { name: 'Switch between light and dark mode' })
    await tabTo(page, toggle)
    const onButton = await focusRing(toggle)
    expect(onButton.width).toBeGreaterThanOrEqual(2)
    expect(onButton.ratio).toBeGreaterThanOrEqual(3)

    // a UButton in the page: the home page's first track action
    await page.goto('/')
    const button = page.getByTestId('track-git-primary')
    await expect(button).toBeVisible()
    await tabTo(page, button, 60)
    const onPage = await focusRing(button)
    expect(onPage.width).toBeGreaterThanOrEqual(2)
    expect(onPage.ratio).toBeGreaterThanOrEqual(3)
  })
}

test('a 404 sits in the site, with header and footer, and says what the address was meant to be', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/git/zzz')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No level “zzz” in Git')
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Web fundamentals cheat sheet' })).toBeVisible()
  await page.getByTestId('error-back').click()
  await expect(page).toHaveURL(/\/git$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Git' })).toBeVisible()

  await page.goto('/zzz')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No track “zzz”')
  await expect(page.getByRole('contentinfo')).toBeVisible()
  expect(errors).toEqual([])
})

test('Web fundamentals at 1440x900: every answer of the prediction is on screen before you answer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/web/01-menu-blocked')
  const card = page.getByTestId('prediction')
  await expect(card.getByRole('radio')).toHaveCount(4)
  for (const radio of await card.locator('label').all()) await expect(radio).toBeInViewport({ ratio: 1 })
  await expect(page.getByTestId('prediction-submit')).toBeInViewport({ ratio: 1 })
  // the story waits under the card, cut short, with a toggle to read it all
  await expect(page.getByTestId('level-story')).toHaveAttribute('data-collapsed', 'true')
  const toggle = page.getByTestId('story-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('level-story')).not.toHaveAttribute('data-collapsed')
})

test('Web fundamentals at 1440x900: once solved, Next level is on screen without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/web/02-order-preflight')
  const card = page.getByTestId('prediction')
  await card.getByRole('radio').first().check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toBeVisible()

  const level = levelById('web-02-order-preflight') as WebLevel
  const step = level.solution.find(each => typeof each === 'object' && 'save' in each && each.save === 'server.js') as { save: string, replace: readonly [string, string] }
  await page.getByRole('tab', { name: 'server.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(editedText(level.setup().files, step))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  const dialog = page.getByRole('dialog')
  // the debrief: results first, in view
  await expect(dialog.getByTestId('debrief-results')).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: 'Stay here' }).click()
  const solved = page.getByTestId('level-solved')
  await expect(solved.getByRole('link', { name: 'Next level' })).toBeInViewport({ ratio: 1 })
})

test('a click on Hint gives the focus back to the terminal, so the next Enter runs a command', async ({ page }) => {
  await page.goto('/git/01-first-commit')
  const input = page.locator('input[name="command"]')
  await expect(input).toBeFocused()
  await page.getByTestId('hint-button').click()
  await expect(page.getByTestId('hint-button')).toContainText('Hint (1/')
  await expect(input).toBeFocused()
  await page.keyboard.type('git status')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('hint-button')).toContainText('Hint (1/')
  await expect(page.getByRole('log')).toContainText('git status')
})

test('the mobile menu is named, one row per track, and closes on the link of the page you are on', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/git/cheat-sheet')
  const button = page.getByRole('button', { name: /menu/i })
  const box = (await button.boundingBox())!
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
  await button.click()
  const menu = page.getByRole('dialog', { name: 'Site navigation' })
  await expect(menu).toBeVisible()
  const git = menu.getByRole('group', { name: 'Git' })
  await expect(git.getByRole('link')).toHaveText(['Levels', 'Cheat sheet'])
  await expect(git.getByRole('link', { name: 'Cheat sheet' })).toHaveAttribute('aria-current', 'page')
  await git.getByRole('link', { name: 'Cheat sheet' }).click()
  await expect(menu).toBeHidden()
})
