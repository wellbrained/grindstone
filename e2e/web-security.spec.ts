import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'

// Plays chapter 7 of Web fundamentals like a player (ADR 0009: Security headers & CSP): the prediction with the
// keyboard, the page's own request first in Network with its Content-Security-Policy, the policy as the browser parsed
// it in Application's Frames, Mallory's request in Server, the fix in three files, Reload and the debrief with the
// keyboard, then Chrome's refusal in the Console; 7.2's framed attack in Network and Other site, refused after the fix;
// and the panels at a phone's width, light and dark.

/** A file as the level's solution leaves it. */
function solved(id: string, path: string): string {
  const level = levelById(id) as WebLevel
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files[path]!
}

test('plays 7.1 with the keyboard: predicts the handler, reads the policy, fixes three files, reads Chrome\'s refusal', async ({ page }) => {
  await page.goto('/web/31-lets-it-run')
  await expect(page.getByRole('heading', { level: 1, name: /The policy that lets it run/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  // the prediction, with the keyboard
  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /changes Lena's email/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')

  // the page ran: the reviews, the account
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#tastebuds-reviews li')).toHaveCount(3)
  await expect(app.locator('#who')).toHaveText('Signed in as Lena')

  // Network: the page itself first, tagged page, its answer carrying the policy with 'unsafe-inline'
  const tabs = page.getByRole('tablist', { name: 'Console, Network, Server and Application' })
  await tabs.getByRole('tab', { name: 'Network' }).click()
  const rows = page.getByTestId('network-list').getByRole('option')
  await expect(rows.first()).toContainText('page')
  await rows.first().click()
  await expect(page.getByTestId('network-response')).toContainText('content-security-policy')
  await expect(page.getByTestId('network-response')).toContainText('\'unsafe-inline\'')
  // the widget's script, tagged script
  await expect(rows.filter({ hasText: 'reviews.js' }).getByTestId('network-destination')).toHaveText('script')

  // Application: Frames first, the policy as the browser parsed it
  await tabs.getByRole('tab', { name: 'Application' }).click()
  const policy = page.getByTestId('frames-policy')
  await expect(policy).toHaveCount(1)
  await expect(policy).toHaveAttribute('data-source', 'header')
  await expect(policy).toHaveAttribute('data-type', 'enforce')
  await expect(policy).toContainText('script-src')
  await expect(policy).toContainText('\'unsafe-inline\'')

  // Server: Mallory's handler changed the email
  await tabs.getByRole('tab', { name: 'Server' }).click()
  await expect(page.getByTestId('server-line').filter({ hasText: 'POST /account/email 200' })).toHaveCount(1)

  // the fix, file by file, each saved with the keyboard
  for (const path of ['server.js', 'index.html', 'app.js']) {
    await page.getByRole('tab', { name: path }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(solved('web-31-lets-it-run', path))
    await page.keyboard.press('ControlOrMeta+s')
  }
  await page.getByTestId('reload').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('Inline is inline, whoever wrote it')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // the reloaded page: Mallory's handler refused in Chrome's words, the order works, the policy without 'unsafe-inline'
  await expect(app.locator('#tastebuds-reviews li')).toHaveCount(3)
  await tabs.getByRole('tab', { name: 'Console' }).click()
  await expect(page.getByTestId('console-log').locator('[data-level]').filter({ hasText: 'Executing inline event handler violates the following Content Security Policy directive' })).toHaveCount(1)
  await app.locator('#place').click()
  await expect(app.locator('#placed')).toHaveText('Order 1042 placed: pick up tomorrow from 7:00.')
  await tabs.getByRole('tab', { name: 'Application' }).click()
  await expect(page.getByTestId('frames-policy')).not.toContainText('unsafe-inline')
})

test('shows 7.2\'s framed attack: the iframe row from cheap-flour.example, then Chrome\'s refusal after the fix', async ({ page }) => {
  await page.goto('/web/32-free-flour')
  await page.getByTestId('prediction').getByRole('radio', { name: /she is subscribed/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  const tabs = page.getByRole('tablist', { name: /Console, Network, Server, Application and Other site/ })
  await tabs.getByRole('tab', { name: 'Network' }).click()
  const framed = page.getByTestId('network-list').getByRole('option').filter({ hasText: 'cheap-flour.example' }).filter({ hasText: 'iframe' })
  await expect(framed).toHaveCount(1)
  // the Other site panel: the see-through frame over the bait, and what it made Lena's browser send
  await tabs.getByRole('tab', { name: 'Other site' }).click()
  await expect(page.getByTestId('site-page')).toContainText('opacity: 0')
  await expect(page.getByTestId('site-sent')).toContainText('POST')

  await page.getByRole('tab', { name: 'server.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solved('web-32-free-flour', 'server.js'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('A page says who may frame it')
  await page.getByRole('button', { name: 'Stay here' }).click()

  await tabs.getByRole('tab', { name: 'Network' }).click()
  const refused = page.getByTestId('network-list').getByRole('option').filter({ hasText: 'cheap-flour.example' })
  await expect(refused).toContainText('(blocked)')
  await refused.click()
  await expect(page.getByTestId('network-reason')).toContainText('Not shown in the frame:')
  await expect(page.getByTestId('network-reason')).toContainText('Framing \'https://cornerbakery.shop/\' violates the following Content Security Policy directive: "frame-ancestors \'self\' https://market.example". The request has been blocked.')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: 7.4's report-only lines, Frames and Network, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/34-only-watched')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    await page.getByTestId('prediction').getByRole('radio', { name: /a report-only policy blocks nothing/ }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await tabs.getByRole('tab', { name: 'Console' }).click()
    await expect(page.getByTestId('console-log').locator('[data-level]').filter({ hasText: 'The policy is report-only, so the violation has been logged but no further action has been taken.' })).toHaveCount(2)
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Application' }).click()
    await expect(page.getByTestId('frames-policy')).toHaveAttribute('data-type', 'report')
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Network' }).click()
    await expect(page.getByTestId('network-list').getByRole('option').filter({ hasText: 'csp-report' })).toHaveCount(2)
    expect(await scrollsSideways()).toBe(false)
    await tabs.getByRole('tab', { name: 'Server' }).click()
    await expect(page.getByTestId('server-line').filter({ hasText: 'CSP report received' })).toHaveCount(2)
    expect(await scrollsSideways()).toBe(false)
  })
}
