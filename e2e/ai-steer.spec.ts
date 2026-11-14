import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Steer the assistant (ADR 0008, chapter 7) in a real browser: 7.1 steered like a player. A request for changes
// without a comment is refused; a security comment on the rounding bug gets Sous's wrong fix (it escapes the number,
// still unrounded in the running app); approving that is too early; a bug comment on the same line gets the right fix,
// shown as the commit's diff and running; the approval solves it, two rounds of changes in the debrief and on the track
// page. Then the Working with AI cheat sheet, in the menu and on a phone.

const number = (page: Page, row: string) => page.locator(`[data-row="${row}"] [data-testid="diff-number"]`)

async function comment(page: Page, row: string, category: string, text: string) {
  await number(page, row).click()
  const form = page.getByTestId('comment-form')
  await expect(form.getByTestId('comment-category')).toBeFocused()
  await form.getByTestId('comment-category').selectOption(category)
  await form.getByTestId('comment-text').fill(text)
  await form.getByTestId('comment-save').click()
  await expect(form).toHaveCount(0)
}

/** Runs the PR, puts ten croissants in the basket and returns the saving line's text. */
async function savingWithTen(page: Page): Promise<string> {
  await page.getByTestId('run-pr').click()
  const app = page.frameLocator('[data-testid="app-frame"]')
  const add = app.locator('[data-id="croissant"] .add')
  for (let i = 0; i < 10; i++) await add.click()
  await expect(app.locator('#saving')).toBeVisible()
  return (await app.locator('#saved').textContent()) ?? ''
}

test('steers What offices save over two rounds: a misleading kind gets a wrong fix, the right kind the fix', async ({ page }) => {
  await page.goto('/ai#steer')
  await page.locator('[data-level="ai-31-what-offices-save"]').click()
  await expect(page).toHaveURL(/\/ai\/31-what-offices-save$/)
  await expect(page.getByRole('heading', { level: 1, name: /What offices save/ })).toBeVisible()
  await expect(page.locator('[data-goal="fixed"]')).toContainText('Steer Sous to fix the problem (1)')
  await expect(page.locator('[data-goal="verdict"]')).toContainText('by round 3')
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 1 of 3')
  await expect(page.getByTestId('steer-round-note')).toContainText('Sous answers with a commit')
  await expect(page.locator('[data-row="summary.js:15"]')).toContainText('savedText.textContent = String(full - total)')
  // the bug, running: ten croissants save 2.3999999999999986 €
  expect(await savingWithTen(page)).toBe('2.3999999999999986')

  // nothing to act on: Sous needs a comment
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('steer-needs-comment')).toBeVisible()
  await expect(page.getByTestId('steer-timeline')).toHaveCount(0)

  // round 1: the right line, a misleading kind
  await comment(page, 'summary.js:15', 'security', 'Is this safe to put on the page?')
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 2 of 3')
  const first = page.locator('[data-testid="steer-round"][data-round="1"]')
  await expect(first).toBeFocused()
  await expect(first.locator('[data-testid="steer-reply"][data-comment="summary.js:15"]')).toContainText('Is this safe to put on the page?')
  await expect(first.getByTestId('steer-sous')).toContainText('the saving is escaped now')
  await expect(first.getByTestId('steer-commit-id')).toHaveText(/^[0-9a-f]{7}$/)
  // the commit's own diff, and the whole pull request as it is now
  await expect(first.getByTestId('steer-commit-diff')).toContainText('escapeHtml(String(full - total))')
  await expect(page.locator('[data-row="summary.js:15"]')).toContainText('escapeHtml(String(full - total))')
  await expect(page.getByTestId('comment-list').locator('li')).toHaveCount(0)
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 0')
  // a wrong fix: still unrounded when it runs
  expect(await savingWithTen(page)).toBe('2.3999999999999986')

  // approving now is too early
  await page.getByTestId('approve').click()
  await expect(page.getByTestId('review-outcome')).toContainText('Not yet: 1 problem is left')
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)

  // round 2: the same line, named for what it is
  await comment(page, 'summary.js:15', 'bug', 'It is the rounding: format it like the total.')
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 3 of 3')
  await expect(page.getByTestId('steer-round-note')).toContainText('the last')
  const second = page.locator('[data-testid="steer-round"][data-round="2"]')
  await expect(second.getByTestId('steer-sous')).toContainText('Escaping wasn')
  await expect(second.getByTestId('steer-commit-diff')).toContainText('formatPrice(full - total)')
  await expect(page.locator('[data-row="summary.js:15"]')).toContainText('savedText.textContent = formatPrice(full - total)')
  await expect(page.locator('[data-file="summary.js"]')).not.toContainText('function escapeHtml')
  expect(await savingWithTen(page)).toBe('2.40')

  // right now: approve it, solved in two rounds
  await page.getByTestId('approve').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Sous does what your comment says it is')
  await expect(dialog.getByTestId('debrief-rounds')).toHaveText('2')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · no false alarms · 2 rounds')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-31-what-offices-save"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('best: no hints, no false alarms, 2 rounds')
  await expect(row).toContainText('bug, not security')
  await expect(page.locator('[data-level="ai-practice-fixed-not-pinned"]')).toContainText('steer')
  await expect(page.locator('#steer')).toContainText('1 of 10 solved')
})

test('a steer practice task: one comment, Sous\'s commit, the approval; a flagged fine place costs a false alarm', async ({ page }) => {
  await page.goto('/ai/practice-take-it-out')
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 1 of 2')
  // the typo fix is what was asked for: flagging it is a false alarm, and Sous leaves it
  await comment(page, 'products.js:5', 'bug', 'Is this right?')
  await comment(page, 'products.js:6', 'scope', 'Nobody asked for a sort.')
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 2 of 2')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')
  const round = page.locator('[data-testid="steer-round"][data-round="1"]')
  await expect(round.locator('[data-comment="products.js:5"]')).toContainText('found nothing to change there')
  await expect(round.locator('[data-comment="products.js:6"]')).toContainText('Took the sort out')
  await expect(page.locator('[data-file="products.js"]')).not.toContainText('.sort(')
  await page.getByTestId('approve').click()
  await expect(page.getByTestId('review-outcome')).toContainText('Sous merges it')
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)
})

test('a request for changes in the last round finds the problem and solves nothing: the rounds are used up', async ({ page }) => {
  await page.goto('/ai/31-what-offices-save')
  // round 1: unclear gets a comment above the line, which moves to line 16
  await comment(page, 'summary.js:15', 'unclear', 'What is this?')
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 2 of 3')
  // round 2: unclear again changes nothing
  await comment(page, 'summary.js:16', 'unclear', 'Still unclear.')
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 3 of 3')
  await expect(page.locator('[data-testid="steer-round"][data-round="2"]').getByTestId('steer-commit-empty')).toBeVisible()
  // round 3, the last: the right comment, but a request for changes
  await comment(page, 'summary.js:16', 'bug', 'It needs formatPrice.')
  await page.getByTestId('request-changes').click()
  const outcome = page.getByTestId('review-outcome')
  await expect(outcome).toContainText('1 of 1 problems found.')
  await expect(outcome).toContainText('The rounds are used up')
  await expect(outcome).toContainText('Reset to try again')
  await expect(outcome).not.toContainText('Sous merges it')
  await expect(outcome).not.toHaveClass(/text-success/)
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)
  await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 3 of 3')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`fits the steer play page on a phone in ${colorScheme}: the round badge, the timeline and the commit's diff, no sideways scroll`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme, hasTouch: true })
    const page = await context.newPage()
    await page.goto('/ai/34-order-by-email')
    await page.locator('[data-row="confirm.js:5"] [data-testid="diff-number"]').tap()
    const form = page.getByTestId('comment-form')
    await form.getByTestId('comment-category').selectOption('bug')
    await form.getByTestId('comment-text').fill('A very long comment about the key that goes on and on, to see how it wraps on a phone without pushing anything sideways at all.')
    await form.getByTestId('comment-save').click()
    await page.getByTestId('request-changes').tap()
    await expect(page.getByTestId('steer-round-badge')).toHaveText('Round 2 of 3')
    const round = page.locator('[data-testid="steer-round"][data-round="1"]')
    await expect(round.getByTestId('steer-sous')).toContainText('put together from its parts')
    await expect(round.getByTestId('steer-commit-diff')).toBeVisible()
    await round.getByTestId('steer-commit-diff').scrollIntoViewIfNeeded()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    // nothing in the timeline is wider than the page
    const widest = await round.evaluate(element => Math.max(...[...element.querySelectorAll('*')].map(each => each.getBoundingClientRect().right)))
    expect(widest).toBeLessThanOrEqual(390)
    await context.close()
  })
}

test('shows the Working with AI cheat sheet from the menu: a section per chapter, each card with its levels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })
  await nav.getByRole('button', { name: 'Working with AI' }).click()
  await page.getByRole('link', { name: 'Cheat sheet', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/cheat-sheet$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Working with AI cheat sheet' })).toBeVisible()
  await expect(page.getByTestId('cheat-group')).toHaveCount(7)
  await expect(page.locator('#steering [data-entry="name-kind"]')).toContainText('Name the kind')
  // filter, then a card's level
  await page.getByRole('textbox', { name: 'Filter the sheet' }).fill('hidden is not')
  await expect(page.getByTestId('cheat-group')).toHaveCount(1)
  await page.locator('[data-entry="not-hidden"]').getByRole('link', { name: /7\.4 Your order by email/ }).click()
  await expect(page).toHaveURL(/\/ai\/34-order-by-email$/)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`fits the Working with AI cheat sheet on a phone in ${colorScheme}: no sideways scroll`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme })
    const page = await context.newPage()
    await page.goto('/ai/cheat-sheet')
    await expect(page.getByRole('heading', { level: 1, name: 'Working with AI cheat sheet' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await context.close()
  })
}
