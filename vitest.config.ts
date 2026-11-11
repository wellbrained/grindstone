import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      // Plain unit tests (utils, schemas, pure functions) — fast, no Nuxt runtime
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts', 'layers/*/test/unit/**/*.{test,spec}.ts'],
          environment: 'node'
        }
      },
      // Component / composable / store tests running inside a Nuxt environment (auto-imports work)
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts', 'layers/*/test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          // Booting the Nuxt environment (with modules/layers) can exceed the 10s default
          hookTimeout: 60_000
        }
      })
    ]
  }
})
