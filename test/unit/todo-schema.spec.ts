import { describe, expect, it } from 'vitest'
import { todoCreateSchema } from '../../shared/schemas/todo'

// Unit test for a shared schema — runs in plain Node, no Nuxt needed
describe('todoCreateSchema', () => {
  it('accepts a valid title and trims it', () => {
    expect(todoCreateSchema.parse({ title: '  Buy milk  ' })).toEqual({ title: 'Buy milk' })
  })

  it('rejects an empty title', () => {
    const result = todoCreateSchema.safeParse({ title: '   ' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Title is required')
  })
})
