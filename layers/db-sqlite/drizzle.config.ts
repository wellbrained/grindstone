import { defineConfig } from 'drizzle-kit'

// Used by drizzle-kit (pnpm db:sqlite:generate | migrate | studio), run from the project root.
try {
  process.loadEnvFile() // load .env if present (Node 22 built-in)
} catch {
  // no .env file
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './layers/db-sqlite/server/db/schema.ts',
  out: './layers/db-sqlite/server/db/migrations',
  dbCredentials: { url: process.env.NUXT_SQLITE_PATH || '.data/sqlite.db' }
})
