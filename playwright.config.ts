import { defineConfig, devices } from '@playwright/test'

// One browser, one dev server on the project's port (4003). The e2e tests live in e2e/, outside Vitest's include globs.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4003',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // the dev script passes --host localhost: @nuxt/cli 4.0.1 fails at start without it
    command: 'pnpm dev',
    url: 'http://localhost:4003',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
})
