import { todoCreateSchema } from '#shared/schemas/todo'

// POST /api/examples/todos — validates the body with the shared Zod schema.
// readZodBody (server/utils/validation.ts) returns a 400 with `{ issues: [{ path, message }] }`.
export default defineEventHandler(async (event) => {
  const { title } = await readZodBody(event, todoCreateSchema)

  setResponseStatus(event, 201)
  return addExampleTodo(title)
})
