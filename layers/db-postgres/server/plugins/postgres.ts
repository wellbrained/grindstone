import { existsSync } from 'node:fs'

const STARTUP_TIMEOUT_MS = 30_000

// 1. Closes the database when the server shuts down (also on every dev reload).
// 2. Applies pending migrations when the server starts (disable with NUXT_POSTGRES_AUTO_MIGRATE=false,
//    e.g. if you run `pnpm db:postgres:migrate` as a deploy step instead).
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', closePostgresDb)

  const { autoMigrate, migrationsDir } = useRuntimeConfig().postgres

  if (!autoMigrate) {
    return
  }

  if (!existsSync(migrationsDir)) {
    console.warn(`[db-postgres] Migrations folder not found (${migrationsDir}). Run \`pnpm db:postgres:migrate\` when deploying.`)
    return
  }

  // Fail with a clear error instead of hanging if the database never becomes ready
  // (e.g. the PGlite data directory is still held by a crashed process).
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(
      `[db-postgres] Database not ready after ${STARTUP_TIMEOUT_MS / 1000}s. Stop all dev servers and restart.`
    )), STARTUP_TIMEOUT_MS).unref()
  })

  const ready = Promise.race([migratePostgresDb(migrationsDir), timeout])
  // Log once; requests below still receive the error (500) instead of hanging
  ready.catch(error => console.error('[db-postgres] Migration failed:', error))

  // Hold incoming requests until migrations are done (instant after the first one)
  nitroApp.hooks.hook('request', async () => {
    await ready
  })
})
