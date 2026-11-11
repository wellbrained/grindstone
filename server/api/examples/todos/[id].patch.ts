import * as z from 'zod'

// PATCH /api/examples/todos/:id — route params validated with Zod too.
const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const todo = toggleExampleTodo(id)
  if (!todo) {
    throw createError({ statusCode: 404, statusMessage: 'Todo not found' })
  }

  return todo
})
