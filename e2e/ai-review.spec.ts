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
  await expect(row).toContainText('best 0 hints · 1 false alarm')
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
  await expect(radar.locator('[data-axis-track]')).toHaveCount(5)
  await expect(radar.locator('[data-axis-track="ai"]')).toContainText('1 of 100 solved')
  await expect(radar.locator('[data-axis]')).toHaveCount(5)
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
    // on a phone the pull request, the review box and Run the PR are tabs (Diff, Review, Run)
    await page.getByRole('tab', { name: 'Run' }).tap()
    await page.getByTestId('run-pr').tap()
    await expect(page.getByTestId('app-frame')).toBeVisible()
    expect(await noSideways()).toBe(true)
    await page.getByRole('tab', { name: 'Review' }).tap()
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

// Chapter 3, Tests that lie: the Tests panel runs the pull request's tests in a sealed frame, on This PR's code and on
// main's (main's files with the pull request's tests on top)
const tests = (page: Page, side: 'head' | 'base') => page.locator(`[data-run-side="${side}"] [data-testid="tests-panel"]`)

test('plays Tests that lie 3.3 end to end: the tests on This PR and on main, a failure into the diff, the review', async ({ page }) => {
  await page.goto('/ai#tests-that-lie')
  await page.locator('[data-level="ai-13-fixed-the-test"]').click()
  await expect(page).toHaveURL(/\/ai\/13-fixed-the-test$/)
  await expect(page.getByTestId('review-run')).toContainText('and runs its tests')
  await page.getByTestId('run-pr').click()
  // the Tests tab is open first and runs on This PR's code: every test passes
  await expect(page.locator('[data-testid="run-tab"][aria-selected="true"]')).toHaveText('Tests')
  await expect(tests(page, 'head').getByTestId('tests-summary')).toHaveText('2 passed')
  await expect(tests(page, 'head').getByTestId('test-case')).toHaveCount(2)
  await expect(tests(page, 'head').getByTestId('test-case').nth(1)).toContainText('three pains au chocolat cost 8.39 €')
  await expect(tests(page, 'head').getByTestId('test-case').nth(1)).toContainText('1 check')
  // a test's own line shows in the diff
  await tests(page, 'head').getByTestId('test-link').nth(1).click()
  await expect(number(page, 'prices.test.js:8')).toBeFocused()

  // on main's code the pull request's test fails: main still gives 8.399999999999999, which shows as 8.40
  await page.getByRole('button', { name: 'main' }).click()
  await expect(tests(page, 'base').getByTestId('tests-summary')).toHaveText('1 failed · 1 passed')
  await expect(tests(page, 'base')).toContainText('This pull request\'s tests, on main\'s code')
  const failed = tests(page, 'base').locator('[data-testid="test-case"][data-status="failed"]')
  await expect(failed.getByTestId('test-failure')).toHaveText('expect(received).toBe(expected)\n\nExpected: 8.39\nReceived: 8.399999999999999')
  // the failure's link shows the test file's line by the pull request's numbers, on main too
  await failed.getByTestId('test-failure-link').click()
  await expect(number(page, 'prices.test.js:9')).toBeFocused()
  await expect(page.getByTestId('run-line-missing')).toHaveCount(0)
  // the Console is the other tab, and running counts for nothing
  await page.locator('[data-run-side="base"] [data-testid="run-tab"][data-panel="console"]').click()
  await expect(page.locator('[data-run-side="base"]').getByTestId('console-log')).toBeVisible()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)

  // the review: the rounding in the code is a bug, the bent test a missing test (a bug there is the other kind)
  await comment(page, 'prices.test.js:9', 'bug', 'Three at 2.80 cost 8.40.')
  await comment(page, 'prices.js:3', 'bug', 'Math.floor cuts 839.9999999999999 down.')
  await page.getByTestId('request-changes').click()
  await expect(page.locator('[data-comment="prices.test.js:9"]').getByTestId('comment-near')).toContainText('isn\'t a problem of the kind “Bug”')
  await expect(page.getByTestId('review-outcome')).toContainText('1 of 2 problems found')
  await page.locator('[data-comment="prices.test.js:9"]').getByTestId('comment-delete').click()
  await comment(page, 'prices.test.js:9', 'missing-test', 'The test was changed to match the bug.')
  await page.getByTestId('request-changes').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('When a test fails, ask which one is wrong')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · no false alarms')
  await page.getByRole('button', { name: 'Stay here' }).click()

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-13-fixed-the-test"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('test bent to the bug')
  await expect(page.locator('#tests-that-lie')).toContainText('1 of 15 solved')
})

test('stops a test that never ends and goes on with the next; a huge failure is cut', async ({ page }) => {
  // the level's tests, made hostile on their way into the test frame: an endless loop, then a megabyte of message
  await page.addInitScript(() => {
    if (window !== window.top) return
    const property = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc')!
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      ...property,
      set(html: string) {
        const hostile = html.includes('testsDone') ? html.replace('toBe(2.4)', 'toBe(2.4); for (;;) {}').replace('toBe(8.39)', 'toBe(8.39); throw new Error(\'boom \'.repeat(200000))') : html
        property.set!.call(this, hostile)
      }
    })
  })
  await page.goto('/ai/13-fixed-the-test')
  await page.getByTestId('run-pr').click()
  const panel = tests(page, 'head')
  await expect(panel.getByTestId('tests-summary')).toHaveText('1 failed · 1 did not finish', { timeout: 20_000 })
  await expect(panel.locator('[data-status="unfinished"]')).toContainText('Stopped after 2 s: it never finished')
  const message = await panel.getByTestId('test-failure').textContent()
  expect(message!.startsWith('Error: boom boom')).toBe(true)
  expect(message!.length).toBeLessThanOrEqual(2010)
  // the page never froze: the review still works after the frame's worker looped
  await number(page, 'prices.js:3').click()
  await expect(page.getByTestId('comment-form')).toBeVisible()
  // and Run again runs it again, the same way
  await panel.getByTestId('tests-run').click()
  await expect(panel.getByTestId('tests-summary')).toHaveText('Running the tests…')
  await expect(panel.getByTestId('tests-summary')).toHaveText('1 failed · 1 did not finish', { timeout: 20_000 })
})

// What each chapter 3 scenario's tests say in the panel, on This PR and on main (as its debrief says)
const TEST_EVIDENCE: { level: string, head: string, base: string, check?: (page: Page) => Promise<void> }[] = [
  {
    level: '11-all-tests-pass',
    head: '3 passed',
    base: '3 passed',
    // the new test passed without a check, on main too
    check: page => expect(tests(page, 'base').getByTestId('test-case').nth(2).getByTestId('test-checks')).toHaveText('passed without checking anything')
  },
  { level: '12-mocked', head: '2 passed', base: '2 passed' },
  { level: '13-fixed-the-test', head: '2 passed', base: '1 failed · 1 passed' },
  {
    level: '14-full-coverage',
    head: '2 passed',
    base: '1 file could not run',
    check: async (page) => {
      await expect(tests(page, 'base').getByTestId('test-file-error')).toHaveText('Could not run: Failed to load ./split.js from split.test.js: no such file.')
      // nothing could run, so nothing was cut short
      await expect(tests(page, 'base').getByTestId('tests-stopped')).toHaveCount(0)
    }
  },
  {
    level: '15-snapshot-updated',
    head: '1 passed',
    base: '1 failed',
    check: page => expect(tests(page, 'base').getByTestId('test-failure')).toContainText('Snapshot:\n  2 × Butter croissant  2.40\n  1 × Pain au chocolat  2.80\n  Total  7.60\n\nReceived:\n  Butter croissant  4.80')
  }
]

for (const { level, head, base, check } of TEST_EVIDENCE) {
  test(`running ${level}'s tests: This PR passes, main shows what the debrief says`, async ({ page }) => {
    await page.goto(`/ai/${level}`)
    await page.getByTestId('run-pr').click()
    await expect(tests(page, 'head').getByTestId('tests-summary')).toHaveText(head)
    await page.getByRole('button', { name: 'main' }).click()
    await expect(tests(page, 'base').getByTestId('tests-summary')).toHaveText(base)
    await check?.(page)
  })
}

// what running each chapter 3 scenario's app shows: the bug where the code is wrong, the deal where it is right
test('running chapter 3\'s apps shows what the debriefs say', async ({ page }) => {
  const app = page.frameLocator('[data-testid="app-frame"]')
  const add = async (id: string, times: number) => {
    for (let i = 0; i < times; i++) await app.locator(`[data-id="${id}"] .add`).click()
  }
  await page.goto('/ai/11-all-tests-pass')
  await page.getByTestId('run-pr').click()
  await add('croissant', 7)
  await expect(app.locator('#order-total')).toHaveText('14.40')
  await page.goto('/ai/12-mocked')
  await page.getByTestId('run-pr').click()
  await add('croissant', 10)
  await expect(app.locator('#order-total')).toHaveText('24.00')
  await add('croissant', 1)
  await expect(app.locator('#order-total')).toHaveText('23.76')
  await page.goto('/ai/13-fixed-the-test')
  await page.getByTestId('run-pr').click()
  await add('pain-au-chocolat', 3)
  await expect(app.locator('#order-total')).toHaveText('8.39')
  await page.goto('/ai/14-full-coverage')
  await page.getByTestId('run-pr').click()
  await add('sourdough', 1)
  await app.locator('#people').selectOption('3')
  await expect(app.locator('#shares')).toHaveText('2.17 + 2.17 + 2.17')
  await page.goto('/ai/15-snapshot-updated')
  await page.getByTestId('run-pr').click()
  await add('croissant', 2)
  await expect(app.locator('#receipt')).toHaveText('2 × Butter croissant  2.40\nTotal  4.80')
  await page.locator('[data-testid="run-tab"][data-panel="console"]').click()
  await expect(page.getByTestId('console-log').locator('[data-level="error"]')).toHaveCount(0)
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`fits the Tests panel on a phone in ${colorScheme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme })
    const page = await context.newPage()
    await page.goto('/ai/11-all-tests-pass')
    const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    await page.getByRole('tab', { name: 'Run' }).tap()
    await page.getByTestId('run-pr').tap()
    await expect(tests(page, 'head').getByTestId('tests-summary')).toHaveText('3 passed')
    expect(await noSideways()).toBe(true)
    await page.getByRole('button', { name: 'main' }).tap()
    await expect(tests(page, 'base').getByTestId('tests-summary')).toHaveText('3 passed')
    // a test's link shows its line in the diff, by tapping
    await tests(page, 'base').getByTestId('test-link').nth(2).tap()
    await expect(number(page, 'prices.test.js:12')).toBeFocused()
    expect(await noSideways()).toBe(true)
    await number(page, 'prices.test.js:14').tap()
    await page.getByTestId('comment-category').selectOption('missing-test')
    await page.getByTestId('comment-save').tap()
    await page.getByRole('tab', { name: 'Review' }).tap()
    await page.getByTestId('request-changes').tap()
    await expect(page.getByRole('dialog')).toContainText('An expect without a matcher checks nothing')
    expect(await noSideways()).toBe(true)
    await context.close()
  })
}

// review of 2026-11-14: a test that ends but leaves a loop running (a timer, an un-awaited async loop) kept the worker
// busy between tests, and the run ended there, the next test unlisted, the summary green
for (const [kind, leak] of [['a timer', 'setTimeout(() => { for (;;) {} }, 0)'], ['an un-awaited async loop', '(async () => { for (;;) await null })()']] as const) {
  test(`goes on after a test that leaves ${kind} running`, async ({ page }) => {
    await page.addInitScript((code: string) => {
      if (window !== window.top) return
      const property = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc')!
      Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
        ...property,
        set(html: string) {
          property.set!.call(this, html.includes('testsDone') ? html.replace('toBe(2.4)', `toBe(2.4); ${code}`) : html)
        }
      })
    }, leak)
    await page.goto('/ai/13-fixed-the-test')
    await page.getByTestId('run-pr').click()
    const panel = tests(page, 'head')
    const summary = panel.getByTestId('tests-summary')
    await expect(summary).toHaveText('1 did not finish · 1 passed', { timeout: 20_000 })
    // not green: something went wrong
    await expect(summary).toHaveClass(/text-error/)
    const first = panel.getByTestId('test-case').first()
    await expect(first).toHaveAttribute('data-status', 'unfinished')
    await expect(first).toContainText('It ended, but something it started')
    // its checks ran; the next test ran in a fresh worker
    await expect(panel.getByTestId('test-case').nth(1)).toHaveAttribute('data-status', 'passed')
    await expect(panel.getByTestId('test-case').nth(1)).toContainText('three pains au chocolat cost 8.39 €')
    await expect(panel.getByTestId('tests-stopped')).toHaveCount(0)
  })
}

// Chapter 4, Invented APIs: running the pull request proves it (the Console names what isn't there, or the one output
// the change is about stays as it was), and a real API that looks invented is a false alarm
const errors = (page: Page) => page.getByTestId('console-log').locator('[data-level="error"]')

test('plays Invented APIs 4.1 end to end: the Console names the invented method, a real one is a false alarm, bug is near', async ({ page }) => {
  await page.goto('/ai#invented-apis')
  await page.locator('[data-level="ai-16-just-added"]').click()
  await expect(page).toHaveURL(/\/ai\/16-just-added$/)
  await expect(page.getByRole('heading', { level: 1, name: /Just added/ })).toBeVisible()
  await expect(page.locator('[data-row="cart.js:10"]')).toContainText('cart.items.last()')

  // Run the PR: it throws as the page opens and again on Add; the counter still counts, nothing shows under the list
  await page.getByTestId('run-pr').click()
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('.product')).toHaveCount(3)
  await expect(errors(page).first()).toContainText('cart.items.last is not a function')
  await app.locator('[data-id="croissant"] .add').click()
  await expect(app.locator('#cart-count')).toHaveText('1')
  await expect(app.locator('#just-added')).toHaveText('')
  await expect(errors(page)).toHaveCount(2)
  // the trace's link shows the line in the diff
  await errors(page).last().locator('[data-frame="cart.js:10"]').first().click()
  await expect(number(page, 'cart.js:10')).toBeFocused()
  // main has no Just added, and no error
  await page.getByRole('button', { name: 'main' }).click()
  await expect(page.locator('[data-run-side="base"]')).toBeVisible()
  await app.locator('[data-id="croissant"] .add').click()
  await expect(app.locator('#cart-count')).toHaveText('1')
  await expect(errors(page)).toHaveCount(0)

  // findLastIndex looks invented and is real: a false alarm, told why; the right line as a bug is near
  await comment(page, 'cart.js:22', 'invented-api', 'Is findLastIndex a thing?')
  await comment(page, 'cart.js:10', 'bug', 'This throws.')
  await page.getByTestId('request-changes').click()
  await expect(page.locator('[data-comment="cart.js:22"]').getByTestId('comment-false-alarm')).toContainText('findLastIndex is real')
  await expect(page.locator('[data-comment="cart.js:10"]').getByTestId('comment-near')).toContainText('isn\'t a problem of the kind “Bug”')
  await expect(page.getByTestId('review-outcome')).toContainText('0 of 1 problems found')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')

  // the right kind: an invented API, solved
  await page.locator('[data-comment="cart.js:10"]').getByRole('button', { name: /^Edit the comment/ }).click()
  const form = page.getByTestId('comment-edit-form')
  await form.getByTestId('comment-category').selectOption('invented-api')
  await expect(form).toContainText('It calls a function, option, export, file or package that doesn\'t exist, or a deprecated one.')
  await form.getByTestId('comment-save').click()
  await expect(page.locator('[data-comment="cart.js:10"]')).toHaveAttribute('aria-label', 'Invented API on line 10')
  await page.getByTestId('request-changes').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Arrays have no last()')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · 1 false alarm')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-comment="cart.js:10"]').getByTestId('comment-found')).toContainText('arrays have no last()')

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-16-just-added"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('invented method')
  await expect(page.locator('#invented-apis')).toContainText('1 of 15 solved')
})

type Frame = ReturnType<Page['frameLocator']>

// What running each other chapter 4 scenario shows, as its debrief says, and main beside it (no error there)
const API_EVIDENCE: { level: string, head: (app: Frame, page: Page) => Promise<void>, base: (app: Frame) => Promise<void> }[] = [
  {
    // a made-up option is ignored: no error, and the rye loaf still shows 5.00, as on main
    level: '17-whole-euros',
    head: async (app, page) => {
      await expect(app.locator('[data-id="rye"] .price')).toHaveText('5.00')
      await expect(app.locator('[data-id="croissant"] .price')).toHaveText('2.40')
      await expect(errors(page)).toHaveCount(0)
    },
    base: app => expect(app.locator('[data-id="rye"] .price')).toHaveText('5.00')
  },
  {
    // an import of a name money.js doesn't export: the modules don't link, the page stays empty
    level: '18-money-helper',
    head: async (app, page) => {
      await expect(errors(page).first()).toContainText('does not provide an export named \'formatEuro\'')
      await expect(app.locator('.product')).toHaveCount(0)
    },
    base: app => expect(app.locator('.product')).toHaveCount(3)
  },
  {
    // event.path is undefined: the first Add throws, and nothing goes in
    level: '19-one-listener',
    head: async (app, page) => {
      await expect(app.locator('.product')).toHaveCount(3)
      await app.locator('[data-id="croissant"] .add').click()
      await expect(errors(page).first()).toContainText('Cannot read properties of undefined (reading \'find\')')
      await expect(app.locator('#cart-count')).toHaveText('0')
    },
    base: async (app) => {
      await app.locator('[data-id="croissant"] .add').click()
      await expect(app.locator('#cart-count')).toHaveText('1')
    }
  },
  {
    // a bare package name in a page without a build step: nothing resolves it, nothing runs
    level: '20-date-library',
    head: async (app, page) => {
      await expect(errors(page).first()).toContainText('Failed to resolve module specifier "friendly-day-format"')
      await expect(app.locator('.product')).toHaveCount(0)
      await expect(app.locator('#pickup')).toHaveText('')
    },
    base: app => expect(app.locator('.product')).toHaveCount(3)
  }
]

for (const { level, head, base } of API_EVIDENCE) {
  test(`running ${level} shows what isn't there, and main runs`, async ({ page }) => {
    await page.goto(`/ai/${level}`)
    await page.getByTestId('run-pr').click()
    const app = page.frameLocator('[data-testid="app-frame"]')
    await head(app, page)
    await page.getByRole('button', { name: 'main' }).click()
    await expect(page.locator('[data-run-side="base"]')).toBeVisible()
    await base(app)
    await expect(errors(page)).toHaveCount(0)
  })
}

// Chapter 5, Security: running the pull request shows the hole (a customer's review running its code, a secret key
// going out, a staff route anyone can call, a price the browser sets, someone else's order), always inside the sealed
// frame; its scripted server answers as the pull request's server code would (main's on main)
const network = (page: Page) => page.getByTestId('network-list')
const openNetwork = (page: Page) => page.locator('[data-testid="run-tab"][data-panel="network"]').click()
const consoleResult = (page: Page) => page.getByTestId('console-log').locator('[data-level="result"]').last()

async function runInConsole(page: Page, line: string) {
  const input = page.getByTestId('console-input')
  await input.fill(line)
  await input.press('Enter')
}

test('plays Security 5.1 end to end: a review\'s markup runs in the sealed frame and never in the page, a fixed innerHTML is a false alarm, bug is near', async ({ page }) => {
  await page.goto('/ai#security')
  await page.locator('[data-level="ai-21-customer-reviews"]').click()
  await expect(page).toHaveURL(/\/ai\/21-customer-reviews$/)
  await expect(page.getByRole('heading', { level: 1, name: /Show customer reviews/ })).toBeVisible()
  await expect(page.locator('[data-row="reviews.js:15"]')).toContainText('item.innerHTML = `<p>${review.text}</p>`')

  // a bait in Grindstone's own page: what the review's code changes, had it run here
  await page.evaluate(() => {
    const bait = document.createElement('p')
    bait.className = 'tagline'
    bait.dataset.testid = 'bait'
    bait.textContent = 'Grindstone'
    document.body.append(bait)
  })
  const title = await page.title()

  await expect(page.getByTestId('review-run')).toContainText('The shop\'s server is scripted')
  await page.getByTestId('run-pr').click()
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#reviews .review')).toHaveCount(3)
  // Tom's review ran its code in the frame: the image failed, its onerror rewrote the tagline
  await expect(app.locator('.tagline')).toHaveText('Card payments are down today: pay at bakery-deals.example')
  await expect(app.locator('#reviews img[onerror]')).toHaveCount(1)
  await expect(page.getByTestId('console-log')).toContainText('Refused to load \'https://cornerbakery.shop/x\'')
  // and only there: the frame is sealed, the page's bait and title are untouched, no markup of it in the page
  await expect(page.getByTestId('app-frame')).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(page.getByTestId('bait')).toHaveText('Grindstone')
  await expect(page.locator('img[onerror]')).toHaveCount(0)
  expect(await page.title()).toBe(title)
  // the Network panel shows the review as the server sent it, as text
  await openNetwork(page)
  await network(page).getByRole('option', { name: /GET https:\/\/cornerbakery\.shop\/api\/reviews\?newest=3, 200 OK/ }).click()
  await expect(page.getByTestId('network-response-body')).toContainText('<img src=\\"x\\" onerror=')
  await expect(page.getByTestId('network-response-body').locator('img')).toHaveCount(0)
  await expect(page.locator('img[onerror]')).toHaveCount(0)
  await expect(page.getByTestId('bait')).toHaveText('Grindstone')
  // Sent from: the line that asked, in the diff
  await page.getByTestId('network-initiator').click()
  await expect(number(page, 'reviews.js:5')).toBeFocused()

  // main: no reviews, Maya's tagline
  await page.getByRole('button', { name: 'main' }).click()
  await expect(page.locator('[data-run-side="base"]')).toBeVisible()
  await expect(app.locator('.product')).toHaveCount(3)
  await expect(app.locator('.tagline')).toHaveText('Order today, pick up tomorrow from 7:00')
  await expect(app.locator('#reviews')).toHaveCount(0)

  // the fixed innerHTML of the no-reviews note is a false alarm, told why; the right line as a bug is near
  await comment(page, 'reviews.js:9', 'security', 'innerHTML!')
  await comment(page, 'reviews.js:15', 'bug', 'Reviews as HTML.')
  await page.getByTestId('request-changes').click()
  await expect(page.locator('[data-comment="reviews.js:9"]').getByTestId('comment-false-alarm')).toContainText('fixed text written in the code')
  await expect(page.locator('[data-comment="reviews.js:15"]').getByTestId('comment-near')).toContainText('isn\'t a problem of the kind “Bug”')
  await expect(page.getByTestId('review-outcome')).toContainText('0 of 1 problems found')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')

  // the right kind: security, solved
  await page.locator('[data-comment="reviews.js:15"]').getByRole('button', { name: /^Edit the comment/ }).click()
  const form = page.getByTestId('comment-edit-form')
  await form.getByTestId('comment-category').selectOption('security')
  await form.getByTestId('comment-save').click()
  await expect(page.locator('[data-comment="reviews.js:15"]')).toHaveAttribute('aria-label', 'Security on line 15')
  await page.getByTestId('request-changes').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Text from customers is not HTML')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · 1 false alarm')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-comment="reviews.js:15"]').getByTestId('comment-found')).toContainText('markup a customer writes becomes part of the page')

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-21-customer-reviews"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('HTML injection')
  await expect(page.locator('#security')).toContainText('1 of 15 solved')
})

// What running each other chapter 5 scenario shows, as its debrief says, and main beside it
const SECURITY_EVIDENCE: { level: string, head: (app: Frame, page: Page) => Promise<void>, base: (app: Frame, page: Page) => Promise<void> }[] = [
  {
    // the secret key goes out from the customer's browser with every Pay
    level: '22-payment-key',
    head: async (app, page) => {
      await expect(app.locator('#pay-methods')).toHaveText('We take cards and bank transfers.')
      await app.locator('[data-id="croissant"] .add').click()
      await app.locator('#pay').click()
      await expect(app.locator('#pay-status a')).toHaveText('Pay 2.40 € on Crumbpay')
      await openNetwork(page)
      await network(page).getByRole('option', { name: /POST https:\/\/api\.crumbpay\.example\/v1\/payment-links, 201 Created/ }).click()
      await expect(page.getByTestId('network-request')).toContainText('Bearer sk_live_cb-7Hq2-Lw9R-t4Xn')
      // and the amount the browser worked out from its basket
      await expect(page.getByTestId('network-request-body')).toContainText('"amount": 240')
    },
    base: async (app, page) => {
      await expect(app.locator('.product')).toHaveCount(3)
      await expect(app.locator('#pay')).toHaveCount(0)
      await openNetwork(page)
      await expect(network(page).getByRole('option')).toHaveCount(0)
    }
  },
  {
    // Sam is a customer: no Remove button, and the server takes the croissant off anyway
    level: '23-staff-button',
    head: async (app, page) => {
      await expect(app.locator('#who')).toHaveText('Signed in as Sam')
      await expect(app.locator('.product')).toHaveCount(3)
      await expect(app.locator('.product .action')).toHaveCount(0)
      await runInConsole(page, 'await removeProduct(\'croissant\')')
      await expect(consoleResult(page)).toHaveText(/true$/)
      await openNetwork(page)
      await expect(network(page).getByRole('option', { name: /DELETE https:\/\/cornerbakery\.shop\/api\/menu\/croissant, 204 No Content/ })).toBeVisible()
    },
    base: async (app, page) => {
      await expect(app.locator('.product')).toHaveCount(3)
      await runInConsole(page, 'await fetch(\'/api/menu/croissant\', { method: \'DELETE\' }).then(response => response.status)')
      await expect(consoleResult(page)).toHaveText(/404$/)
    }
  },
  {
    // the order carries the price the browser says: 0.01 goes out, and the server takes the order
    level: '24-price-from-basket',
    head: async (app, page) => {
      await app.locator('[data-id="sourdough"] .add').click()
      await runInConsole(page, 'cart.items[0].price = 0.01')
      await app.locator('#order').click()
      await expect(app.locator('#order-status')).toHaveText('Thanks! Order 1043 is in. Pick it up tomorrow from 7:00.')
      await openNetwork(page)
      await network(page).getByRole('option', { name: /POST https:\/\/cornerbakery\.shop\/api\/orders, 201 Created/ }).click()
      await expect(page.getByTestId('network-request-body')).toContainText('"price": 0.01')
      await expect(page.getByTestId('network-request-body')).toContainText('"total": 0.01')
    },
    base: async (app, page) => {
      await app.locator('[data-id="sourdough"] .add').click()
      await runInConsole(page, 'cart.items[0].price = 0.01')
      await app.locator('#order').click()
      await expect(app.locator('#order-status')).toHaveText('Thanks! Order 1043 is in. Pick it up tomorrow from 7:00.')
      await openNetwork(page)
      await network(page).getByRole('option', { name: /POST https:\/\/cornerbakery\.shop\/api\/orders, 201 Created/ }).click()
      await expect(page.getByTestId('network-request-body')).toContainText('"id": "sourdough"')
      await expect(page.getByTestId('network-request-body')).not.toContainText('price')
    }
  },
  {
    // Sam's own receipt, then Lena's: any order to anyone signed in
    level: '25-order-by-number',
    head: async (app, page) => {
      await app.getByRole('button', { name: 'Order 1042 · yesterday' }).click()
      await expect(app.locator('#receipt li')).toHaveText(['2 × Butter croissant  4.80', '1 × Sourdough loaf  6.50', 'Total  11.30 €'])
      await runInConsole(page, 'fetch(\'/api/orders/1041\')')
      await openNetwork(page)
      await network(page).getByRole('option', { name: /GET https:\/\/cornerbakery\.shop\/api\/orders\/1041, 200 OK/ }).click()
      await expect(page.getByTestId('network-response-body')).toContainText('lena.b@example.com')
    },
    base: async (app, page) => {
      await expect(app.locator('#orders li')).toHaveText(['Order 1042 · yesterday', 'Order 1036 · last Saturday'])
      await runInConsole(page, 'await fetch(\'/api/orders/1041\').then(response => response.status)')
      await expect(consoleResult(page)).toHaveText(/404$/)
    }
  }
]

for (const { level, head, base } of SECURITY_EVIDENCE) {
  test(`running ${level} shows the hole, and main does not have it`, async ({ page }) => {
    await page.goto(`/ai/${level}`)
    await page.getByTestId('run-pr').click()
    const app = page.frameLocator('[data-testid="app-frame"]')
    await head(app, page)
    await page.getByRole('button', { name: 'main' }).click()
    await expect(page.locator('[data-run-side="base"]')).toBeVisible()
    await page.locator('[data-run-side="base"] [data-testid="run-tab"][data-panel="console"]').click()
    await base(app, page)
  })
}

// Chapter 6, Scope and size: Sous does what was asked and more (a whole-file reformat, a change on the side, a rewrite,
// a rule inside a rename, a feature on top). Running both sides shows what the extra does, and a bug hidden in a
// reformat is found on its own lines: a bug comment over the reformat around it is too wide
test('plays Scope and size 6.1 end to end: a reformat hides a lost product, the test with the fix is fine, a bug comment over the reformat is too wide', async ({ page }) => {
  await page.goto('/ai#scope-and-size')
  await page.locator('[data-level="ai-26-menu-typo"]').click()
  await expect(page).toHaveURL(/\/ai\/26-menu-typo$/)
  await expect(page.getByRole('heading', { level: 1, name: /Fix the typo in the menu/ })).toBeVisible()
  await expect(page.locator('[data-goal="found"]')).toContainText('Find the problems in the diff (2)')
  const lost = page.locator('[data-row="products.js:-8"]')
  await expect(lost).toContainText('id: \'kouign-amann\'')
  await expect(lost).toHaveAttribute('data-kind', 'del')

  // Run the PR: seven products with the name fixed, and the test passes; main sells eight, and fails the test
  await page.getByTestId('run-pr').click()
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('.product')).toHaveCount(7)
  await expect(app.locator('[data-id="pain-au-chocolat"] .name')).toHaveText('Pain au chocolat')
  await expect(app.locator('[data-id="kouign-amann"]')).toHaveCount(0)
  await expect(tests(page, 'head').getByTestId('tests-summary')).toHaveText('1 passed')
  await page.getByRole('button', { name: 'main' }).click()
  await expect(page.locator('[data-run-side="base"]')).toBeVisible()
  await expect(app.locator('.product')).toHaveCount(8)
  await expect(app.locator('[data-id="kouign-amann"] .name')).toHaveText('Kouign-amann')
  await expect(tests(page, 'base').getByTestId('tests-summary')).toHaveText('1 failed')

  // the test that comes with the fix is a false alarm, told why; a bug comment over every removed product is too wide
  await comment(page, 'products.test.js:6', 'missing-test', 'Does this test belong here?')
  await number(page, 'products.js:-3').click()
  await number(page, 'products.js:-11').click({ modifiers: ['Shift'] })
  const form = page.getByTestId('comment-form')
  await expect(form).toContainText('Commenting on removed lines 3 to 11')
  await form.getByTestId('comment-category').selectOption('bug')
  await form.getByTestId('comment-save').click()
  await page.getByTestId('request-changes').click()
  await expect(page.locator('[data-comment="products.test.js:6"]').getByTestId('comment-false-alarm')).toContainText('a test that proves the fix belongs with it')
  const wide = page.locator('[data-comment="products.js:−3–11"]')
  await expect(wide.getByTestId('comment-wide')).toContainText('narrow it down')
  await expect(wide.getByTestId('comment-false-alarm')).toHaveCount(0)
  await expect(page.getByTestId('review-outcome')).toContainText('0 of 2 problems found')
  await expect(page.getByTestId('false-alarms')).toHaveText('False alarms: 1')

  // the lost line alone as a bug, the reformat as scope: solved
  await wide.getByTestId('comment-delete').click()
  await comment(page, 'products.js:-8', 'bug', 'The Kouign-amann is gone.')
  await comment(page, 'products.js:25', 'scope', 'A typo fix shouldn\'t reformat the whole file.')
  await page.getByTestId('request-changes').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('A one-word fix, buried in a whole file')
  await expect(dialog.getByTestId('debrief-stats')).toContainText('no hints · 1 false alarm')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-comment="products.js:−8"]').getByTestId('comment-found')).toContainText('the Kouign-amann is gone')
  await expect(page.locator('[data-comment="products.js:25"]').getByTestId('comment-found')).toContainText('a whole-file reformat')

  await page.goto('/ai')
  const row = page.locator('[data-level="ai-26-menu-typo"]')
  await expect(row).toContainText('Solved')
  await expect(row).toContainText('reformat')
  await expect(page.locator('#scope-and-size')).toContainText('1 of 15 solved')
})

async function addTimes(app: Frame, id: string, times: number) {
  for (let i = 0; i < times; i++) await app.locator(`[data-id="${id}"] .add`).click()
}

// What running each other chapter 6 scenario shows, as its debrief says, and main beside it
const SCOPE_EVIDENCE: { level: string, head: (app: Frame, page: Page) => Promise<void>, base: (app: Frame) => Promise<void> }[] = [
  {
    // the note works; and every time on the page reads the new way
    level: '27-pickup-note',
    head: async (app, page) => {
      await expect(app.locator('#hours')).toHaveText('Open today 7 AM–6 PM')
      await expect(app.locator('.product')).toHaveCount(3)
      await app.locator('[data-id="sourdough"] .add').click()
      await app.locator('#note').fill('Sliced, please')
      await app.locator('#order').click()
      await expect(app.locator('#order-status')).toHaveText('Thanks! Order 1043 is in. Pick it up tomorrow from 7 AM.')
      await openNetwork(page)
      await network(page).getByRole('option', { name: /POST https:\/\/cornerbakery\.shop\/api\/orders, 201 Created/ }).click()
      await expect(page.getByTestId('network-request-body')).toContainText('"note": "Sliced, please"')
    },
    base: async (app) => {
      await expect(app.locator('#hours')).toHaveText('Open today 7:00–18:00')
      await expect(app.locator('.product')).toHaveCount(3)
      await expect(app.locator('#note')).toHaveCount(0)
    }
  },
  {
    // eleven croissants, an office's order: the rewrite lost the 10 % off
    level: '28-five-cents',
    head: async (app) => {
      await addTimes(app, 'croissant', 11)
      await expect(app.locator('#order-total')).toHaveText('26.40')
    },
    base: async (app) => {
      await addTimes(app, 'croissant', 11)
      await expect(app.locator('#order-total')).toHaveText('23.76')
    }
  },
  {
    // the rename works, and Add stops at ten
    level: '29-cart-to-basket',
    head: async (app) => {
      await addTimes(app, 'croissant', 12)
      await expect(app.locator('#basket li')).toHaveText(['10 × Butter croissant'])
      await expect(app.locator('#cart-count')).toHaveText('10')
    },
    base: async (app) => {
      await addTimes(app, 'croissant', 12)
      await expect(app.locator('#basket li')).toHaveText(['12 × Butter croissant'])
      await expect(app.locator('#cart-count')).toHaveText('12')
    }
  },
  {
    // the label Maya asked for, and a button nobody asked for, whose wish goes to the server
    level: '30-sold-out-label',
    head: async (app, page) => {
      const gone = app.locator('[data-id="pain-au-chocolat"]')
      await expect(gone.locator('.price')).toHaveText('Sold out')
      await expect(gone.locator('.add')).toBeDisabled()
      await expect(app.locator('[data-id="croissant"] .add')).toBeEnabled()
      await gone.locator('.restock').click()
      await expect(gone.locator('.restock')).toHaveText('Done: we\'ll email you when it\'s back')
      await openNetwork(page)
      await expect(network(page).getByRole('option', { name: /POST https:\/\/cornerbakery\.shop\/api\/restock-alerts, 201 Created/ })).toBeVisible()
    },
    base: async (app) => {
      const gone = app.locator('[data-id="pain-au-chocolat"]')
      await expect(gone.locator('.price')).toHaveText('2.80')
      await expect(gone.locator('.add')).toBeEnabled()
      await expect(app.locator('.restock')).toHaveCount(0)
    }
  }
]

for (const { level, head, base } of SCOPE_EVIDENCE) {
  test(`running ${level} shows what it changes besides what was asked, and main beside it`, async ({ page }) => {
    await page.goto(`/ai/${level}`)
    await page.getByTestId('run-pr').click()
    const app = page.frameLocator('[data-testid="app-frame"]')
    await head(app, page)
    await page.getByRole('button', { name: 'main' }).click()
    await expect(page.locator('[data-run-side="base"]')).toBeVisible()
    const consoleTab = page.locator('[data-run-side="base"] [data-testid="run-tab"][data-panel="console"]')
    if (await consoleTab.count()) await consoleTab.click()
    await base(app)
    await expect(errors(page)).toHaveCount(0)
  })
}
