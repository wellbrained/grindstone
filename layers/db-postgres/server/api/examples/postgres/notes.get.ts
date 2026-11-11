import { desc, sql } from 'drizzle-orm'

// GET /api/examples/postgres/notes — list notes, newest first
export default defineEventHandler(async () => {
  const db = usePostgres()
  const { notes } = pgTables

  const rows = await db.select().from(notes).orderBy(desc(notes.createdAt), desc(notes.id))

  // Raw SQL fragments inside the query builder — parameterized and typed via sql<T>
  const [stats] = await db.select({ total: sql<number>`count(*)::int` }).from(notes)

  return {
    driver: usePostgresDriver(),
    total: stats?.total ?? 0,
    notes: rows
  }
})
