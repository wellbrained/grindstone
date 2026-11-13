import { expect, test } from '@playwright/test'

// The level's app runs sealed (ADR 0007): sandbox="allow-scripts" only, an opaque origin. Code typed into the Console
// runs inside the app and can't read Grindstone's localStorage (where progress lives), its page, or the network.
test('the app cannot reach Grindstone\'s storage, page or the network', async ({ page }) => {
  await page.goto('/debugging/01-add-to-cart')
  await page.evaluate(() => localStorage.setItem('grindstone:secret-check', 'only-for-grindstone'))
  await expect(page.getByTestId('app-frame')).toHaveAttribute('sandbox', 'allow-scripts')

  const log = page.getByTestId('console-log')
  await expect(log).toContainText('Corner Bakery shop ready')
  const input = page.getByTestId('console-input')
  const run = async (code: string) => {
    await input.fill(code)
    await input.press('Enter')
  }

  await run('localStorage.getItem("grindstone:secret-check")')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('parent.localStorage.getItem("grindstone:secret-check")')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('parent.document.title')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('document.cookie = "a=1"; document.cookie')
  await expect(log.locator('[data-level="error"]').last()).toContainText('SecurityError')
  await run('fetch("https://example.com/").catch(error => console.error(error.message))')
  await expect(log).toContainText('Refused to load')
  await expect(log).not.toContainText('only-for-grindstone')

  // the page's own storage is untouched, and the app still works
  expect(await page.evaluate(() => localStorage.getItem('grindstone:secret-check'))).toBe('only-for-grindstone')
  await run('1 + 1')
  await expect(log.locator('[data-level="result"]').last()).toHaveText(/2/)
})

// A level with a scripted backend (chapter 2): its fetch is answered inside the frame, so no request ever reaches a
// server, not the shop's, not any other; anything that is not fetch is still refused by the frame's policy.
test('a level\'s fake backend answers inside the frame: nothing leaves it', async ({ page }) => {
  // what reached a server (a response came back), and how the browser stopped the rest
  const outside: string[] = []
  const stopped: string[] = []
  page.on('requestfinished', (request) => {
    if (/cornerbakery\.shop|example\.com/.test(request.url())) outside.push(request.url())
  })
  page.on('requestfailed', (request) => {
    if (/cornerbakery\.shop|example\.com/.test(request.url())) stopped.push(request.failure()?.errorText ?? '')
  })
  await page.goto('/debugging/06-menu-wont-load')
  const log = page.getByTestId('console-log')
  await expect(log).toContainText('GET https://cornerbakery.shop/api/products 404 (Not Found)')
  const input = page.getByTestId('console-input')
  const run = async (code: string) => {
    await input.fill(code)
    await input.press('Enter')
  }

  await run('fetch("/api/menu").then(response => response.json()).then(menu => console.log("menu", menu.length))')
  await expect(log).toContainText('menu 3')
  await run('fetch("https://example.com/").catch(error => console.warn(error.message))')
  await expect(log).toContainText('GET https://example.com/ net::ERR_NAME_NOT_RESOLVED')
  await run('new Image().src = "https://example.com/pixel.png"')
  await expect(log).toContainText('Refused to load')
  expect(outside).toEqual([])
  expect(stopped).toEqual(['csp'])
})
