import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'

// Runs the real migrations against an in-memory SQLite database.
// Catches broken migrations and wrong queries early.
const migrationsFolder = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))

describe('db-sqlite', () => {
  const db = drizzle(new Database(':memory:'), { schema })

  beforeAll(() => {
    migrate(db, { migrationsFolder })
  })

  it('inserts, reads and deletes notes', () => {
    const first = db.insert(schema.notes).values({ text: 'first' }).returning().get()
    db.insert(schema.notes).values({ text: 'second' }).run()

    const rows = db.select().from(schema.notes).orderBy(desc(schema.notes.id)).all()
    expect(rows.map(r => r.text)).toEqual(['second', 'first'])
    expect(rows[0]?.createdAt).toBeInstanceOf(Date)

    db.delete(schema.notes).where(eq(schema.notes.id, first.id)).run()
    expect(db.select().from(schema.notes).all()).toHaveLength(1)
  })

  it('validates input with the drizzle-zod schema', () => {
    expect(schema.noteInsertSchema.parse({ text: '  hi  ' })).toEqual({ text: 'hi' })
    expect(schema.noteInsertSchema.safeParse({ text: '' }).success).toBe(false)
    expect(schema.noteInsertSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(false)
  })
})
