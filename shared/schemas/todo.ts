import * as z from 'zod'

// `shared/` is available in both the app and the server (import via `#shared/...`).
// One schema validates the client form AND the API request body.
export const todoCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Max 100 characters')
})

export type TodoCreate = z.output<typeof todoCreateSchema>

export interface Todo {
  id: number
  title: string
  done: boolean
}
