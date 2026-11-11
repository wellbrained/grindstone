// POST /api/examples/postgres/notes — body validated with the drizzle-zod schema from the table
// (readZodBody: server/utils/validation.ts — returns a clean 400 with field messages)
export default defineEventHandler(async (event) => {
  const body = await readZodBody(event, pgTables.noteInsertSchema)

  const [note] = await usePostgres()
    .insert(pgTables.notes)
    .values(body)
    .returning()

  setResponseStatus(event, 201)
  return note
})
