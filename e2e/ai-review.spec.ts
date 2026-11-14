import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Working with AI (ADR 0008): a scenario reviewed like a player (a false alarm, the comment on the right line, Request
// changes, the debrief, the best run on the track page), a chapter 2 scenario reviewed on Sous's description (a claim
// that holds, the wrong kind on the right line, the false claim), a verdict task that should be approved, Run the PR in
// the Debugging sandbox, the overview radar on home, and the review page on a phone in both themes.

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

test('plays Working with AI 1.1 end to end: a false alarm, the right line, Request changes, the debrief', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('track-ai-primary').click()
  await expect(page).toHaveURL(/\/ai\/01-twelve-croissants$/)
  await expect(page.getByRole('heading', { level: 1, name: /At most twelve croissants/ })).toBeVisible()
  await expect(page.locator('[data-goal]')).toHaveCount(2)
  await expect(page.locator('[data-goal="found"]')).toContainText('Find the problem in the diff (1)')
  await expect(page.getByTestId('pull-request')).toContainText('Limit each product to 12 per order')
  await expect(page.getByTestId('pr-description')).toContainText('The Add button turns off at 12')
  // the diff: three files after the description, the planted line on the head side
  await expect(page.locator('[data-file]')).toHaveCount(4)
  await expect(page.locator('[data-file]').first()).toHaveAttribute('data-file', 'description')
  await expect(page.locator('[data-row="cart.js:37"]')).toContainText('line.quantity < MAX_PER_PRODUCT - 1')
  await expect(page.locator('[data-row="cart.js:37"]')).toHaveAttribute('data-kind', 'add')

  // the tempting guard first: a false alarm, told why
  await comment(page, 'cart.js:28', 'bug', 'Off by one?')
  await page.getByTestId('request-changes').click()
  const alarm = page.locator('[data-comment="cart.js:28"]')
  await expect(alarm.getByTestId('comment-false-alarm')).toContainText('it runs before adding')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')
  await expect(page.getByTestId('review-outcome')).toContainText('0 of 1 problems found')
  await expect(page.locator('[data-goal="found"]')).toHaveAttribute('data-met', 'false')
  await expect(page.locator('[data-goal="verdict"]')).toHaveAttribute('data-met', 'true')

  // the right line, then the review again: solved, the debrief
  await comment(page, 'cart.js:37', 'bug', 'With 11 in the basket this is 11 < 11.')
  await expect(page.getByTestId('comment-list').locator('li')).toHaveCount(2)
  await page.getByTestId('review-summary').fill('The 12th croissant can never be added.')
  await page.getByTestId('request-changes').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Off by one, right at the edge you were told about')
  await expect(dialog.getByTestId('debrief-issues')).toContainText('cart.js:37')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('False alarms')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · 1 false alarm')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(2)
  await expect(page.locator('[data-comment="cart.js:37"]').getByTestId('comment-found')).toContainText('turns Add off at 11, one early')
  // sending it again counts the old false alarm once
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-01-twelve-croissants"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('best: no hints, 1 false alarm')
  await expect(row).toContainText('off-by-one')
  await expect(page.locator('[data-level="ai-practice-open-days"]')).toHaveAttribute('data-state', 'next')
  await expect(page.locator('[data-level="ai-practice-same-loop"]')).toContainText('verdict')
})

test('plays Claims vs. code 2.1 end to end: comments on the description, the wrong kind, the false claim', async ({ page }) => {
  await page.goto('/ai#claims-vs-code')
  await page.locator('[data-level="ai-06-empty-basket"]').click()
  await expect(page).toHaveURL(/\/ai\/06-empty-basket$/)
  await expect(page.getByRole('heading', { level: 1, name: /Handles empty baskets/ })).toBeVisible()
  // the description is numbered like a file: a paragraph, then the claims
  const description = page.getByTestId('pr-description')
  await expect(description.locator('[data-testid="diff-number"]')).toHaveText(['1', '2', '3', '4'])
  await expect(page.locator('[data-row="description:3"]')).toContainText('Handles an empty basket')
  await expect(page.locator('[data-row="description:3"] [data-claim="1"]')).toBeVisible()

  // a claim that holds: a false alarm, told why
  await comment(page, 'description:4', 'false-claim', 'Is it?')
  // the right line, the wrong kind: near
  await comment(page, 'summary.js:12', 'bug', '0 / 0 is NaN.')
  await expect(page.getByTestId('comment-list')).toContainText('description:4')
  await page.getByTestId('request-changes').click()
  await expect(page.locator('[data-comment="description:4"]').getByTestId('comment-false-alarm')).toContainText('only the average is new')
  await expect(page.locator('[data-comment="summary.js:12"]').getByTestId('comment-near')).toContainText('isn\'t a problem of the kind “Bug”')
  await expect(page.getByTestId('review-outcome')).toContainText('0 of 1 problems found')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')

  // the false claim, on the claim itself: solved
  await comment(page, 'description:3', 'false-claim', 'An empty basket says NaN: 0 / 0 isn\'t 0.')
  await expect(page.locator('[data-comment="description:3"]')).toHaveAttribute('aria-label', 'False claim on line 3 of the description')
  await page.getByTestId('request-changes').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('A claimed edge case is the first thing to try')
  await expect(dialog.getByTestId('debrief-issues')).toContainText('description:3 · summary.js:11–12')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · 1 false alarm')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-comment="description:3"]').getByTestId('comment-found')).toContainText('0 / 0 is not 0')

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-06-empty-basket"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('empty case')
  await expect(page.locator('#claims-vs-code')).toContainText('1 of 15 solved')
})

test('picks the description\'s lines with the keyboard, and shows the issue a fix names', async ({ page }) => {
  await page.goto('/ai/09-linked-issue')
  const issue = page.getByTestId('linked-issue')
  await expect(issue).toContainText('The basket counter shows 2 for three items')
  await expect(issue).toContainText('#142')
  await expect(issue).toContainText('opened by Anna')
  // the linked issue is not a place to comment: it has no line numbers
  await expect(issue.getByTestId('diff-number')).toHaveCount(0)
  await number(page, 'description:2').focus()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(number(page, 'description:3')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('comment-form')).toContainText('Commenting on lines 2 to 3 of the description')
  await page.getByTestId('comment-category').selectOption('false-claim')
  await page.getByTestId('comment-save').click()
  await page.getByTestId('request-changes').click()
  // the false claim and one that holds: broad, a false alarm, and no hint that a problem is there
  await expect(page.locator('[data-comment="description:2–3"]').getByTestId('comment-false-alarm')).toContainText('most of the lines this comment covers hold')
  await expect(page.locator('[data-comment="description:2–3"]').getByTestId('comment-wide')).toHaveCount(0)
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')
})

test('a verdict task that is fine: approve it, with a reason', async ({ page }) => {
  await page.goto('/ai/practice-same-loop')
  await expect(page.locator('[data-goal]')).toHaveCount(1)
  await expect(page.getByTestId('review-run')).toContainText('no page to run')
  // no reason, no review
  await page.getByTestId('approve').click()
  await expect(page.getByTestId('reason-missing')).toBeVisible()
  await expect(page.getByTestId('review-summary')).toBeFocused()
  await expect(page.getByTestId('review-outcome')).toBeEmpty()
  await page.getByTestId('review-summary').fill('Same loop: both stop at the last line.')
  await page.getByTestId('approve').click()
  await expect(page.getByTestId('practice-solved')).toContainText('Nothing to fix: approve')
  await expect(page.locator('[data-goal="verdict"]')).toHaveAttribute('data-met', 'true')
})

test('an approval with a comment flags a problem: it is not the right verdict', async ({ page }) => {
  await page.goto('/ai/practice-no-double-negative')
  await comment(page, 'delivery.js:5', 'bug', 'Is 30 free?')
  await page.getByTestId('review-summary').fill('Looks fine.')
  await page.getByTestId('approve').click()
  await expect(page.getByTestId('review-outcome')).toContainText('You approved, but your comments flag problems')
  await expect(page.locator('[data-comment="delivery.js:5"]').getByTestId('comment-false-alarm')).toContainText('30 or more')
  // delete it and approve again
  await page.locator('[data-comment="delivery.js:5"]').getByTestId('comment-delete').click()
  await expect(page.locator('[data-comment]')).toHaveCount(0)
  await page.getByTestId('approve').click()
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')
})

test('runs the PR in the sandbox: the PR turns Add off at 11, main has no limit', async ({ page }) => {
  await page.goto('/ai/01-twelve-croissants')
  await expect(page.getByTestId('app-frame')).toHaveCount(0)
  await page.getByTestId('run-pr').click()
  const app = page.frameLocator('[data-testid="app-frame"]')
  const add = app.locator('[data-id="croissant"] .add')
  for (let i = 0; i < 11; i++) await add.click()
  await expect(add).toBeDisabled()
  await expect(app.locator('#cart-count')).toHaveText('11')
  // the Console runs inside the PR's app
  const input = page.getByTestId('console-input')
  await input.fill('cart.lines[0].quantity')
  await input.press('Enter')
  await expect(page.getByTestId('console-log').locator('[data-level="result"]').last()).toHaveText(/11$/)

  // main, before the change: a fresh load with no limit
  await page.getByRole('button', { name: 'main' }).click()
  await expect(page.locator('[data-run-side="base"]')).toBeVisible()
  for (let i = 0; i < 13; i++) await add.click()
  await expect(app.locator('#cart-count')).toHaveText('13')
  // running counts for nothing
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 0')
})

test('picks rows with the keyboard and comments on all of them', async ({ page }) => {
  await page.goto('/ai/05-office-discount')
  await number(page, 'discount.js:8').focus()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(number(page, 'discount.js:9')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('comment-form')).toContainText('Commenting on lines 8 to 9')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('comment-form')).toHaveCount(0)
  await expect(number(page, 'discount.js:9')).toBeFocused()
  // one comment over both lines finds both problems
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Enter')
  await page.getByTestId('comment-text').fill('A percentage used as a share, and rounding to euros.')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-comment="discount.js:8–9"]')).toBeFocused()
  await page.getByTestId('request-changes').click()
  await expect(page.getByRole('dialog')).toContainText('Ten is not a tenth')
})

test('picks rows with the keyboard while the form is open: the form moves there and keeps what you typed', async ({ page }) => {
  await page.goto('/ai/05-office-discount')
  await number(page, 'discount.js:9').click()
  await page.getByTestId('comment-text').fill('Rounds to euros.')
  // back to the rows, then pick upwards from the focused row
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(number(page, 'discount.js:9')).toBeFocused()
  await page.keyboard.press('Shift+ArrowUp')
  await expect(number(page, 'discount.js:8')).toHaveAttribute('aria-pressed', 'true')
  await expect(number(page, 'discount.js:9')).toHaveAttribute('aria-pressed', 'true')
  await expect(number(page, 'discount.js:7')).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('comment-form')).toContainText('Commenting on lines 8 to 9')
  await expect(page.getByTestId('comment-text')).toHaveValue('Rounds to euros.')
})

test('a comment that covers too much finds nothing: narrow it down, or a false alarm over fine changes', async ({ page }) => {
  await page.goto('/ai/05-office-discount')
  // the whole new function: both problems, the right guard and the lines around them
  await number(page, 'discount.js:6').click()
  await number(page, 'discount.js:10').click({ modifiers: ['Shift'] })
  await page.getByTestId('comment-save').click()
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('review-outcome')).toContainText('0 of 2 problems found')
  await expect(page.locator('[data-comment="discount.js:6–10"]').getByTestId('comment-false-alarm')).toContainText('most of the changes this comment covers are fine')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')
})

test('a Console link in Run the PR shows its line in the diff', async ({ page }) => {
  await page.goto('/ai/01-twelve-croissants')
  await page.getByTestId('run-pr').click()
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('.product')).toHaveCount(3)
  // a broken basket line makes Add throw inside cart.js
  const input = page.getByTestId('console-input')
  await input.fill('cart.lines.push(null)')
  await input.press('Enter')
  await app.locator('[data-id="croissant"] .add').click()
  const error = page.getByTestId('console-log').locator('[data-level="error"]')
  await expect(error).toContainText('TypeError')
  await error.locator('[data-frame="cart.js:10"]').first().click()
  await expect(number(page, 'cart.js:10')).toBeFocused()
  await expect(page.getByTestId('run-line-missing')).toHaveCount(0)
})

test('shows the overview radar on home once you have progress: one axis per live track', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('overview-radar')).toHaveCount(0)
  await page.goto('/ai/practice-open-days')
  await comment(page, 'hours.js:5', 'bug', 'Stops before Sunday.')
  await page.getByTestId('request-changes').click()
  await expect(page.getByTestId('practice-solved')).toBeVisible()
  await page.goto('/')
  const radar = page.getByTestId('overview-radar')
  await expect(radar).toBeVisible()
  await expect(radar.locator('[data-axis-track]')).toHaveCount(3)
  await expect(radar.locator('[data-axis-track="ai"]')).toContainText('1 of 30 solved')
  await expect(radar.locator('[data-axis]')).toHaveCount(3)
  await expect(radar.getByTestId('radar-shape')).toBeVisible()
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`fits a phone in ${colorScheme}: no sideways scroll, comment by tapping a line number`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme })
    const page = await context.newPage()
    await page.goto('/ai/02-line-totals')
    await expect(page.getByTestId('pull-request')).toBeVisible()
    const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(await noSideways()).toBe(true)
    // no Shift and no drag on a phone: the how-to says to tap the line
    await expect(page.getByTestId('how-to-touch')).toBeVisible()
    await number(page, 'summary.js:13').tap()
    await page.getByTestId('comment-save').tap()
    await expect(page.locator('[data-comment="summary.js:13"]')).toBeVisible()
    expect(await noSideways()).toBe(true)
    await page.getByTestId('run-pr').tap()
    await expect(page.getByTestId('app-frame')).toBeVisible()
    expect(await noSideways()).toBe(true)
    await page.getByTestId('request-changes').tap()
    await expect(page.getByRole('dialog')).toContainText('The right number, from the wrong variable')
    await page.getByRole('button', { name: 'Stay here' }).tap()
    await page.goto('/')
    expect(await noSideways()).toBe(true)
    await expect(page.getByTestId('overview-radar')).toBeVisible()
    // chapter 2: the description and the linked issue fit too, and a tap on a claim comments on it
    await page.goto('/ai/09-linked-issue')
    await expect(page.getByTestId('linked-issue')).toBeVisible()
    expect(await noSideways()).toBe(true)
    await number(page, 'description:2').tap()
    await page.getByTestId('comment-category').selectOption('false-claim')
    await page.getByTestId('comment-save').tap()
    await expect(page.locator('[data-comment="description:2"]')).toBeVisible()
    expect(await noSideways()).toBe(true)
    await context.close()
  })
}

// What each scenario's debrief says running the PR shows: the bug, for real, in the sandbox (and main without it)
const EVIDENCE: { level: string, act: (app: ReturnType<Page['frameLocator']>, side: 'head' | 'base') => Promise<void>, read: string, head: string | RegExp, base: string | RegExp }[] = [
  {
    level: '02-line-totals',
    act: async (app) => {
      for (const id of ['croissant', 'croissant', 'sourdough']) await app.locator(`[data-id="${id}"] .add`).click()
    },
    read: '#basket li:first-child',
    head: '2 × Butter croissant 7.20',
    base: '2 × Butter croissant'
  },
  { level: '03-free-coffee', act: async () => {}, read: '#coffee', head: /A free coffee/, base: /A free coffee/ },
  {
    level: '04-pickup-locker',
    act: async (app, side) => {
      await app.locator('[data-id="croissant"] .add').click()
      // main has no locker yet: delivery's fee shows it adds up there
      await app.locator('#method').selectOption(side === 'head' ? 'locker' : 'delivery')
    },
    read: '#order-total',
    head: 'NaN',
    base: '5.90'
  },
  {
    level: '05-office-discount',
    act: async (app) => {
      for (let i = 0; i < 10; i++) await app.locator('[data-id="croissant"] .add').click()
    },
    read: '#order-total',
    head: '-216.00',
    base: '24.00'
  }
]

// Chapter 2: what running each scenario shows against its claim, and main beside it
const CLAIM_EVIDENCE: { level: string, check: (app: ReturnType<Page['frameLocator']>, side: 'head' | 'base') => Promise<void> }[] = [
  {
    // “Handles an empty basket”: the page opens with NaN; main has no average yet
    level: '06-empty-basket',
    check: async (app, side) => {
      if (side === 'base') return expect(app.locator('#order-average')).toHaveCount(0)
      await expect(app.locator('#order-average')).toHaveText('NaN')
      await app.locator('[data-id="croissant"] .add').click()
      await expect(app.locator('#order-average')).toHaveText('2.40')
    }
  },
  {
    // “No behaviour change”: the PR lists the croissant first, main Maya's bread; the tip is the same
    level: '07-just-a-refactor',
    check: async (app, side) => {
      await expect(app.locator('.product .name').first()).toHaveText(side === 'head' ? 'Butter croissant' : 'Sourdough loaf')
      await expect(app.locator('#tip')).toHaveText('Something small? Butter croissant, 2.40 €')
    }
  },
  {
    // “Tested with all sizes”: a medium coffee costs the small price; main has one size
    level: '08-all-sizes',
    check: async (app, side) => {
      if (side === 'base') {
        await app.locator('#coffee-size').selectOption('small')
        return expect(app.locator('#order-total')).toHaveText('2.20')
      }
      await app.locator('#coffee-size').selectOption('medium')
      await expect(app.locator('#order-total')).toHaveText('2.20')
      await app.locator('#coffee-size').selectOption('large')
      await expect(app.locator('#order-total')).toHaveText('3.00')
    }
  },
  {
    // “Fixes #142”: what the issue describes, two croissants and a loaf, still says 2; one item says “1 products”
    level: '09-linked-issue',
    check: async (app, side) => {
      await app.locator('[data-id="croissant"] .add').click()
      await expect(app.locator('#cart-count')).toHaveText(side === 'head' ? '1 products' : '1')
      await app.locator('[data-id="croissant"] .add').click()
      await app.locator('[data-id="sourdough"] .add').click()
      await expect(app.locator('#cart-count')).toHaveText(side === 'head' ? '2 products' : '2')
    }
  },
  {
    // “Same totals as before”: the second croissant leaves the total at 2.40 on the PR
    level: '10-same-but-faster',
    check: async (app, side) => {
      await app.locator('[data-id="croissant"] .add').click()
      await app.locator('[data-id="croissant"] .add').click()
      await expect(app.locator('#order-total')).toHaveText(side === 'head' ? '2.40' : '4.80')
    }
  }
]

for (const { level, check } of CLAIM_EVIDENCE) {
  test(`running ${level} shows the claim that doesn't hold, and main beside it`, async ({ page }) => {
    await page.goto(`/ai/${level}`)
    await page.getByTestId('run-pr').click()
    const app = page.frameLocator('[data-testid="app-frame"]')
    await expect(app.locator('.product')).toHaveCount(3)
    await check(app, 'head')
    await expect(page.getByTestId('console-log').locator('[data-level="error"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'main' }).click()
    await expect(page.locator('[data-run-side="base"]')).toBeVisible()
    await expect(app.locator('.product')).toHaveCount(3)
    await check(app, 'base')
  })
}

for (const { level, act, read, head, base } of EVIDENCE) {
  test(`running ${level} shows its bug, and main does not`, async ({ page }) => {
    await page.goto(`/ai/${level}`)
    await page.getByTestId('run-pr').click()
    const app = page.frameLocator('[data-testid="app-frame"]')
    await expect(app.locator('.product')).toHaveCount(3)
    await act(app, 'head')
    await expect(app.locator(read)).toHaveText(head)
    if (level === '03-free-coffee') await expect(app.locator('#coffee')).toBeVisible()
    await expect(page.getByTestId('console-log').locator('[data-level="error"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'main' }).click()
    await expect(page.locator('[data-run-side="base"]')).toBeVisible()
    await expect(app.locator('.product')).toHaveCount(3)
    await act(app, 'base')
    await expect(app.locator(read)).toHaveText(base)
    // main has no free coffee note yet: it stays hidden
    if (level === '03-free-coffee') await expect(app.locator('#coffee')).toBeHidden()
  })
}
