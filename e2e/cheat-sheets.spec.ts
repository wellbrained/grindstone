import { expect, test } from '@playwright/test'

// The cheat sheets' cards (docs/features/ui.md, "Debugging cheat sheet"): copy a line, open the detail behind a card's
// disclosure, the "Practise it in" links as tap targets (all four sheets), and the sections in the order of the chips.
const sheets = [
  {
    path: '/debugging/cheat-sheet',
    // a card with a line to copy, its level link and where that goes
    card: 'input',
    line: 'typeof formatPrice',
    link: /1\.2 The prices vanished/,
    to: /\/debugging\/02-prices-vanished$/,
    // a word only in one card's summary, and that card
    summaryWord: 'idempotency',
    summaryCard: 'double',
    firstChip: 'Console'
  },
  {
    path: '/web/cheat-sheet',
    card: 'allow-origin',
    line: 'res.set(\'Access-Control-Allow-Origin\', SHOP)',
    link: /1\.1 The menu stays empty/,
    to: /\/web\/01-menu-blocked$/,
    summaryWord: 'registrable',
    summaryCard: 'site',
    firstChip: 'Same-origin & CORS'
  }
]

for (const sheet of sheets) {
  test.describe(sheet.path, () => {
    test('clicking a line puts exactly that line on the clipboard', async ({ browser }) => {
      const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
      const page = await context.newPage()
      await page.goto(sheet.path)
      const card = page.locator(`[data-entry="${sheet.card}"]`)
      await card.getByRole('button', { name: `Copy ${sheet.line}` }).click()
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sheet.line)
      // the copy icon is there without hovering (a phone has no hover)
      await expect(card.getByTestId('cheat-example').first().locator('svg, .iconify').first()).toBeVisible()
      await context.close()
    })

    test('a card shows a one-line rule and keeps its longer text behind a disclosure', async ({ page }) => {
      await page.goto(sheet.path)
      const card = page.locator(`[data-entry="${sheet.card}"]`)
      await expect(card.getByTestId('cheat-rule')).toBeVisible()
      const details = card.getByTestId('cheat-details')
      await expect(details).not.toHaveAttribute('open', '')
      const text = details.locator('p')
      await expect(text).toBeHidden()
      await details.locator('summary').click()
      await expect(details).toHaveAttribute('open', '')
      await expect(text).toBeVisible()
      expect((await text.innerText()).length).toBeGreaterThan(60)
      // and by keyboard: Enter on the focused summary closes it again, with the ember focus outline
      await details.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(details).not.toHaveAttribute('open', '')
      const outline = await details.locator('summary').evaluate(el => getComputedStyle(el).outlineStyle)
      expect(outline).toBe('solid')
    })

    test('a filter that matches only the hidden text opens that card\'s disclosure', async ({ page }) => {
      await page.goto(sheet.path)
      await page.getByRole('textbox', { name: 'Filter the sheet' }).fill(sheet.summaryWord)
      const details = page.locator(`[data-entry="${sheet.summaryCard}"]`).getByTestId('cheat-details')
      await expect(details).toHaveAttribute('open', '')
      await expect(details.locator('p')).toContainText(sheet.summaryWord, { ignoreCase: true })
      // cleared again: the one the filter opened closes
      await page.getByRole('textbox', { name: 'Filter the sheet' }).fill('')
      await expect(details).not.toHaveAttribute('open', '')
    })

    test('"Practise it in" links are at least 24px tall, and go to their level', async ({ page }) => {
      await page.goto(sheet.path)
      const links = page.getByTestId('cheat-level-link')
      await expect(links.first()).toBeVisible()
      const heights = await links.evaluateAll(all => all.map(el => el.getBoundingClientRect().height))
      expect(heights.length).toBeGreaterThan(20)
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(24)
      await page.locator(`[data-entry="${sheet.card}"]`).getByRole('link', { name: sheet.link }).click()
      await expect(page).toHaveURL(sheet.to)
    })

    test('"Practise it in" links are 44px tall on a touch screen', async ({ browser }) => {
      const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
      const page = await context.newPage()
      await page.goto(sheet.path)
      await expect(page.getByTestId('cheat-level-link').first()).toBeVisible()
      const heights = await page.getByTestId('cheat-level-link').evaluateAll(all => all.map(el => el.getBoundingClientRect().height))
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
      await context.close()
    })

    test('the sections come in the order of the chips, top to bottom', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(sheet.path)
      await expect(page.getByTestId('cheat-group').first()).toBeVisible()
      const chips = await page.getByTestId('cheat-chip').evaluateAll(all => all.map(el => (el.getAttribute('href') ?? '').slice(1)))
      expect(chips.length).toBeGreaterThanOrEqual(8)
      const sections = await page.getByTestId('cheat-group').evaluateAll(all => all.map(el => ({ id: el.id, top: el.getBoundingClientRect().top + window.scrollY })))
      expect(sections.map(section => section.id)).toEqual(chips)
      const tops = sections.map(section => section.top)
      expect(tops).toEqual([...tops].sort((a, b) => a - b))
      expect(new Set(tops).size).toBe(tops.length)
      // a chip jumps to its section
      await page.getByTestId('cheat-chip').getByText(sheet.firstChip, { exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#${chips[0]}$`))
    })

    test('the cards of a section flow down a column, then into the next', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(sheet.path)
      const section = page.getByTestId('cheat-group').first()
      await expect(section).toBeVisible()
      const boxes = await section.getByTestId('cheat-card').evaluateAll(all => all.map((el) => {
        const box = el.getBoundingClientRect()
        return { top: Math.round(box.top), left: Math.round(box.left) }
      }))
      expect(boxes.length).toBeGreaterThan(4)
      // several columns, and each next card is below the one before in its column, or starts the next column to the right
      expect(new Set(boxes.map(box => box.left)).size).toBeGreaterThan(1)
      for (let i = 1; i < boxes.length; i++) {
        const [before, after] = [boxes[i - 1]!, boxes[i]!]
        expect((after.left === before.left && after.top > before.top) || after.left > before.left).toBe(true)
      }
    })

    test('has no sideways scroll at 390px', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(sheet.path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  })
}

// the Git and Working with AI sheets share the same links
for (const path of ['/git/cheat-sheet', '/ai/cheat-sheet']) {
  test(`${path}: the "Practise it in" links are tap targets too`, async ({ page }) => {
    await page.goto(path)
    const links = page.getByTestId('cheat-level-link')
    await expect(links.first()).toBeVisible()
    const heights = await links.evaluateAll(all => all.map(el => el.getBoundingClientRect().height))
    expect(heights.length).toBeGreaterThan(10)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(24)
    const href = await links.first().getAttribute('href')
    await links.first().click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
  })
}
