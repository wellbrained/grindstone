# PostgreSQL + Drizzle layer

[Drizzle ORM](https://orm.drizzle.team) with PostgreSQL. Auto-registered because it lives in `layers/`.

- **Local development needs no database install:** without `NUXT_POSTGRES_URL` it uses [PGlite](https://pglite.dev) — real Postgres compiled to WASM, stored in `.data/pglite`.
- **Production / shared databases:** set `NUXT_POSTGRES_URL=postgres://user:pass@host:5432/db` (Neon, Supabase, Docker, …) — uses [postgres.js](https://github.com/porsager/postgres).
- Same schema, queries and migrations for both.

> Keep **either** this layer **or** `layers/db-sqlite` in a real project.

The example uses `readZodBody()` / `getErrorMessage()` from the base template (`server/utils/validation.ts`, `app/utils/errors.ts`).

## Files

| File | Purpose |
|---|---|
| `server/db/schema.ts` | Tables, inferred types, drizzle-zod validation schemas |
| `server/db/migrations/` | Generated SQL migrations (commit them) |
| `server/utils/postgres.ts` | `usePostgres()`, `pgTables`, auto-imported in server code |
| `server/plugins/postgres.ts` | Applies pending migrations on server start |
| `drizzle.config.ts` | drizzle-kit config |
| `app/pages/examples/postgres.vue`, `server/api/examples/postgres/` | Example (notes CRUD) |
| `test/unit/postgres.spec.ts` | Runs migrations + queries against in-memory PGlite |

## Usage

```ts
// any file in server/
import { eq } from 'drizzle-orm'

const db = usePostgres()
const note = await db.select().from(pgTables.notes).where(eq(pgTables.notes.id, 1))
```

## Schema changes

1. Edit `server/db/schema.ts`
2. `pnpm db:postgres:generate` — creates a SQL migration in `server/db/migrations/`
3. Restart the dev server — pending migrations are applied automatically

`pnpm db:postgres:studio` opens Drizzle Studio (DB browser).

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `NUXT_POSTGRES_URL` | *(empty)* | Postgres connection string. Empty = PGlite |
| `NUXT_POSTGRES_PGLITE_DIR` | `.data/pglite` | PGlite data folder |
| `NUXT_POSTGRES_AUTO_MIGRATE` | `true` | Migrate on server start |

## Deployment

Auto-migration on start works when the server runs from the project folder (e.g. `node .output/server/index.mjs` on the same machine). On platforms where the source isn't available at runtime, set `NUXT_POSTGRES_AUTO_MIGRATE=false` and run `pnpm db:postgres:migrate` (with `NUXT_POSTGRES_URL` set) as a deploy step. PGlite is meant for development — use a real server in production.

## Remove

```bash
pnpm remove @electric-sql/pglite postgres
```

Delete this folder and the `db:postgres:*` scripts in `package.json`. If `layers/db-sqlite` is gone too, also `pnpm remove drizzle-orm drizzle-zod drizzle-kit`.

## Add back to a project

Copy this folder and the `db:postgres:*` scripts, then:

```bash
pnpm add drizzle-orm drizzle-zod @electric-sql/pglite postgres
pnpm add -D drizzle-kit
```
