import { expect, test } from '@playwright/test'
import { editedText, levelById } from '../shared/levels'
import type { WebLevel } from '../shared/levels'

// Plays chapter 2 of Web fundamentals like a player (ADR 0009: cookies & sessions): the prediction first, then the
// Application panel (Lena's cookie and its flags, live), the Other site panel (cheap-flour.example's page, readable and
// not editable, and what it made her browser send), the Network panel's cookies (sent, or why not, in Chrome's words),
// a fix in server.js, Reload, the debrief. And the new panels at a phone's width, light and dark.

/** server.js as the level's solution leaves it. */
function solvedServer(id: string): string {
  const level = levelById(id) as WebLevel
  const step = level.solution.find(each => typeof each === 'object' && 'save' in each && each.save === 'server.js') as { save: string, replace: readonly [string, string] }
  return editedText(level.setup().files, step)
}

test('plays 2.2: predicts the forged order, reads the Application and Other site panels, fixes the cookie in server.js', async ({ page }) => {
  await page.goto('/web/07-order-from-elsewhere')
  await expect(page.getByRole('heading', { level: 1, name: /An order Lena never placed/ })).toBeVisible()
  await expect(page.getByTestId('app-waits')).toBeVisible()

  // the prediction, with the keyboard: the right answer
  const card = page.getByTestId('prediction')
  await card.getByRole('radio', { name: /The order goes through/ }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('prediction-submit').focus()
  await page.keyboard.press('Enter')
  const result = page.getByTestId('prediction-result')
  await expect(result).toBeFocused()
  await expect(result).toHaveAttribute('data-right', 'true')
  await expect(page.getByTestId('wrong-predictions')).toHaveText('Wrong predictions: 0')

  // the scene ran: Lena signed in, cheap-flour.example placed its order, the page shows it
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#who')).toHaveText('Signed in as Lena')
  await expect(app.locator('#orders li')).toHaveText(['40 × Sourdough loaf'])

  // the Application panel: Lena's session with its flags, in a table named by its site
  const tabs = page.getByRole('tablist', { name: /Console, Network, Server, Application and Other site/ })
  await tabs.getByRole('tab', { name: 'Application' }).click()
  const table = page.getByRole('table', { name: /Cookies of cornerbakery\.shop/ })
  await expect(table).toBeVisible()
  const row = table.getByRole('row', { name: /session/ })
  await expect(row).toContainText('lena-7f3a')
  await expect(row).toContainText('api.cornerbakery.shop')
  await expect(row).toContainText('None')
  await expect(page.getByTestId('application-count')).toHaveText('1 cookie')

  // the Other site panel: the attacker's page, readable, and what it sent
  await tabs.getByRole('tab', { name: 'Other site' }).click()
  await expect(page.getByTestId('site-address')).toHaveText('cheap-flour.example/')
  await expect(page.getByTestId('site-page')).toContainText('<form id="f1" method="POST" action="https://api.cornerbakery.shop/orders">')
  await expect(page.getByTestId('site-page')).toContainText('document.getElementById(\'f1\').submit()')
  await expect(page.getByTestId('site-page').locator('[contenteditable]')).toHaveCount(0)
  const sent = page.getByTestId('site-sent').getByRole('button')
  await expect(sent).toHaveCount(1)
  await expect(sent.first()).toContainText('201')
  // Visit as Lena again: a second forged order, in the list
  await page.getByTestId('site-visit').click()
  await expect(sent).toHaveCount(2)

  // its row in the Network panel: tagged with the site, a page, its cookie sent
  await sent.first().click()
  await expect(page.getByTestId('network-detail')).toBeVisible()
  await expect(page.getByTestId('network-detail')).toContainText('https://cheap-flour.example')
  await expect(page.getByTestId('network-request-cookie')).toHaveAttribute('data-sent', 'true')
  await expect(page.getByTestId('network-list').getByRole('option', { name: /POST https:\/\/api\.cornerbakery\.shop\/orders, page, from cheap-flour\.example, 201/ }).first()).toBeVisible()

  // the fix in server.js, Save, Reload: the debrief
  await page.getByRole('tab', { name: 'server.js' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(solvedServer('web-07-order-from-elsewhere'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Whoever starts it, the cookie goes along')
  await expect(page.getByTestId('debrief-stats')).toContainText('no wrong predictions · no hints · 1 reload')
  await page.getByRole('button', { name: 'Stay here' }).click()

  // the reloaded app: the form arrives without her cookie, and the panel says why
  await expect(app.locator('#who')).toHaveText('Signed in as Lena')
  await expect(app.locator('#orders li')).toHaveCount(0)
  await tabs.getByRole('tab', { name: 'Network' }).click()
  await page.getByTestId('network-list').getByRole('option', { name: /from cheap-flour\.example, 401/ }).click()
  await expect(page.getByTestId('network-request-cookie')).toHaveAttribute('data-sent', 'false')
  await expect(page.getByTestId('network-request-cookie')).toContainText('This cookie was blocked because it had the "SameSite=Lax" attribute and the request was made from a different site')
})

test('shows a refused cookie in the Network and Application panels, with Chrome\'s words (2.1)', async ({ page }) => {
  await page.goto('/web/06-sign-in-lost')
  await page.getByTestId('prediction').getByRole('radio', { name: /The browser refuses the cookie/ }).check()
  await page.getByTestId('prediction-submit').click()
  await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('#who')).toHaveText('Not signed in: please sign in again.')
  await page.getByRole('tab', { name: 'Application' }).click()
  await expect(page.getByTestId('application-empty')).toBeVisible()
  const refused = page.getByTestId('application-refused-row')
  await expect(refused).toHaveCount(1)
  await expect(refused).toContainText('session=lena-7f3a; Path=/; HttpOnly; SameSite=None')
  await expect(refused).toContainText('This attempt to set a cookie via a "Set-Cookie" header was blocked because it had the "SameSite=None" attribute but didn’t have the "Secure" attribute')
  await page.getByRole('tab', { name: 'Network' }).click()
  await page.getByTestId('network-list').getByRole('option', { name: /^POST https:\/\/api\.cornerbakery\.shop\/login/ }).click()
  await expect(page.getByTestId('network-response-cookie')).toHaveAttribute('data-stored', 'false')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a phone, ${scheme}: Application and Other site, no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/web/08-script-reads-session')
    const scrollsSideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    const card = page.getByTestId('prediction')
    await card.getByRole('checkbox', { name: 'session' }).check()
    await card.getByRole('checkbox', { name: 'theme' }).check()
    await page.getByTestId('prediction-submit').click()
    await expect(page.getByTestId('prediction-result')).toHaveAttribute('data-right', 'true')
    // six tabs in two rows (the guard site has no panel)
    const tabs = page.getByRole('tablist', { name: 'Panels' })
    await expect(tabs.getByRole('tab')).toHaveCount(6)
    await tabs.getByRole('tab', { name: 'Application' }).click()
    await expect(page.getByTestId('application-cookie')).toHaveCount(4)
    // the table scrolls inside its own region, never the page
    expect(await scrollsSideways()).toBe(false)
    await expect(page.getByRole('region', { name: 'Cookies of cornerbakery.shop' })).toBeVisible()
    await tabs.getByRole('tab', { name: 'Network' }).click()
    await page.getByTestId('network-list').getByRole('option', { name: /collect/ }).first().click()
    await expect(page.getByTestId('network-detail')).toContainText('cheap-flour.example/collect?c=theme%3Ddark%3B%20session%3Dlena-7f3a')
    expect(await scrollsSideways()).toBe(false)
  })
}
