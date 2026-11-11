// POST /api/examples/sqlite/notes — body validated with the drizzle-zod schema from the table
// (readZodBody: server/utils/validation.ts — returns a clean 400 with field messages)
export default defineEventHandler(async (event) => {
  const body = await readZodBody(event, sqliteTables.noteInsertSchema)

  const [note] = await useSqlite()
    .insert(sqliteTables.notes)
    .values(body)
    .returning()

  setResponseStatus(event, 201)
  return note
})
