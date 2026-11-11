import { desc, sql } from 'drizzle-orm'

// GET /api/examples/sqlite/notes — list notes, newest first
export default defineEventHandler(async () => {
  const db = useSqlite()
  const { notes } = sqliteTables

  const rows = await db.select().from(notes).orderBy(desc(notes.createdAt), desc(notes.id))

  // Raw SQL fragments inside the query builder — parameterized and typed via sql<T>
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    version: sql<string>`sqlite_version()`
  }).from(notes)

  return {
    total: stats?.total ?? 0,
    version: stats?.version,
    notes: rows
  }
})
