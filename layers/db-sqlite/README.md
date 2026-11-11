# SQLite (better-sqlite3) + Drizzle layer

[Drizzle ORM](https://orm.drizzle.team) with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3). Auto-registered because it lives in `layers/`.

- The whole database is one file (`.data/sqlite.db`, gitignored) — no server, no setup.
- Very fast, synchronous driver; WAL mode is enabled for concurrent reads.
- Great for single-server apps, prototypes, internal tools. For multiple app servers / serverless, prefer `layers/db-postgres`.

> Keep **either** this layer **or** `layers/db-postgres` in a real project.

The example uses `readZodBody()` / `getErrorMessage()` from the base template (`server/utils/validation.ts`, `app/utils/errors.ts`).

better-sqlite3 ships prebuilt binaries for Windows, macOS and Linux (x64/arm64), so nothing is compiled. Its build script stays disabled in `pnpm-workspace.yaml` on purpose — enabling it would trigger a native compile that needs a C++ toolchain.

## Files

| File | Purpose |
|---|---|
| `server/db/schema.ts` | Tables, inferred types, drizzle-zod validation schemas |
| `server/db/migrations/` | Generated SQL migrations (commit them) |
| `server/utils/sqlite.ts` | `useSqlite()`, `sqliteTables`, auto-imported in server code |
| `server/plugins/sqlite.ts` | Applies pending migrations on server start |
| `drizzle.config.ts` | drizzle-kit config |
| `app/pages/examples/sqlite.vue`, `server/api/examples/sqlite/` | Example (notes CRUD) |
| `test/unit/sqlite.spec.ts` | Runs migrations + queries against in-memory SQLite |

## Usage

```ts
// any file in server/
import { eq } from 'drizzle-orm'

const db = useSqlite()
const note = await db.select().from(sqliteTables.notes).where(eq(sqliteTables.notes.id, 1))
```

## Schema changes

1. Edit `server/db/schema.ts`
2. `pnpm db:sqlite:generate` — creates a SQL migration in `server/db/migrations/`
3. Restart the dev server — pending migrations are applied automatically

`pnpm db:sqlite:studio` opens Drizzle Studio (DB browser).

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `NUXT_SQLITE_PATH` | `.data/sqlite.db` | Database file |
| `NUXT_SQLITE_AUTO_MIGRATE` | `true` | Migrate on server start |

## Deployment

Needs a persistent disk for the database file (VPS, Docker volume, Fly.io volume …) — not suitable for serverless platforms. Auto-migration on start works when the server runs from the project folder; otherwise set `NUXT_SQLITE_AUTO_MIGRATE=false` and run `pnpm db:sqlite:migrate` as a deploy step.

## Remove

```bash
pnpm remove better-sqlite3 @types/better-sqlite3
```

Delete this folder, the `db:sqlite:*` scripts in `package.json` and the `better-sqlite3` entry in `pnpm-workspace.yaml`. If `layers/db-postgres` is gone too, also `pnpm remove drizzle-orm drizzle-zod drizzle-kit`.

## Add back to a project

Copy this folder and the `db:sqlite:*` scripts, then:

```bash
pnpm add drizzle-orm drizzle-zod better-sqlite3
pnpm add -D drizzle-kit @types/better-sqlite3
```
