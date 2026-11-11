import { eq } from 'drizzle-orm'
import * as z from 'zod'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// DELETE /api/examples/postgres/notes/:id
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { notes } = pgTables

  const [deleted] = await usePostgres()
    .delete(notes)
    .where(eq(notes.id, id))
    .returning({ id: notes.id })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  return deleted
})
