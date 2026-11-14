import { expect, test } from '@playwright/test'

// The IDE layout's shared column (docs/features/ui.md, "Terminal height" and "Play page layouts"): the terminal can be
// resized with a drag handle (mouse and keyboard, kept per browser), and at the common desktop sizes the level panel and
// the file explorer share their column without overlapping.

const setIde = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => window.localStorage.setItem('grindstone:layout', 'ide'))

const SPLITTER = '[data-testid="terminal-splitter"]'

test('the terminal is resized by dragging and with the keyboard, and the height is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await setIde(page)
  await page.goto('/git/09-read-history')
  const splitter = page.locator(SPLITTER)
  await expect(splitter).toBeVisible()
  await expect(splitter).toHaveAttribute('role', 'separator')
  await expect(splitter).toHaveAttribute('aria-orientation', 'horizontal')

  const terminal = page.getByRole('region', { name: 'Terminal' })
  const height = async () => Math.round((await terminal.boundingBox())!.height)
  const value = async () => Number(await splitter.getAttribute('aria-valuenow'))
  await expect.poll(height).toBeGreaterThan(160)
  const start = await height()
  await expect.poll(value).toBe(start)

  // drag up by 100px: the terminal gets 100px taller
  const box = (await splitter.boundingBox())!
  const x = box.x + box.width / 2
  await page.mouse.move(x, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, box.y + box.height / 2 - 100, { steps: 6 })
  await page.mouse.up()
  await expect.poll(height).toBe(start + 100)
  await expect.poll(value).toBe(start + 100)
  expect(await page.evaluate(() => window.localStorage.getItem('grindstone:terminal-height'))).toBe(String(start + 100))

  // keyboard: Down makes it shorter by a step, Shift+Up by a bigger one, Home the smallest, End the largest
  await splitter.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(height).toBe(start + 100 - 24)
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(height).toBe(start + 100 - 24 + 96)
  await page.keyboard.press('Home')
  await expect.poll(height).toBe(Number(await splitter.getAttribute('aria-valuemin')))
  await page.keyboard.press('End')
  await expect.poll(height).toBe(Number(await splitter.getAttribute('aria-valuemax')))
  // the editor above keeps its room at the largest height
  const editor = await page.locator('.reveal-editor').boundingBox()
  expect(editor!.height).toBeGreaterThanOrEqual(150)

  // remembered across a reload
  const stored = await page.evaluate(() => window.localStorage.getItem('grindstone:terminal-height'))
  expect(Number(stored)).toBe(await height())
  await page.reload()
  await expect(splitter).toBeVisible()
  await expect.poll(height).toBe(Number(stored))

  // a double click puts the default sizes back
  await splitter.dblclick()
  await expect.poll(height).toBe(start)
  expect(await page.evaluate(() => window.localStorage.getItem('grindstone:terminal-height'))).toBeNull()
})

test('a stored height that is not a number of pixels is ignored, and the Terminal layout has no handle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => window.localStorage.setItem('grindstone:terminal-height', 'not a number'))
  await page.goto('/git/09-read-history')
  // Terminal layout (the default): the handle is closed and inert, the terminal fills the column
  await expect(page.locator('.reveal-handle')).toHaveAttribute('inert')
  await expect.poll(async () => (await page.locator('.reveal-handle').boundingBox())?.height ?? -1).toBe(0)

  await page.getByRole('radio', { name: 'IDE' }).click()
  await expect(page.locator(SPLITTER)).toBeVisible()
  await expect.poll(async () => (await page.getByRole('region', { name: 'Terminal' }).boundingBox())?.height ?? 0).toBeGreaterThan(160)
})

test('blocked storage does not break the resize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await setIde(page)
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'grindstone:terminal-height') blocked()
      return original.call(this, key, value)
    }
  })
  await page.goto('/git/09-read-history')
  const splitter = page.locator(SPLITTER)
  await expect(splitter).toBeVisible()
  const terminal = page.getByRole('region', { name: 'Terminal' })
  const before = (await terminal.boundingBox())!.height
  await splitter.focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => Math.round((await terminal.boundingBox())!.height)).toBe(Math.round(before) + 24)
})

test('a saved height that no longer fits is clamped to the window: the editor keeps its room and the values stay in range', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setIde(page)
  await page.goto('/git/09-read-history')
  const splitter = page.locator(SPLITTER)
  await expect(splitter).toBeVisible()
  await splitter.focus()
  await page.keyboard.press('End')
  const terminal = page.getByRole('region', { name: 'Terminal' })
  const height = async () => Math.round((await terminal.boundingBox())!.height)
  const attr = async (name: string) => Number(await splitter.getAttribute(name))
  await expect.poll(async () => attr('aria-valuenow')).toBe(await attr('aria-valuemax'))
  const saved = await page.evaluate(() => window.localStorage.getItem('grindstone:terminal-height'))

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect.poll(async () => (await page.locator('.reveal-editor').boundingBox())!.height).toBeGreaterThanOrEqual(160)
  await expect.poll(async () => attr('aria-valuenow')).toBeLessThanOrEqual(await attr('aria-valuemax'))
  await expect.poll(height).toBe(await attr('aria-valuenow'))
  expect(await attr('aria-valuenow')).toBeGreaterThanOrEqual(await attr('aria-valuemin'))
  // the saved value is kept, so a taller window brings it back
  expect(await page.evaluate(() => window.localStorage.getItem('grindstone:terminal-height'))).toBe(saved)

  // Up from there does not make it shorter
  const before = await height()
  await splitter.focus()
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(150)
  expect(await height()).toBe(before)

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(height).toBe(Number(saved))
})

// Opening and closing the IDE panels moves only the terminal's top edge: its bottom edge stays on the column's, with the
// default sizes and with a saved height (which used to snap to the saved height at once).
for (const saved of [null, '508']) {
  test(`switching layouts keeps the terminal's bottom edge fixed ${saved ? 'with a saved height' : 'with the default sizes'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript((value) => {
      window.localStorage.setItem('grindstone:layout', 'terminal')
      if (value) window.localStorage.setItem('grindstone:terminal-height', value)
    }, saved)
    await page.goto('/git/09-read-history')
    await expect(page.getByRole('radio', { name: 'Terminal' })).toHaveAttribute('aria-checked', 'true')

    // the biggest distance between the terminal's bottom edge and its column's, over the next 450 ms of frames
    const watch = () => page.evaluate(() => new Promise<{ gap: number, heights: number }>((resolve) => {
      const box = document.querySelector('.terminal-box')!
      const column = box.parentElement!
      const start = performance.now()
      let gap = 0
      const heights = new Set<number>()
      const frame = () => {
        gap = Math.max(gap, Math.abs(column.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom))
        heights.add(Math.round(box.getBoundingClientRect().height))
        if (performance.now() - start < 450) requestAnimationFrame(frame)
        else resolve({ gap: Math.round(gap), heights: heights.size })
      }
      frame()
    }))

    for (const [radio, to] of [['IDE', 'open'], ['Terminal', 'close']] as const) {
      const watching = watch()
      await page.getByRole('radio', { name: radio }).click()
      const seen = await watching
      expect(seen.gap, `${to}: the bottom edge moved`).toBeLessThanOrEqual(1)
      // it really animated (several heights on the way), it did not jump
      expect(seen.heights, `${to}: no animation`).toBeGreaterThan(3)
    }
  })
}

// the level with the longest story (8.2): its goals sit far below the fold of the panel
for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900]] as const) {
  test(`IDE layout at ${width}x${height}: the level panel and the explorer do not overlap`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await setIde(page)
    await page.goto('/git/36-hotfix-mid-feature')
    const explorer = page.getByRole('region', { name: 'Files in the working tree' })
    await expect(explorer).toBeVisible()
    await expect.poll(async () => (await page.locator('.reveal-files').boundingBox())?.height ?? 0).toBeGreaterThan(100)

    const panel = page.locator('.reveal-files').locator('xpath=..').locator('> div').first()
    const rects = async () => ({
      panel: (await panel.boundingBox())!,
      explorer: (await explorer.boundingBox())!,
      files: (await page.locator('.reveal-files').boundingBox())!
    })
    const before = await rects()
    expect(before.panel.y + before.panel.height).toBeLessThanOrEqual(before.files.y + 1)
    // the explorer is bounded: it never takes more than a third of the column
    expect(before.files.height).toBeLessThanOrEqual((before.panel.height + before.files.height) * 0.4)

    // the panel scrolls inside its own box: the last goal can be brought into view and then sits above the explorer
    const lastGoal = page.getByRole('region', { name: /Goals/ }).getByRole('listitem').last()
    await lastGoal.scrollIntoViewIfNeeded()
    const goal = (await lastGoal.boundingBox())!
    const after = await rects()
    expect(goal.y + goal.height).toBeLessThanOrEqual(after.explorer.y + 1)
    expect(goal.y).toBeGreaterThanOrEqual(after.panel.y - 1)
    // nothing moved: the explorer stayed where it was
    expect(after.explorer.y).toBe(before.explorer.y)
  })
}
