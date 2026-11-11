import { defineConfig } from 'drizzle-kit'

// Used by drizzle-kit (pnpm db:postgres:generate | migrate | studio), run from the project root.
try {
  process.loadEnvFile() // load .env if present (Node 22 built-in)
} catch {
  // no .env file
}

const url = process.env.NUXT_POSTGRES_URL

export default defineConfig({
  dialect: 'postgresql',
  schema: './layers/db-postgres/server/db/schema.ts',
  out: './layers/db-postgres/server/db/migrations',
  ...(url
    ? { dbCredentials: { url } }
    : { driver: 'pglite', dbCredentials: { url: process.env.NUXT_POSTGRES_PGLITE_DIR || '.data/pglite' } })
})
