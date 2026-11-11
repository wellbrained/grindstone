import type { H3Event } from 'h3'
import type * as z from 'zod'

/**
 * Reads the request body and validates it with a Zod schema.
 * Invalid input throws a 400 whose `data` is `{ issues: [{ path, message }] }`,
 * so the client can show field messages (on $fetch errors: `error.data.data.issues`).
 *
 *   const body = await readZodBody(event, schema)
 */
export async function readZodBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await readBody(event))

  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }))
    throw createError({ statusCode: 400, statusMessage: 'Validation Error', data: { issues } })
  }

  return result.data
}
