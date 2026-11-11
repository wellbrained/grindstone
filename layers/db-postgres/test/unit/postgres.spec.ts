import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'

// Runs the real migrations against an in-memory Postgres (PGlite) — no server needed.
// Catches broken migrations and wrong queries early.
const migrationsFolder = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))

describe('db-postgres', () => {
  const db = drizzle(new PGlite(), { schema })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  it('inserts, reads and deletes notes', async () => {
    const [first] = await db.insert(schema.notes).values({ text: 'first' }).returning()
    await db.insert(schema.notes).values({ text: 'second' })

    const rows = await db.select().from(schema.notes).orderBy(desc(schema.notes.id))
    expect(rows.map(r => r.text)).toEqual(['second', 'first'])
    expect(rows[0]?.createdAt).toBeInstanceOf(Date)

    await db.delete(schema.notes).where(eq(schema.notes.id, first!.id))
    expect(await db.select().from(schema.notes)).toHaveLength(1)
  })

  it('validates input with the drizzle-zod schema', () => {
    expect(schema.noteInsertSchema.parse({ text: '  hi  ' })).toEqual({ text: 'hi' })
    expect(schema.noteInsertSchema.safeParse({ text: '' }).success).toBe(false)
    expect(schema.noteInsertSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(false)
  })
})
