import { chromium, type FullConfig } from '@playwright/test'

// Warms a freshly started dev server before any spec runs (#545): Vite compiles each route and its components on
// first request, and the first level page of a cold `nuxt dev` took ~11 s, past the 10 s expect timeout, so whichever
// spec loaded first failed. One page of each play environment (git, debugging, review, web) compiles what the specs need.
const WARM_PAGES = ['/', '/git/01-first-commit', '/debugging/06-menu-wont-load', '/ai/01-twelve-croissants', '/web/01-menu-blocked']

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:4003'
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const path of WARM_PAGES) {
      await page.goto(new URL(path, baseURL).href, { waitUntil: 'networkidle', timeout: 120_000 })
      await page.locator('main').first().waitFor({ timeout: 60_000 })
    }
  } finally {
    await browser.close()
  }
}
