import { defineConfig, devices } from '@playwright/test'

// One browser, one dev server on the project's port (4003). The e2e tests live in e2e/, outside Vitest's include globs.
export default defineConfig({
  testDir: './e2e',
  // a cold dev server compiles routes on first load: warm one page per play environment first (#545)
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // one dev server serves every worker: 12 (half of 24 threads) overloaded it and the first page timed out; 6 is as fast (#545)
  workers: 6,
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
