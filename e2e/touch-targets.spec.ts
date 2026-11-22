import { expect, test } from '@playwright/test'

// A finger gets 44px (DESIGN.md, phone targets; CoreHub #581): every Nuxt UI button and field on a touch screen,
// whatever its size on desktop, plus the chapter rows and chips. And the code editor shows the 2px ember focus ring.

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  for (const path of ['/', '/frameworks', '/git/01-first-commit', '/debugging/06-menu-wont-load', '/web/01-menu-blocked', '/frameworks/01-raw-basket', '/frameworks/cheat-sheet']) {
    test(`buttons, fields and chapter links are at least 44px high on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('main').first()).toBeVisible()
      await expect(page.getByRole('button').first()).toBeVisible()
      const small = await page.evaluate(() => [...document.querySelectorAll('main button[data-slot="base"], main a[data-slot="base"], main input[data-slot="base"], main nav a')]
        .map(element => ({ text: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40), height: element.getBoundingClientRect().height }))
        .filter(each => each.height > 0 && each.height < 43.5))
      expect(small).toEqual([])
    })
  }
})

test('the code editor shows the ember focus ring', async ({ page }) => {
  await page.goto('/debugging/06-menu-wont-load')
  const content = page.locator('.cm-content').first()
  await expect(content).toBeVisible()
  await content.focus()
  const ring = await content.evaluate((element) => {
    const style = getComputedStyle(element.closest('.cm-editor')!.parentElement!, '::after')
    return { style: style.outlineStyle, width: style.outlineWidth, layer: style.zIndex }
  })
  expect(ring).toEqual({ style: 'solid', width: '2px', layer: '300' })
})
