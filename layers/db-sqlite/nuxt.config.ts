import { fileURLToPath } from 'node:url'

// SQLite (better-sqlite3) + Drizzle layer — auto-registered because it lives in `layers/`.
// Remove: see README.md in this folder.
export default defineNuxtConfig({
  runtimeConfig: {
    sqlite: {
      // NUXT_SQLITE_PATH — database file (created if missing, gitignored in .data/)
      path: '.data/sqlite.db',
      // NUXT_SQLITE_AUTO_MIGRATE — apply pending migrations on server start
      autoMigrate: true,
      migrationsDir: fileURLToPath(new URL('./server/db/migrations', import.meta.url))
    }
  }
})
