import { fileURLToPath } from 'node:url'

// PostgreSQL + Drizzle layer — auto-registered because it lives in `layers/`.
// Remove: see README.md in this folder.
export default defineNuxtConfig({
  runtimeConfig: {
    postgres: {
      // NUXT_POSTGRES_URL — e.g. postgres://user:pass@host:5432/db (Neon, Supabase, Docker, …).
      // Empty = embedded PGlite (real Postgres in WASM, no install) for local development.
      url: '',
      // NUXT_POSTGRES_PGLITE_DIR — where PGlite stores its data (gitignored)
      pgliteDir: '.data/pglite',
      // NUXT_POSTGRES_AUTO_MIGRATE — apply pending migrations on server start
      autoMigrate: true,
      migrationsDir: fileURLToPath(new URL('./server/db/migrations', import.meta.url))
    }
  }
})
