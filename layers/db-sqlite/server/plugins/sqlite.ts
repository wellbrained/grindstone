import { existsSync } from 'node:fs'

// 1. Closes the database file when the server shuts down (also on every dev reload).
// 2. Applies pending migrations when the server starts (disable with NUXT_SQLITE_AUTO_MIGRATE=false,
//    e.g. if you run `pnpm db:sqlite:migrate` as a deploy step instead).
//    better-sqlite3 is synchronous, so migrations finish before the first request is handled.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', closeSqliteDb)

  const { autoMigrate, migrationsDir } = useRuntimeConfig().sqlite

  if (!autoMigrate) {
    return
  }

  if (!existsSync(migrationsDir)) {
    console.warn(`[db-sqlite] Migrations folder not found (${migrationsDir}). Run \`pnpm db:sqlite:migrate\` when deploying.`)
    return
  }

  migrateSqliteDb(migrationsDir)
})
