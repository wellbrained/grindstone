import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'

// Auto-imported in all server code (server/utils). Usage:
//   const db = useSqlite()
//   await db.select().from(sqliteTables.notes)
export const sqliteTables = schema

export type SqliteDb = BetterSQLite3Database<typeof schema>

let db: SqliteDb | undefined
let connection: Database.Database | undefined

/** Drizzle instance for the SQLite database file. */
export function useSqlite(): SqliteDb {
  if (!db) {
    const { path } = useRuntimeConfig().sqlite
    mkdirSync(dirname(path), { recursive: true })

    connection = new Database(path)
    // WAL mode: readers don't block writers — recommended for web servers
    connection.pragma('journal_mode = WAL')
    connection.pragma('foreign_keys = ON')

    db = drizzle(connection, { schema })
  }
  return db
}

/** Applies pending migrations from the given folder (see server/plugins/sqlite.ts). */
export function migrateSqliteDb(migrationsFolder: string): void {
  migrate(useSqlite(), { migrationsFolder })
}

/** Closes the database file (called when the server shuts down, see server/plugins/sqlite.ts). */
export function closeSqliteDb(): void {
  connection?.close()
  connection = undefined
  db = undefined
}
